"""Background tasks run by the Procrastinate worker."""

from __future__ import annotations

import logging

import procrastinate.exceptions

from app.db import repo
from app.jobs.app import app
from app.jobs.stages import Cancelled, run_clip_stages, run_source_stages
from app.metadata import engine

log = logging.getLogger(__name__)

TERMINAL_CLIP = {"done", "error", "cancelled"}


@app.task(name="process_source", queue="pipeline", pass_context=False)
async def process_source(source_id: str) -> None:
    source = await repo.get_source(source_id)
    if source is None or source["status"] == "cancelled":
        return
    if source["status"] == "cancel_requested":
        await repo.update_source(source_id, status="cancelled")
        return
    await repo.update_source(source_id, status="processing", error=None)
    try:
        await run_source_stages(source_id)
    except Cancelled:
        await repo.update_source(source_id, status="cancelled")
        return
    except Exception as exc:
        await repo.update_source(source_id, status="error", error=str(exc)[:2000])
        return
    clips = await repo.list_clips(source_id)
    pending = [c for c in clips if c["status"] != "done"]
    if not pending:
        await finalize_source(source_id)
        return
    await repo.update_source(source_id, status="clips_processing", stage="clips")
    for clip in pending:
        await repo.update_clip(str(clip["id"]), status="queued", error=None)
        await defer_clip(str(clip["id"]))


@app.task(name="process_clip", queue="pipeline", pass_context=False)
async def process_clip(clip_id: str) -> None:
    clip = await repo.get_clip(clip_id)
    if clip is None:
        return
    source_id = str(clip["source_id"])
    source = await repo.get_source(source_id)
    if source is None or source["status"] in ("cancel_requested", "cancelled"):
        await repo.update_clip(clip_id, status="cancelled")
        await finalize_source(source_id)
        return
    await repo.update_clip(clip_id, status="processing", error=None)
    try:
        await run_clip_stages(clip_id)
        await repo.update_clip(clip_id, status="done", stage="done")
    except Cancelled:
        await repo.update_clip(clip_id, status="cancelled")
    except Exception as exc:
        await repo.update_clip(clip_id, status="error", error=str(exc)[:2000])
    await finalize_source(source_id)


@app.task(name="regenerate_metadata", queue="metadata", pass_context=False)
async def regenerate_metadata(clip_id: str, pool: str, title_id: str | None = None) -> None:
    clip = await repo.get_clip(clip_id)
    if clip is None:
        return
    source = await repo.get_source(str(clip["source_id"]))
    try:
        await engine.regenerate(clip, source, pool, title_id)
    except Exception as exc:
        log.exception("regenerate failed")
        await repo.update_clip(clip_id, error=f"regenerate {pool} failed: {exc}"[:2000])


async def finalize_source(source_id: str) -> None:
    source = await repo.get_source(source_id)
    if source is None or source["status"] in ("cancelled", "error"):
        return
    clips = await repo.list_clips(source_id)
    if source["status"] == "cancel_requested":
        if all(c["status"] in TERMINAL_CLIP | {"queued"} for c in clips):
            await repo.update_source(source_id, status="cancelled")
        return
    if not all(c["status"] in TERMINAL_CLIP for c in clips):
        return
    failed = sum(1 for c in clips if c["status"] != "done")
    status = "completed" if failed == 0 else ("error" if failed == len(clips) else "completed_with_errors")
    await repo.update_source(source_id, status=status, stage="done",
                             error=None if failed == 0 else f"{failed} of {len(clips)} clips failed")


async def defer_source(source_id: str) -> None:
    try:
        await process_source.configure(lock=f"source:{source_id}",
                                       queueing_lock=f"source:{source_id}").defer_async(source_id=source_id)
    except procrastinate.exceptions.AlreadyEnqueued:
        log.info("source %s already queued", source_id)


async def defer_clip(clip_id: str) -> None:
    try:
        await process_clip.configure(lock=f"clip:{clip_id}",
                                     queueing_lock=f"clip:{clip_id}").defer_async(clip_id=clip_id)
    except procrastinate.exceptions.AlreadyEnqueued:
        log.info("clip %s already queued", clip_id)


async def defer_regenerate(clip_id: str, pool: str, title_id: str | None) -> None:
    await regenerate_metadata.configure(lock=f"meta:{clip_id}:{pool}").defer_async(
        clip_id=clip_id, pool=pool, title_id=title_id)
