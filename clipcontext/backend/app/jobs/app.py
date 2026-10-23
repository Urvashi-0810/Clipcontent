"""Procrastinate app: PostgreSQL-backed job queue (no Redis)."""

from __future__ import annotations

import procrastinate

from app.core.config import get_settings


def _conninfo() -> str:
    return get_settings().database_url


app = procrastinate.App(
    connector=procrastinate.PsycopgConnector(conninfo=_conninfo()),
    import_paths=["app.jobs.tasks"],
)


async def ensure_queue_schema() -> None:
    """Apply procrastinate's schema once (idempotent check)."""
    from app.db.repo import fetch_one

    row = await fetch_one("SELECT to_regclass('public.procrastinate_jobs') AS t")
    if row and row["t"]:
        return
    from app.db.pool import get_pool

    pool = await get_pool()
    async with pool.connection() as conn:
        await conn.execute("SELECT pg_advisory_lock(424243)")
        try:
            check = await conn.execute("SELECT to_regclass('public.procrastinate_jobs') AS t")
            if not (await check.fetchone())["t"]:
                await app.schema_manager.apply_schema_async()
        finally:
            await conn.execute("SELECT pg_advisory_unlock(424243)")
