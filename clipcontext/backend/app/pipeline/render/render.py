"""One ffmpeg pass per clip: cut + crop/fit + scale + burned ASS subtitles."""

from __future__ import annotations

import logging
from pathlib import Path

from app.core.config import get_settings
from app.pipeline.media import run
from app.pipeline.render.reframe import CropPlan

log = logging.getLogger(__name__)


def filter_chain(plan: CropPlan, ass_path: Path) -> str:
    st = get_settings()
    out_w, out_h = st.output_width, st.output_height
    if plan.mode == "fit":
        video = (f"scale={out_w}:{out_h}:force_original_aspect_ratio=decrease:flags=lanczos,"
                 f"pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:color=black")
    else:
        video = (f"crop=w={plan.crop_w}:h={plan.crop_h}:x={plan.x_expression()}:y=0,"
                 f"scale={out_w}:{out_h}:flags=lanczos")
    subs = str(ass_path).replace("\\", "/").replace("'", r"\'").replace(":", r"\:")
    return f"{video},setsar=1,subtitles=filename='{subs}'"


def render_clip(source: Path, t_start: float, t_end: float, plan: CropPlan, ass_path: Path, out_path: Path) -> None:
    st = get_settings()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(".partial.mp4")
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-ss", f"{t_start:.3f}", "-to", f"{t_end:.3f}", "-i", str(source),
        "-vf", filter_chain(plan, ass_path),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-c:v", "libx264", "-preset", st.render_preset, "-crf", str(st.render_crf),
        "-pix_fmt", "yuv420p", "-threads", str(st.render_threads),
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
        "-movflags", "+faststart",
        str(tmp),
    ]
    run(cmd)
    tmp.replace(out_path)


def make_thumbnail(clip_file: Path, out_jpg: Path, at: float = 0.6) -> None:
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{at:.2f}", "-i", str(clip_file), "-frames:v", "1",
         "-vf", "scale=540:-2", "-q:v", "3", str(out_jpg)])
