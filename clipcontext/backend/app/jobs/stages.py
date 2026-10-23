"""Pipeline stages. Each stage is idempotent and checkpointed in pipeline_runs."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Awaitable, Callable

from app.core import storage
from app.core.config import get_settings
from app.db import repo
from app.metadata import engine
from app.metadata.niche import cache_key, fetch_benchmark
from app.metadata.style import build_style_profile
from app.pipeline import evidence, ingest, scan, select_clips, signals, transcribe
from app.pipeline.render import reframe, render, subtitles

log = logging.getLogger(__name__)

SOURCE_STAGES = ("ingest", "transcribe", "scan", "select", "niche")
CLIP_STAGES = ("evidence", "render", "metadata")


class Cancelled(Exception):
    pass


async def check_cancel(source_id: str) -> None:
    source = await repo.get_source(source_id)
    if source is None or source["status"] in ("cancel_requested", "cancelled"):
        raise Cancelled()


async def run_stage(source_id: str, stage: str, fn: Callable[[], Awaitable[dict | None]],
                    clip_id: str | None = None) -> None:
    if await repo.stage_status(source_id, stage, clip_id) == "done":
        log.info("skip %s (already done) source=%s clip=%s", stage, source_id, clip_id)
        return
    await check_cancel(source_id)
    await repo.stage_start(source_id, stage, clip_id)
    if clip_id:
        await repo.update_clip(clip_id, stage=stage)
    else:
        await repo.update_source(source_id, stage=stage)
    started = time.monotonic()
    try:
        info = await fn()
    except Cancelled:
        await repo.stage_finish(source_id, stage, clip_id, "error", error="cancelled")
        raise
    except Exception as exc:
        log.exception("stage %s failed", stage)
        await repo.stage_finish(source_id, stage, clip_id, "error", error=str(exc)[:2000])
        raise
    info = dict(info or {})
    info["wall_seconds"] = round(time.monotonic() - started, 2)
    await repo.stage_finish(source_id, stage, clip_id, "done", info=info)
    log.info("stage %s done in %.1fs source=%s clip=%s", stage, info["wall_seconds"], source_id, clip_id)


# =============================================================== source stages
async def stage_ingest(source: dict) -> dict:
    source_id = str(source["id"])
    folder = storage.source_dir(source_id)
    title = source.get("title")
    if source.get("file_path") and storage.abs_path(source["file_path"]).exists():
        video = storage.abs_path(source["file_path"])
    elif source["origin"] == "url":
        video, title = await asyncio.to_thread(ingest.download_url, source["url"], folder)
    else:
        raise ingest.IngestError("uploaded file is missing")
    info = await asyncio.to_thread(ingest.validate, video)
    wav = folder / "audio.wav"
    await asyncio.to_thread(ingest.extract_audio, video, wav)
    width, height = info.display_size
    await repo.update_source(source_id, file_path=storage.rel(video), audio_path=storage.rel(wav),
                             duration_s=info.duration_s, width=width, height=height, fps=info.fps,
                             title=title or source.get("title") or video.stem)
    return {"duration_s": info.duration_s, "size": [width, height], "fps": info.fps}


async def stage_transcribe(source: dict) -> dict:
    source_id = str(source["id"])
    folder = storage.source_dir(source_id)
    wav = storage.abs_path(source["audio_path"])
    data = await asyncio.to_thread(transcribe.transcribe, wav, source["duration_s"], source["language_mode"], folder)
    path = folder / "transcript.json"
    storage.write_json(path, data)
    await repo.save_transcript(source_id, data["provider"], data["model"], data["language"],
                               storage.rel(path), len(data["words"]))
    if not data["words"]:
        raise RuntimeError("no speech was found in this video")
    return {"provider": data["provider"], "model": data["model"], "words": len(data["words"]),
            "lines": len(data["lines"])}


async def stage_scan(source: dict) -> dict:
    source_id = str(source["id"])
    folder = storage.source_dir(source_id)
    video = storage.abs_path(source["file_path"])
    result = await asyncio.to_thread(scan.coarse_scan, video, folder, source["duration_s"])
    storage.write_json(folder / "scan.json", result)
    return {"frames": len(result["times"]), "cuts": len(result["cuts"])}


async def load_transcript(source_id: str) -> dict:
    row = await repo.get_transcript(source_id)
    if row is None:
        raise RuntimeError("transcript missing; transcribe stage has not run")
    return storage.read_json(storage.abs_path(row["path"]))


async def stage_select(source: dict) -> dict:
    source_id = str(source["id"])
    folder = storage.source_dir(source_id)
    transcript = await load_transcript(source_id)
    scan_path = folder / "scan.json"
    scan_data = storage.read_json(scan_path) if scan_path.exists() else None
    wav = storage.abs_path(source["audio_path"])
    hints = await asyncio.to_thread(signals.compute_signals, transcript["lines"], wav, scan_data)
    result = await select_clips.select_clips(transcript, hints, source["duration_s"], source["language_mode"])
    if not result["clips"]:
        raise RuntimeError("the model returned no usable clips")
    await repo.replace_clips(source_id, result["clips"])
    analysis = dict(source.get("analysis") or {})
    analysis.update(result["profile"])
    analysis["signals"] = hints[:10]
    await repo.update_source(source_id, analysis=analysis)
    return {"clips": len(result["clips"]), "windows": result["profile"].get("windows")}


async def stage_niche(source: dict) -> dict:
    settings = get_settings()
    source_id = str(source["id"])
    analysis = source.get("analysis") or {}
    queries = [q for q in analysis.get("niche_queries", []) if q][:5]
    key = cache_key(queries, source["language_mode"], source.get("channel_handle"))
    await repo.purge_old_niche_data()
    cached = await repo.find_niche_profile(key, settings.niche_cache_days)
    if cached:
        await repo.update_source(source_id, niche_profile_id=str(cached["id"]))
        return {"cached": True, "benchmark": len(cached["benchmark"])}
    benchmark, calls = await fetch_benchmark(queries, source["language_mode"], source.get("channel_handle"))
    style = await build_style_profile(benchmark)
    profile = await repo.save_niche_profile(key, queries, source["language_mode"], benchmark, style, calls)
    await repo.update_source(source_id, niche_profile_id=str(profile["id"]))
    return {"cached": False, "benchmark": len(benchmark), "search_calls": calls}


SOURCE_STAGE_FNS = {
    "ingest": stage_ingest, "transcribe": stage_transcribe, "scan": stage_scan,
    "select": stage_select, "niche": stage_niche,
}


# ================================================================= clip stages
async def stage_evidence(clip: dict, source: dict) -> dict:
    clip_id, source_id = str(clip["id"]), str(source["id"])
    folder = storage.clip_dir(source_id, clip_id)
    video = storage.abs_path(source["file_path"])
    frames = await asyncio.to_thread(evidence.pick_frames, video, folder, clip["t_start"], clip["t_end"])
    transcript = await load_transcript(source_id)
    captions = await evidence.caption_frames(frames, clip.get("transcript_text") or "")
    facts = evidence.build_facts(transcript["lines"], clip["t_start"], clip["t_end"], frames, captions, storage.rel)
    await repo.replace_facts(clip_id, facts)
    return {"frames": len(frames), "facts": len(facts), "captions": len(captions)}


async def stage_render(clip: dict, source: dict) -> dict:
    clip_id, source_id = str(clip["id"]), str(source["id"])
    folder = storage.clip_dir(source_id, clip_id)
    video = storage.abs_path(source["file_path"])
    plan = await asyncio.to_thread(reframe.plan_crop, video, clip["t_start"], clip["t_end"],
                                   int(source["width"]), int(source["height"]))
    transcript = await load_transcript(source_id)
    words = subtitles.words_for_clip(transcript["words"], clip["t_start"], clip["t_end"])
    ass_path = folder / "captions.ass"
    ass_path.write_text(subtitles.build_ass(words, clip["t_end"] - clip["t_start"], clip.get("hook_title")),
                        encoding="utf-8")
    out = folder / "clip.mp4"
    await asyncio.to_thread(render.render_clip, video, clip["t_start"], clip["t_end"], plan, ass_path, out)
    thumb = folder / "thumb.jpg"
    await asyncio.to_thread(render.make_thumbnail, out, thumb, min(0.6, (clip["t_end"] - clip["t_start"]) / 2))
    await repo.add_render(clip_id, storage.rel(out), storage.rel(thumb), storage.rel(ass_path), plan.as_dict())
    return {"crop_mode": plan.mode, "faces_found": plan.faces_found, "keyframes": len(plan.keyframes)}


async def stage_metadata(clip: dict, source: dict) -> dict:
    return await engine.generate_all(clip, source)


CLIP_STAGE_FNS = {"evidence": stage_evidence, "render": stage_render, "metadata": stage_metadata}


async def run_source_stages(source_id: str) -> None:
    for stage in SOURCE_STAGES:
        async def call(stage=stage):
            source = await repo.get_source(source_id)  # fresh row: earlier stages update it
            return await SOURCE_STAGE_FNS[stage](source)
        await run_stage(source_id, stage, call)


async def run_clip_stages(clip_id: str) -> None:
    clip = await repo.get_clip(clip_id)
    source_id = str(clip["source_id"])
    for stage in CLIP_STAGES:
        async def call(stage=stage):
            fresh_clip = await repo.get_clip(clip_id)
            source = await repo.get_source(source_id)
            return await CLIP_STAGE_FNS[stage](fresh_clip, source)
        await run_stage(source_id, stage, call, clip_id=clip_id)

