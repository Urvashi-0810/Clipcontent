"""Style profile from the benchmark set: computed statistics first, LLM only names templates."""

from __future__ import annotations

import logging
import re
from collections import Counter

import numpy as np

from app.llm import schemas as s
from app.llm.client import role_available, run_structured
from app.metadata.textembed import embed_texts

log = logging.getLogger(__name__)

EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
HASHTAG = re.compile(r"#[\w]+", re.UNICODE)
NUMBER = re.compile(r"\d")
STOPWORDS = set("""a an and are as at be but by for from has have how i if in into is it its me my of on or our
so that the their them they this to up was we what when why will with you your just like get got do does
not no yes vs""".split())

DEFAULT_PROFILE = {
    "sample_size": 0,
    "title_chars": {"p25": 35, "median": 48, "p75": 60},
    "title_words_median": 8,
    "rates": {"number": 0.3, "question": 0.15, "brackets": 0.1, "caps_word": 0.15, "emoji": 0.2,
              "separator": 0.15, "first_person": 0.2, "second_person": 0.25},
    "hashtags_per_description": 3,
    "common_hashtags": ["#shorts"],
    "common_tags": [],
    "description_first_line_chars": 70,
    "keyphrases": [],
    "templates": [],
    "tone": "",
    "notes": [],
}


def compute_stats(benchmark: list[dict]) -> dict:
    if not benchmark:
        return dict(DEFAULT_PROFILE)
    titles = [r["title"] for r in benchmark if r.get("title")]
    lengths = np.array([len(t) for t in titles]) if titles else np.array([48])

    def rate(pattern) -> float:
        return round(sum(1 for t in titles if pattern(t)) / max(len(titles), 1), 2)

    descriptions = [r.get("description") or "" for r in benchmark]
    hashtag_lists = [HASHTAG.findall(d) for d in descriptions]
    hashtag_counter = Counter(h.lower() for hs in hashtag_lists for h in hs)
    tag_counter = Counter(t.lower() for r in benchmark for t in r.get("tags", []))
    first_lines = [d.strip().splitlines()[0] for d in descriptions if d.strip()]
    return {
        "sample_size": len(benchmark),
        "title_chars": {"p25": int(np.percentile(lengths, 25)), "median": int(np.median(lengths)),
                        "p75": int(np.percentile(lengths, 75))},
        "title_words_median": int(np.median([len(t.split()) for t in titles])) if titles else 8,
        "rates": {
            "number": rate(lambda t: bool(NUMBER.search(t))),
            "question": rate(lambda t: "?" in t),
            "brackets": rate(lambda t: bool(re.search(r"[\(\[\{]", t))),
            "caps_word": rate(lambda t: bool(re.search(r"\b[A-Z]{3,}\b", t))),
            "emoji": rate(lambda t: bool(EMOJI.search(t))),
            "separator": rate(lambda t: bool(re.search(r"[|:–—-]\s", t))),
            "first_person": rate(lambda t: bool(re.search(r"\b(I|I'm|my|me|we|our)\b", t, re.I))),
            "second_person": rate(lambda t: bool(re.search(r"\b(you|your)\b", t, re.I))),
        },
        "hashtags_per_description": int(np.median([len(h) for h in hashtag_lists])) if hashtag_lists else 3,
        "common_hashtags": [h for h, _ in hashtag_counter.most_common(15)],
        "common_tags": [t for t, _ in tag_counter.most_common(20)],
        "description_first_line_chars": int(np.median([len(l) for l in first_lines])) if first_lines else 70,
        "keyphrases": keyphrases(titles + [" ".join(r.get("tags", [])) for r in benchmark]),
    }


def keyphrases(texts: list[str], top_n: int = 15) -> list[str]:
    """Frequent 1-3 word phrases, diversified with MMR over embeddings."""
    from sklearn.feature_extraction.text import CountVectorizer

    texts = [t for t in texts if t and t.strip()]
    if len(texts) < 2:
        return []
    try:
        vectorizer = CountVectorizer(ngram_range=(1, 3), stop_words=list(STOPWORDS), lowercase=True,
                                     token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z0-9']+\b", min_df=2)
        counts = vectorizer.fit_transform(texts)
    except ValueError:
        return []
    vocab = vectorizer.get_feature_names_out()
    freq = np.asarray(counts.sum(axis=0)).ravel()
    order = np.argsort(-freq)[:60]
    candidates = [vocab[i] for i in order]
    if len(candidates) <= top_n:
        return list(candidates)
    vectors = embed_texts(candidates)
    weights = freq[order] / freq[order].max()
    chosen: list[int] = [0]
    sims = vectors @ vectors.T
    while len(chosen) < top_n:
        scores = [(0.7 * weights[i] - 0.3 * max(sims[i, j] for j in chosen), i)
                  for i in range(len(candidates)) if i not in chosen]
        chosen.append(max(scores)[1])
    return [candidates[i] for i in chosen]


async def build_style_profile(benchmark: list[dict]) -> dict:
    profile = compute_stats(benchmark)
    titles = [r["title"] for r in benchmark][:25]
    if len(titles) >= 5 and role_available("helper"):
        prompt = ("Titles of top-performing short videos in one niche (best first):\n"
                  + "\n".join(f"- {t}" for t in titles)
                  + "\n\nComputed stats: " + str({k: profile[k] for k in ("title_chars", "rates")}))
        try:
            result = await run_structured(
                "helper",
                "You analyse what top titles in a niche have in common. Extract 3-5 reusable title formulas "
                "with placeholders in braces (never copy a full title), one sentence on tone, and up to 4 short "
                "notes on structure. Be specific and brief.",
                prompt, s.StyleTemplates, temperature=0.2,
            )
            profile.update(templates=result.templates[:5], tone=result.tone, notes=result.notes[:4])
        except Exception as exc:
            log.warning("style templates failed, continuing with stats only: %s", exc)
    return profile


def style_for_prompt(profile: dict) -> str:
    rates = profile.get("rates", {})
    common = ", ".join(f"{k} {int(v * 100)}%" for k, v in rates.items() if v >= 0.15)
    lines = [
        f"Title length: median {profile['title_chars']['median']} chars "
        f"(typical {profile['title_chars']['p25']}-{profile['title_chars']['p75']}).",
        f"Common title traits: {common or 'none dominant'}.",
        f"Description first line: ~{profile.get('description_first_line_chars', 70)} chars; "
        f"~{profile.get('hashtags_per_description', 3)} hashtags per description.",
    ]
    if profile.get("templates"):
        lines.append("Title formulas: " + " | ".join(profile["templates"]))
    if profile.get("tone"):
        lines.append(f"Tone: {profile['tone']}")
    if profile.get("keyphrases"):
        lines.append("Niche vocabulary: " + ", ".join(profile["keyphrases"][:12]))
    if profile.get("common_hashtags"):
        lines.append("Hashtags seen often: " + " ".join(profile["common_hashtags"][:10]))
    return "\n".join(lines)
