"""Filesystem layout for media artefacts. The database stores paths relative to media_dir."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from app.core.config import get_settings


def media_root() -> Path:
    root = get_settings().media_dir.resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def source_dir(source_id: str) -> Path:
    path = media_root() / "sources" / source_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def clip_dir(source_id: str, clip_id: str) -> Path:
    path = source_dir(source_id) / "clips" / clip_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def rel(path: Path) -> str:
    """Path relative to the media root, as stored in the database."""
    return Path(path).resolve().relative_to(media_root()).as_posix()


def abs_path(relative: str) -> Path:
    """Resolve a stored relative path, refusing anything outside the media root."""
    root = media_root()
    candidate = (root / relative).resolve()
    if root != candidate and root not in candidate.parents:
        raise ValueError("path escapes media root")
    return candidate


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


def read_json(path: Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def remove_source_files(source_id: str) -> None:
    path = media_root() / "sources" / source_id
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)
