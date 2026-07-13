"""성공 배포와 RCA incident를 연결하는 read projection 계약."""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from conftest import load_service, make_context, run_handler
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

from domains.audit.repository import audit_log_row
from domains.gitops.events import WorkflowRunCompletedBody
from domains.identity.dependencies import require_session
from domains.rca_changes.projection import (
    trusted_pr_url,
    workflow_pr_reference_row,
    workload_change_row,
)
from domains.rca_changes.repository import RcaChangesRepository
from domains.rca_changes.router import recent_incident_changes, router
from domains.scm.events import SafePrCreatedBody
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.runtime.dependencies import get_db

NOW = "2026-07-13T08:00:00Z"
INCIDENT_AT = datetime(2026, 7, 13, 8, 30, tzinfo=UTC)


def _completed(**overrides: object) -> WorkflowRunCompletedBody:
    values: dict[str, object] = {
        "workflow_run_id": "run-1",
        "application_id": "app-1",
        "workspace_id": "workspace-a",
        "binding_id": "binding-1",
        "environment": "production",
        "details": {"command_id": "cmd-1"},
    }
    values.update(overrides)
    return WorkflowRunCompletedBody(**values)  # type: ignore[arg-type]


def _authority(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "workspace_id": "workspace-a",
        "workflow_run_id": "run-1",
        "application_id": "app-1",
        "binding_id": "binding-1",
        "cluster_id": "cluster-1",
        "repository_id": "repo-1",
        "namespace": "shop",
        "manifest_path": "deploy/checkout.yaml",
        "repo_ref": "acme/checkout",
        "commit_sha": "abc123",
        "command_id": "cmd-1",
        "run_metadata": {
            "result": {
                "status": "completed",
                "applied": True,
                "resources": [{"applied": True, "status": "ready"}],
                "rollout": {"ready": True},
            },
            "failed_resources": [],
        },
        "apply_details": {"command_id": "cmd-1"},
        "diff_details": {
            "workspace_id": "workspace-a",
            "repository_id": "repo-1",
            "binding_id": "binding-1",
            "workflow_run_id": "run-1",
            "cluster_id": "cluster-1",
            "commit_sha": "abc123",
            "manifest_path": "deploy/checkout.yaml",
            "namespace": "shop",
            "resource": "Deployment/checkout-api",
            "actual_image": "ghcr.io/acme/checkout:v1",
            "desired_image": "ghcr.io/acme/checkout:v2",
            "has_changes": True,
            "status": "change_detected",
        },
    }
    values.update(overrides)
    return values


def _safe_pr(**overrides: object) -> SafePrCreatedBody:
    values: dict[str, object] = {
        "pr_url": "https://github.com/acme/checkout/pull/42",
        "provider": "github",
        "mode": "live",
        "workspace_id": "workspace-a",
        "repository_id": "repo-1",
        "binding_id": "binding-1",
        "application_id": "app-1",
        "workflow_run_id": "run-1",
        "environment": "production",
        "manifest_path": "deploy/checkout.yaml",
        "repo_ref": "acme/checkout",
        "commit_sha": "abc123",
    }
    values.update(overrides)
    return SafePrCreatedBody(**values)  # type: ignore[arg-type]


def _context(db: Any = None, **overrides: object):
    values: dict[str, object] = {
        "event_id": "evt-completed-1",
        "created_at": NOW,
        "workspace_id": "workspace-a",
    }
    values.update(overrides)
    return make_context(db=db, **values)


def test_completed_apply_projects_authoritative_workload_change() -> None:
    row = workload_change_row(_completed(), _context(), _authority())

    assert row == {
        "event_id": "evt-completed-1",
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-1",
        "namespace": "shop",
        "resource_kind": "deployment",
        "resource_name": "checkout-api",
        "repository_id": "repo-1",
        "binding_id": "binding-1",
        "manifest_path": "deploy/checkout.yaml",
        "repo_ref": "acme/checkout",
        "commit_sha": "abc123",
        "workflow_run_id": "run-1",
        "image_before": "ghcr.io/acme/checkout:v1",
        "image_after": "ghcr.io/acme/checkout:v2",
        "changed_at": datetime(2026, 7, 13, 8, 0, tzinfo=UTC),
    }


