"""Pure-function tests (no database, no network)."""

from __future__ import annotations

import numpy as np

from app.llm import schemas as s
from app.metadata import filters
from app.metadata.niche import score_outliers
from app.metadata.rank import bradley_terry
from app.metadata.style import compute_stats
from app.pipeline import select_clips
from app.pipeline.render.reframe import build_x_expression, smooth_path
from app.pipeline.render.subtitles import ass_time, build_ass, chunk_words
from app.pipeline.transcribe import _fake_words, build_lines, romanize


def test_build_lines_breaks_on_sentences_and_pauses():
    words = _fake_words(60)
    lines = build_lines(words)
    assert lines and lines[0]["id"] == "L1"
    assert all(l["e"] >= l["s"] for l in lines)
    assert all(l["e"] - l["s"] <= 12.5 for l in lines)
    # every word belongs to exactly one line
    covered = sum(l["w1"] - l["w0"] + 1 for l in lines)
    assert covered == len(words)


def test_romanize_devanagari_to_latin():
    assert romanize("hello") == "hello"
    out = romanize("क्या")
    assert out.isascii() and out
    assert romanize("नमस्ते").isascii()


def test_normalize_clip_respects_bounds():
    words = _fake_words(300)
    lines = build_lines(words)
    index = {l["id"]: i for i, l in enumerate(lines)}
    raw = s.SelectedClip(start_line="L3", end_line="L3", hook_title="x", hook=10, engagement=10, value=10,
                         shareability=10, reasoning="r")
    clip = select_clips.normalize_clip(raw, lines, index, 300, 20, 60)
    assert clip is not None
    assert 20 <= clip["t_end"] - clip["t_start"] <= 61
    assert clip["scores"]["total"] == 40
    bad = raw.model_copy(update={"start_line": "L999"})
    assert select_clips.normalize_clip(bad, lines, index, 300, 20, 60) is None


def test_dedupe_keeps_higher_score():
    a = {"t_start": 0, "t_end": 30, "scores": {"total": 50}}
    b = {"t_start": 10, "t_end": 40, "scores": {"total": 70}}
    c = {"t_start": 100, "t_end": 130, "scores": {"total": 10}}
    kept = select_clips.dedupe([a, b, c])
    assert b in kept and c in kept and a not in kept


def test_target_clip_count_clamped():
    assert select_clips.target_clip_count(30 * 60) == 3
    assert select_clips.target_clip_count(150 * 60) == 10


def test_crop_path_and_expression():
    samples = [(i * 0.5, 0.3 if i < 20 else 0.7) for i in range(60)]
    kf = smooth_path(samples, [10.0], 1920, 606)
    assert kf[0][0] == 0.0
    xs = [x for _, x in kf]
    assert min(xs) >= 0 and max(xs) <= 1920 - 606
    assert xs[0] < xs[-1]  # moved right after the cut
    expr = build_x_expression(kf)
    assert expr.count("if(") == len(kf) - 1
    assert "\\," in expr  # commas escaped for the filtergraph


def test_subtitles():
    assert ass_time(3661.5) == "1:01:01.50"
    words = [{"w": w, "s": i * 0.4, "e": i * 0.4 + 0.3} for i, w in enumerate("one two three four. five six".split())]
    chunks = chunk_words(words)
    assert all(len(c) <= 3 for c in chunks)
    ass = build_ass(words, 5.0, "A hook title")
    assert "Style: Hook" in ass and "A hook title" in ass
    assert ass.count("Dialogue: 0,") == len(words)


def test_tags_field_counting_and_fit():
    assert filters.tags_field_length(["a", "b c"]) == 1 + 1 + 3 + 2
    tags = [f"keyword number {i}" for i in range(60)]
    fitted = filters.fit_tags(tags)
    assert filters.tags_field_length(fitted) <= 500
    assert len(fitted) < 60


def test_check_candidate_flags():
    evidence = "We grew 3 channels in 30 days."
    keys = {"S1"}
    good = filters.check_candidate("title", {"text": "How we grew 3 channels in 30 days", "fact_keys": ["S1"]},
                                   evidence, keys, (30, 60))
    assert good["passed_filters"], good["filter_flags"]
    bad = filters.check_candidate("title", {"text": "We grew 10 channels", "fact_keys": ["S1"]}, evidence, keys)
    assert "unsupported_number" in bad["filter_flags"] and not bad["passed_filters"]
    long = filters.check_candidate("title", {"text": "x" * 120, "fact_keys": ["S1"]}, evidence, keys)
    assert "title_over_100" in long["filter_flags"]
    tagset = filters.check_candidate("hashtags", {"hashtags": ["#a b", "shorts", "#Shorts", "#"] + [f"t{i}" for i in range(20)],
                                                  "tags": ["x"]}, evidence, keys)
    assert len(tagset["hashtags"]) == 15 and "hashtags_over_15" in tagset["filter_flags"]
    assert tagset["hashtags"][0] == "#ab"


def test_near_duplicates_and_copies():
    cands = [{"text": "Same title", "passed_filters": True, "filter_flags": []},
             {"text": "Same title!", "passed_filters": True, "filter_flags": []},
             {"text": "Totally different", "passed_filters": True, "filter_flags": []}]
    sims = [[1, 0.95, 0.1], [0.95, 1, 0.1], [0.1, 0.1, 1]]
    filters.mark_near_duplicates(cands, sims, 0.9)
    assert [c["passed_filters"] for c in cands] == [True, False, True]
    filters.mark_benchmark_copies(cands, ["totally different"], 85)
    assert not cands[2]["passed_filters"]


def test_bradley_terry_orders_by_wins():
    wins = [(0, 1), (0, 2), (1, 2), (0, 1), (2, 1)]
    strengths = bradley_terry(3, wins)
    assert np.argmax(strengths) == 0
    assert strengths[1] < strengths[0]


def test_outlier_scoring_prefers_fast_growth():
    rows = [
        {"views_per_day": 10_000, "views_per_sub": 5.0, "channel_id": "a"},
        {"views_per_day": 100, "views_per_sub": 0.1, "channel_id": "b"},
        {"views_per_day": 1_000, "views_per_sub": None, "channel_id": "c"},
    ]
    ranked = score_outliers(rows)
    assert ranked[0]["views_per_day"] == 10_000


def test_style_stats():
    bench = [{"title": f"I tried {i} things? #{i}", "description": "Line one\n#a #b", "tags": ["x", "y"]}
             for i in range(12)]
    stats = compute_stats(bench)
    assert stats["sample_size"] == 12
    assert stats["rates"]["question"] == 1.0
    assert stats["hashtags_per_description"] == 2
    assert compute_stats([])["sample_size"] == 0
