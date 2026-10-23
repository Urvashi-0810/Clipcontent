"""Shared async PostgreSQL connection pool (psycopg 3)."""

from __future__ import annotations

import asyncio
import logging
from importlib import resources

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from app.core.config import get_settings

log = logging.getLogger(__name__)

_pool: AsyncConnectionPool | None = None
_lock = asyncio.Lock()


async def get_pool() -> AsyncConnectionPool:
    """Open the pool lazily so the API and the worker can both use it."""
    global _pool
    if _pool is None:
        async with _lock:
            if _pool is None:
                pool = AsyncConnectionPool(
                    get_settings().database_url,
                    min_size=1,
                    max_size=10,
                    kwargs={"row_factory": dict_row, "autocommit": True},
                    open=False,
                )
                await pool.open(wait=True, timeout=30)
                _pool = pool
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def apply_schema() -> None:
    sql = resources.files("app.db").joinpath("schema.sql").read_text(encoding="utf-8")
    pool = await get_pool()
    async with pool.connection() as conn:
        # Serialise concurrent starts (api + worker) with an advisory lock.
        await conn.execute("SELECT pg_advisory_lock(424242)")
        try:
            await conn.execute(sql)
        finally:
            await conn.execute("SELECT pg_advisory_unlock(424242)")
    log.info("database schema applied")
