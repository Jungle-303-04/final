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
from sqlalchemy.exc import IntegrityError

from domains.release_flow import router as release_router
from domains.release_flow.repository import (
    ReleaseFlowRepository,
    ReleasePlanWorkspaceMismatchError,
    derive_release_plan_id,
)
from packages.contracts.identity import AccessResourceType, Permission


class _Result:
    def __init__(
        self,
        *,
        first: dict[str, object] | None = None,
        all_rows: list[dict[str, object]] | None = None,
        rowcount: int = 0,
    ) -> None:
        self._first = first
        self._all_rows = all_rows or []
        self.rowcount = rowcount

    def mappings(self) -> _Result:
        return self

    def first(self) -> dict[str, object] | None:
        return self._first

    def all(self) -> list[dict[str, object]]:
        return self._all_rows

    def scalar_one_or_none(self) -> object | None:
        if self._first is None:
            return None
        return next(iter(self._first.values()), None)


def _postgres_sql(statement: Any) -> str:
    return " ".join(str(statement.compile(dialect=postgresql.dialect())).split())


class _StatementCaptureConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any, *_args: object, **_kwargs: object) -> _Result:
        self.statements.append(statement)
        return _Result(first={"plan_id": "shared-plan-id"}, rowcount=1)


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
    assert "RETURNING release_plans.plan_id" in upsert_sql


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


class _PlanLookupConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        if len(self.statements) == 1:
            return _Result(
                first={
                    "plan_id": "plan-a",
                    "workspace_id": "workspace-a",
                    "name": "Shared release",
                    "description": "",
                    "status": "draft",
                    "settings": {},
                    "created_at": None,
                    "updated_at": None,
                }
            )
        return _Result(all_rows=[])


def test_release_plan_mutation_lookup_locks_plan_row() -> None:
    connection = _PlanLookupConnection()

    @contextmanager
    def fake_connection() -> Iterator[Any]:
        yield connection

    repository = object.__new__(ReleaseFlowRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    plan = repository.get_release_plan("workspace-a", "plan-a", for_update=True)

    assert plan is not None
    assert "FOR UPDATE" in _postgres_sql(connection.statements[0])


def test_release_plan_identity_lock_uses_transaction_advisory_lock() -> None:
    connection = _StatementCaptureConnection()
    repository = _release_repository(connection)
    lock_identity = getattr(repository, "lock_release_plan_identity", None)

    assert callable(lock_identity)
    lock_identity("workspace-a", "Shared release")

    assert len(connection.statements) == 1
    assert "pg_advisory_xact_lock" in _postgres_sql(connection.statements[0]).lower()


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

    with pytest.raises(ReleasePlanWorkspaceMismatchError):
        repository.upsert_release_plan(
            {
                **_release_payload(workspace_id="workspace-a", plan_id="plan-b"),
                "name": "Attacker replacement",
            }
        )

    assert (
        connection.plan["workspace_id"],
        connection.plan["name"],
        [step["step_id"] for step in connection.steps],
    ) == (
        "workspace-b",
        "Workspace B release",
        ["step-b"],
    )


class _PlanAuthorizationDb:
    def __init__(
        self,
        *,
        existing_plan: dict[str, object] | None = None,
        allow_access: bool = False,
        collision: bool = False,
    ) -> None:
        self.plan = existing_plan
        self.allow_access = allow_access
        self.collision = collision
        self.access_checks: list[tuple[str, str, str, str, str]] = []
        self.upserts: list[dict[str, object]] = []
        self.events: list[tuple[str, str, str]] = []

    def lock_release_plan_identity(self, workspace_id: str, name: str) -> None:
        self.events.append(("lock_identity", workspace_id, name))

    def get_release_plan(
        self,
        workspace_id: str,
        plan_id: str,
        *,
        for_update: bool = False,
    ) -> dict[str, object] | None:
        self.events.append(
            ("get_by_id_for_update" if for_update else "get_by_id", workspace_id, plan_id)
        )
        if self.plan is None:
            return None
        if self.plan["workspace_id"] != workspace_id or self.plan["plan_id"] != plan_id:
            return None
        raw_steps = self.plan.get("steps")
        steps = (
            [dict(step) for step in raw_steps if isinstance(step, dict)]
            if isinstance(raw_steps, list)
            else []
        )
        return {**self.plan, "steps": steps}

    def get_release_plan_by_name(
        self,
        workspace_id: str,
        name: str,
        *,
        for_update: bool = False,
    ) -> dict[str, object] | None:
        self.events.append(
            ("get_by_name_for_update" if for_update else "get_by_name", workspace_id, name)
        )
        if self.plan is None:
            return None
        if self.plan["workspace_id"] != workspace_id or self.plan["name"] != name:
            return None
        return self.get_release_plan(
            workspace_id,
            str(self.plan["plan_id"]),
            for_update=for_update,
        )

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.access_checks.append((user_id, workspace_id, resource_type, resource_id, permission))
        return self.allow_access

    def upsert_release_plan(self, payload: dict[str, object]) -> dict[str, object]:
        self.upserts.append(payload)
        self.events.append(("upsert", str(payload["workspace_id"]), str(payload["name"])))
        if self.collision:
            raise ReleasePlanWorkspaceMismatchError("foreign workspace plan")
        plan_id = str(payload.get("plan_id") or derive_release_plan_id(payload))
        self.plan = {**payload, "plan_id": plan_id}
        return self.plan


def _member() -> SimpleNamespace:
    return SimpleNamespace(
        workspace_id="workspace-a",
        user_id="member-a",
        roles=("user",),
    )


def _existing_plan(*, name: str = "Shared release") -> dict[str, object]:
    workspace_id = "workspace-a"
    return {
        "workspace_id": workspace_id,
        "plan_id": derive_release_plan_id({"workspace_id": workspace_id, "name": name}),
        "name": name,
        "steps": [{"application_id": "app-b", "position": 0}],
    }


def _assert_existing_application_manage_check(db: _PlanAuthorizationDb) -> None:
    assert db.access_checks == [
        (
            "member-a",
            "workspace-a",
            AccessResourceType.APPLICATION.value,
            "app-b",
            Permission.APPLICATION_MANAGE.value,
        )
    ]


def test_create_same_name_checks_persisted_plan_scope_before_empty_replacement() -> None:
    victim = _existing_plan()
    db = _PlanAuthorizationDb(existing_plan=victim)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.create_release_plan(
                release_router.ReleasePlanUpsertRequest(
                    name="Shared release",
                    steps=[],
                ),
                current=_member(),
                db=db,
            )
        )

    assert exc.value.status_code == 403
    assert db.upserts == []
    assert db.plan == victim
    assert db.plan["steps"] == [{"application_id": "app-b", "position": 0}]
    _assert_existing_application_manage_check(db)


