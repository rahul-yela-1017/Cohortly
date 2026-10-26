"""File storage abstraction.

Files live on disk (or any POSIX-mounted object store) — never inside MongoDB.
MongoDB holds only metadata: owner, scope, size, MIME and the storage key.
"""
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

_SAFE = re.compile(r"[^A-Za-z0-9.\-_]")


class Storage:
    def __init__(self, base_dir: str):
        self.base = Path(base_dir).resolve()
        self.base.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.base / key).resolve()
        if not str(path).startswith(str(self.base)):
            raise ValueError("Invalid storage key")
        return path

    def save(self, stream, suffix: str = "") -> tuple[str, int]:
        key = uuid.uuid4().hex + (_SAFE.sub("", suffix)[:24])
        path = self._path(key)
        size = 0
        with path.open("wb") as fh:
            while True:
                chunk = stream.read(1024 * 256)
                if not chunk:
                    break
                size += len(chunk)
                fh.write(chunk)
        return key, size

    def open(self, key: str):
        return self._path(key).open("rb")

    def delete(self, key: str) -> None:
        try:
            self._path(key).unlink(missing_ok=True)
        except ValueError:
            pass

    def exists(self, key: str) -> bool:
        try:
            return self._path(key).is_file()
        except ValueError:
            return False


_storage: Storage | None = None


def get_storage(app=None) -> Storage:
    global _storage
    if _storage is None:
        from flask import current_app

        cfg = (app or current_app).config
        _storage = Storage(cfg["STORAGE_DIR"])
    return _storage
