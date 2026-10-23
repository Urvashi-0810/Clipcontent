"""Niche trend mining: find outlier videos in the clip's niche (or the creator's own top videos).

YouTube has no niche 'trending' feed any more, so we search the niche and rank by how
much each video beat its channel: views/day, views/subscribers and a z-score.
Scores stay internal (YouTube policy discourages showing derived metrics as YouTube data).
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone

import numpy as np

from app.core.config import get_settings
from app.metadata.youtube import YouTubeAPIError, YouTubeClient, iso_duration_seconds

log = logging.getLogger(__name__)


def cache_key(queries: list[str], language_mode: str, channel_handle: str | None) -> str:
    payload = json.dumps({"q": sorted(q.lower().strip() for q in queries), "lang": language_mode,
                          "ch": (channel_handle or "").lower(), "dur": get_settings().niche_video_duration})
    return hashlib.sha1(payload.encode()).hexdigest()


def video_row(item: dict, subscribers: dict[str, int], now: datetime | None = None) -> dict | None:
    now = now or datetime.now(timezone.utc)
    snippet = item.get("snippet", {})
    stats = item.get("statistics", {})
    try:
        published = datetime.fromisoformat(snippet["publishedAt"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return None
    views = int(stats.get("viewCount", 0) or 0)
    if views <= 0:
        return None
    days = max((now - published).total_seconds() / 86400.0, 0.5)
    subs = subscribers.get(snippet.get("channelId", ""), 0)
    return {
        "video_id": item["id"],
        "title": snippet.get("title", ""),
        "description": (snippet.get("description") or "")[:600],
        "tags": (snippet.get("tags") or [])[:20],
        "channel_id": snippet.get("channelId"),
        "channel_title": snippet.get("channelTitle"),
        "published_at": snippet.get("publishedAt"),
        "duration_s": iso_duration_seconds(item.get("contentDetails", {}).get("duration")),
        "views": views,
        "likes": int(stats.get("likeCount", 0) or 0),
        "comments": int(stats.get("commentCount", 0) or 0),
        "subscribers": subs,
        "views_per_day": views / days,
        "views_per_sub": views / subs if subs else None,
    }


def score_outliers(rows: list[dict]) -> list[dict]:
    """Outlier score = z(log views/day) + 0.5 * z(log views/subscriber) + 0.5 * within-channel z."""
    if not rows:
        return rows
    vpd = np.log1p(np.array([r["views_per_day"] for r in rows]))
    vps_raw = [r["views_per_sub"] for r in rows]
    known = [v for v in vps_raw if v is not None]
    median_vps = float(np.median(known)) if known else 1.0
    vps = np.log1p(np.array([v if v is not None else median_vps for v in vps_raw]))

    def z(arr: np.ndarray) -> np.ndarray:
        return (arr - arr.mean()) / arr.std() if arr.std() > 1e-9 else np.zeros_like(arr)

    by_channel: dict[str, list[int]] = {}
    for i, r in enumerate(rows):
        by_channel.setdefault(r.get("channel_id") or "", []).append(i)
    within = np.zeros(len(rows))
    for indices in by_channel.values():
        if len(indices) >= 3:
            within[indices] = z(vpd[indices])

    score = z(vpd) + 0.5 * z(vps) + 0.5 * within
    for r, s in zip(rows, score):
        r["outlier_score"] = round(float(s), 3)
    return sorted(rows, key=lambda r: r["outlier_score"], reverse=True)


async def fetch_benchmark(queries: list[str], language_mode: str, channel_handle: str | None) -> tuple[list[dict], int]:
    """Returns (benchmark rows, search calls used). Empty list if no API key."""
    settings = get_settings()
    if not settings.youtube_api_key:
        log.info("YOUTUBE_API_KEY not set; skipping niche benchmark")
        return [], 0
    client = YouTubeClient()
    try:
        ids: list[str] = []
        if channel_handle:
            _, ids = await client.channel_uploads(channel_handle, limit=100)
        if not ids:
            language = "hi" if language_mode == "hinglish" else "en"
            plan: list[tuple[str, str]] = []
            for q in queries[:2]:
                plan.append((q, "viewCount"))
            if queries:
                plan.append((queries[0], "relevance"))
            for q, order in plan[: settings.niche_max_search_calls]:
                try:
                    ids.extend(await client.search_videos(
                        q, order=order, days=settings.niche_search_days, duration=settings.niche_video_duration,
                        language=language, region=settings.niche_region_code))
                except YouTubeAPIError as exc:
                    log.warning("search failed for %r: %s", q, exc)
        ids = list(dict.fromkeys(ids))
        if not ids:
            return [], client.search_calls
        items = await client.videos(ids)
        subs = await client.channel_subscribers([i["snippet"]["channelId"] for i in items if "snippet" in i])
        now = datetime.now(timezone.utc)
        rows = [r for r in (video_row(i, subs, now) for i in items) if r]
        if settings.niche_video_duration == "short":
            rows = [r for r in rows if r["duration_s"] <= 180] or rows
        ranked = score_outliers(rows)
        return ranked[: settings.niche_benchmark_size], client.search_calls
    finally:
        await client.close()


def benchmark_for_prompt(benchmark: list[dict], n: int = 10) -> list[str]:
    return [r["title"] for r in benchmark[:n]]

