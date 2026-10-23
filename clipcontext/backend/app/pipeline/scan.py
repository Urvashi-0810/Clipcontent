"""Stage 3: coarse visual scan of the whole video (cheap, CPU friendly).

One small frame every few seconds -> colour-histogram change per step.
Used as a 'visual change' signal for clip selection; heavy visual work is
done later and only inside the selected clips.
"""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

import cv2
import numpy as np

from app.core.config import get_settings
from app.pipeline.media import extract_frames

log = logging.getLogger(__name__)


def hsv_hist(image: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])
    cv2.normalize(hist, hist)
    return hist.flatten()


def coarse_scan(video: Path, work_dir: Path, duration_s: float) -> dict:
    settings = get_settings()
    interval = max(1, settings.coarse_frame_interval_s)
    frames_dir = work_dir / "coarse"
    frames = extract_frames(video, frames_dir, None, None, fps=1.0 / interval, width=160)
    times: list[float] = []
    changes: list[float] = []
    previous = None
    for index, path in enumerate(frames):
        image = cv2.imread(str(path))
        if image is None:
            continue
        hist = hsv_hist(image)
        t = index * interval + interval / 2
        change = 0.0 if previous is None else float(cv2.compareHist(previous, hist, cv2.HISTCMP_BHATTACHARYYA))
        times.append(round(min(t, duration_s), 2))
        changes.append(round(change, 4))
        previous = hist
    shutil.rmtree(frames_dir, ignore_errors=True)
    arr = np.array(changes) if changes else np.zeros(0)
    threshold = float(max(0.35, arr.mean() + 2 * arr.std())) if arr.size else 0.35
    cuts = [t for t, c in zip(times, changes) if c >= threshold]
    return {"interval_s": interval, "times": times, "change": changes, "cut_threshold": threshold, "cuts": cuts}
