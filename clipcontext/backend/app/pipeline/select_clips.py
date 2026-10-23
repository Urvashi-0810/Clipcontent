"""Stage 4: choose clip-worthy moments from the transcript (Gemini, long context).

Long videos are split into overlapping windows; each window proposes candidates,
then one comparative call reranks all candidates and profiles the whole video.
Clip boundaries are always snapped to whole transcript lines.
"""

from __future__ import annotations

import logging
import math
from typing import Any

from app.core.config import get_settings
from app.llm.client import run_structured
from app.llm import schemas as s
from app.pipeline.signals import format_signals

log = logging.getLogger(__name__)

SELECTION_INSTRUCTIONS = """You are an experienced short-form video editor.
You receive the transcript of a long video as numbered lines (L1, L2, ...) with timestamps.
Pick moments that work as standalone vertical clips for YouTube Shorts and Instagram Reels.

A good clip:
- opens on a line a new viewer understands immediately (no dangling "he", "that", "as I said")
- delivers one complete idea: a setup, a specific point or story, and a payoff
- is concrete: numbers, named things, clear claims, a surprising turn, a strong opinion, a useful tip
- ends right after the payoff, not in the middle of the next thought
Avoid intros, greetings, sponsor reads, calls to subscribe, and moments that depend on unseen context.

Rules:
- Use only line ids that exist. start_line and end_line are inclusive; the clip is one contiguous range.
- Target {min_s}-{max_s} seconds per clip. Clips must not overlap.
- Score each clip 0-25 on: hook (first 3 seconds), engagement, value, shareability. Be strict; most clips are 10-20.
- hook_title: 3-9 words, written as an on-screen headline, only promising what the clip delivers.
- reasoning: one or two sentences citing what is actually said.
- Write hook_title in {language}.
"""

PROFILE_INSTRUCTIONS = """Also profile the whole video:
- summary: 3-5 factual sentences.
- key_topics: up to 10 short topics.
- niche_queries: 3-5 short YouTube search queries (2-5 words each) that would find popular videos in the same niche.
  Use English queries unless the audience clearly searches in Hinglish.
- youtube_category_id: the best matching YouTube category id (e.g. 22 People & Blogs, 24 Entertainment,
  26 Howto & Style, 27 Education, 28 Science & Technology, 17 Sports, 10 Music, 20 Gaming, 25 News & Politics)."""

RERANK_INSTRUCTIONS = """You are the final editor choosing which candidate clips to publish from one long video.
Compare the candidates against each other and give each a comparative total 0-100.
Set keep=false for weak, repetitive or context-dependent candidates.
Return every candidate id exactly once in ranking, best first.
"""


def fmt_time(seconds: float) -> str:
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m:02d}:{sec:02d}"


def target_clip_count(duration_s: float) -> int:
    settings = get_settings()
    n = round(duration_s / 60 / max(settings.minutes_per_clip, 1))
    return max(settings.clips_min, min(settings.clips_max, n))


def render_lines(lines: list[dict]) -> str:
    return "\n".join(f"{l['id']} [{fmt_time(l['s'])}] {l['text']}" for l in lines)


def make_windows(lines: list[dict], duration_s: float) -> list[list[dict]]:
    settings = get_settings()
    window = settings.selection_window_minutes * 60
    overlap = settings.selection_window_overlap_minutes * 60
    if duration_s <= window + overlap:
        return [lines]
    windows: list[list[dict]] = []
    start = 0.0
    while start < duration_s:
        end = start + window
        chunk = [l for l in lines if l["s"] >= start and l["s"] < end]
        if chunk:
            windows.append(chunk)
        if end >= duration_s:
            break
        start = end - overlap
    return windows


# ------------------------------------------------------------------ normalise
def normalize_clip(clip: s.SelectedClip, lines: list[dict], index: dict[str, int], duration_s: float,
                   min_s: float, max_s: float) -> dict | None:
    if clip.start_line not in index or clip.end_line not in index:
        return None
    a, b = index[clip.start_line], index[clip.end_line]
    if a > b:
        a, b = b, a

    def span(i: int, j: int) -> float:
        return lines[j]["e"] - lines[i]["s"]

    while span(a, b) < min_s and b + 1 < len(lines) and span(a, b + 1) <= max_s:
        b += 1
    while span(a, b) < min_s and a > 0 and span(a - 1, b) <= max_s:
        a -= 1
    while span(a, b) > max_s and b > a:
        b -= 1
    if span(a, b) < min_s * 0.6:
        return None
    total = clip.hook + clip.engagement + clip.value + clip.shareability
    return {
        "t_start": round(max(0.0, lines[a]["s"] - 0.15), 3),
        "t_end": round(min(duration_s, lines[b]["e"] + 0.3), 3),
        "line_start": lines[a]["id"],
        "line_end": lines[b]["id"],
        "hook_title": clip.hook_title.strip().strip('"'),
        "hook_type": clip.hook_type,
        "scores": {"hook": clip.hook, "engagement": clip.engagement, "value": clip.value,
                   "shareability": clip.shareability, "total": total},
        "reasoning": clip.reasoning,
        "transcript_text": " ".join(l["text"] for l in lines[a:b + 1]),
    }


def overlap_ratio(x: dict, y: dict) -> float:
    inter = max(0.0, min(x["t_end"], y["t_end"]) - max(x["t_start"], y["t_start"]))
    shorter = min(x["t_end"] - x["t_start"], y["t_end"] - y["t_start"])
    return inter / shorter if shorter > 0 else 0.0