def test_update_checks_persisted_plan_scope_before_empty_replacement() -> None:
    victim = _existing_plan()
    db = _PlanAuthorizationDb(existing_plan=victim)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.update_release_plan(
                str(victim["plan_id"]),
                release_router.ReleasePlanUpsertRequest(
                    name="Shared release",
                    steps=[],
                ),
                current=_member(),
                db=db,
            )
        )

    assert exc.value.status_code == 403
    assert db.upserts == []
    assert db.plan == victim
    assert db.plan["steps"] == [{"application_id": "app-b", "position": 0}]
    _assert_existing_application_manage_check(db)


def test_authorized_create_same_name_allows_empty_replacement() -> None:
    db = _PlanAuthorizationDb(existing_plan=_existing_plan(), allow_access=True)

    response = asyncio.run(
        release_router.create_release_plan(
            release_router.ReleasePlanUpsertRequest(
                name="Shared release",
                steps=[],
            ),
            current=_member(),
            db=db,
        )
    )

    assert response.plan["steps"] == []
    assert len(db.upserts) == 1
    _assert_existing_application_manage_check(db)


def test_authorized_update_allows_empty_replacement() -> None:
    victim = _existing_plan()
    db = _PlanAuthorizationDb(existing_plan=victim, allow_access=True)

    response = asyncio.run(
        release_router.update_release_plan(
            str(victim["plan_id"]),
            release_router.ReleasePlanUpsertRequest(
                name="Shared release",
                steps=[],
            ),
            current=_member(),
            db=db,
        )
    )

    assert response.plan["steps"] == []
    assert len(db.upserts) == 1
    _assert_existing_application_manage_check(db)


def test_brand_new_empty_plan_is_rejected_before_write() -> None:
    db = _PlanAuthorizationDb()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.create_release_plan(
                release_router.ReleasePlanUpsertRequest(
                    name="Empty release",
                    steps=[],
                ),
                current=_member(),
                db=db,
            )
        )

    assert exc.value.status_code == 422
    assert db.upserts == []
    assert db.access_checks == []


