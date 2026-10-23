"""Worker entry point: `python -m app.worker`."""

from __future__ import annotations

import logging

from app.core import runtime
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.pool import apply_schema, close_pool
from app.jobs.app import app, ensure_queue_schema

log = logging.getLogger(__name__)


async def main() -> None:
    setup_logging()
    settings = get_settings()
    await apply_schema()
    log.info("worker starting (concurrency=%d, llm_mode=%s)", settings.worker_concurrency, settings.llm_mode)
    async with app.open_async():
        await ensure_queue_schema()
        try:
            await app.run_worker_async(concurrency=settings.worker_concurrency, install_signal_handlers=True)
        finally:
            await close_pool()


if __name__ == "__main__":
    runtime.run(main())
