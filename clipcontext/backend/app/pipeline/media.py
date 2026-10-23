"""Thin wrappers around ffmpeg / ffprobe (blocking; call from a worker thread)."""

from __future__ import annotations

import json
import logging
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)


class MediaError(RuntimeError):
    pass


def run(cmd: list[str], timeout: float | None = None) -> subprocess.CompletedProcess:
    log.debug("run: %s", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        tail = (proc.stderr or "")[-1500:]
        raise MediaError(f"{Path(cmd[0]).name} failed ({proc.returncode}): {tail}")
    return proc


@dataclass
class ProbeInfo:
    duration_s: float
    width: int
    height: int
    fps: float
    has_audio: bool
    video_codec: str | None
    rotation: int = 0

    @property
    def display_size(self) -> tuple[int, int]:
        if self.rotation in (90, 270, -90, -270):
            return self.height, self.width
        return self.width, self.height


def probe(path: Path) -> ProbeInfo:
    proc = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
               timeout=120)
    data = json.loads(proc.stdout or "{}")
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"
                  and not s.get("disposition", {}).get("attached_pic")), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if video is None:
        raise MediaError("no video stream found")
    duration = float(data.get("format", {}).get("duration") or video.get("duration") or 0)
    fps = _parse_rate(video.get("avg_frame_rate")) or _parse_rate(video.get("r_frame_rate")) or 25.0
    rotation = 0
    for side in video.get("side_data_list", []) or []:
        if "rotation" in side:
            rotation = int(side["rotation"])
    if "rotate" in (video.get("tags") or {}):
        rotation = int(video["tags"]["rotate"])
    return ProbeInfo(
        duration_s=duration,
        width=int(video.get("width") or 0),
        height=int(video.get("height") or 0),
        fps=fps,
        has_audio=audio is not None,
        video_codec=video.get("codec_name"),
        rotation=rotation,
    )


def _parse_rate(value: str | None) -> float | None:
    if not value or value in ("0/0", "0"):
        return None
    if "/" in value:
        num, den = value.split("/", 1)
        try:
            return float(num) / float(den) if float(den) else None
        except ValueError:
            return None
    try:
        return float(value)
    except ValueError:
        return None


def extract_audio_wav(video: Path, out_wav: Path) -> None:
    """16 kHz mono PCM: what speech models expect and cheap to analyse."""
    run(["ffmpeg", "-y", "-v", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000",
         "-c:a", "pcm_s16le", str(out_wav)])


def encode_audio_chunk(wav: Path, start: float, end: float, out_path: Path) -> None:
    """Compressed mono chunk for upload to a hosted ASR API (small, under free-tier size limits)."""
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.3f}", "-to", f"{end:.3f}", "-i", str(wav),
         "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", str(out_path)])


def read_wav_mono(wav: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(wav), "rb") as handle:
        rate = handle.getframerate()
        frames = handle.readframes(handle.getnframes())
    samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    return samples, rate


def rms_envelope(wav: Path, window_s: float = 0.1) -> tuple[np.ndarray, float]:
    """RMS loudness per window. Returns (values, window_seconds)."""
    samples, rate = read_wav_mono(wav)
    size = max(1, int(rate * window_s))
    usable = len(samples) // size * size
    if usable == 0:
        return np.zeros(0, dtype=np.float32), window_s
    frames = samples[:usable].reshape(-1, size)
    return np.sqrt((frames ** 2).mean(axis=1)), window_s


def extract_frames(video: Path, out_dir: Path, start: float | None, end: float | None,
                   fps: float, width: int, pattern: str = "f_%05d.jpg") -> list[Path]:
    """Write frames at ``fps`` (scaled to ``width``) and return them in order."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.jpg"):
        old.unlink()
    cmd = ["ffmpeg", "-y", "-v", "error"]
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    if end is not None:
        cmd += ["-to", f"{end:.3f}"]
    cmd += ["-i", str(video), "-vf", f"fps={fps},scale={width}:-2", "-q:v", "4", str(out_dir / pattern)]
    run(cmd)
    return sorted(out_dir.glob("*.jpg"))
