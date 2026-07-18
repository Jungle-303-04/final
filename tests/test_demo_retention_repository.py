from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy.dialects import postgresql

from domains.retention.repository import DemoRetentionRepository


class RecordingResult:
    def __init__(self, rows: list[tuple[object, ...]]) -> None:
        self.rows = rows

    def all(self) -> list[tuple[object, ...]]:
        return self.rows


def retention_repository(
    recorded: list[Any],
    transactions: list[str],
    *,
    return_rows: bool,
    fail_after: int | None = None,
) -> DemoRetentionRepository:
    class Connection:
        def execute(self, statement: Any) -> RecordingResult:
            recorded.append(statement)
            if fail_after is not None and len(recorded) >= fail_after:
                raise RuntimeError("simulated retention failure")
            table = getattr(statement, "table", None)
            if not return_rows or table is None:
                return RecordingResult([])
            if table.name == "timeline_events":
                return RecordingResult([("workspace-1", 1)])
            return RecordingResult([(1,)])

    @contextmanager
    def connection():
        transactions.append("begin")
        try:
            yield Connection()
        except Exception:
            transactions.append("rollback")
            raise
        else:
            transactions.append("commit")

    repository = object.__new__(DemoRetentionRepository)
    repository.connection = connection  # type: ignore[method-assign]
    return repository


def statement_table_names(recorded: list[Any]) -> list[str]:
    return [
        table.name
        for statement in recorded
        if (table := getattr(statement, "table", None)) is not None
    ]


def test_demo_retention_uses_one_transaction_fk_order_and_bounded_deletes() -> None:
    recorded: list[Any] = []
    transactions: list[str] = []
    repository = retention_repository(recorded, transactions, return_rows=True)

    result = repository.delete_demo_data_older_than(
        datetime(2026, 7, 17, tzinfo=UTC),
        scopes=(
            "observations",
            "events",
            "incidents",
            "rca",
            "evidence",
            "timeline",
            "commands",
            "projections",
        ),
        limit=17,
    )

    assert transactions == ["begin", "commit"]
    names = statement_table_names(recorded)
    assert names.index("agent_command_attempts") < names.index("agent_commands")
    assert names.index("command_operation_events") < names.index("agent_commands")
    assert names.index("evidence_jobs") < names.index("evidence_windows")
    assert names.index("inventory_resource_label_versions") < names.index(
        "inventory_resource_versions"
    )
    assert names.index("inventory_resource_application_versions") < names.index(
        "inventory_resource_versions"
    )
    assert result["timeline_events"] == 1

    delete_statements = [
        statement for statement in recorded if statement.__class__.__name__ == "Delete"
    ]
    assert delete_statements
    for statement in delete_statements:
        compiled = statement.compile(dialect=postgresql.dialect())
        sql = str(compiled)
        assert "LIMIT" in sql
        assert "RETURNING" in sql
        assert 17 in compiled.params.values()

    sql = "\n".join(str(statement.compile(dialect=postgresql.dialect())) for statement in recorded)
    for protected_table in (
        "user_accounts",
        "workspaces",
        "cluster_registrations",
        "target_desired_states",
        "agent_policies",
        "git_repositories",
        "deployment_bindings",
        "audit_log",
        "alert_events",
    ):
        assert protected_table not in sql


def test_demo_retention_is_idempotent_when_no_rows_are_expired() -> None:
    recorded: list[Any] = []
    transactions: list[str] = []
    repository = retention_repository(recorded, transactions, return_rows=False)

    result = repository.delete_demo_data_older_than(
        datetime(2026, 7, 17, tzinfo=UTC),
        scopes=("commands", "timeline", "observations"),
        limit=500,
    )

    assert result == {}
    assert transactions == ["begin", "commit"]


def test_demo_retention_caps_large_requested_batches() -> None:
    recorded: list[Any] = []
    transactions: list[str] = []
    repository = retention_repository(recorded, transactions, return_rows=False)

    repository.delete_demo_data_older_than(
        datetime(2026, 7, 17, tzinfo=UTC),
        scopes=("events",),
        limit=50_000,
    )

    delete_statements = [
        statement for statement in recorded if statement.__class__.__name__ == "Delete"
    ]
    assert delete_statements
    for statement in delete_statements:
        compiled = statement.compile(dialect=postgresql.dialect())
        assert 10_000 in compiled.params.values()


def test_demo_retention_rolls_back_the_scope_set_on_failure() -> None:
    recorded: list[Any] = []
    transactions: list[str] = []
    repository = retention_repository(
        recorded,
        transactions,
        return_rows=False,
        fail_after=2,
    )

    with pytest.raises(RuntimeError, match="simulated retention failure"):
        repository.delete_demo_data_older_than(
            datetime(2026, 7, 17, tzinfo=UTC),
            scopes=("commands", "timeline"),
            limit=500,
        )

    assert transactions == ["begin", "rollback"]
