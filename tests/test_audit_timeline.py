"""workspace-scoped audit correlation timeline 계약."""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

import domains.audit.router as audit_router
from domains.audit.repository import AuditLogRepository
from domains.audit.router import (
    audit_timeline,
    parse_audit_cursor,
    router,
    summarize_payload,
)
from domains.identity.dependencies import require_session
from packages.contracts.event_bus.subjects import EventSubject
from packages.runtime.dependencies import get_db


def _row(
    row_id: int,
    created_at: datetime,
    *,
    subject: str = "incident.detected",
    causation_id: str | None = None,
    summary: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "id": row_id,
        "event_id": f"event-{row_id}",
        "subject": subject,
        "source": "incident-worker",
        "causation_id": causation_id,
        "created_at": created_at,
        **(summary or {}),
    }


class AuthorizedDb:
    def list_audit_correlation_cluster_ids(
        self,
        workspace_id: str,
        correlation_id: str,
    ) -> list[str | None]:
        assert workspace_id == "workspace-a"
        assert correlation_id
        return ["cluster-1"]

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        return (
            user_id == "user-a"
            and workspace_id == "workspace-a"
            and resource_type == "cluster"
            and resource_id == "cluster-1"
            and permission == "rca.read"
        )


def test_repository_filters_workspace_and_correlation_with_keyset_order() -> None:
    statements: list[Any] = []

    class Result:
        def mappings(self) -> Result:
            return self

        def all(self) -> list[dict[str, object]]:
            return [_row(3, datetime(2026, 7, 13, tzinfo=UTC))]

    class Connection:
        def execute(self, statement: Any) -> Result:
            statements.append(statement)
            return Result()

    @contextmanager
    def connection():
        yield Connection()

    repository = object.__new__(AuditLogRepository)
    repository.connection = connection  # type: ignore[method-assign]
    cursor = (datetime(2026, 7, 12, tzinfo=UTC), 2)

    rows = repository.list_audit_timeline(
        "workspace-a",
        "correlation-a",
        "cluster-1",
        cursor=cursor,
        limit=51,
    )

    assert rows[0]["id"] == 3
    compiled = statements[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "audit_log.workspace_id" in sql
    assert "audit_log.correlation_id" in sql
    assert "audit_log.event_id" in sql
    assert "audit_log.created_at >" in sql
    assert "audit_log.id >" in sql
    assert "ORDER BY audit_log.created_at ASC, audit_log.id ASC" in sql
    assert "audit_correlation_clusters" in sql
    assert "count(*)" in sql
    assert "jsonb_typeof" in sql
    assert "left(" in sql
    assert "audit_log.payload AS payload" not in sql
    assert "workspace-a" in compiled.params.values()
    assert "correlation-a" in compiled.params.values()
    assert "cluster-1" in compiled.params.values()
    assert 51 in compiled.params.values()


def test_repository_resolves_at_most_two_distinct_report_clusters() -> None:
    statements: list[Any] = []

    class Result:
        def scalars(self) -> Result:
            return self

        def all(self) -> list[str]:
            return ["cluster-1"]

    class Connection:
        def execute(self, statement: Any) -> Result:
            statements.append(statement)
            return Result()

    @contextmanager
    def connection():
        yield Connection()

    repository = object.__new__(AuditLogRepository)
    repository.connection = connection  # type: ignore[method-assign]

    assert repository.list_audit_correlation_cluster_ids("workspace-a", "correlation-a") == [
        "cluster-1"
    ]
    compiled = statements[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "SELECT rca_reports.cluster_id" in sql
    assert "UNION SELECT evidence_windows.cluster_id" in sql
    assert "rca_reports.workspace_id" in sql
    assert "rca_reports.correlation_id" in sql
    assert "evidence_windows.workspace_id" in sql
    assert "evidence_windows.correlation_id" in sql
    assert "workspace-a" in compiled.params.values()
    assert "correlation-a" in compiled.params.values()
    assert 2 in compiled.params.values()


def test_route_orders_page_and_emits_opaque_cursor_without_raw_payload() -> None:
    started_at = datetime(2026, 7, 13, tzinfo=UTC)
    rows = [
        _row(
            1,
            started_at,
            summary={"cluster_id": "cluster-1"},
        ),
        _row(2, started_at + timedelta(seconds=1), causation_id=None),
        _row(3, started_at + timedelta(seconds=2)),
    ]

    class Db(AuthorizedDb):
        def list_audit_timeline(
            self,
            workspace_id: str,
            correlation_id: str,
            authorized_cluster_id: str,
            *,
            cursor: tuple[datetime, int] | None,
            limit: int,
        ) -> list[dict[str, object]]:
            assert workspace_id == "workspace-a"
            assert correlation_id == "correlation-a"
            assert authorized_cluster_id == "cluster-1"
            assert cursor is None
            assert limit == 3
            return rows

    response = asyncio.run(
        audit_timeline(
            correlation_id="correlation-a",
            cursor=None,
            limit=2,
            current=SimpleNamespace(workspace_id="workspace-a", user_id="user-a"),
            db=Db(),
        )
    )

    assert [item.created_at for item in response.items] == [
        started_at.isoformat(),
        (started_at + timedelta(seconds=1)).isoformat(),
    ]
    assert response.items[0].payload_summary == {"cluster_id": "cluster-1"}
    assert response.items[0].event_id == "event-1"
    assert response.items[0].journey_stage == "alert"
    assert "payload" not in response.items[0].model_dump()
    assert response.items[1].causation_id is None
    assert response.has_more is True
    assert response.next_cursor is not None
    assert parse_audit_cursor(response.next_cursor) == (started_at + timedelta(seconds=1), 2)


def test_cross_workspace_correlation_is_concealed_as_not_found() -> None:
    class Db(AuthorizedDb):
        def list_audit_correlation_cluster_ids(
            self,
            workspace_id: str,
            correlation_id: str,
        ) -> list[str | None]:
            assert workspace_id == "workspace-a"
            assert correlation_id == "workspace-b-correlation"
            return []

        def list_audit_timeline(self, *_args: object, **_kwargs: object) -> list[object]:
            raise AssertionError("concealed correlation must not reach audit query")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            audit_timeline(
                correlation_id="workspace-b-correlation",
                cursor=None,
                limit=50,
                current=SimpleNamespace(workspace_id="workspace-a", user_id="user-a"),
                db=Db(),
            )
        )

    assert exc.value.status_code == 404


def test_cross_cluster_correlation_collision_is_concealed_as_not_found() -> None:
    class Db(AuthorizedDb):
        def list_audit_correlation_cluster_ids(
            self,
            workspace_id: str,
            correlation_id: str,
        ) -> list[str | None]:
            return ["cluster-1", "cluster-2"]

        def list_audit_timeline(self, *_args: object, **_kwargs: object) -> list[object]:
            raise AssertionError("ambiguous correlation must not reach audit query")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            audit_timeline(
                correlation_id="shared-correlation",
                cursor=None,
                limit=50,
                current=SimpleNamespace(workspace_id="workspace-a", user_id="user-a"),
                db=Db(),
            )
        )

    assert exc.value.status_code == 404


