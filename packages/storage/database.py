"""Database 공개 진입점(하위호환) — 합성은 domains/registry 가 담당.

엔진·트랜잭션·헬퍼는 engine.py, 도메인 repo 합성은 domains/registry.py(도메인 zone).
여기서는 그 Database 와 테스트·하위호환용 모듈 헬퍼를 재노출한다.
"""

from __future__ import annotations

from domains.registry import Database as Database
from packages.config.retry import retry_dependency
from packages.contracts.interfaces import InitializableStore
from packages.storage.engine import (
    ERROR_MESSAGE_LIMIT,
    compact_error,
    iso_or_none,
    row_dict,
    serialize_command,
    serialize_dead_letter,
)

__all__ = [
    "ERROR_MESSAGE_LIMIT",
    "Database",
    "compact_error",
    "iso_or_none",
    "row_dict",
    "serialize_command",
    "serialize_dead_letter",
    "wait_for_database",
]


async def wait_for_database(db: InitializableStore) -> None:
    async def attempt() -> None:
        db.init()

    await retry_dependency(attempt, label="postgres")