def test_create_rejects_whitespace_only_explicit_plan_id_before_write() -> None:
    db = _PlanAuthorizationDb(allow_access=True)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.create_release_plan(
                release_router.ReleasePlanUpsertRequest(
                    plan_id=" \t ",
                    name="Whitespace id",
                    steps=[{"application_id": "app-a", "position": 0}],
                ),
                current=_member(),
                db=db,
            )
        )

    assert exc.value.status_code == 422
    assert db.upserts == []
    assert db.access_checks == []


def test_create_acquires_name_identity_lock_before_lookup_and_write() -> None:
    db = _PlanAuthorizationDb(allow_access=True)

    response = asyncio.run(
        release_router.create_release_plan(
            release_router.ReleasePlanUpsertRequest(
                name="New release",
                steps=[{"application_id": "app-a", "position": 0}],
            ),
            current=_member(),
            db=db,
        )
    )

    assert response.plan["name"] == "New release"
    assert db.events[:3] == [
        (
            "lock_identity",
            "workspace-a",
            release_router.RELEASE_PLAN_WORKSPACE_MUTATION_LOCK,
        ),
        ("lock_identity", "workspace-a", "New release"),
        ("get_by_name_for_update", "workspace-a", "New release"),
    ]
    assert db.events[-1] == ("upsert", "workspace-a", "New release")


def test_update_acquires_workspace_lock_before_plan_row_lock() -> None:
    victim = _existing_plan(name="Plan A")
    db = _PlanAuthorizationDb(existing_plan=victim, allow_access=True)

    asyncio.run(
        release_router.update_release_plan(
            str(victim["plan_id"]),
            release_router.ReleasePlanUpsertRequest(
                name="Plan B",
                steps=[{"application_id": "app-b", "position": 0}],
            ),
            current=_member(),
            db=db,
        )
    )

    assert db.events[0] == (
        "lock_identity",
        "workspace-a",
        release_router.RELEASE_PLAN_WORKSPACE_MUTATION_LOCK,
    )
    assert db.events[1] == ("get_by_id_for_update", "workspace-a", victim["plan_id"])
    assert db.events[2] == ("lock_identity", "workspace-a", "Plan B")


def test_server_derived_plan_collision_maps_to_generic_client_error() -> None:
    db = _PlanAuthorizationDb(allow_access=True, collision=True)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.create_release_plan(
                release_router.ReleasePlanUpsertRequest(
                    name="Colliding release",
                    steps=[
                        {
                            "application_id": "app-a",
                            "position": 0,
                        }
                    ],
                ),
                current=_member(),
                db=db,
            )
        )

    assert exc.value.status_code in {404, 409}
    assert "foreign workspace" not in str(exc.value.detail).lower()
    assert len(db.upserts) == 1


def test_legacy_plan_id_is_found_by_workspace_name_before_incoming_scope() -> None:
    victim = {
        **_existing_plan(),
        "plan_id": "legacy-client-selected-plan-id",
    }
    db = _PlanAuthorizationDb(existing_plan=victim)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.create_release_plan(
                release_router.ReleasePlanUpsertRequest(
                    name="Shared release",
                    steps=[{"application_id": "app-a", "position": 0}],
                ),
                current=_member(),
                db=db,
            )
        )

    assert exc.value.status_code == 403
    assert db.upserts == []
    assert db.plan == victim
    _assert_existing_application_manage_check(db)


def test_authorized_legacy_plan_reuses_stored_id_instead_of_unique_name_conflict() -> None:
    victim = {
        **_existing_plan(),
        "plan_id": "legacy-client-selected-plan-id",
    }
    db = _PlanAuthorizationDb(existing_plan=victim, allow_access=True)

    response = asyncio.run(
        release_router.create_release_plan(
            release_router.ReleasePlanUpsertRequest(
                name="Shared release",
                steps=[{"application_id": "app-a", "position": 0}],
            ),
            current=_member(),
            db=db,
        )
    )

    assert response.plan["plan_id"] == "legacy-client-selected-plan-id"
    assert db.upserts[0]["plan_id"] == "legacy-client-selected-plan-id"
    assert [check[3] for check in db.access_checks] == ["app-b", "app-a"]


