"""Runtime configuration, read from environment variables / .env."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore")

    # --- infrastructure -------------------------------------------------
    database_url: str = "postgresql://clipcontext:clipcontext@localhost:5432/clipcontext"
    media_dir: Path = Path("./media")
    api_token: str | None = None  # optional shared secret for the API (single-user tool)
    log_level: str = "INFO"
    max_upload_mb: int = 8000

    # --- provider keys (read by pydantic-ai / our own clients) ----------
    google_api_key: str | None = None
    groq_api_key: str | None = None
    youtube_api_key: str | None = None

    # --- LLM routing: comma-separated fallback chains ------------------
    # "fake" mode returns deterministic outputs and is used for tests and dry runs.
    llm_mode: Literal["live", "fake"] = "live"
    llm_selection_models: str = "google:gemini-3.8-flash,google:gemini-3.5-flash,google:gemini-3.5-flash-lite"
    llm_vision_models: str = "google:gemini-3.8-flash,google:gemini-3.5-flash,google:gemini-3.5-flash-lite"
    llm_generator_models: str = "groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b,google:gemini-3.5-flash-lite"
    llm_judge_models: str = "google:gemini-3.8-flash,google:gemini-3.5-flash,groq:qwen/qwen3.8-27b"
    llm_helper_models: str = "groq:qwen/qwen3.8-27b,google:gemini-3.5-flash-lite"
    llm_max_attempts: int = 5
    llm_backoff_seconds: float = 8.0
    llm_timeout_seconds: float = 180.0

    # --- transcription --------------------------------------------------
    transcription_provider: Literal["auto", "groq", "local", "fake"] = "auto"
    groq_whisper_model: str = "whisper-large-v3-turbo"
    groq_whisper_model_hinglish: str = "whisper-large-v3"
    local_whisper_model: str = "small"
    local_whisper_threads: int = 6
    audio_chunk_seconds: int = 600
    default_language_mode: Literal["en", "hinglish"] = "en"

    # --- ingest ---------------------------------------------------------
    min_duration_s: int = 60
    max_duration_s: int = 3 * 60 * 60
    ytdlp_format: str = "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]/bv*+ba/b"

    # --- analysis -------------------------------------------------------
    coarse_frame_interval_s: int = 5
    selection_window_minutes: int = 45
    selection_window_overlap_minutes: int = 5
    clips_min: int = 3
    clips_max: int = 10
    minutes_per_clip: int = 15
    clip_min_s: int = 20
    clip_max_s: int = 60

    # --- evidence -------------------------------------------------------
    evidence_frames_per_clip: int = 8
    enable_ocr: bool = True
    enable_frame_captions: bool = True
    image_embedding_model: str = "Qdrant/clip-ViT-B-32-vision"
    text_embedding_model: str = "BAAI/bge-small-en-v1.5"

    # --- rendering ------------------------------------------------------
    output_width: int = 1080
    output_height: int = 1920
    render_crf: int = 23
    render_preset: str = "veryfast"
    render_threads: int = 3
    subtitle_font: str = "Noto Sans"
    subtitle_font_size: int = 74
    hook_font_size: int = 70
    hook_title_seconds: float = 3.0
    face_sample_fps: float = 2.0
    yunet_model_path: Path = Path("./models/face_detection_yunet_2023mar.onnx")

    # --- niche trends (YouTube Data API, key only) ----------------------
    niche_search_days: int = 90
    niche_max_search_calls: int = 3
    niche_benchmark_size: int = 25
    niche_cache_days: int = 3
    niche_region_code: str | None = None
    niche_video_duration: Literal["short", "medium", "any"] = "short"

    # --- metadata engine ------------------------------------------------
    candidates_per_pool: int = 10
    top_k: int = 5
    judge_shuffles: int = 2
    pairwise_top: int = 5
    near_duplicate_threshold: float = 0.9
    anti_copy_ratio: int = 85

    # --- worker ---------------------------------------------------------
    worker_concurrency: int = 2

    # derived helpers -----------------------------------------------------
    def chain(self, name: str) -> list[str]:
        return _split(getattr(self, name))

    @property
    def sources_dir(self) -> Path:
        return self.media_dir / "sources"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    # pydantic-ai providers read keys from the process environment; values that came
    # from a .env file are exported here so both paths behave the same.
    for env_name, value in (
        ("GOOGLE_API_KEY", settings.google_api_key),
        ("GROQ_API_KEY", settings.groq_api_key),
    ):
        if value and not os.environ.get(env_name):
            os.environ[env_name] = value
    return settings


def reset_settings_cache() -> None:
    get_settings.cache_clear()
