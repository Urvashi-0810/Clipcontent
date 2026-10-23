"""Per-clip metadata: generate -> filter -> rank -> store, for each pool."""

from __future__ import annotations

import logging

from app.core.config import get_settings
from app.db import repo
from app.metadata import filters
from app.metadata.generate import evidence_block, generate_pool
from app.metadata.niche import benchmark_for_prompt
from app.metadata.rank import rank_pool
from app.metadata.style import DEFAULT_PROFILE, style_for_prompt
from app.metadata.textembed import cosine_matrix

log = logging.getLogger(__name__)
POOLS = ("title", "description", "hashtags")


async def clip_context(clip: dict, source: dict) -> dict:
    facts = await repo.list_facts(clip["id"])
    analysis = source.get("analysis") or {}
    profile = None
    if source.get("niche_profile_id"):
        profile = await repo.get_niche_profile(str(source["niche_profile_id"]))
    style = (profile or {}).get("style") or dict(DEFAULT_PROFILE)
    benchmark = (profile or {}).get("benchmark") or []
    return {
        "clip_id": str(clip["id"]),
        "hook_title": clip.get("hook_title"),
        "summary": analysis.get("summary"),
        "facts": [{"key": f["fact_key"], "kind": f["kind"], "text": f["text"]} for f in facts],
        "style": style,
        "style_text": style_for_prompt(style),
        "benchmark_titles": benchmark_for_prompt(benchmark),
        "language_mode": source.get("language_mode", "en"),
    }


def judge_context(ctx: dict, extra: str = "") -> str:
    parts = [
        f"CLIP HOOK TITLE: {ctx.get('hook_title') or '-'}",
        "EVIDENCE:\n" + evidence_block(ctx["facts"], limit=35),
        "NICHE STYLE PROFILE:\n" + ctx["style_text"],
    ]
    if extra:
        parts.append(extra)
    return "\n\n".join(parts)


async def run_pool(pool: str, ctx: dict, extra_prompt: str = "", conditioned_on: str | None = None) -> list[dict]:
    settings = get_settings()
    cands = await generate_pool(pool, ctx, extra_prompt)
    evidence_text = "\n".join(f["text"] for f in ctx["facts"]) + " " + (ctx.get("hook_title") or "")
    valid_keys = {f["key"] for f in ctx["facts"]}
    band = (ctx["style"]["title_chars"]["p25"], ctx["style"]["title_chars"]["p75"])
    for cand in cands:
        filters.check_candidate(pool, cand, evidence_text, valid_keys, band if pool == "title" else None)
    if len(cands) > 1:
        sims = cosine_matrix([c["text"] for c in cands])
        filters.mark_near_duplicates(cands, sims, settings.near_duplicate_threshold)
    if pool == "title" and ctx["benchmark_titles"]:
        filters.mark_benchmark_copies(cands, ctx["benchmark_titles"], settings.anti_copy_ratio)
    ranked = await rank_pool(pool, cands, judge_context(ctx, extra_prompt), band)
    generation = await repo.next_generation(ctx["clip_id"], pool)
    return await repo.insert_candidates(ctx["clip_id"], pool, generation, ranked, conditioned_on)


async def generate_all(clip: dict, source: dict) -> dict:
    ctx = await clip_context(clip, source)
    if not ctx["facts"]:
        raise RuntimeError("clip has no evidence facts; run the evidence stage first")
    summary = {}
    for pool in POOLS:
        rows = await run_pool(pool, ctx)
        summary[pool] = len(rows)
    return summary


async def regenerate(clip: dict, source: dict, pool: str, title_id: str | None = None) -> list[dict]:
    ctx = await clip_context(clip, source)
    extra = ""
    if title_id and pool in ("description", "hashtags"):
        title = await repo.get_candidate(title_id)
        if title:
            extra = (f"CHOSEN TITLE: {title['text']}\n"
                     "The description/hashtags must fit this title and must not repeat it word for word.")
    return await run_pool(pool, ctx, extra, conditioned_on=title_id)
