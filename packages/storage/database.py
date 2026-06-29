"""Database — 도메인별 repository 를 합친 단일 진입점(공개 API).

실제 SQL 은 repositories/ 의 도메인별 파일에 있다(events·commands·auth·gitops·projection).
엔진·트랜잭션·헬퍼는 engine.py. 여기서는 그것들을 하나의 Database 로 합치고,
테스트·하위호환을 위해 모듈 헬퍼를 재노출한다.
"""

from __future__ import annotations

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
from packages.storage.repositories.auth import OAuthRepository
from packages.storage.repositories.commands import AgentCommandRepository
from packages.storage.repositories.events import (
    DeadLetterRepository,
    EventRepository,
    OutboxRepository,
)
from packages.storage.repositories.gitops import RcaRepository, RepoChangeRepository
from packages.storage.repositories.projection import AuditLogRepository, DashboardRepository

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


class Database(
    EventRepository,
    DeadLetterRepository,
    OAuthRepository,
    RepoChangeRepository,
    AgentCommandRepository,
    RcaRepository,
    DashboardRepository,
    AuditLogRepository,
    OutboxRepository,
):
    pass


async def wait_for_database(db: InitializableStore) -> None:
    async def attempt() -> None:
        db.init()

    await retry_dependency(attempt, label="postgres")