def test_audit_projection_preserves_immutable_envelope_time_for_cutoff() -> None:
    envelope = EventEnvelope(
        event_id="incident-event-1",
        subject="incident.detected",
        source="incident-worker",
        correlation_id="corr-1",
        causation_id=None,
        created_at=NOW,
        payload={},
        workspace_id="workspace-a",
    )
    assert audit_log_row(envelope)["event_created_at"] == datetime(2026, 7, 13, 8, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("event", "authority"),
    [
        (_completed(), _authority(command_id="")),
        (_completed(details={"command_id": "wrong"}), _authority()),
        (_completed(), _authority(run_metadata={"result": {"status": "failed"}})),
        (
            _completed(),
            _authority(
                run_metadata={
                    "result": {"status": "completed", "resources": []},
                    "failed_resources": [{"status": "failed"}],
                }
            ),
        ),
        (
            _completed(),
            _authority(diff_details={**_authority()["diff_details"], "resource": "unknown/x"}),
        ),
        (
            _completed(),
            _authority(diff_details={**_authority()["diff_details"], "has_changes": False}),
        ),
    ],
)
def test_non_deployment_completion_is_not_projected(
    event: WorkflowRunCompletedBody,
    authority: dict[str, object],
) -> None:
    assert workload_change_row(event, _context(), authority) is None


def test_envelope_workspace_and_authority_identity_must_match() -> None:
    assert (
        workload_change_row(_completed(), _context(workspace_id="workspace-b"), _authority())
        is None
    )
    assert (
        workload_change_row(
            _completed(),
            _context(),
            _authority(repository_id="repo-b"),
        )
        is None
    )


def test_safe_pr_requires_full_authoritative_identity_and_trusted_url() -> None:
    authority = _authority()
    row = workflow_pr_reference_row(_safe_pr(), _context(event_id="evt-pr-1"), authority)

    assert row is not None
    assert row["workspace_id"] == "workspace-a"
    assert row["repository_id"] == "repo-1"
    assert row["binding_id"] == "binding-1"
    assert row["workflow_run_id"] == "run-1"
    assert row["commit_sha"] == "abc123"
    assert row["manifest_path"] == "deploy/checkout.yaml"
    assert row["source_event_id"] == "evt-pr-1"
    assert workflow_pr_reference_row(_safe_pr(commit_sha="other"), _context(), authority) is None
    assert (
        workflow_pr_reference_row(_safe_pr(repository_id="repo-b"), _context(), authority) is None
    )
    assert (
        workflow_pr_reference_row(_safe_pr(pr_url="javascript:alert(1)"), _context(), authority)
        is None
    )
    assert (
        workflow_pr_reference_row(
            _safe_pr(pr_url="https://evil.example/pull/42"), _context(), authority
        )
        is None
    )
    assert trusted_pr_url("https://github.com/acme/checkout/pull/42", "acme/checkout")
    assert not trusted_pr_url("https://github.com/acme/other/pull/42", "acme/checkout")


class _WorkerDb:
    def __init__(self, authority: dict[str, object] | None) -> None:
        self.authority = authority
        self.changes: list[dict[str, object]] = []
        self.references: list[dict[str, object]] = []

    async def get_completed_workload_change_context(self, *args: object):
        assert args == ("workspace-a", "run-1", "app-1", "binding-1")
        return self.authority

    async def get_workflow_pr_identity_context(self, *args: object):
        assert args == ("workspace-a", "run-1", "app-1", "binding-1")
        return self.authority

    async def record_workload_change(self, row: dict[str, object]) -> None:
        self.changes.append(row)

    async def record_workflow_pr_reference(self, row: dict[str, object]) -> None:
        self.references.append(row)


def test_worker_records_only_hydrated_completion_and_safe_pr() -> None:
    worker = load_service("projection/change-correlation-worker")
    db = _WorkerDb(_authority())

    assert (
        run_handler(
            worker.on_workflow_completed,
            _completed(),
            db=db,
            event_id="evt-completed-1",
            created_at=NOW,
            workspace_id="workspace-a",
        )
        == []
    )
    assert (
        run_handler(
            worker.on_safe_pr_created,
            _safe_pr(),
            db=db,
            event_id="evt-pr-1",
            created_at=NOW,
            workspace_id="workspace-a",
        )
        == []
    )
    assert len(db.changes) == 1
    assert len(db.references) == 1

    missing = _WorkerDb(None)
    run_handler(
        worker.on_workflow_completed,
        _completed(),
        db=missing,
        created_at=NOW,
        workspace_id="workspace-a",
    )
    assert missing.changes == []


