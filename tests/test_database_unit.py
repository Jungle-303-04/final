"""storage 계층 단위 검증 — 실 DB 없이 가능한 부분(헬퍼·빌더·URL·schema 정의).

repository 의 실제 SQL 실행은 Postgres 전용(jsonb·on_conflict)이라 실 DB smoke·크래시
테스트가 검증한다. 여기서는 DB 연결 없이 결정적으로 확인 가능한 로직만 단위로 잠근다.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy.dialects import postgresql

from domains import registry
from domains.gitops.repository import (
    RepoChangeRepository,
    derive_deployment_binding_id,
    derive_repository_id,
    derive_watch_target_id,
)
from domains.projection.repository import DashboardRepository
from packages.contracts.gitops import (
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
)
from packages.events.envelope import event
from packages.storage import database as db
from packages.storage.repositories.event import EventRepository
from packages.storage.schema import metadata


def test_compact_error_truncates_to_limit() -> None:
    long = "x" * (db.ERROR_MESSAGE_LIMIT + 50)
    assert len(db.compact_error(long)) == db.ERROR_MESSAGE_LIMIT
    assert db.compact_error("short") == "short"


def test_iso_or_none() -> None:
    assert db.iso_or_none(datetime(2026, 1, 2, 3, 4, 5)) == "2026-01-02T03:04:05"
    assert db.iso_or_none(None) is None
    assert db.iso_or_none("not-a-datetime") is None  # isoformat 없음 → None


def test_serialize_dead_letter_isoformats_timestamps() -> None:
    row = {"id": 1, "created_at": datetime(2026, 1, 1), "replayed_at": None, "subject": "a.b"}
    out = db.serialize_dead_letter(row)
    assert out["created_at"] == "2026-01-01T00:00:00"
    assert out["replayed_at"] is None
    assert out["subject"] == "a.b"  # 그 외 필드 보존


def test_serialize_command_isoformats_lease() -> None:
    out = db.serialize_command({"command_id": "c1", "leased_until": datetime(2026, 1, 1)})
    assert out["leased_until"] == "2026-01-01T00:00:00"
    assert out["command_id"] == "c1"


def test_row_dict_copies_mapping() -> None:
    assert db.row_dict({"a": 1, "b": 2}) == {"a": 1, "b": 2}


def test_sqlalchemy_url_uses_psycopg_driver(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    conn = db.Database()  # 엔진은 지연 생성(연결 안 함)
    assert conn.sqlalchemy_url.startswith("postgresql+psycopg://")


def test_schema_defines_expected_tables() -> None:
    expected = {
        "events",
        "event_processing",
        "event_dead_letters",
        "outbox",
        "repo_changes",
        "git_repositories",
        "git_watch_targets",
        "deployment_bindings",
        "applications",
        "workflow_runs",
        "workflow_run_steps",
        "approvals",
        "manifest_artifacts",
        "evidence",
        "rca_reports",
        "pull_requests",
        "agent_commands",
        "dashboard_cards",
        "audit_log",
        "user_accounts",
        "workspaces",
        "workspace_members",
        "resource_access_grants",
        "cluster_registrations",
        "evidence_source_leases",
        "evidence_windows",
        "target_desired_states",
        "target_reconcile_records",
    }
    assert expected <= set(metadata.tables)


def test_event_schema_preserves_causation_id() -> None:
    assert "causation_id" in set(metadata.tables["events"].c.keys())


def test_record_event_persists_causation_id() -> None:
    recorded: list[Any] = []

    class FakeConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(EventRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    repository.record_event(
        event(
            "git.changed",
            "git-pull-worker",
            {"commit_sha": "abc123"},
            correlation_id="corr-1",
            causation_id="parent-event-1",
        )
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    assert "causation_id" in str(compiled)
    assert compiled.params["causation_id"] == "parent-event-1"


def test_dashboard_upsert_namespaces_correlation_id_by_workspace() -> None:
    recorded: list[Any] = []

    class FakeConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(DashboardRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    repository.upsert_dashboard(
        event(
            "command.completed",
            "command-worker",
            {
                "workspace_id": "workspace-b",
                "command_id": "cmd-1",
                "result": {"status": "completed"},
            },
            correlation_id="corr-shared",
        ),
        "done",
        "command.completed from command-worker",
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    assert compiled.params["correlation_id"] == "workspace-b:corr-shared"
    assert compiled.params["payload"]["correlation_id"] == "corr-shared"


def test_manifest_artifact_upsert_is_scoped_by_workspace() -> None:
    recorded: list[Any] = []

    class FakeConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    repository.record_manifest_artifact(
        {
            "workspace_id": "workspace-b",
            "repository_id": "repo-1",
            "binding_id": "binding-shared",
            "commit_sha": "abc123",
            "manifest_path": "deploy/app.yaml",
            "status": "rendered",
            "rendered_manifest": {"kind": "Deployment"},
            "source_summary": {},
        }
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    assert "ON CONFLICT (workspace_id, binding_id, commit_sha, manifest_path)" in str(compiled)
    assert compiled.params["workspace_id"] == "workspace-b"


def test_gitops_default_ids_are_workspace_scoped() -> None:
    base = {
        "repo_ref": "org/checkout",
        "cluster_id": "target-cluster-01",
        "namespace": "sandbox",
        "app_name": "checkout-api",
    }
    workspace_a = {**base, "workspace_id": "workspace-a"}
    workspace_b = {**base, "workspace_id": "workspace-b"}

    assert derive_repository_id(workspace_a) != derive_repository_id(workspace_b)
    assert derive_repository_id(workspace_a) != DEFAULT_REPOSITORY_ID
    assert derive_watch_target_id(workspace_a) != derive_watch_target_id(workspace_b)
    assert derive_watch_target_id(workspace_a) != DEFAULT_WATCH_TARGET_ID
    assert derive_deployment_binding_id(workspace_a) != derive_deployment_binding_id(workspace_b)
    assert derive_deployment_binding_id(workspace_a) != DEFAULT_DEPLOYMENT_BINDING_ID

    assert (
        derive_repository_id({**workspace_a, "repository_id": "repo-explicit"}) == "repo-explicit"
    )
    assert (
        derive_watch_target_id({**workspace_a, "watch_target_id": "watch-explicit"})
        == "watch-explicit"
    )
    assert (
        derive_deployment_binding_id({**workspace_a, "binding_id": "binding-explicit"})
        == "binding-explicit"
    )


def test_gitops_registration_stores_workspace_scoped_default_ids() -> None:
    recorded: list[Any] = []

    class FakeConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]
    payload = {
        "workspace_id": "workspace-b",
        "repo_ref": "org/checkout",
        "cluster_id": "target-cluster-01",
        "namespace": "sandbox",
        "app_name": "checkout-api",
    }

    repo = repository.register_repository(payload)
    watch = repository.register_watch_target(payload)
    binding = repository.register_deployment_binding(payload)

    assert repo["repository_id"] != DEFAULT_REPOSITORY_ID
    assert watch["watch_target_id"] != DEFAULT_WATCH_TARGET_ID
    assert binding["binding_id"] != DEFAULT_DEPLOYMENT_BINDING_ID
    assert watch["repository_id"] == repo["repository_id"]
    assert binding["repository_id"] == repo["repository_id"]
    assert binding["watch_target_id"] == watch["watch_target_id"]

    compiled = [statement.compile(dialect=postgresql.dialect()) for statement in recorded]
    assert compiled[0].params["repository_id"] == repo["repository_id"]
    assert compiled[1].params["watch_target_id"] == watch["watch_target_id"]
    assert compiled[2].params["binding_id"] == binding["binding_id"]


def test_user_account_schema_supports_password_login() -> None:
    columns = set(metadata.tables["user_accounts"].c.keys())
    assert {"email", "password_hash", "role"} <= columns


def test_gitops_schema_tracks_repo_binding_and_manifest_state() -> None:
    assert {
        "workspace_id",
        "repository_id",
        "provider",
        "repo_ref",
        "credential_ref",
        "status",
    } <= set(metadata.tables["git_repositories"].c.keys())
    assert {
        "binding_id",
        "workspace_id",
        "repository_id",
        "cluster_id",
        "namespace",
        "resource_class",
        "status",
    } <= set(metadata.tables["deployment_bindings"].c.keys())
    assert {
        "artifact_id",
        "binding_id",
        "commit_sha",
        "manifest_path",
        "status",
        "status_reason",
    } <= set(metadata.tables["manifest_artifacts"].c.keys())
    assert {
        "application_id",
        "workspace_id",
        "repository_id",
        "name",
        "manifest_path",
        "status",
    } <= set(metadata.tables["applications"].c.keys())
    assert {
        "workflow_run_id",
        "application_id",
        "binding_id",
        "environment",
        "commit_sha",
        "status",
        "current_step",
        "command_id",
    } <= set(metadata.tables["workflow_runs"].c.keys())
    assert {
        "approval_id",
        "workflow_run_id",
        "status",
        "requested_role",
        "decision",
    } <= set(metadata.tables["approvals"].c.keys())


def test_workspace_access_repository_declares_management_tables() -> None:
    expected = {
        "user_accounts",
        "workspaces",
        "workspace_members",
        "resource_access_grants",
        "cluster_registrations",
    }
    assert expected == db.Database.required_tables()


def test_domain_module_discovery_ignores_missing_optional_suffix(monkeypatch) -> None:
    monkeypatch.setattr(
        registry.pkgutil,
        "iter_modules",
        lambda *_: [SimpleNamespace(ispkg=True, name="domains.empty_domain")],
    )

    def fail_missing_optional(name: str):
        raise ModuleNotFoundError(f"No module named {name}", name=name)

    monkeypatch.setattr(registry.importlib, "import_module", fail_missing_optional)

    assert registry._domain_modules("models") == []


def test_domain_module_discovery_raises_nested_import_failure(monkeypatch) -> None:
    monkeypatch.setattr(
        registry.pkgutil,
        "iter_modules",
        lambda *_: [SimpleNamespace(ispkg=True, name="domains.broken_domain")],
    )

    def fail_nested_import(name: str):
        raise ModuleNotFoundError("No module named nested_dependency", name="nested_dependency")

    monkeypatch.setattr(registry.importlib, "import_module", fail_nested_import)

    with pytest.raises(ModuleNotFoundError, match="nested_dependency"):
        registry._domain_modules("models")
