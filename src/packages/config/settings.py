from __future__ import annotations

import os
from datetime import UTC, datetime


def env(name: str, default: str) -> str:
    return os.getenv(name, default)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()