def dedupe(clips: list[dict], max_overlap: float = 0.3) -> list[dict]:
    kept: list[dict] = []
    for clip in sorted(clips, key=lambda c: c["scores"]["total"], reverse=True):
        if all(overlap_ratio(clip, other) <= max_overlap for other in kept):
            kept.append(clip)
    return kept


# ------------------------------------------------------------------- main
async def select_clips(transcript: dict, signals: list[dict], duration_s: float, language_mode: str) -> dict:
    settings = get_settings()
    lines: list[dict] = transcript["lines"]
    if not lines:
        raise RuntimeError("transcript has no speech; nothing to clip")
    index = {l["id"]: i for i, l in enumerate(lines)}
    n_clips = target_clip_count(duration_s)
    language = "romanized Hinglish (Latin script)" if language_mode == "hinglish" else "English"
    instructions = SELECTION_INSTRUCTIONS.format(min_s=settings.clip_min_s, max_s=settings.clip_max_s,
                                                 language=language)
    windows = make_windows(lines, duration_s)
    signal_ids = set()

    if len(windows) == 1:
        prompt = _selection_prompt(lines, signals, n_clips, duration_s)
        result = await run_structured(
            "selection", instructions + "\n" + PROFILE_INSTRUCTIONS, prompt, s.FullSelection, temperature=0.3,
            fake_context={"lines": [(l["id"], l["s"], l["e"]) for l in lines], "n_clips": n_clips},
        )
        candidates = [c for c in (normalize_clip(x, lines, index, duration_s, settings.clip_min_s,
                                                 settings.clip_max_s) for x in result.clips) if c]
        clips = dedupe(candidates)[:n_clips]
        profile = s.VideoProfile.model_validate(result.model_dump())
    else:
        per_window = max(2, math.ceil(n_clips * 1.6 / len(windows)) + 1)
        candidates: list[dict] = []
        summaries: list[str] = []
        for w_index, window in enumerate(windows):
            ids = {l["id"] for l in window}
            window_signals = [sig for sig in signals if sig["id"] in ids]
            signal_ids |= {sig["id"] for sig in window_signals}
            prompt = _selection_prompt(window, window_signals, per_window, duration_s,
                                       note=f"This is part {w_index + 1} of {len(windows)} of the video.")
            result = await run_structured(
                "selection", instructions, prompt, s.WindowSelection, temperature=0.3,
                fake_context={"lines": [(l["id"], l["s"], l["e"]) for l in window], "n_clips": per_window},
            )
            summaries.append(f"Part {w_index + 1}: {result.summary}")
            for raw in result.clips:
                clip = normalize_clip(raw, lines, index, duration_s, settings.clip_min_s, settings.clip_max_s)
                if clip:
                    candidates.append(clip)
        candidates = dedupe(candidates)
        for i, clip in enumerate(candidates):
            clip["candidate_id"] = f"C{i + 1}"
        rerank = await run_structured(
            "selection", RERANK_INSTRUCTIONS + "\n" + PROFILE_INSTRUCTIONS,
            _rerank_prompt(candidates, summaries), s.Rerank, temperature=0.2,
            fake_context={"candidate_ids": [c["candidate_id"] for c in candidates]},
        )
        by_id = {c["candidate_id"]: c for c in candidates}
        ordered: list[dict] = []
        for item in rerank.ranking:
            clip = by_id.pop(item.candidate_id, None)
            if clip and item.keep:
                clip["scores"]["comparative"] = item.total
                ordered.append(clip)
        ordered.extend(sorted(by_id.values(), key=lambda c: c["scores"]["total"], reverse=True))
        clips = ordered[:n_clips]
        profile = s.VideoProfile.model_validate(rerank.model_dump())

    clips.sort(key=lambda c: (c["scores"].get("comparative", 0), c["scores"]["total"]), reverse=True)
    for rank, clip in enumerate(clips, start=1):
        clip["rank"] = rank
        clip.pop("candidate_id", None)
    profile_dict: dict[str, Any] = profile.model_dump()
    profile_dict["target_clips"] = n_clips
    profile_dict["windows"] = len(windows)
    return {"profile": profile_dict, "clips": clips}


def _selection_prompt(lines: list[dict], signals: list[dict], n: int, duration_s: float, note: str = "") -> str:
    parts = [
        f"Video length: {fmt_time(duration_s)}. {note}".strip(),
        f"Pick up to {n} clips.",
    ]
    if signals:
        parts.append("Lines flagged by audio/text/visual heuristics (hints only):\n" + format_signals(signals))
    parts.append("Transcript:\n" + render_lines(lines))
    return "\n\n".join(parts)


def _rerank_prompt(candidates: list[dict], summaries: list[str]) -> str:
    rows = []
    for c in candidates:
        excerpt = c["transcript_text"]
        if len(excerpt) > 600:
            excerpt = excerpt[:600] + "..."
        rows.append(
            f"{c['candidate_id']} [{fmt_time(c['t_start'])}-{fmt_time(c['t_end'])}] "
            f"hook_title=\"{c['hook_title']}\" scores={c['scores']}\n  {excerpt}"
        )
    return "Video summary by part:\n" + "\n".join(summaries) + "\n\nCandidates:\n" + "\n".join(rows)