class _InterleavingPlanDb:
    def __init__(self) -> None:
        self.plan = {
            "workspace_id": "workspace-a",
            "plan_id": "plan-a",
            "name": "Shared release",
            "steps": [{"application_id": "app-a", "position": 0}],
        }
        self.access_checks: list[str] = []
        self.lookup_lock_modes: list[bool] = []
        self.upserts: list[dict[str, object]] = []

    def lock_release_plan_identity(self, _workspace_id: str, _name: str) -> None:
        return None

    def get_release_plan(
        self,
        _workspace_id: str,
        _plan_id: str,
        *,
        for_update: bool = False,
    ) -> dict[str, object]:
        self.lookup_lock_modes.append(for_update)
        before_interleave = {
            **self.plan,
            "steps": [dict(step) for step in self.plan["steps"]],
        }
        self.plan["steps"] = [{"application_id": "app-b", "position": 0}]
        if for_update:
            return {
                **self.plan,
                "steps": [dict(step) for step in self.plan["steps"]],
            }
        return before_interleave

    def can_access(
        self,
        _user_id: str,
        _workspace_id: str,
        _resource_type: str,
        resource_id: str,
        _permission: str,
    ) -> bool:
        self.access_checks.append(resource_id)
        return resource_id == "app-a"

    def upsert_release_plan(self, payload: dict[str, object]) -> dict[str, object]:
        self.upserts.append(payload)
        self.plan = {**payload}
        return self.plan


def test_update_locks_before_scope_check_and_rejects_interleaved_scope() -> None:
    db = _InterleavingPlanDb()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.update_release_plan(
                "plan-a",
                release_router.ReleasePlanUpsertRequest(
                    name="Shared release",
                    steps=[{"application_id": "app-a", "position": 0}],
                ),
                current=_member(),
                db=db,
            )
        )

    assert exc.value.status_code == 403
    assert db.lookup_lock_modes == [True]
    assert db.access_checks == ["app-b"]
    assert db.upserts == []
    assert db.plan["steps"] == [{"application_id": "app-b", "position": 0}]


class _RenameConflictDb:
    def __init__(self) -> None:
        self.plan_a = {
            "workspace_id": "workspace-a",
            "plan_id": "plan-a",
            "name": "Plan A",
            "steps": [{"application_id": "app-a", "position": 0}],
        }
        self.plan_b = {
            "workspace_id": "workspace-a",
            "plan_id": "plan-b",
            "name": "Plan B",
            "steps": [{"application_id": "app-b", "position": 0}],
        }
        self.upsert_attempts = 0

    def lock_release_plan_identity(self, _workspace_id: str, _name: str) -> None:
        return None

    def get_release_plan(
        self,
        workspace_id: str,
        plan_id: str,
        *,
        for_update: bool = False,
    ) -> dict[str, object] | None:
        del for_update
        for plan in (self.plan_a, self.plan_b):
            if plan["workspace_id"] == workspace_id and plan["plan_id"] == plan_id:
                return {**plan, "steps": [dict(step) for step in plan["steps"]]}
        return None

    def get_release_plan_by_name(
        self,
        workspace_id: str,
        name: str,
        *,
        for_update: bool = False,
    ) -> dict[str, object] | None:
        del for_update
        for plan in (self.plan_a, self.plan_b):
            if plan["workspace_id"] == workspace_id and plan["name"] == name:
                return {**plan, "steps": [dict(step) for step in plan["steps"]]}
        return None

    def can_access(
        self,
        _user_id: str,
        _workspace_id: str,
        _resource_type: str,
        resource_id: str,
        _permission: str,
    ) -> bool:
        return resource_id == "app-a"

    def upsert_release_plan(self, _payload: dict[str, object]) -> dict[str, object]:
        self.upsert_attempts += 1
        raise IntegrityError("update release_plans", {}, Exception("unique workspace/name"))


def test_update_name_conflict_maps_to_generic_409_without_mutation() -> None:
    db = _RenameConflictDb()
    before_a = {**db.plan_a, "steps": [dict(step) for step in db.plan_a["steps"]]}
    before_b = {**db.plan_b, "steps": [dict(step) for step in db.plan_b["steps"]]}

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            release_router.update_release_plan(
                "plan-a",
                release_router.ReleasePlanUpsertRequest(
                    name="Plan B",
                    steps=[{"application_id": "app-a", "position": 0}],
                ),
                current=_member(),
                db=db,
            )
        )

    assert exc.value.status_code == 409
    assert "plan-b" not in str(exc.value.detail).lower()
    assert db.plan_a == before_a
    assert db.plan_b == before_b
