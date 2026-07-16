from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from sqlalchemy.dialects import postgresql

from domains.release_flow.repository import ReleaseFlowRepository
from packages.events.envelope import event
from packages.storage.repositories.outbox import OutboxRepository


class _Result:
    def scalar_one_or_none(self) -> str:
        return "plan-200"


class _StatementConnection:
    def __init__(self, *, fail_on_statement: int | None = None) -> None:
        self.fail_on_statement = fail_on_statement
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        if self.fail_on_statement == len(self.statements):
            raise RuntimeError("bulk write fault")
        return _Result()


def _compiled(statement: Any) -> tuple[str, dict[str, Any]]:
    compiled = statement.compile(dialect=postgresql.dialect())
    return " ".join(str(compiled).split()), dict(compiled.params)


def _release_steps(count: int = 200) -> list[dict[str, object]]:
    return [
        {
            "application_id": f"app-{index:03d}",
            "name": f"Application {index:03d}",
            "position": index,
            "depends_on": [] if index == 0 else [f"app-{index - 1:03d}"],
            "config": {
                "environment": "production",
                "namespace": "app",
                "strategy": "rolling",
            },
        }
        for index in range(count)
    ]


def _release_repository(connection: _StatementConnection) -> ReleaseFlowRepository:
    @contextmanager
    def fake_connection() -> Iterator[_StatementConnection]:
        yield connection

    repository = object.__new__(ReleaseFlowRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]
    repository.get_release_plan = lambda workspace_id, plan_id: {  # type: ignore[method-assign]
        "workspace_id": workspace_id,
        "plan_id": plan_id,
    }
    repository.get_release_run = lambda workspace_id, run_id: {  # type: ignore[method-assign]
        "workspace_id": workspace_id,
        "run_id": run_id,
    }
    return repository


def _release_run_payload() -> dict[str, object]:
    steps = _release_steps()
    return {
        "workspace_id": "workspace-a",
        "run_id": "run-200",
        "status": "running",
        "current_wave": 1,
        "started_by": "operator-a",
        "plan": {
            "plan_id": "plan-200",
            "name": "200 application rollout",
            "settings": {
                "runtime_mode": "live",
                "provider_mode": "live",
                "rollback_policy": "manual",
            },
            "steps": steps,
        },
        "preview": {
            "waves": [{"wave": 1}],
            "steps": [
                {
                    "application_id": step["application_id"],
                    "step_id": f"step-{index:03d}",
                    "wave": 1,
                    "gate": "manual",
                    "strategy": "rolling",
                    "environment": "production",
                }
                for index, step in enumerate(steps)
            ],
        },
    }


def test_outbox_stages_200_events_with_one_multi_values_statement() -> None:
    connection = _StatementConnection()
    repository = object.__new__(OutboxRepository)
    events = [
        event(
            "release.step.queued",
            "release-worker",
            {"position": index, "workspace_id": "workspace-a"},
            correlation_id="release-200",
        )
        for index in range(200)
    ]

    repository.stage_events(connection, events)

    assert len(connection.statements) == 1
    sql, params = _compiled(connection.statements[0])
    assert "ON CONFLICT (event_id) DO NOTHING" in sql
    assert {item.event_id for item in events} == {
        value for key, value in params.items() if key.startswith("event_id")
    }


def test_release_plan_200_steps_use_constant_statement_count() -> None:
    connection = _StatementConnection()
    repository = _release_repository(connection)

    repository.upsert_release_plan(
        {
            "workspace_id": "workspace-a",
            "plan_id": "plan-200",
            "name": "200 application rollout",
            "description": "",
            "status": "draft",
            "settings": {},
            "steps": _release_steps(),
        }
    )

    assert len(connection.statements) == 3
    step_sql, step_params = _compiled(connection.statements[2])
    assert step_sql.startswith("INSERT INTO release_plan_steps")
    application_ids = {f"app-{index:03d}" for index in range(200)}
    assert application_ids == {
        value for key, value in step_params.items() if key.startswith("application_id")
    }


def test_release_run_200_steps_use_one_idempotent_bulk_upsert() -> None:
    connection = _StatementConnection()
    repository = _release_repository(connection)
    payload = _release_run_payload()

    repository.create_release_run(payload)
    repository.create_release_run(payload)

    assert len(connection.statements) == 6
    first_step_sql, first_step_params = _compiled(connection.statements[1])
    second_step_sql, second_step_params = _compiled(connection.statements[4])
    assert "ON CONFLICT (run_step_id) DO UPDATE" in first_step_sql
    assert "release_run_steps.workspace_id = excluded.workspace_id" in first_step_sql
    assert "release_run_steps.run_id = excluded.run_id" in first_step_sql
    assert "status = excluded.status" not in first_step_sql
    assert "workflow_run_id = excluded.workflow_run_id" not in first_step_sql
    assert "health = excluded.health" not in first_step_sql
    assert {value for key, value in first_step_params.items() if key.startswith("run_step_id")} == {
        value for key, value in second_step_params.items() if key.startswith("run_step_id")
    }
    assert (
        len({value for key, value in first_step_params.items() if key.startswith("run_step_id")})
        == 200
    )
    assert first_step_sql == second_step_sql


def test_release_run_bulk_write_rolls_back_when_event_insert_fails() -> None:
    connection = _StatementConnection(fail_on_statement=3)
    committed: list[Any] = []

    @contextmanager
    def transactional_connection() -> Iterator[_StatementConnection]:
        start = len(connection.statements)
        try:
            yield connection
        except Exception:
            del connection.statements[start:]
            raise
        else:
            committed.extend(connection.statements[start:])

    repository = object.__new__(ReleaseFlowRepository)
    repository.connection = transactional_connection  # type: ignore[method-assign]
    repository.get_release_run = lambda workspace_id, run_id: None  # type: ignore[method-assign]

    with pytest.raises(RuntimeError, match="bulk write fault"):
        repository.create_release_run(_release_run_payload())

    assert committed == []
    assert connection.statements == []
