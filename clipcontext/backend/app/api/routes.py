"""REST endpoints. Heavy work is always queued; the UI polls GET /sources/{id}."""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import require_token
from app.api.schemas import RegenerateRequest, SelectTitleRequest, SourceFromUrl
from app.core import storage
from app.core.config import get_settings
from app.db import repo
from app.jobs import tasks
from app.llm.client import models_for

router = APIRouter(dependencies=[Depends(require_token)])

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}


def media_url(relative: str | None) -> str | None:
    return f"/media/{relative}" if relative else None


async def _source_or_404(source_id: str) -> dict:
    try:
        source = await repo.get_source(source_id)
    except Exception:
        source = None
    if source is None:
        raise HTTPException(404, "source not found")
    return source


async def _clip_or_404(clip_id: str) -> dict:
    try:
        clip = await repo.get_clip(clip_id)
    except Exception:
        clip = None
    if clip is None:
        raise HTTPException(404, "clip not found")
    return clip


def _source_summary(source: dict) -> dict:
    keys = ("id", "origin", "url", "title", "duration_s", "width", "height", "language_mode", "channel_handle",
            "status", "stage", "error", "created_at", "updated_at")
    return {k: source.get(k) for k in keys}


async def _clip_view(clip: dict, with_metadata: bool = False) -> dict[str, Any]:
    render = await repo.latest_render(str(clip["id"]))
    view = {k: clip.get(k) for k in ("id", "source_id", "rank", "t_start", "t_end", "hook_title", "hook_type",
                                     "scores", "reasoning", "status", "stage", "error", "chosen_title_id")}
    view["duration_s"] = round(clip["t_end"] - clip["t_start"], 2)
    view["video_url"] = media_url(render["file_path"]) if render else None
    view["thumb_url"] = media_url(render["thumb_path"]) if render else None
    view["download_url"] = f"/clips/{clip['id']}/download" if render else None
    if with_metadata:
        view["metadata"] = await _metadata(str(clip["id"]), get_settings().top_k)
    return view


async def _metadata(clip_id: str, limit: int | None) -> dict:
    out = {}
    for pool in ("title", "description", "hashtags"):
        rows = await repo.latest_candidates(clip_id, pool)
        if limit:
            rows = [r for r in rows if r["passed_filters"]][:limit] or rows[:limit]
        out[pool] = [_candidate_view(r) for r in rows]
    return out


def _candidate_view(row: dict) -> dict:
    return {k: row.get(k) for k in ("id", "pool", "generation", "rank", "strategy", "text", "hashtags", "tags",
                                    "fact_keys", "filter_flags", "passed_filters", "scores", "final_score",
                                    "judge_reason", "conditioned_on")}


# =================================================================== sources
@router.post("/sources", status_code=201, tags=["sources"])
async def create_source_from_url(body: SourceFromUrl) -> dict:
    language = body.language_mode or get_settings().default_language_mode
    source = await repo.create_source("url", str(body.url), language, body.channel_handle)
    await tasks.defer_source(str(source["id"]))
    return _source_summary(source)


@router.post("/sources/upload", status_code=201, tags=["sources"])
async def create_source_from_upload(
    file: UploadFile = File(...),
    language_mode: str | None = Form(default=None),
    channel_handle: str | None = Form(default=None),
) -> dict:
    settings = get_settings()
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in VIDEO_EXTENSIONS:
        raise HTTPException(400, f"unsupported file type {suffix or '(none)'}; use one of {sorted(VIDEO_EXTENSIONS)}")
    language = language_mode or settings.default_language_mode
    if language not in ("en", "hinglish"):
        raise HTTPException(400, "language_mode must be 'en' or 'hinglish'")
    title = re.sub(r"[_\-]+", " ", Path(file.filename or "upload").stem).strip()[:200]
    source = await repo.create_source("upload", None, language, channel_handle, title)
    source_id = str(source["id"])
    target = storage.source_dir(source_id) / f"source{suffix}"
    limit = settings.max_upload_mb * 1024 * 1024
    written = 0
    try:
        with target.open("wb") as out:
            while chunk := await file.read(8 * 1024 * 1024):
                written += len(chunk)
                if written > limit:
                    raise HTTPException(413, f"file is larger than {settings.max_upload_mb} MB")
                out.write(chunk)
    except HTTPException:
        await repo.delete_source(source_id)
        storage.remove_source_files(source_id)
        raise
    await repo.update_source(source_id, file_path=storage.rel(target))
    await tasks.defer_source(source_id)
    return _source_summary(await repo.get_source(source_id))


