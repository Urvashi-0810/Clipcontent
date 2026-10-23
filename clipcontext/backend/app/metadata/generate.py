"""Strategy-conditioned candidate generation (generator role, Groq by default)."""

from __future__ import annotations

import logging

from app.core.config import get_settings
from app.llm import schemas as s
from app.llm.client import run_structured
from app.metadata.strategies import STRATEGIES

log = logging.getLogger(__name__)

POOL_RULES = {
    "title": """Write video TITLES for a vertical short (YouTube Shorts / Instagram Reels).
- At most 100 characters; aim for the niche's typical length.
- No hashtags, no quotes around the title, at most one emoji and only if the niche uses them.""",
    "description": """Write video DESCRIPTIONS for a vertical short.
- First line (<= 120 characters) is a hook that works alone above the fold.
- Then 1-4 short lines. Total under 600 characters.
- End with 3-5 relevant hashtags on the last line.""",
    "hashtags": """Write HASHTAG SETS plus hidden YouTube TAGS for a vertical short.
- hashtags: 3-8 per set, no spaces inside a hashtag, most important first (YouTube shows the first 3).
- tags: 5-15 search keywords/phrases per set, total under 450 characters.""",
}

COMMON_RULES = """Ground rules (strict):
- Every claim, name and number must come from the EVIDENCE. Cite the evidence ids you used in fact_keys.
- Never invent numbers, results, names or promises the clip does not deliver.
- Borrow the niche's STYLE, never its wording: do not copy or lightly edit any benchmark title.
- Each candidate must follow its assigned strategy and be clearly different from the others.
- Write in {language}."""


def language_label(language_mode: str) -> str:
    return ("romanized Hinglish (Hindi-English mix in Latin script, the way Indian creators write online)"
            if language_mode == "hinglish" else "English")


def evidence_block(facts: list[dict], limit: int = 45) -> str:
    rows = []
    for fact in facts[:limit]:
        text = fact["text"]
        if len(text) > 300:
            text = text[:300] + "..."
        rows.append(f"{fact['fact_key'] if 'fact_key' in fact else fact['key']}: {text}")
    return "\n".join(rows)


def build_prompt(pool: str, ctx: dict, strategies: dict[str, str], extra: str = "") -> str:
    parts = [
        f"CLIP HOOK TITLE (on screen): {ctx.get('hook_title') or '-'}",
        f"VIDEO SUMMARY: {ctx.get('summary') or '-'}",
        "EVIDENCE (S = spoken, O = on-screen text, F = frame description):\n" + evidence_block(ctx["facts"]),
        "NICHE STYLE PROFILE:\n" + (ctx.get("style_text") or "No benchmark available; use clear, specific style."),
    ]
    if ctx.get("benchmark_titles"):
        parts.append("STYLE REFERENCE ONLY - top niche titles (do not copy):\n"
                     + "\n".join(f"- {t}" for t in ctx["benchmark_titles"][:10]))
    if extra:
        parts.append(extra)
    parts.append("STRATEGIES (one candidate per strategy, in this order):\n"
                 + "\n".join(f"- {name}: {desc}" for name, desc in strategies.items()))
    return "\n\n".join(parts)


async def generate_pool(pool: str, ctx: dict, extra: str = "") -> list[dict]:
    settings = get_settings()
    strategies = dict(list(STRATEGIES[pool].items())[: settings.candidates_per_pool])
    instructions = POOL_RULES[pool] + "\n" + COMMON_RULES.format(language=language_label(ctx["language_mode"]))
    prompt = build_prompt(pool, ctx, strategies, extra)
    fact_keys = [f.get("fact_key") or f.get("key") for f in ctx["facts"]]
    fake = {"strategies": list(strategies), "fact_keys": fact_keys, "pool": pool}
    if pool == "hashtags":
        result = await run_structured("generator", instructions, prompt, s.HashtagCandidates,
                                      temperature=0.8, fake_context=fake)
        out = [{"strategy": c.strategy, "text": " ".join(c.hashtags), "hashtags": c.hashtags, "tags": c.tags,
                "fact_keys": c.fact_keys} for c in result.candidates]
    else:
        result = await run_structured("generator", instructions, prompt, s.TextCandidates,
                                      temperature=0.8, fake_context=fake)
        out = [{"strategy": c.strategy, "text": c.text, "fact_keys": c.fact_keys} for c in result.candidates]
    known = set(strategies)
    for i, cand in enumerate(out):
        if cand["strategy"] not in known and i < len(strategies):
            cand["strategy"] = list(strategies)[i]
    return out
