"""Request bodies for the API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class SourceFromUrl(BaseModel):
    url: HttpUrl
    language_mode: Literal["en", "hinglish"] | None = None
    channel_handle: str | None = Field(default=None, description="optional @handle to mine the creator's own top videos")


class RegenerateRequest(BaseModel):
    pool: Literal["title", "description", "hashtags"]
    title_id: str | None = Field(default=None, description="condition description/hashtags on this chosen title")


class SelectTitleRequest(BaseModel):
    title_id: str
    regenerate_dependents: bool = Field(default=True, description="regenerate description and hashtags for this title")
