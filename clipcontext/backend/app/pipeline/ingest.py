"""Stage 1: get the long video onto disk, validate it, extract audio."""

from __future__ import annotations

import logging
from pathlib import Path

from app.core.config import get_settings
from app.pipeline.media import MediaError, ProbeInfo, extract_audio_wav, probe

log = logging.getLogger(__name__)


class IngestError(RuntimeError):
    pass


def download_url(url: str, out_dir: Path) -> tuple[Path, str | None]:
    """Download with yt-dlp. Returns (file path, title)."""
    import yt_dlp

    settings = get_settings()
    out_dir.mkdir(parents=True, exist_ok=True)
    options = {
        "format": settings.ytdlp_format,
        "outtmpl": str(out_dir / "source.%(ext)s"),
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "retries": 5,
        "fragment_retries": 5,
        "concurrent_fragment_downloads": 4,
    }
    with yt_dlp.YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=True)
        if info is None:
            raise IngestError("yt-dlp returned no information for this URL")
        if info.get("is_live"):
            raise IngestError("live streams are not supported")
        path = Path(ydl.prepare_filename(info))
    if not path.exists():
        candidates = sorted(out_dir.glob("source.*"), key=lambda p: p.stat().st_size, reverse=True)
        candidates = [c for c in candidates if c.suffix not in (".part", ".ytdl", ".json")]
        if not candidates:
            raise IngestError("download finished but no file was found")
        path = candidates[0]
    return path, info.get("title")


def validate(path: Path) -> ProbeInfo:
    settings = get_settings()
    try:
        info = probe(path)
    except MediaError as exc:
        raise IngestError(f"not a readable video: {exc}") from exc
    if not info.has_audio:
        raise IngestError("the video has no audio track; clips are chosen from speech")
    if info.duration_s < settings.min_duration_s:
        raise IngestError(f"video is too short ({info.duration_s:.0f}s); minimum is {settings.min_duration_s}s")
    if info.duration_s > settings.max_duration_s:
        raise IngestError(
            f"video is too long ({info.duration_s / 60:.0f} min); maximum is {settings.max_duration_s / 60:.0f} min"
        )
    width, height = info.display_size
    if width < 320 or height < 240:
        raise IngestError(f"resolution {width}x{height} is too small")
    return info


def extract_audio(video: Path, out_wav: Path) -> None:
    extract_audio_wav(video, out_wav)
