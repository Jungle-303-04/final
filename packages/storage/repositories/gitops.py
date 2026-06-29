from __future__ import annotations

from sqlalchemy.dialects.postgresql import insert as pg_insert

from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import (
    DatabaseConnection,
)
from packages.storage.schema import (
    Evidence,
    PullRequest,
    RcaReport,
    RepoChange,
)


class RepoChangeRepository(DatabaseConnection):
    def save_repo_change(self, correlation_id: str, commit_sha: str, manifest: JsonObject) -> None:
        table = RepoChange.__table__
        statement = pg_insert(table).values(
            correlation_id=correlation_id, commit_sha=commit_sha, manifest=manifest
        )
        with self.connection() as conn:
            conn.execute(statement)


class RcaRepository(DatabaseConnection):
    def save_evidence(self, correlation_id: str, kind: str, body: JsonObject) -> None:
        table = Evidence.__table__
        statement = pg_insert(table).values(correlation_id=correlation_id, kind=kind, payload=body)
        with self.connection() as conn:
            conn.execute(statement)

    def save_rca_report(
        self, correlation_id: str, root_cause: str, action: str, body: JsonObject
    ) -> None:
        table = RcaReport.__table__
        statement = pg_insert(table).values(
            correlation_id=correlation_id, root_cause=root_cause, action=action, payload=body
        )
        with self.connection() as conn:
            conn.execute(statement)

    def save_pull_request(
        self, correlation_id: str, pr_url: str, title: str, body: str, status: str
    ) -> None:
        table = PullRequest.__table__
        statement = pg_insert(table).values(
            correlation_id=correlation_id, pr_url=pr_url, title=title, body=body, status=status
        )
        with self.connection() as conn:
            conn.execute(statement)
