FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/cache/hf \
    FASTEMBED_CACHE_PATH=/app/cache/fastembed \
    YUNET_MODEL_PATH=/app/models/face_detection_yunet_2023mar.onnx

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core fonts-dejavu-core libgomp1 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --upgrade pip && pip install .

COPY scripts ./scripts
ARG PRELOAD_LOCAL_WHISPER=0
RUN PRELOAD_LOCAL_WHISPER=${PRELOAD_LOCAL_WHISPER} python scripts/download_models.py || true

RUN useradd --create-home --uid 1000 clipcontext \
 && mkdir -p /data/media /app/cache \
 && chown -R clipcontext:clipcontext /data /app
USER clipcontext

ENV MEDIA_DIR=/data/media
EXPOSE 8000
CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
