"""Clip selection with the fake LLM: single window and windowed (long video) paths."""

from __future__ import annotations

from app.pipeline import select_clips
from app.pipeline.transcribe import _fake_words, build_lines


async def _run(duration_s: float):
    words = _fake_words(duration_s)
    transcript = {"words": words, "lines": build_lines(words)}
    return await select_clips.select_clips(transcript, [], duration_s, "en")


async def test_single_window_selection(fake_mode):
    result = await _run(30 * 60)
    assert result["profile"]["windows"] == 1
    assert 1 <= len(result["clips"]) <= 3
    for rank, clip in enumerate(result["clips"], start=1):
        assert clip["rank"] == rank
        assert 20 <= clip["t_end"] - clip["t_start"] <= 61
    assert result["profile"]["niche_queries"]


async def test_windowed_selection_for_long_video(fake_mode):
    result = await _run(150 * 60)
    assert result["profile"]["windows"] > 1
    clips = result["clips"]
    assert 3 <= len(clips) <= 10
    for a in clips:
        for b in clips:
            if a is not b:
                assert select_clips.overlap_ratio(a, b) <= 0.3
