"""Minimal YouTube Data API v3 client (API key only, read-only).

Quota (2026): search.list has its own bucket of 100 calls/day per project; videos.list,
channels.list and playlistItems.list cost 1 unit each from the 10,000-unit pool.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)
API = "https://www.googleapis.com/youtube/v3"


class YouTubeAPIError(RuntimeError):
    pass


class YouTubeClient:
    def __init__(self, api_key: str | None = None, client: httpx.AsyncClient | None = None) -> None:
        self.api_key = api_key or get_settings().youtube_api_key
        if not self.api_key:
            raise YouTubeAPIError("YOUTUBE_API_KEY is not set")
        self._client = client or httpx.AsyncClient(timeout=30)
        self.search_calls = 0
        self.unit_calls = 0

    async def close(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, Any]) -> dict:
        params = {k: v for k, v in params.items() if v is not None}
        params["key"] = self.api_key
        response = await self._client.get(f"{API}/{path}", params=params)
        if response.status_code != 200:
            raise YouTubeAPIError(f"{path} {response.status_code}: {response.text[:300]}")
        return response.json()

    async def search_videos(self, query: str, order: str = "viewCount", days: int = 90,
                            duration: str = "short", language: str | None = None,
                            region: str | None = None, max_results: int = 50) -> list[str]:
        published_after = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
        data = await self._get("search", {
            "part": "snippet", "q": query, "type": "video", "order": order, "maxResults": max_results,
            "publishedAfter": published_after, "videoDuration": None if duration == "any" else duration,
            "relevanceLanguage": language, "regionCode": region,
        })
        self.search_calls += 1
        return [item["id"]["videoId"] for item in data.get("items", []) if item.get("id", {}).get("videoId")]

    async def videos(self, ids: list[str]) -> list[dict]:
        out: list[dict] = []
        for i in range(0, len(ids), 50):
            data = await self._get("videos", {"part": "snippet,statistics,contentDetails",
                                              "id": ",".join(ids[i:i + 50]), "maxResults": 50})
            self.unit_calls += 1
            out.extend(data.get("items", []))
        return out

    async def channel_subscribers(self, channel_ids: list[str]) -> dict[str, int]:
        out: dict[str, int] = {}
        unique = list(dict.fromkeys(channel_ids))
        for i in range(0, len(unique), 50):
            data = await self._get("channels", {"part": "statistics", "id": ",".join(unique[i:i + 50]),
                                                "maxResults": 50})
            self.unit_calls += 1
            for item in data.get("items", []):
                stats = item.get("statistics", {})
                if not stats.get("hiddenSubscriberCount"):
                    out[item["id"]] = int(stats.get("subscriberCount", 0) or 0)
        return out

    async def channel_uploads(self, handle: str, limit: int = 100) -> tuple[str | None, list[str]]:
        handle = handle if handle.startswith("@") else f"@{handle}"
        data = await self._get("channels", {"part": "contentDetails,statistics", "forHandle": handle})
        self.unit_calls += 1
        items = data.get("items", [])
        if not items:
            return None, []
        channel = items[0]
        uploads = channel["contentDetails"]["relatedPlaylists"]["uploads"]
        ids: list[str] = []
        token = None
        while len(ids) < limit:
            page = await self._get("playlistItems", {"part": "contentDetails", "playlistId": uploads,
                                                     "maxResults": 50, "pageToken": token})
            self.unit_calls += 1
            ids.extend(i["contentDetails"]["videoId"] for i in page.get("items", []))
            token = page.get("nextPageToken")
            if not token:
                break
        return channel["id"], ids[:limit]


def iso_duration_seconds(value: str | None) -> int:
    """PT1M5S -> 65."""
    if not value or not value.startswith("P"):
        return 0
    import re

    match = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value)
    if not match:
        return 0
    d, h, m, s = (int(x or 0) for x in match.groups())
    return d * 86400 + h * 3600 + m * 60 + s
