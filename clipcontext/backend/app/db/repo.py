"""Data access with plain SQL. Every function takes/returns plain dicts."""

from __future__ import annotations

from typing import Any, Iterable

from psycopg.types.json import Jsonb

from app.db.pool import get_pool

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _j(value: Any) -> Any:
    return Jsonb(value) if value is not None else None


async def fetch_one(sql: str, *params: Any) -> dict | None:
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchone()


async def fetch_all(sql: str, *params: Any) -> list[dict]:
    pool = await get_pool()
    async with pool.connection() as conn:
        cur = await conn.execute(sql, params)
        return await cur.fetchall()


async def execute(sql: str, *params: Any) -> None:
    pool = await get_pool()
    async with pool.connection() as conn:
        await conn.execute(sql, params)


# --------------------------------------------------------------------- sources
async def create_source(origin: str, url: str | None, language_mode: str,
                        channel_handle: str | None = None, title: str | None = None) -> dict:
    return await fetch_one(
        """INSERT INTO sources (origin, url, language_mode, channel_handle, title)
           VALUES (%s, %s, %s, %s, %s) RETURNING *""",
        origin, url, language_mode, channel_handle, title,
    )


async def get_source(source_id: str) -> dict | None:
    return await fetch_one("SELECT * FROM sources WHERE id = %s", source_id)


async def list_sources(limit: int = 50) -> list[dict]:
    return await fetch_all("SELECT * FROM sources ORDER BY created_at DESC LIMIT %s", limit)


_SOURCE_COLUMNS = {
    "title", "file_path", "audio_path", "duration_s", "width", "height", "fps", "status",
    "stage", "error", "analysis", "niche_profile_id", "language_mode",
}
_JSON_COLUMNS = {"analysis", "scores", "crop_info", "benchmark", "style", "queries"}


async def update_source(source_id: str, **fields: Any) -> None:
    await _update("sources", _SOURCE_COLUMNS, source_id, fields)


async def delete_source(source_id: str) -> None:
    await execute("DELETE FROM sources WHERE id = %s", source_id)


async def _update(table: str, allowed: set[str], row_id: str, fields: dict[str, Any]) -> None:
    unknown = set(fields) - allowed
    if unknown:
        raise ValueError(f"unknown columns for {table}: {unknown}")
    if not fields:
        return
    assignments = ", ".join(f"{name} = %s" for name in fields)
    values = [_j(v) if k in _JSON_COLUMNS else v for k, v in fields.items()]
    stamp = ", updated_at = now()" if table in ("sources", "clips") else ""
    await execute(f"UPDATE {table} SET {assignments}{stamp} WHERE id = %s", *values, row_id)


# --------------------------------------------------------------- pipeline runs
async def stage_status(source_id: str, stage: str, clip_id: str | None = None) -> str | None:
    row = await fetch_one(
        """SELECT status FROM pipeline_runs
           WHERE source_id = %s AND COALESCE(clip_id, %s::uuid) = %s::uuid AND stage = %s""",
        source_id, ZERO_UUID, clip_id or ZERO_UUID, stage,
    )
    return row["status"] if row else None


async def stage_start(source_id: str, stage: str, clip_id: str | None = None) -> None:
    await execute(
        """INSERT INTO pipeline_runs (source_id, clip_id, stage, status)
           VALUES (%s, %s, %s, 'running')
           ON CONFLICT (source_id, COALESCE(clip_id, '00000000-0000-0000-0000-000000000000'::uuid), stage)
           DO UPDATE SET status = 'running', started_at = now(), finished_at = NULL, error = NULL""",
        source_id, clip_id, stage,
    )


async def stage_finish(source_id: str, stage: str, clip_id: str | None, status: str,
                       error: str | None = None, info: dict | None = None) -> None:
    await execute(
        """UPDATE pipeline_runs
              SET status = %s, error = %s, info = %s, finished_at = now(),
                  seconds = EXTRACT(EPOCH FROM (now() - started_at))
            WHERE source_id = %s AND COALESCE(clip_id, %s::uuid) = %s::uuid AND stage = %s""",
        status, error, _j(info), source_id, ZERO_UUID, clip_id or ZERO_UUID, stage,
    )


