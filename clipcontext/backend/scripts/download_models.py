"""Download optional models at build time so the first job does not stall.

Each step is best-effort: the pipeline falls back (Haar cascade, colour histograms,
TF-IDF) when a model is missing.
"""

from __future__ import annotations

import os
import sys
import urllib.request
from pathlib import Path

YUNET_URL = ("https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/"
             "face_detection_yunet_2023mar.onnx")


def yunet(target: Path) -> None:
    if target.exists() and target.stat().st_size > 100_000:
        print("yunet: present")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        urllib.request.urlretrieve(YUNET_URL, target)
        if target.stat().st_size < 100_000:
            raise RuntimeError("download too small (LFS pointer?)")
        print("yunet: downloaded")
    except Exception as exc:  # noqa: BLE001
        target.unlink(missing_ok=True)
        print(f"yunet: skipped ({exc}); Haar cascade fallback will be used", file=sys.stderr)


def fastembed_models() -> None:
    try:
        from fastembed import ImageEmbedding, TextEmbedding

        TextEmbedding(os.environ.get("TEXT_EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5"))
        ImageEmbedding(os.environ.get("IMAGE_EMBEDDING_MODEL", "Qdrant/clip-ViT-B-32-vision"))
        print("fastembed: cached")
    except Exception as exc:  # noqa: BLE001
        print(f"fastembed: skipped ({exc}); fallbacks will be used", file=sys.stderr)


def ocr_models() -> None:
    try:
        from rapidocr import RapidOCR

        RapidOCR()
        print("rapidocr: ready")
    except Exception as exc:  # noqa: BLE001
        print(f"rapidocr: skipped ({exc})", file=sys.stderr)


def whisper_model() -> None:
    if os.environ.get("PRELOAD_LOCAL_WHISPER", "0") != "1":
        return
    try:
        from faster_whisper import WhisperModel

        WhisperModel(os.environ.get("LOCAL_WHISPER_MODEL", "small"), device="cpu", compute_type="int8")
        print("faster-whisper: cached")
    except Exception as exc:  # noqa: BLE001
        print(f"faster-whisper: skipped ({exc})", file=sys.stderr)


if __name__ == "__main__":
    yunet(Path(os.environ.get("YUNET_MODEL_PATH", "/app/models/face_detection_yunet_2023mar.onnx")))
    fastembed_models()
    ocr_models()
    whisper_model()