@router.get("/sources", tags=["sources"])
async def list_sources(limit: int = Query(default=50, le=200)) -> list[dict]:
    return [_source_summary(s) for s in await repo.list_sources(limit)]


@router.get("/sources/{source_id}", tags=["sources"])
async def get_source(source_id: str) -> dict:
    source = await _source_or_404(source_id)
    clips = await repo.list_clips(source_id)
    stages = await repo.list_stages(source_id)
    analysis = source.get("analysis") or {}
    return {
        **_source_summary(source),
        "analysis": {k: analysis.get(k) for k in ("summary", "key_topics", "niche_queries", "youtube_category_id")},
        "stages": stages,
        "clips": [await _clip_view(c) for c in clips],
        "progress": _progress(source, stages, clips),
    }


def _progress(source: dict, stages: list[dict], clips: list[dict]) -> dict:
    source_done = sum(1 for s in stages if s["clip_id"] is None and s["status"] == "done")
    clip_done = sum(1 for s in stages if s["clip_id"] is not None and s["status"] == "done")
    total = 5 + 3 * max(len(clips), 1)
    return {"percent": round(100 * (source_done + clip_done) / total, 1) if source["status"] != "completed" else 100.0,
            "source_stages_done": source_done, "clips_done": sum(1 for c in clips if c["status"] == "done"),
            "clips_total": len(clips)}


@router.post("/sources/{source_id}/resume", tags=["sources"])
async def resume_source(source_id: str) -> dict:
    source = await _source_or_404(source_id)
    if source["status"] in ("processing", "clips_processing", "queued"):
        raise HTTPException(409, f"source is {source['status']}; nothing to resume")
    await repo.reset_failed_stages(source_id)
    await repo.update_source(source_id, status="queued", error=None)
    await tasks.defer_source(source_id)
    return _source_summary(await repo.get_source(source_id))


@router.post("/sources/{source_id}/cancel", tags=["sources"])
async def cancel_source(source_id: str) -> dict:
    source = await _source_or_404(source_id)
    if source["status"] in ("completed", "completed_with_errors", "error", "cancelled"):
        raise HTTPException(409, f"source is already {source['status']}")
    await repo.update_source(source_id, status="cancel_requested")
    return _source_summary(await repo.get_source(source_id))


@router.delete("/sources/{source_id}", status_code=204, tags=["sources"])
async def delete_source(source_id: str) -> None:
    source = await _source_or_404(source_id)
    if source["status"] in ("processing", "clips_processing"):
        raise HTTPException(409, "cancel the source before deleting it")
    await repo.delete_source(source_id)
    storage.remove_source_files(source_id)


# ===================================================================== clips
@router.get("/clips/{clip_id}", tags=["clips"])
async def get_clip(clip_id: str) -> dict:
    clip = await _clip_or_404(clip_id)
    view = await _clip_view(clip, with_metadata=True)
    view["evidence"] = [{k: f[k] for k in ("fact_key", "kind", "t_start", "t_end", "text")} | {
        "frame_url": media_url(f["frame_path"])} for f in await repo.list_facts(clip_id)]
    return view


@router.get("/clips/{clip_id}/metadata", tags=["metadata"])
async def get_metadata(clip_id: str, all: bool = Query(default=False, description="return every candidate")) -> dict:
    await _clip_or_404(clip_id)
    return await _metadata(clip_id, None if all else get_settings().top_k)