async def list_stages(source_id: str) -> list[dict]:
    return await fetch_all(
        """SELECT clip_id, stage, status, started_at, finished_at, seconds, error, info
             FROM pipeline_runs WHERE source_id = %s ORDER BY id""",
        source_id,
    )


async def reset_failed_stages(source_id: str) -> None:
    await execute(
        "DELETE FROM pipeline_runs WHERE source_id = %s AND status IN ('error', 'running')",
        source_id,
    )


# ----------------------------------------------------------------- transcripts
async def save_transcript(source_id: str, provider: str, model: str | None, language: str | None,
                          path: str, word_count: int) -> None:
    await execute(
        """INSERT INTO transcripts (source_id, provider, model, language, path, word_count)
           VALUES (%s, %s, %s, %s, %s, %s)
           ON CONFLICT (source_id) DO UPDATE SET provider = EXCLUDED.provider, model = EXCLUDED.model,
             language = EXCLUDED.language, path = EXCLUDED.path, word_count = EXCLUDED.word_count""",
        source_id, provider, model, language, path, word_count,
    )


async def get_transcript(source_id: str) -> dict | None:
    return await fetch_one("SELECT * FROM transcripts WHERE source_id = %s", source_id)


# ----------------------------------------------------------------------- clips
_CLIP_COLUMNS = {"rank", "t_start", "t_end", "hook_title", "hook_type", "scores", "reasoning",
                 "transcript_text", "status", "stage", "error", "chosen_title_id"}


async def replace_clips(source_id: str, clips: Iterable[dict]) -> list[dict]:
    pool = await get_pool()
    rows: list[dict] = []
    async with pool.connection() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM clips WHERE source_id = %s", (source_id,))
            for clip in clips:
                cur = await conn.execute(
                    """INSERT INTO clips (source_id, rank, t_start, t_end, hook_title, hook_type,
                                          scores, reasoning, transcript_text)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                    (source_id, clip["rank"], clip["t_start"], clip["t_end"], clip.get("hook_title"),
                     clip.get("hook_type"), Jsonb(clip.get("scores") or {}), clip.get("reasoning"),
                     clip.get("transcript_text")),
                )
                rows.append(await cur.fetchone())
    return rows


async def list_clips(source_id: str) -> list[dict]:
    return await fetch_all("SELECT * FROM clips WHERE source_id = %s ORDER BY rank", source_id)


async def get_clip(clip_id: str) -> dict | None:
    return await fetch_one("SELECT * FROM clips WHERE id = %s", clip_id)


async def update_clip(clip_id: str, **fields: Any) -> None:
    await _update("clips", _CLIP_COLUMNS, clip_id, fields)


# -------------------------------------------------------------------- evidence
async def replace_facts(clip_id: str, facts: list[dict]) -> None:
    pool = await get_pool()
    async with pool.connection() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM evidence_facts WHERE clip_id = %s", (clip_id,))
            for fact in facts:
                await conn.execute(
                    """INSERT INTO evidence_facts (clip_id, fact_key, kind, t_start, t_end, text, frame_path)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (clip_id, fact["key"], fact["kind"], fact.get("t_start"), fact.get("t_end"),
                     fact["text"], fact.get("frame_path")),
                )


async def list_facts(clip_id: str) -> list[dict]:
    return await fetch_all("SELECT * FROM evidence_facts WHERE clip_id = %s ORDER BY id", clip_id)


# --------------------------------------------------------------------- renders
async def add_render(clip_id: str, file_path: str, thumb_path: str | None, subtitles_path: str | None,
                     crop_info: dict | None, preset: str = "vertical_1080") -> dict:
    row = await fetch_one("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM renders WHERE clip_id = %s", clip_id)
    return await fetch_one(
        """INSERT INTO renders (clip_id, preset, file_path, thumb_path, subtitles_path, crop_info, version)
           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *""",
        clip_id, preset, file_path, thumb_path, subtitles_path, _j(crop_info), row["v"],
    )


