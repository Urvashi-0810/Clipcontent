"""Mechanical checks on generated candidates (no LLM).

Hard failures remove a candidate from ranking; soft flags are kept for the UI.
Limits follow YouTube: title <= 100 chars, description <= 5000 chars, > 15 hashtags
makes YouTube ignore all of them, tags field <= 500 chars (commas count; tags with
spaces count as if quoted).
"""

from __future__ import annotations

import re
import unicodedata

from rapidfuzz import fuzz

TITLE_MAX = 100
DESCRIPTION_MAX = 5000
HASHTAGS_MAX = 15
TAGS_FIELD_MAX = 500

HARD_FLAGS = {"empty", "title_over_100", "description_over_5000", "hashtags_over_15", "unsupported_number",
              "near_duplicate", "too_close_to_benchmark", "no_hashtags"}

_NUM = re.compile(r"\d+(?:[.,]\d+)*")


def normalize_hashtag(tag: str) -> str | None:
    tag = unicodedata.normalize("NFKC", tag).strip()
    tag = tag.lstrip("#")
    tag = re.sub(r"[^\w]", "", tag, flags=re.UNICODE)
    return f"#{tag}" if tag and not tag.isdigit() else None


def normalize_tag(tag: str) -> str | None:
    tag = re.sub(r"\s+", " ", tag.replace("#", " ").replace(",", " ")).strip()
    tag = tag.replace("<", "").replace(">", "")
    return tag[:100] if tag else None


def tags_field_length(tags: list[str]) -> int:
    """Characters YouTube counts for snippet.tags."""
    total = 0
    for i, tag in enumerate(tags):
        total += len(tag) + (2 if " " in tag else 0)
        if i:
            total += 1  # comma
    return total


def fit_tags(tags: list[str], limit: int = TAGS_FIELD_MAX) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in tags:
        tag = normalize_tag(raw)
        if not tag or tag.lower() in seen:
            continue
        if tags_field_length(out + [tag]) > limit:
            continue
        out.append(tag)
        seen.add(tag.lower())
    return out


def numbers_in(text: str) -> set[str]:
    return {n.replace(",", "") for n in _NUM.findall(text)}


def unsupported_numbers(text: str, evidence_text: str) -> set[str]:
    """Numbers in a candidate that never appear in the evidence (digits only; '#1' style kept)."""
    evidence = numbers_in(evidence_text)
    return {n for n in numbers_in(text) if n not in evidence}


def clean_text(text: str) -> str:
    text = text.replace("\r", "").strip().strip('"').strip()
    return re.sub(r"[ \t]+", " ", text)


def check_candidate(pool: str, cand: dict, evidence_text: str, valid_keys: set[str],
                    title_band: tuple[int, int] | None = None) -> dict:
    """Mutates and returns cand with filter_flags / passed_filters and normalised fields."""
    flags: list[str] = []
    cand["text"] = clean_text(cand.get("text", ""))
    keys = [k for k in cand.get("fact_keys", []) if k in valid_keys]
    if len(keys) < len(cand.get("fact_keys", [])):
        flags.append("invalid_fact_keys")
    cand["fact_keys"] = keys

    if pool == "title":
        text = cand["text"].replace("\n", " ")
        cand["text"] = text
        if not text:
            flags.append("empty")
        if len(text) > TITLE_MAX:
            flags.append("title_over_100")
        if title_band and text:
            lo, hi = title_band
            if len(text) < max(12, lo - 15):
                flags.append("short_for_niche")
            elif len(text) > hi + 20:
                flags.append("long_for_niche")
        if text.count("#"):
            flags.append("hashtag_in_title")
    elif pool == "description":
        text = cand["text"]
        if not text:
            flags.append("empty")
        if len(text) > DESCRIPTION_MAX:
            flags.append("description_over_5000")
        first = text.splitlines()[0] if text else ""
        if len(first) > 150:
            flags.append("long_first_line")
        if len(re.findall(r"#\w+", text)) > HASHTAGS_MAX:
            flags.append("hashtags_over_15")
    elif pool == "hashtags":
        hashtags = []
        for h in cand.get("hashtags") or []:
            norm = normalize_hashtag(h)
            if norm and norm.lower() not in {x.lower() for x in hashtags}:
                hashtags.append(norm)
        if len(hashtags) > HASHTAGS_MAX:
            flags.append("hashtags_over_15")
            hashtags = hashtags[:HASHTAGS_MAX]
        if not hashtags:
            flags.append("no_hashtags")
        cand["hashtags"] = hashtags
        cand["tags"] = fit_tags(cand.get("tags") or [])
        cand["text"] = " ".join(hashtags)

    if pool in ("title", "description") and unsupported_numbers(cand["text"], evidence_text):
        flags.append("unsupported_number")
    if pool in ("title", "description") and not keys:
        flags.append("no_evidence_cited")

    cand["filter_flags"] = flags
    cand["passed_filters"] = not (set(flags) & HARD_FLAGS)
    return cand


def mark_near_duplicates(cands: list[dict], similarity, threshold: float) -> None:
    """similarity: square matrix aligned with cands. Later duplicates of a passing candidate fail."""
    for i in range(len(cands)):
        if not cands[i]["passed_filters"]:
            continue
        for j in range(i):
            if cands[j]["passed_filters"] and similarity[i][j] >= threshold:
                cands[i]["filter_flags"].append("near_duplicate")
                cands[i]["passed_filters"] = False
                break


def mark_benchmark_copies(cands: list[dict], benchmark_titles: list[str], ratio: int) -> None:
    for cand in cands:
        for title in benchmark_titles:
            if fuzz.token_set_ratio(cand["text"].lower(), title.lower()) >= ratio:
                cand["filter_flags"].append("too_close_to_benchmark")
                cand["passed_filters"] = False
                break


def title_fit_score(text: str, band: tuple[int, int]) -> float:
    """1.0 inside the niche's typical length band, decaying outside it."""
    lo, hi = band
    n = len(text)
    if lo <= n <= hi:
        return 1.0
    distance = lo - n if n < lo else n - hi
    return max(0.0, 1.0 - distance / 40.0)
