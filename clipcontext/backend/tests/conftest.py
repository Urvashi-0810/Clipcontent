import os

import pytest

from app.core.config import reset_settings_cache


@pytest.fixture
def fake_mode(monkeypatch, tmp_path):
    monkeypatch.setenv("LLM_MODE", "fake")
    monkeypatch.setenv("TRANSCRIPTION_PROVIDER", "fake")
    monkeypatch.setenv("MEDIA_DIR", str(tmp_path / "media"))
    monkeypatch.setenv("SUBTITLE_FONT", os.environ.get("SUBTITLE_FONT", "DejaVu Sans"))
    reset_settings_cache()
    yield
    reset_settings_cache()