def test_authority_repository_join_is_tenant_scoped_and_apply_gated() -> None:
    statements: list[Any] = []

    class Result:
        def mappings(self) -> Result:
            return self

        def first(self) -> dict[str, object]:
            return _authority()

    class Connection:
        def execute(self, statement: Any) -> Result:
            statements.append(statement)
            return Result()

    @contextmanager
    def connection():
        yield Connection()

    repository = object.__new__(RcaChangesRepository)
    repository.connection = connection  # type: ignore[method-assign]
    assert repository.get_completed_workload_change_context(
        "workspace-a", "run-1", "app-1", "binding-1"
    )
    compiled = statements[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "workflow_runs.workspace_id" in sql
    assert "deployment_bindings.workspace_id = workflow_runs.workspace_id" in sql
    assert "git_repositories.workspace_id = deployment_bindings.workspace_id" in sql
    assert "change_diff_step.status" in sql
    assert "change_apply_step.status" in sql
    assert "workflow_runs.command_id IS NOT NULL" in sql
    assert "deployment_bindings.status" in sql
    assert "git_repositories.status" in sql
    assert {"workspace-a", "run-1", "app-1", "binding-1"} <= set(compiled.params.values())


def test_recent_query_rechecks_unique_incident_scope_and_cutoff() -> None:
    statements: list[Any] = []

    class Result:
        def mappings(self) -> Result:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class Connection:
        def execute(self, statement: Any) -> Result:
            statements.append(statement)
            return Result()

    @contextmanager
    def connection():
        yield Connection()

    repository = object.__new__(RcaChangesRepository)
    repository.connection = connection  # type: ignore[method-assign]
    assert (
        repository.list_recent_workload_changes(
            "workspace-a",
            "cluster-1",
            "shop",
            "Deployment",
            "checkout-api",
            "incident-1",
            limit=5,
        )
        == []
    )
    compiled = statements[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "authorized_incident_scope" in sql
    assert "count(*)" in sql
    assert "audit_log" in sql
    assert "incident.detected" in compiled.params.values()
    assert "workflow_pr_references" in sql
    for join_column in (
        "workspace_id",
        "repository_id",
        "binding_id",
        "workflow_run_id",
        "commit_sha",
        "manifest_path",
    ):
        assert f"workflow_pr_references.{join_column} = workload_changes.{join_column}" in sql
    assert "workload_changes.changed_at <=" in sql
    assert "ORDER BY workload_changes.changed_at DESC, workload_changes.event_id DESC" in sql
    assert "rca_timeline.workspace_id" in sql
    assert "rca_timeline.incident_id" in sql
    assert {"workspace-a", "cluster-1", "shop", "deployment", "checkout-api", "incident-1"} <= set(
        compiled.params.values()
    )
    assert 5 in compiled.params.values()


def _projected_row() -> dict[str, object]:
    row = workload_change_row(_completed(), _context(), _authority())
    assert row is not None
    return row


def test_pr_before_change_and_change_before_pr_use_full_exact_identity() -> None:
    statements: list[Any] = []

    class Result:
        def __init__(self, first: object = None) -> None:
            self.row = first

        def first(self) -> object:
            return self.row

    class ChangeConnection:
        def execute(self, statement: Any) -> Result:
            statements.append(statement)
            return Result()

    @contextmanager
    def change_connection():
        yield ChangeConnection()

    repository = object.__new__(RcaChangesRepository)
    repository.connection = change_connection  # type: ignore[method-assign]
    repository.record_workload_change(_projected_row())

    assert len(statements) == 1
    insert_compiled = statements[0].compile(dialect=postgresql.dialect())
    assert "ON CONFLICT DO NOTHING" in str(insert_compiled)

    statements.clear()

    class PrConnection:
        def execute(self, statement: Any) -> Result:
            statements.append(statement)
            return Result(first=("workspace-a",))

    @contextmanager
    def pr_connection():
        yield PrConnection()

    repository.connection = pr_connection  # type: ignore[method-assign]
    reference = workflow_pr_reference_row(_safe_pr(), _context(event_id="evt-pr-1"), _authority())
    assert reference is not None
    repository.record_workflow_pr_reference(reference)

    assert len(statements) == 1
    upsert = str(statements[0].compile(dialect=postgresql.dialect()))
    assert "workflow_pr_references.observed_at" in upsert
    assert "excluded.observed_at" in upsert
    # change와 PR은 서로를 UPDATE하지 않는다. 조회 시 exact-key LEFT JOIN이므로
    # PR-before/change-before 및 동시 도착에서 같은 결과를 낸다.


def test_older_pr_event_cannot_overwrite_newer_reference() -> None:
    statements: list[Any] = []

    class Result:
        def first(self) -> None:
            return None

    class Connection:
        def execute(self, statement: Any) -> Result:
            statements.append(statement)
            return Result()

    @contextmanager
    def connection():
        yield Connection()

    repository = object.__new__(RcaChangesRepository)
    repository.connection = connection  # type: ignore[method-assign]
    reference = workflow_pr_reference_row(_safe_pr(), _context(event_id="evt-pr-old"), _authority())
    assert reference is not None
    repository.record_workflow_pr_reference(reference)

    assert len(statements) == 1


class _AuthorizedRouteDb:
    def __init__(self, *, scopes: list[dict[str, object]] | None = None, allowed: bool = True):
        self.scopes = scopes if scopes is not None else [_scope()]
        self.allowed = allowed

    def list_incident_workload_scopes(self, workspace_id: str, incident_id: str):
        assert workspace_id == "workspace-a"
        assert incident_id
        return self.scopes

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        return bool(
            self.allowed
            and user_id == "user-a"
            and workspace_id == "workspace-a"
            and resource_type == "cluster"
            and resource_id == "cluster-1"
            and permission == "rca.read"
        )

    def list_recent_workload_changes(self, *args: object, **kwargs: object):
        assert args == (
            "workspace-a",
            "cluster-1",
            "shop",
            "deployment",
            "checkout-api",
            "incident-1",
        )
        assert kwargs == {"limit": 5}
        return [_change_row()]


def _scope(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "cluster_id": "cluster-1",
        "namespace": "shop",
        "resource_kind": "deployment",
        "resource_name": "checkout-api",
        "incident_at": INCIDENT_AT,
    }
    value.update(overrides)
    return value


def _change_row(**overrides: object) -> dict[str, object]:
    value: dict[str, object] = {
        "event_id": "evt-completed-1",
        "changed_at": datetime(2026, 7, 13, 8, 0, tzinfo=UTC),
        "namespace": "shop",
        "resource_kind": "deployment",
        "resource_name": "checkout-api",
        "image_before": "ghcr.io/acme/checkout:v1",
        "image_after": "ghcr.io/acme/checkout:v2",
        "pr_url": "https://github.com/acme/checkout/pull/42",
        "commit_sha": "abc123",
        "repository_id": "repo-1",
        "repo_ref": "acme/checkout",
        "workflow_run_id": "run-1",
    }
    value.update(overrides)
    return value


def _current(workspace_id: str = "workspace-a") -> SimpleNamespace:
    return SimpleNamespace(workspace_id=workspace_id, user_id="user-a")


def test_recent_changes_route_returns_schema_and_hides_unsafe_pr_url() -> None:
    db = _AuthorizedRouteDb()
    response = asyncio.run(
        recent_incident_changes(
            incident_id="incident-1",
            limit=5,
            current=_current(),
            db=db,
        )
    )

    assert response.incident_id == "incident-1"
    assert response.items[0].workflow_run_id == "run-1"
    assert response.items[0].pr_url == "https://github.com/acme/checkout/pull/42"

    class UnsafeDb(_AuthorizedRouteDb):
        def list_recent_workload_changes(self, *args: object, **kwargs: object):
            return [_change_row(pr_url="javascript:alert(1)")]

    unsafe = asyncio.run(
        recent_incident_changes(
            incident_id="incident-1",
            limit=5,
            current=_current(),
            db=UnsafeDb(),
        )
    )
    assert unsafe.items[0].pr_url is None


def test_recent_changes_route_returns_empty_list_for_authorized_incident() -> None:
    class EmptyDb(_AuthorizedRouteDb):
        def list_recent_workload_changes(self, *args: object, **kwargs: object):
            return []

    response = asyncio.run(
        recent_incident_changes(
            incident_id="incident-1",
            limit=5,
            current=_current(),
            db=EmptyDb(),
        )
    )
    assert response.items == []


def test_cross_workspace_incident_is_concealed() -> None:
    class CrossWorkspaceDb(_AuthorizedRouteDb):
        def list_incident_workload_scopes(self, workspace_id: str, incident_id: str):
            assert workspace_id == "workspace-b"
            return []

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            recent_incident_changes(
                incident_id="workspace-a-incident",
                limit=5,
                current=_current("workspace-b"),
                db=CrossWorkspaceDb(),
            )
        )
    assert exc.value.status_code == 404


@pytest.mark.parametrize(
    "db",
    [
        _AuthorizedRouteDb(scopes=[]),
        _AuthorizedRouteDb(scopes=[_scope(), _scope(cluster_id="cluster-2")]),
        _AuthorizedRouteDb(allowed=False),
    ],
)
def test_recent_changes_route_conceals_missing_ambiguous_and_denied_incidents(
    db: _AuthorizedRouteDb,
) -> None:
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            recent_incident_changes(
                incident_id="incident-1",
                limit=5,
                current=_current(),
                db=db,
            )
        )
    assert exc.value.status_code == 404


def test_recent_changes_http_route_validates_response_contract() -> None:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[require_session] = lambda: _current()
    app.dependency_overrides[get_db] = _AuthorizedRouteDb

    response = TestClient(app).get("/rca/incidents/incident-1/recent-changes?limit=5")

    assert response.status_code == 200
    body = response.json()
    assert body["incident_id"] == "incident-1"
    assert body["items"][0]["image_before"].endswith(":v1")
    assert "metadata" not in body["items"][0]
    assert "payload" not in body["items"][0]
