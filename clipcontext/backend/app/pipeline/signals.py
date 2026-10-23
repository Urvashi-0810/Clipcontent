"""Deterministic clip-worthiness hints passed to the selection LLM.

Our own heuristics (no third-party prompt/code): text cues, pauses, loudness,
speaking rate and visual change. They are hints only; the LLM decides.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np

from app.pipeline.media import rms_envelope

CUE_WORDS = re.compile(
    r"\b(secret|mistake|mistakes|never|always|nobody|everyone|truth|wrong|biggest|worst|best|actually|"
    r"crazy|shocking|surprised|warning|problem|fail(?:ed|s)?|lesson|realized|learned|stop|don't|"
    r"sach|galti|kabhi|sabse|dhyan|zaroor|asli|bilkul)\b",
    re.IGNORECASE,
)
STORY = re.compile(r"\b(I was|when I|I realized|I learned|I tried|I lost|I made|ek baar|maine)\b", re.IGNORECASE)
NUMBER = re.compile(r"\b(\d+[\d,.%]*|one|two|three|four|five|ten|hundred|thousand|million|lakh|crore)\b",
                    re.IGNORECASE)


def _z(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values
    std = values.std()
    return (values - values.mean()) / std if std > 1e-9 else np.zeros_like(values)


def compute_signals(lines: list[dict], wav: Path | None, scan: dict | None, top_n: int = 25) -> list[dict]:
    if not lines:
        return []
    loudness = np.zeros(len(lines))
    if wav is not None and wav.exists():
        envelope, step = rms_envelope(wav, 0.1)
        for i, line in enumerate(lines):
            a, b = int(line["s"] / step), max(int(line["e"] / step), int(line["s"] / step) + 1)
            segment = envelope[a:b]
            loudness[i] = float(segment.mean()) if segment.size else 0.0
    loud_z = _z(loudness)

    rates = np.array([len(l["text"].split()) / max(l["e"] - l["s"], 0.3) for l in lines])
    rate_z = _z(rates)

    change_times = np.array(scan.get("times", [])) if scan else np.zeros(0)
    changes = np.array(scan.get("change", [])) if scan else np.zeros(0)
    change_threshold = float(scan.get("cut_threshold", 0.35)) if scan else 1.0

    scored: list[dict] = []
    for i, line in enumerate(lines):
        reasons: list[str] = []
        score = 0.0
        text = line["text"]
        if "?" in text:
            score += 1.5
            reasons.append("question")
        if CUE_WORDS.search(text):
            score += 1.5
            reasons.append("strong cue word")
        if NUMBER.search(text):
            score += 1.0
            reasons.append("number")
        if STORY.search(text):
            score += 1.0
            reasons.append("story turn")
        if i > 0 and line["s"] - lines[i - 1]["e"] >= 1.0:
            score += 0.75
            reasons.append("pause before")
        if loud_z[i] > 1.0:
            score += 1.25
            reasons.append("loud delivery")
        if rate_z[i] > 1.2:
            score += 0.5
            reasons.append("fast speech")
        if changes.size:
            mask = (change_times >= line["s"] - 2) & (change_times <= line["e"] + 2)
            if mask.any() and float(changes[mask].max()) >= change_threshold:
                score += 0.75
                reasons.append("visual change")
        if score > 0:
            scored.append({"id": line["id"], "s": line["s"], "e": line["e"], "score": round(score, 2),
                           "reasons": reasons, "text": text})
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:top_n]


def format_signals(signals: list[dict]) -> str:
    rows = [f"- {s['id']} score={s['score']}: {', '.join(s['reasons'])}" for s in signals]
    return "\n".join(rows)