def test_inaccessible_cluster_is_concealed_as_not_found() -> None:
    class Db(AuthorizedDb):
        def can_access(self, *_args: object) -> bool:
            return False

        def list_audit_timeline(self, *_args: object, **_kwargs: object) -> list[object]:
            raise AssertionError("denied cluster must not reach audit query")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            audit_timeline(
                correlation_id="correlation-a",
                cursor=None,
                limit=50,
                current=SimpleNamespace(workspace_id="workspace-a", user_id="user-a"),
                db=Db(),
            )
        )

    assert exc.value.status_code == 404


def test_unknown_subject_and_nested_payload_are_not_exposed() -> None:
    assert summarize_payload("extension.secret", {"cluster_id": "cluster-1"}) == {}
    assert summarize_payload(
        "incident.detected",
        {
            "cluster_id": "cluster-1",
            "status": None,
            "evidence": None,
        },
    ) == {"cluster_id": "cluster-1"}


def test_every_known_subject_has_an_explicit_canonical_journey_stage() -> None:
    assert set(audit_router.AUDIT_JOURNEY_STAGE_BY_SUBJECT) == {
        subject.value for subject in EventSubject
    }
    assert audit_router.audit_journey_stage(EventSubject.INCIDENT_DETECTED.value) == "alert"
    assert (
        audit_router.audit_journey_stage(EventSubject.CLUSTER_EVIDENCE_RECEIVED.value) == "evidence"
    )
    assert audit_router.audit_journey_stage(EventSubject.RCA_COMPLETED.value) == "rca"
    assert audit_router.audit_journey_stage(EventSubject.RECOVERY_PLANNED.value) == "recovery"
    assert (
        audit_router.audit_journey_stage(EventSubject.COMMAND_CANCEL_REQUESTED.value) == "command"
    )
    assert audit_router.audit_journey_stage(EventSubject.COMMAND_RETRY_REQUESTED.value) == "command"
    assert audit_router.audit_journey_stage(EventSubject.COMMAND_COMPLETED.value) == "command"
    assert audit_router.audit_journey_stage(EventSubject.SAFE_PR_CREATED.value) == "pr"
    assert audit_router.audit_journey_stage(EventSubject.WORKFLOW_RUN_COMPLETED.value) == "workflow"
    assert audit_router.audit_journey_stage("extension.secret") == "unknown"


def test_invalid_cursor_is_rejected() -> None:
    with pytest.raises(HTTPException) as exc:
        parse_audit_cursor("not-a-valid-cursor")

    assert exc.value.status_code == 422


def test_http_route_returns_response_schema() -> None:
    class Db(AuthorizedDb):
        def list_audit_timeline(self, *_args: object, **_kwargs: object) -> list[dict[str, object]]:
            return [
                _row(
                    1,
                    datetime(2026, 7, 13, tzinfo=UTC),
                    summary={"incident_id": "incident-1"},
                )
            ]

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        workspace_id="workspace-a", user_id="user-a"
    )
    app.dependency_overrides[get_db] = Db

    response = TestClient(app).get(
        "/audit/timeline",
        params={"correlation_id": "correlation-a"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "subject": "incident.detected",
                "source": "incident-worker",
                "event_id": "event-1",
                "created_at": "2026-07-13T00:00:00+00:00",
                "causation_id": None,
                "journey_stage": "alert",
                "payload_summary": {"incident_id": "incident-1"},
            }
        ],
        "limit": 50,
        "has_more": False,
        "next_cursor": None,
    }
