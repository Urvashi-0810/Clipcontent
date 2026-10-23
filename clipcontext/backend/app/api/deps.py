"""Optional single-user auth: if API_TOKEN is set, every request must present it."""

from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, Query, status

from app.core.config import get_settings


async def require_token(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
    token: str | None = Query(default=None, description="for <video>/<img> tags that cannot send headers"),
) -> None:
    expected = get_settings().api_token
    if not expected:
        return
    supplied = x_api_key or token
    if authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:]
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or missing API token")