async def latest_render(clip_id: str) -> dict | None:
    return await fetch_one(
        "SELECT * FROM renders WHERE clip_id = %s ORDER BY version DESC LIMIT 1", clip_id
    )


async def get_render(render_id: str) -> dict | None:
    return await fetch_one("SELECT * FROM renders WHERE id = %s", render_id)


# --------------------------------------------------------------- niche profiles
async def find_niche_profile(cache_key: str, max_age_days: int) -> dict | None:
    return await fetch_one(
        """SELECT * FROM niche_profiles
            WHERE cache_key = %s AND fetched_at > now() - make_interval(days => %s)
            ORDER BY fetched_at DESC LIMIT 1""",
        cache_key, max_age_days,
    )


async def save_niche_profile(cache_key: str, queries: list[str], language: str | None,
                             benchmark: list[dict], style: dict, search_calls: int) -> dict:
    return await fetch_one(
        """INSERT INTO niche_profiles (cache_key, queries, language, benchmark, style, search_calls)
           VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
        cache_key, Jsonb(queries), language, Jsonb(benchmark), Jsonb(style), search_calls,
    )


async def get_niche_profile(profile_id: str) -> dict | None:
    return await fetch_one("SELECT * FROM niche_profiles WHERE id = %s", profile_id)


async def purge_old_niche_data(days: int = 30) -> None:
    """YouTube API data may not be kept more than 30 days without refresh."""
    await execute(
        """UPDATE niche_profiles SET benchmark = '[]'::jsonb
            WHERE fetched_at < now() - make_interval(days => %s) AND benchmark <> '[]'::jsonb""",
        days,
    )


# ---------------------------------------------------------- metadata candidates
async def next_generation(clip_id: str, pool_name: str) -> int:
    row = await fetch_one(
        "SELECT COALESCE(MAX(generation), 0) + 1 AS g FROM metadata_candidates WHERE clip_id = %s AND pool = %s",
        clip_id, pool_name,
    )
    return row["g"]


async def insert_candidates(clip_id: str, pool_name: str, generation: int, candidates: list[dict],
                            conditioned_on: str | None = None) -> list[dict]:
    pool = await get_pool()
    rows: list[dict] = []
    async with pool.connection() as conn:
        async with conn.transaction():
            for cand in candidates:
                cur = await conn.execute(
                    """INSERT INTO metadata_candidates
                         (clip_id, pool, generation, strategy, text, hashtags, tags, fact_keys,
                          filter_flags, passed_filters, scores, final_score, rank, judge_reason, conditioned_on)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                    (clip_id, pool_name, generation, cand["strategy"], cand["text"],
                     _j(cand.get("hashtags")), _j(cand.get("tags")), Jsonb(cand.get("fact_keys", [])),
                     Jsonb(cand.get("filter_flags", [])), cand.get("passed_filters", True),
                     Jsonb(cand.get("scores", {})), cand.get("final_score"), cand.get("rank"),
                     cand.get("judge_reason"), conditioned_on),
                )
                rows.append(await cur.fetchone())
    return rows


async def latest_candidates(clip_id: str, pool_name: str) -> list[dict]:
    return await fetch_all(
        """SELECT * FROM metadata_candidates
            WHERE clip_id = %s AND pool = %s
              AND generation = (SELECT MAX(generation) FROM metadata_candidates
                                 WHERE clip_id = %s AND pool = %s)
            ORDER BY rank NULLS LAST, final_score DESC NULLS LAST""",
        clip_id, pool_name, clip_id, pool_name,
    )


async def get_candidate(candidate_id: str) -> dict | None:
    return await fetch_one("SELECT * FROM metadata_candidates WHERE id = %s", candidate_id)
