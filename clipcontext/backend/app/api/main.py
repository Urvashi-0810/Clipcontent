"""FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db.pool import apply_schema, close_pool
from app.jobs.app import app as job_app
from app.jobs.app import ensure_queue_schema


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()
    await apply_schema()
    await job_app.open_async()
    await ensure_queue_schema()
    try:
        yield
    finally:
        await job_app.close_async()
        await close_pool()


def create_app() -> FastAPI:
    app = FastAPI(title="ClipContext API", version="0.1.0", lifespan=lifespan,
                  description="Part 1: long video -> ranked vertical clips with grounded metadata.")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.get("/health", tags=["system"])
    async def health() -> dict:
        return {"ok": True, "llm_mode": get_settings().llm_mode}

    app.include_router(router)
    return app


app = create_app()
