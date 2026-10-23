"""Face-tracked 9:16 crop path for a clip.

Sample frames at a few FPS -> detect faces (YuNet ONNX, Haar cascade fallback)
-> follow the dominant face with median filtering, a dead zone and hard resets on
shot cuts -> keyframes -> one piecewise-linear ffmpeg crop expression.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from app.core.config import get_settings
from app.pipeline.scan import hsv_hist

log = logging.getLogger(__name__)

DETECT_WIDTH = 640


@dataclass
class CropPlan:
    mode: str                      # "track" | "center" | "fit"
    src_w: int
    src_h: int
    crop_w: int
    crop_h: int
    keyframes: list[tuple[float, int]] = field(default_factory=list)  # (t, x)
    faces_found: int = 0
    samples: int = 0
    cuts: list[float] = field(default_factory=list)

    def x_expression(self) -> str:
        return build_x_expression(self.keyframes)

    def as_dict(self) -> dict:
        return {"mode": self.mode, "src": [self.src_w, self.src_h], "crop": [self.crop_w, self.crop_h],
                "keyframes": self.keyframes, "faces_found": self.faces_found, "samples": self.samples,
                "cuts": self.cuts}


class FaceDetector:
    def __init__(self) -> None:
        self.kind = "none"
        self._yunet = None
        self._haar = None
        model = get_settings().yunet_model_path
        if model.exists() and hasattr(cv2, "FaceDetectorYN"):
            try:
                self._yunet = cv2.FaceDetectorYN.create(str(model), "", (320, 320), 0.6, 0.3, 50)
                self.kind = "yunet"
            except cv2.error as exc:
                log.warning("YuNet failed to load (%s); falling back to Haar", exc)
        if self._yunet is None:
            cascade = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
            if cascade.exists() and hasattr(cv2, "CascadeClassifier"):
                self._haar = cv2.CascadeClassifier(str(cascade))
                self.kind = "haar"

    def detect(self, image: np.ndarray) -> list[tuple[float, float, float, float, float]]:
        """Faces as (x, y, w, h, score) in the given image's pixels."""
        h, w = image.shape[:2]
        if self._yunet is not None:
            self._yunet.setInputSize((w, h))
            _, faces = self._yunet.detect(image)
            if faces is None:
                return []
            return [(float(f[0]), float(f[1]), float(f[2]), float(f[3]), float(f[-1])) for f in faces]
        if self._haar is not None:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            found = self._haar.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(36, 36))
            return [(float(x), float(y), float(fw), float(fh), 0.7) for x, y, fw, fh in found]
        return []


def even(value: float) -> int:
    v = int(round(value))
    return v - (v % 2)


def plan_crop(video: Path, t_start: float, t_end: float, src_w: int, src_h: int) -> CropPlan:
    settings = get_settings()
    target_ratio = settings.output_width / settings.output_height  # 0.5625
    if src_w / src_h <= target_ratio + 0.02:
        return CropPlan(mode="fit", src_w=src_w, src_h=src_h, crop_w=src_w, crop_h=src_h)
    crop_h = even(src_h)
    crop_w = even(src_h * target_ratio)
    center_x = even((src_w - crop_w) / 2)

    samples, cuts = _sample_faces(video, t_start, t_end, src_w, settings.face_sample_fps)
    found = sum(1 for _, cx in samples if cx is not None)
    if found < max(2, len(samples) * 0.15):
        return CropPlan(mode="center", src_w=src_w, src_h=src_h, crop_w=crop_w, crop_h=crop_h,
                        keyframes=[(0.0, center_x)], faces_found=found, samples=len(samples), cuts=cuts)
    keyframes = smooth_path(samples, cuts, src_w, crop_w)
    return CropPlan(mode="track", src_w=src_w, src_h=src_h, crop_w=crop_w, crop_h=crop_h,
                    keyframes=keyframes, faces_found=found, samples=len(samples), cuts=cuts)


