"""Deterministic stand-ins for LLM calls (llm_mode=fake). Used by tests and dry runs.

Callers pass a ``fake_context`` with whatever the fake needs (line ids, labels...).
"""

from __future__ import annotations

import hashlib
from typing import Any

from app.llm import schemas as s


def _h(*parts: Any) -> int:
    return int(hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:8], 16)


def respond(role: str, output_type: type, prompt: str, ctx: dict[str, Any]):
    if output_type in (s.FullSelection, s.WindowSelection):
        clips = _clips(ctx)
        if output_type is s.WindowSelection:
            return s.WindowSelection(summary="Fake window summary.", clips=clips)
        return s.FullSelection(
            summary="A fake summary of the video for testing.",
            key_topics=["testing", "video"],
            niche_queries=["test video tips", "how to test videos"],
            youtube_category_id="27",
            clips=clips,
        )
    if output_type is s.Rerank:
        ids = ctx.get("candidate_ids", [])
        return s.Rerank(
            summary="Fake reranked summary.", key_topics=["testing"],
            niche_queries=["test video tips"], youtube_category_id="27",
            ranking=[s.RerankItem(candidate_id=c, total=90 - i) for i, c in enumerate(ids)],
        )
    if output_type is s.FrameCaptions:
        return s.FrameCaptions(frames=[
            s.FrameCaption(index=i, caption=f"Frame {i} shows a test pattern.", visible_text="")
            for i in range(ctx.get("n_frames", 0))
        ])
    if output_type is s.StyleTemplates:
        return s.StyleTemplates(templates=["How I {did X} in {N} days", "{Topic}: the mistake nobody sees"],
                                tone="Direct and energetic.", notes=["Short first lines."])
    if output_type is s.TextCandidates:
        keys = ctx.get("fact_keys", []) or []
        pool = ctx.get("pool", "title")
        out = []
        for i, strategy in enumerate(ctx.get("strategies", [])):
            key = keys[i % len(keys)] if keys else None
            if pool == "title":
                text = f"Test clip idea {i + 1}: {strategy.replace('_', ' ')} angle"
            else:
                text = (f"Hook line for {strategy.replace('_', ' ')} number {i + 1}.\n"
                        f"This clip explains the main point of the test video.\n#testing #video")
            out.append(s.TextCandidate(strategy=strategy, text=text, fact_keys=[key] if key else []))
        return s.TextCandidates(candidates=out)
    if output_type is s.HashtagCandidates:
        out = []
        for i, strategy in enumerate(ctx.get("strategies", [])):
            out.append(s.HashtagCandidate(
                strategy=strategy,
                hashtags=["#shorts", f"#testing{i}", "#video"],
                tags=["test video", f"testing tag {i}", "clipcontext"],
                fact_keys=[],
            ))
        return s.HashtagCandidates(candidates=out)
    if output_type is s.JudgeScores:
        items = []
        for label in ctx.get("labels", []):
            v = _h(label, ctx.get("salt", 0))
            items.append(s.JudgeItem(label=label, grounding=1 + v % 5, hook=1 + (v >> 3) % 5,
                                     style_match=1 + (v >> 6) % 5, search_intent=1 + (v >> 9) % 5,
                                     honesty=1 + (v >> 12) % 5, reason="fake judgement"))
        return s.JudgeScores(items=items)
    if output_type is s.PairVerdicts:
        return s.PairVerdicts(verdicts=[
            s.PairVerdict(pair_id=pid, winner="A" if _h(pid) % 2 else "B") for pid in ctx.get("pair_ids", [])
        ])
    raise NotImplementedError(f"no fake for {output_type.__name__}")


def _clips(ctx: dict[str, Any]) -> list[s.SelectedClip]:
    lines = ctx.get("lines", [])  # [(id, start, end)]
    n = ctx.get("n_clips", 3)
    if not lines:
        return []
    out: list[s.SelectedClip] = []
    step = max(1, len(lines) // max(n, 1))
    for c in range(n):
        i = c * step
        if i >= len(lines):
            break
        j = i
        while j + 1 < len(lines) and lines[j][2] - lines[i][1] < 30:
            j += 1
        v = _h(lines[i][0])
        out.append(s.SelectedClip(
            start_line=lines[i][0], end_line=lines[j][0], hook_title=f"Test moment {c + 1}",
            hook_type="bold_claim",hook=10 + v % 15, engagement=10 + (v >> 4) % 15,
            value=10 + (v >> 8) % 15, shareability=10 + (v >> 12) % 15, reasoning="fake reasoning",
        ))
    return out
