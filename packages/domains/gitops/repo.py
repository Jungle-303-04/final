"""gitops 도메인 repository(SQL)."""

from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert as pg_insert

from packages.contracts.event_bus.interfaces import JsonObject
from packages.domains.gitops.tables import RepoChange
from packages.storage.engine import DatabaseConnection


class RepoChangeRepository(DatabaseConnection):
    def save_repo_change(self, correlation_id: str, commit_sha: str, manifest: JsonObject) -> None:
        table = RepoChange.__table__
        statement = pg_insert(table).values(
            correlation_id=correlation_id, commit_sha=commit_sha, manifest=manifest
        )
        with self.connection() as conn:
            conn.execute(statement)