def _sample_faces(video: Path, t_start: float, t_end: float, src_w: int, sample_fps: float):
    detector = FaceDetector()
    cap = cv2.VideoCapture(str(video))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(round(fps / max(sample_fps, 0.5))))
    cap.set(cv2.CAP_PROP_POS_MSEC, t_start * 1000.0)
    samples: list[tuple[float, float | None]] = []
    cuts: list[float] = []
    previous_hist = None
    frame_index = 0
    total_frames = int((t_end - t_start) * fps)
    try:
        while frame_index <= total_frames:
            if frame_index % step:
                if not cap.grab():
                    break
                frame_index += 1
                continue
            ok, frame = cap.read()
            if not ok:
                break
            t_rel = frame_index / fps
            scale = DETECT_WIDTH / frame.shape[1] if frame.shape[1] > DETECT_WIDTH else 1.0
            small = cv2.resize(frame, None, fx=scale, fy=scale) if scale < 1.0 else frame
            hist = hsv_hist(small)
            if previous_hist is not None and cv2.compareHist(previous_hist, hist, cv2.HISTCMP_BHATTACHARYYA) > 0.45:
                cuts.append(round(t_rel, 3))
            previous_hist = hist
            faces = detector.detect(small)
            if faces:
                x, y, w, h, score = max(faces, key=lambda f: f[2] * f[3] * f[4])
                samples.append((round(t_rel, 3), (x + w / 2) / small.shape[1]))
            else:
                samples.append((round(t_rel, 3), None))
            frame_index += 1
    finally:
        cap.release()
    log.debug("face samples=%d detector=%s cuts=%d", len(samples), detector.kind, len(cuts))
    return samples, cuts


def smooth_path(samples: list[tuple[float, float | None]], cuts: list[float], src_w: int, crop_w: int,
                dead_zone: float = 0.06, max_keyframes: int = 40) -> list[tuple[float, int]]:
    """Turn noisy face centres (0..1) into a calm camera path of (t, x_px) keyframes."""
    if not samples:
        return [(0.0, even((src_w - crop_w) / 2))]
    # fill gaps: carry last seen face, else next seen, else centre
    centres = [c for _, c in samples]
    known = [c for c in centres if c is not None]
    fill = known[0] if known else 0.5
    filled: list[float] = []
    for c in centres:
        if c is not None:
            fill = c
        filled.append(fill)
    times = [t for t, _ in samples]
    # median filter (window 5) within each shot
    shots = _split_by_cuts(times, cuts)
    keyframes: list[tuple[float, int]] = []
    max_x = src_w - crop_w

    def to_x(centre: float) -> int:
        return int(min(max_x, max(0, even(centre * src_w - crop_w / 2))))

    for shot_start, shot_end in shots:
        idx = [i for i, t in enumerate(times) if shot_start <= t < shot_end]
        if not idx:
            continue
        values = np.array([filled[i] for i in idx])
        if len(values) >= 5:
            padded = np.pad(values, 2, mode="edge")
            values = np.array([np.median(padded[i:i + 5]) for i in range(len(values))])
        current = float(values[0])
        if keyframes and keyframes[-1][0] >= times[idx[0]]:
            keyframes.pop()
        if keyframes:  # hard cut: hold previous x until just before the new shot
            keyframes.append((round(max(times[idx[0]] - 0.04, keyframes[-1][0] + 0.01), 3), keyframes[-1][1]))
        keyframes.append((round(times[idx[0]], 3), to_x(current)))
        for k, i in enumerate(idx[1:], start=1):
            if abs(values[k] - current) > dead_zone:
                current = float(values[k])
                keyframes.append((round(times[i], 3), to_x(current)))
    keyframes = _dedupe_keyframes(keyframes)
    if len(keyframes) > max_keyframes:
        stride = len(keyframes) / max_keyframes
        keyframes = [keyframes[int(i * stride)] for i in range(max_keyframes)]
    if keyframes[0][0] > 0:
        keyframes.insert(0, (0.0, keyframes[0][1]))
    return keyframes


def _split_by_cuts(times: list[float], cuts: list[float]) -> list[tuple[float, float]]:
    bounds = [times[0]] + [c for c in cuts if times[0] < c < times[-1]] + [times[-1] + 1.0]
    return list(zip(bounds[:-1], bounds[1:]))


def _dedupe_keyframes(keyframes: list[tuple[float, int]]) -> list[tuple[float, int]]:
    out: list[tuple[float, int]] = []
    for t, x in keyframes:
        if out and t <= out[-1][0]:
            continue
        if len(out) >= 2 and out[-1][1] == x and out[-2][1] == x:
            out[-1] = (t, x)
            continue
        out.append((t, x))
    return out


def build_x_expression(keyframes: list[tuple[float, int]]) -> str:
    """Piecewise-linear x(t) for ffmpeg's crop filter. Commas are escaped for the filtergraph."""
    if not keyframes:
        return "0"
    if len(keyframes) == 1:
        return str(keyframes[0][1])
    expr = str(keyframes[-1][1])
    for (t0, x0), (t1, x1) in reversed(list(zip(keyframes[:-1], keyframes[1:]))):
        if x0 == x1 or t1 - t0 < 0.05:
            piece = str(x1) if t1 - t0 < 0.05 else str(x0)
        else:
            piece = f"{x0}+({x1 - x0})*(t-{t0:.3f})/{t1 - t0:.3f}"
        expr = f"if(lt(t\\,{t1:.3f})\\,{piece}\\,{expr})"
    return expr
