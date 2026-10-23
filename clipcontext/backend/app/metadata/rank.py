"""Ranking: rubric judge (shuffled, averaged) -> pairwise on the top group -> Bradley-Terry.

The judge is a different model family from the generator by default (Gemini judges
Groq output) to reduce self-preference. Position bias is reduced by shuffling the
rubric list and by asking each pair in both orders.
"""

from __future__ import annotations

import itertools
import logging
import random

import numpy as np

from app.core.config import get_settings
from app.llm import schemas as s
from app.llm.client import run_structured
from app.metadata.filters import title_fit_score

log = logging.getLogger(__name__)

WEIGHTS = {"grounding": 0.30, "hook": 0.25, "style_match": 0.20, "search_intent": 0.15, "honesty": 0.10}

POOL_NAMES = {"title": "titles", "description": "descriptions", "hashtags": "hashtag sets"}

RUBRIC_INSTRUCTIONS = """You are a strict judge of short-video {pool_name}. Score each candidate 1-5 on:
- grounding: every claim/number is supported by the EVIDENCE (5 = fully supported)
- hook: would make a scrolling viewer stop and tap (for hashtags: discoverability)
- style_match: fits the NICHE STYLE PROFILE without copying it
- search_intent: covers what people in this niche actually search for
- honesty: promises only what the clip delivers (5 = no clickbait gap)
Judge each candidate on its own merits; the order of the list means nothing. Give a one-line reason.
Return every label exactly once."""

PAIR_INSTRUCTIONS = """You compare pairs of short-video {pool_name} for the same clip. For each pair choose the
better one (A or B), weighing grounding in the evidence, scroll-stopping hook, niche fit and honesty.
Position in the pair means nothing. Return a verdict for every pair id."""


def bradley_terry(n: int, wins: list[tuple[int, int]], iterations: int = 200, prior: float = 0.5) -> np.ndarray:
    """MM estimate of Bradley-Terry strengths. wins = [(winner, loser), ...]. Returns log-strengths."""
    if n == 0:
        return np.zeros(0)
    w = np.full((n, n), 0.0)
    for winner, loser in wins:
        w[winner, loser] += 1.0
    # symmetric prior: every pair gets a fractional win each way (keeps estimates finite)
    w += prior * (1 - np.eye(n)) / max(n - 1, 1)
    p = np.ones(n)
    games = w + w.T
    total_wins = w.sum(axis=1)
    for _ in range(iterations):
        denom = np.array([sum(games[i, j] / (p[i] + p[j]) for j in range(n) if j != i) for i in range(n)])
        new = total_wins / np.maximum(denom, 1e-12)
        new /= np.exp(np.mean(np.log(new)))
        if np.allclose(new, p, atol=1e-8):
            p = new
            break
        p = new
    return np.log(p)


def candidate_line(pool: str, cand: dict) -> str:
    if pool == "hashtags":
        return f"hashtags: {' '.join(cand.get('hashtags') or [])} | tags: {', '.join(cand.get('tags') or [])}"
    return cand["text"].replace("\n", " / ")


async def rubric_scores(pool: str, cands: list[dict], context_text: str, shuffles: int) -> list[dict]:
    """Returns per-candidate averaged rubric dicts aligned with cands."""
    totals = [{k: [] for k in WEIGHTS} | {"reasons": []} for _ in cands]
    rng = random.Random(len(cands) * 7919 + sum(len(c["text"]) for c in cands))
    for shuffle in range(max(1, shuffles)):
        order = list(range(len(cands)))
        rng.shuffle(order)
        labels = {f"C{i + 1}": idx for i, idx in enumerate(order)}
        listing = "\n".join(f"{label}: {candidate_line(pool, cands[idx])}" for label, idx in labels.items())
        result = await run_structured(
            "judge", RUBRIC_INSTRUCTIONS.format(pool_name=POOL_NAMES[pool]),
            f"{context_text}\n\nCANDIDATES:\n{listing}", s.JudgeScores, temperature=0.0,
            fake_context={"labels": list(labels), "salt": shuffle},
        )
        for item in result.items:
            idx = labels.get(item.label.strip())
            if idx is None:
                continue
            for key in WEIGHTS:
                totals[idx][key].append(getattr(item, key))
            if item.reason:
                totals[idx]["reasons"].append(item.reason)
    out = []
    for t in totals:
        avg = {k: (float(np.mean(t[k])) if t[k] else 3.0) for k in WEIGHTS}
        score = sum(WEIGHTS[k] * (avg[k] - 1) / 4 for k in WEIGHTS)
        out.append({"rubric": {k: round(v, 2) for k, v in avg.items()}, "rubric_score": round(score, 4),
                    "reason": t["reasons"][0] if t["reasons"] else ""})
    return out


