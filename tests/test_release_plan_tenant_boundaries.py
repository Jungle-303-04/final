"""Release-plan 쓰기 경계의 교차 workspace 회귀 테스트."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from domains.release_flow import router as release_router
from domains.release_flow.repository import ReleaseFlowRepository
from packages.contracts.identity import Permission


class _Result:
    def __init__(
        self,
        *,
        first: dict[str, object] | None = None,
        rowcount: int = 0,
    ) -> None:
        self._first = first
        self.rowcount = rowcount

    def mappings(self) -> _Result:
        return self

    def first(self) -> dict[str, object] | None:
        return self._first

    def scalar_one_or_none(self) -> object | None:
        if self._first is None:
            return None
        return next(iter(self._first.values()), None)


def _postgres_sql(statement: Any) -> str:
    return " ".join(str(statement.compile(dialect=postgresql.dialect())).split())


class _StatementCaptureConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        return _Result(rowcount=1)


def _release_repository(connection: Any) -> ReleaseFlowRepository:
    @contextmanager
    def fake_connection() -> Iterator[Any]:
        yield connection

    repository = object.__new__(ReleaseFlowRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]
    repository.get_release_plan = lambda workspace_id, plan_id: {  # type: ignore[method-assign]
        "workspace_id": workspace_id,
        "plan_id": plan_id,
        "steps": [],
    }
    return repository


def _release_payload(*, workspace_id: str, plan_id: str) -> dict[str, object]:
    return {
        "workspace_id": workspace_id,
        "plan_id": plan_id,
        "name": "Checkout release",
        "description": "",
        "status": "draft",
        "settings": {},
        "steps": [],
    }


def test_release_plan_conflict_update_requires_same_workspace() -> None:
    connection = _StatementCaptureConnection()
    repository = _release_repository(connection)

    repository.upsert_release_plan(
        _release_payload(workspace_id="workspace-a", plan_id="shared-plan-id")
    )

    upsert_sql = _postgres_sql(connection.statements[0])
    assert "ON CONFLICT (plan_id) DO UPDATE" in upsert_sql
    assert "WHERE release_plans.workspace_id = excluded.workspace_id" in upsert_sql


def test_release_plan_step_replacement_delete_is_workspace_scoped() -> None:
    connection = _StatementCaptureConnection()
    repository = _release_repository(connection)

    repository.upsert_release_plan(
        _release_payload(workspace_id="workspace-a", plan_id="shared-plan-id")
    )

    delete_statement = next(
        statement for statement in connection.statements if getattr(statement, "is_delete", False)
    )
    delete_sql = _postgres_sql(delete_statement)
    assert "release_plan_steps.plan_id =" in delete_sql
    assert "release_plan_steps.workspace_id =" in delete_sql


class _CrossWorkspaceConnection:
    """Conditional upsert/delete predicates까지 반영하는 최소 상태 모델."""

    def __init__(self) -> None:
        self.plan = {
            "workspace_id": "workspace-b",
            "plan_id": "plan-b",
            "name": "Workspace B release",
        }
        self.steps = [
            {
                "workspace_id": "workspace-b",
                "plan_id": "plan-b",
                "step_id": "step-b",
            }
        ]

    def execute(self, statement: Any) -> _Result:
        sql = _postgres_sql(statement)
        if getattr(statement, "is_select", False):
            return _Result(first=dict(self.plan), rowcount=1)
        if sql.startswith("INSERT INTO release_plans"):
            same_workspace_guard = "WHERE release_plans.workspace_id = excluded.workspace_id" in sql
            if same_workspace_guard:
                return _Result(rowcount=0)
            self.plan["name"] = "Attacker replacement"
            return _Result(rowcount=1)
        if getattr(statement, "is_delete", False):
            workspace_guard = "release_plan_steps.workspace_id =" in sql
            if not workspace_guard:
                self.steps.clear()
            return _Result(rowcount=0 if workspace_guard else 1)
        return _Result()


def test_cross_workspace_empty_plan_is_rejected_and_victim_steps_survive() -> None:
    connection = _CrossWorkspaceConnection()
    repository = _release_repository(connection)
    rejected = False

    try:
        repository.upsert_release_plan(
            {
                **_release_payload(workspace_id="workspace-a", plan_id="plan-b"),
                "name": "Attacker replacement",
            }
        )
    except Exception:  # noqa: BLE001 - repository may expose 404 or 409 as directed
        rejected = True

    assert (
        rejected,
        connection.plan["workspace_id"],
        connection.plan["name"],
        [step["step_id"] for step in connection.steps],
    ) == (
        True,
        "workspace-b",
        "Workspace B release",
        ["step-b"],
    )


class _DenyEmptyPlanWriteDb:
    def __init__(self) -> None:
        self.access_checks: list[tuple[str, str, str, str, str]] = []
        self.upserts: list[dict[str, object]] = []

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.access_checks.append((user_id, workspace_id, resource_type, resource_id, permission))
        return False

    def upsert_release_plan(self, payload: dict[str, object]) -> dict[str, object]:
        self.upserts.append(payload)
        return payload


def test_empty_plan_requires_plan_manage_access_before_write() -> None:
    db = _DenyEmptyPlanWriteDb()
    current = SimpleNamespace(
        workspace_id="workspace-a",
        user_id="member-a",
        roles=("user",),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.create_release_plan(
                release_router.ReleasePlanUpsertRequest(
                    name="Empty release",
                    steps=[],
                ),
                current=current,
                db=db,
            )
        )

    assert exc.value.status_code == 403
    assert db.upserts == []
    assert len(db.access_checks) == 1
    user_id, workspace_id, _resource_type, resource_id, permission = db.access_checks[0]
    assert (user_id, workspace_id, bool(resource_id), permission) == (
        "member-a",
        "workspace-a",
        True,
        Permission.APPLICATION_MANAGE.value,
    )
