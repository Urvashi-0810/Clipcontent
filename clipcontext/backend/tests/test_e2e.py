"""End-to-end pipeline on a synthetic video with fake providers.

Needs a PostgreSQL database: set E2E_DATABASE_URL (it will be used as DATABASE_URL).
Skipped otherwise.
"""

from __future__ import annotations

import os
import shutil
import subprocess

import pytest

from app.core.config import reset_settings_cache

pytestmark = pytest.mark.skipif(not os.environ.get("E2E_DATABASE_URL"), reason="E2E_DATABASE_URL not set")


@pytest.fixture
def e2e_env(fake_mode, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", os.environ["E2E_DATABASE_URL"])
    monkeypatch.setenv("CLIPS_MIN", "2")
    monkeypatch.setenv("CLIPS_MAX", "2")
    monkeypatch.setenv("JUDGE_SHUFFLES", "1")
    reset_settings_cache()
    yield


async def test_full_pipeline(e2e_env, tmp_path):
    from app.core import storage
    from app.db import repo
    from app.db.pool import apply_schema, close_pool
    from app.jobs.stages import run_clip_stages, run_source_stages

    await apply_schema()
    source = await repo.create_source("upload", None, "en", None, "synthetic")
    sid = str(source["id"])
    video = storage.source_dir(sid) / "source.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25",
                    "-f", "lavfi", "-i", "sine=frequency=300:sample_rate=48000", "-t", "150",
                    "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", str(video)], check=True)
    await repo.update_source(sid, file_path=storage.rel(video))
    try:
        await run_source_stages(sid)
        clips = await repo.list_clips(sid)
        assert len(clips) == 2
        for clip in clips:
            await run_clip_stages(str(clip["id"]))
            render = await repo.latest_render(str(clip["id"]))
            assert render and storage.abs_path(render["file_path"]).stat().st_size > 10_000
            for pool in ("title", "description", "hashtags"):
                rows = await repo.latest_candidates(str(clip["id"]), pool)
                assert len(rows) == 10
                assert sorted(r["rank"] for r in rows) == list(range(1, 11))
        # resumability: re-running skips finished stages
        await run_source_stages(sid)
        stages = await repo.list_stages(sid)
        assert all(s["status"] == "done" for s in stages)
    finally:
        await repo.delete_source(sid)
        shutil.rmtree(storage.media_root() / "sources" / sid, ignore_errors=True)
        await close_pool()