async def pairwise_strengths(pool: str, cands: list[dict], context_text: str) -> np.ndarray:
    n = len(cands)
    pairs = list(itertools.combinations(range(n), 2))
    if not pairs:
        return np.zeros(n)
    rng = random.Random(n * 104729)
    wins: list[tuple[int, int]] = []
    for swap in (False, True):
        listing = []
        mapping: dict[str, tuple[int, int]] = {}
        for p_index, (i, j) in enumerate(pairs):
            first, second = (i, j) if (rng.random() < 0.5) != swap else (j, i)
            pid = f"P{p_index + 1}"
            mapping[pid] = (first, second)
            listing.append(f"{pid}\n  A: {candidate_line(pool, cands[first])}\n  B: {candidate_line(pool, cands[second])}")
        result = await run_structured(
            "judge", PAIR_INSTRUCTIONS.format(pool_name=POOL_NAMES[pool]),
            f"{context_text}\n\nPAIRS:\n" + "\n".join(listing), s.PairVerdicts, temperature=0.0,
            fake_context={"pair_ids": list(mapping)},
        )
        for verdict in result.verdicts:
            pair = mapping.get(verdict.pair_id.strip())
            if not pair:
                continue
            a, b = pair
            wins.append((a, b) if verdict.winner == "A" else (b, a))
    return bradley_terry(n, wins)


async def rank_pool(pool: str, cands: list[dict], context_text: str, title_band: tuple[int, int]) -> list[dict]:
    """Scores and ranks candidates in place; returns them sorted by rank."""
    settings = get_settings()
    passing = [c for c in cands if c["passed_filters"]]
    failing = [c for c in cands if not c["passed_filters"]]
    if not passing:
        passing, failing = cands, []

    rubric = await rubric_scores(pool, passing, context_text, settings.judge_shuffles)
    for cand, r in zip(passing, rubric):
        mechanical = title_fit_score(cand["text"], title_band) if pool == "title" else 1.0
        soft_penalty = 0.05 * len([f for f in cand["filter_flags"] if f in ("no_evidence_cited", "long_first_line",
                                                                              "short_for_niche", "long_for_niche")])
        cand["scores"] = {**r["rubric"], "rubric_score": r["rubric_score"], "mechanical": round(mechanical, 3)}
        cand["judge_reason"] = r["reason"]
        cand["final_score"] = round(0.85 * r["rubric_score"] + 0.15 * mechanical - soft_penalty, 4)

    passing.sort(key=lambda c: c["final_score"], reverse=True)
    top = passing[: max(2, settings.pairwise_top)]
    if len(top) >= 2:
        try:
            strengths = await pairwise_strengths(pool, top, context_text)
            for cand, strength in zip(top, strengths):
                cand["scores"]["bt"] = round(float(strength), 4)
            top.sort(key=lambda c: (c["scores"]["bt"], c["final_score"]), reverse=True)
        except Exception as exc:
            log.warning("pairwise ranking failed, keeping rubric order: %s", exc)
    ranked = top + passing[len(top):] + sorted(failing, key=lambda c: c.get("final_score") or 0, reverse=True)
    for rank, cand in enumerate(ranked, start=1):
        cand["rank"] = rank
    return ranked
