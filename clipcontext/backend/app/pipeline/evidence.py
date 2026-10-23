"""Per-clip evidence sheet: what is said and shown, as atomic facts with ids.

Frames (1 FPS inside the clip) -> quality filter -> pHash dedupe -> diverse pick (MMR)
-> OCR (RapidOCR) + captions (vision LLM). Speech lines become S facts, on-screen
text O facts, frame descriptions F facts. Every generated title/description must
cite these ids.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path

import cv2
import imagehash
import numpy as np
from PIL import Image

from app.core.config import get_settings
from app.llm import schemas as s
from app.llm.client import role_available, run_structured
from app.pipeline.media import extract_frames
from app.pipeline.scan import hsv_hist

log = logging.getLogger(__name__)

_IMAGE_MODEL = None
_IMAGE_MODEL_FAILED = False
_OCR = None
_INIT_LOCK = threading.Lock()


# ----------------------------------------------------------------- quality
def frame_quality(image: np.ndarray) -> float:
    """0..1 score from sharpness, exposure and contrast (no learned model)."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    sharp = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharp_score = min(1.0, np.log1p(sharp) / np.log1p(800.0))
    brightness = gray.mean()
    exposure = 1.0 - min(1.0, abs(brightness - 125.0) / 125.0)
    contrast = min(1.0, gray.std() / 64.0)
    return float(0.5 * sharp_score + 0.25 * exposure + 0.25 * contrast)


# --------------------------------------------------------------- embeddings
def _image_vectors(paths: list[Path], images: list[np.ndarray]) -> np.ndarray:
    global _IMAGE_MODEL, _IMAGE_MODEL_FAILED
    if not _IMAGE_MODEL_FAILED:
        try:
            with _INIT_LOCK:
                if _IMAGE_MODEL is None and not _IMAGE_MODEL_FAILED:
                    from fastembed import ImageEmbedding

                    _IMAGE_MODEL = ImageEmbedding(get_settings().image_embedding_model)
            if _IMAGE_MODEL is None:
                raise RuntimeError("image embedding model failed to load earlier")
            vectors = np.array(list(_IMAGE_MODEL.embed([str(p) for p in paths])), dtype=np.float32)
            return _normalize(vectors)
        except Exception as exc:  # model download blocked, etc.
            log.warning("image embedding model unavailable (%s); using colour histograms", exc)
            _IMAGE_MODEL_FAILED = True
    return _normalize(np.array([hsv_hist(img) for img in images], dtype=np.float32))


def _normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.maximum(norms, 1e-9)


def mmr_select(quality: list[float], vectors: np.ndarray, k: int, lam: float = 0.6,
               forced: tuple[int, ...] = (0,)) -> list[int]:
    """Maximal marginal relevance: high quality, low similarity to frames already chosen."""
    n = len(quality)
    if n == 0:
        return []
    chosen: list[int] = [i for i in forced if i < n][:k]
    sims = vectors @ vectors.T
    while len(chosen) < min(k, n):
        best, best_score = None, -1e9
        for i in range(n):
            if i in chosen:
                continue
            redundancy = max(float(sims[i, j]) for j in chosen) if chosen else 0.0
            score = lam * quality[i] - (1 - lam) * redundancy
            if score > best_score:
                best, best_score = i, score
        chosen.append(best)
    return sorted(chosen)


# ------------------------------------------------------------------- OCR
def ocr_text(path: Path) -> str:
    global _OCR
    try:
        with _INIT_LOCK:
            if _OCR is None:
                from rapidocr import RapidOCR

                _OCR = RapidOCR()
        result = _OCR(str(path))
        texts = list(getattr(result, "txts", None) or [])
        scores = list(getattr(result, "scores", None) or [])
        kept = [t.strip() for t, sc in zip(texts, scores) if sc >= 0.6 and len(t.strip()) >= 2]
        return " ".join(kept)
    except Exception as exc:
        log.warning("OCR failed on %s: %s", path.name, exc)
        return ""