@router.get("/clips/{clip_id}/package", tags=["metadata"])
async def get_package(clip_id: str) -> dict:
    """Copy-ready metadata: chosen (or top) title, top description, top hashtag set."""
    clip = await _clip_or_404(clip_id)
    source = await repo.get_source(str(clip["source_id"]))
    meta = await _metadata(clip_id, 1)
    title = None
    if clip.get("chosen_title_id"):
        row = await repo.get_candidate(str(clip["chosen_title_id"]))
        title = row["text"] if row else None
    title = title or (meta["title"][0]["text"] if meta["title"] else clip.get("hook_title"))
    description = meta["description"][0]["text"] if meta["description"] else ""
    tagset = meta["hashtags"][0] if meta["hashtags"] else {"hashtags": [], "tags": []}
    hashtags = tagset.get("hashtags") or []
    if hashtags and not any(h.lower() in description.lower() for h in hashtags[:3]):
        description = f"{description}\n\n{' '.join(hashtags[:5])}".strip()
    analysis = (source or {}).get("analysis") or {}
    return {"title": title, "description": description, "hashtags": hashtags, "tags": tagset.get("tags") or [],
            "youtube_category_id": analysis.get("youtube_category_id"),
            "language": "hi-Latn" if (source or {}).get("language_mode") == "hinglish" else "en"}


@router.post("/clips/{clip_id}/metadata/regenerate", status_code=202, tags=["metadata"])
async def regenerate(clip_id: str, body: RegenerateRequest) -> dict:
    clip = await _clip_or_404(clip_id)
    if clip["status"] != "done":
        raise HTTPException(409, "clip is still processing")
    await tasks.defer_regenerate(clip_id, body.pool, body.title_id)
    return {"queued": True, "pool": body.pool}


@router.post("/clips/{clip_id}/select-title", tags=["metadata"])
async def select_title(clip_id: str, body: SelectTitleRequest) -> dict:
    clip = await _clip_or_404(clip_id)
    candidate = await repo.get_candidate(body.title_id)
    if candidate is None or str(candidate["clip_id"]) != clip_id or candidate["pool"] != "title":
        raise HTTPException(400, "title_id is not a title candidate of this clip")
    await repo.update_clip(clip_id, chosen_title_id=body.title_id)
    if body.regenerate_dependents and clip["status"] == "done":
        await tasks.defer_regenerate(clip_id, "description", body.title_id)
        await tasks.defer_regenerate(clip_id, "hashtags", body.title_id)
    return {"chosen_title_id": body.title_id, "regenerating": body.regenerate_dependents}


@router.get("/clips/{clip_id}/download", tags=["clips"])
async def download_clip(clip_id: str) -> FileResponse:
    clip = await _clip_or_404(clip_id)
    render = await repo.latest_render(clip_id)
    if render is None:
        raise HTTPException(404, "clip has not been rendered yet")
    path = storage.abs_path(render["file_path"])
    name = re.sub(r"[^\w\- ]", "", clip.get("hook_title") or "clip").strip().replace(" ", "_")[:60] or "clip"
    return FileResponse(path, media_type="video/mp4", filename=f"{clip['rank']:02d}_{name}.mp4")


# ===================================================================== media
@router.get("/media/{relative:path}", tags=["media"])
async def media(relative: str) -> FileResponse:
    try:
        path = storage.abs_path(relative)
    except ValueError:
        raise HTTPException(404, "not found")
    if not path.is_file():
        raise HTTPException(404, "not found")
    return FileResponse(path)


# ==================================================================== system
@router.get("/system/status", tags=["system"])
async def system_status() -> dict:
    settings = get_settings()
    return {
        "llm_mode": settings.llm_mode,
        "keys": {"google": bool(settings.google_api_key), "groq": bool(settings.groq_api_key),
                 "youtube": bool(settings.youtube_api_key)},
        "models": {role: models_for(role) for role in ("selection", "vision", "generator", "judge", "helper")},
        "transcription_provider": settings.transcription_provider,
        "ffmpeg": bool(shutil.which("ffmpeg")) and bool(shutil.which("ffprobe")),
        "face_model": settings.yunet_model_path.exists(),
        "media_dir": str(storage.media_root()),
    }