# --------------------------------------------------------------- main entry
def pick_frames(video: Path, clip_dir: Path, t_start: float, t_end: float) -> list[dict]:
    """Blocking part: extract, score, dedupe and select frames. Returns selected frame dicts."""
    settings = get_settings()
    frames = extract_frames(video, clip_dir / "frames", t_start, t_end, fps=1.0, width=640)
    items: list[dict] = []
    for i, path in enumerate(frames):
        image = cv2.imread(str(path))
        if image is None:
            continue
        items.append({"path": path, "image": image, "t": round(t_start + i + 0.5, 2),
                      "quality": frame_quality(image), "phash": imagehash.phash(Image.open(path))})
    if not items:
        return []
    # keep the opening frame (the hook) and drop near-duplicates
    unique: list[dict] = []
    for item in items:
        if unique and min(item["phash"] - u["phash"] for u in unique) <= 6:
            continue
        unique.append(item)
    vectors = _image_vectors([u["path"] for u in unique], [u["image"] for u in unique])
    chosen = mmr_select([u["quality"] for u in unique], vectors, settings.evidence_frames_per_clip)
    selected = [unique[i] for i in chosen]
    for item in selected:
        item["ocr"] = ocr_text(item["path"]) if settings.enable_ocr else ""
    return [{"path": i["path"], "t": i["t"], "quality": round(i["quality"], 3), "ocr": i["ocr"]} for i in selected]


async def caption_frames(frames: list[dict], clip_text: str) -> list[s.FrameCaption]:
    settings = get_settings()
    if not frames or not settings.enable_frame_captions or not role_available("vision"):
        return []
    images = []
    for frame in frames:
        image = cv2.imread(str(frame["path"]))
        ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            images.append((buf.tobytes(), "image/jpeg"))
    instructions = (
        "You describe video frames for an editor. For each image (in order, index from 0) give one short, "
        "factual sentence about what is visible (people, objects, setting, actions, on-screen graphics) and copy "
        "any readable on-screen text verbatim. Do not guess names or facts that are not visible."
    )
    prompt = f"These {len(images)} frames come from one short clip. What is said in the clip:\n{clip_text[:1500]}"
    try:
        result = await run_structured("vision", instructions, prompt, s.FrameCaptions, images=images,
                                      fake_context={"n_frames": len(images)})
        return result.frames
    except Exception as exc:
        log.warning("frame captions failed, continuing without them: %s", exc)
        return []


def build_facts(lines: list[dict], t_start: float, t_end: float, frames: list[dict],
                captions: list[s.FrameCaption], rel) -> list[dict]:
    facts: list[dict] = []
    clip_lines = [l for l in lines if l["e"] > t_start and l["s"] < t_end]
    for n, line in enumerate(clip_lines, start=1):
        facts.append({"key": f"S{n}", "kind": "speech", "t_start": line["s"], "t_end": line["e"],
                      "text": line["text"]})
    seen_text: set[str] = set()
    o = 0
    for frame in frames:
        text = frame.get("ocr", "").strip()
        norm = text.lower()
        if text and norm not in seen_text:
            seen_text.add(norm)
            o += 1
            facts.append({"key": f"O{o}", "kind": "ocr", "t_start": frame["t"], "t_end": frame["t"],
                          "text": text, "frame_path": rel(frame["path"])})
    by_index = {c.index: c for c in captions}
    for i, frame in enumerate(frames):
        cap = by_index.get(i)
        if not cap:
            continue
        text = cap.caption.strip()
        if cap.visible_text and cap.visible_text.strip().lower() not in seen_text:
            text += f' On-screen text: "{cap.visible_text.strip()}"'
        facts.append({"key": f"F{i + 1}", "kind": "frame", "t_start": frame["t"], "t_end": frame["t"],
                      "text": text, "frame_path": rel(frame["path"])})
    return facts
