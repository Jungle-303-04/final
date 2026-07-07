"""storage 계층 단위 검증 — 실 DB 없이 가능한 부분(헬퍼·빌더·URL·schema 정의).

repository 의 실제 SQL 실행은 Postgres 전용(jsonb·on_conflict)이라 실 DB smoke·크래시
테스트가 검증. 여기서는 DB 연결 없이 결정적으로 확인 가능한 로직만 단위로 잠금.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy.dialects import postgresql

from domains import registry
from domains.gitops.repository import (
    RepoChangeRepository,
    derive_application_id,
    derive_deployment_binding_id,
    derive_repository_id,
    derive_watch_target_id,
)
from domains.target.repository import TargetAgentRepository
from packages.contracts.event_bus.processing import CLAIM_BLOCKED
from packages.contracts.gitops import (
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
)
from packages.contracts.identity import Permission, ResourceRole
from packages.events.envelope import event
from packages.storage import database as db
from packages.storage import engine as storage_engine
from packages.storage.repositories import event as event_repository
from packages.storage.repositories.dead_letter import DeadLetterRepository
from packages.storage.repositories.event import EventRepository
from packages.storage.repositories.outbox import OutboxRepository
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


def test_role_permission_compat_migration_removes_legacy_aliases() -> None:
    role_statement = storage_engine.MEMBER_RESOURCE_ROLE_MIGRATE_LEGACY_ROLES
    permission_delete = storage_engine.ROLE_PERMISSION_DELETE_LEGACY_ALIAS_DUPLICATES
    permission_update = storage_engine.ROLE_PERMISSION_MIGRATE_LEGACY_ALIASES

    assert ResourceRole.OBSERVER.value in role_statement
    assert ResourceRole.RELEASE_OPERATOR.value in role_statement
    assert ResourceRole.INCIDENT_OPERATOR.value in role_statement
    assert ResourceRole.CLUSTER_STEWARD.value in role_statement
    assert "viewer" in role_statement
    assert "developer" in role_statement
    assert "duplicates" in permission_delete
    assert Permission.CLUSTER_READ.value in permission_update
    assert Permission.CONFIG_UPDATE.value in permission_update
    assert Permission.DEPLOY_RUN.value in permission_update
    assert Permission.CLUSTER_ROLE_MANAGE.value in permission_update


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
        "audit_log",
        "user_accounts",
        "workspaces",
        "organizations",
        "organization_members",
        "groups",
        "group_members",
        "resource_assignments",
        "member_resource_roles",
        "role_permissions",
        "alert_channels",
        "cluster_registrations",
        "evidence_jobs",
        "evidence_windows",
        "target_desired_states",
        "target_reconcile_records",
    }
    assert expected <= set(metadata.tables)


def test_event_schema_preserves_causation_id() -> None:
    assert "causation_id" in set(metadata.tables["events"].c.keys())


def test_outbox_schema_supports_relay_leases() -> None:
    columns = set(metadata.tables["outbox"].c.keys())
    assert {"lease_id", "leased_until", "sent_at"} <= columns


def test_outbox_compat_migration_adds_relay_lease_columns() -> None:
    assert "lease_id" in storage_engine.OUTBOX_COMPAT_COLUMNS
    assert "leased_until" in storage_engine.OUTBOX_COMPAT_COLUMNS
    assert "ix_outbox_claim" in storage_engine.OUTBOX_CLAIM_INDEX


def test_pool_options_env_defaults_remain_unchanged() -> None:
    # env 미설정 시 기존 기본값과 동일해야 함(배포 호환)
    assert storage_engine.POOL_OPTIONS["pool_size"] == 2
    assert storage_engine.POOL_OPTIONS["max_overflow"] == 2
    assert storage_engine.POOL_OPTIONS["pool_timeout"] == 10
    assert storage_engine.DB_POOL_SIZE_ENV == "DB_POOL_SIZE"
    assert storage_engine.DB_MAX_OVERFLOW_ENV == "DB_MAX_OVERFLOW"
    assert storage_engine.DB_POOL_TIMEOUT_ENV == "DB_POOL_TIMEOUT_SECONDS"


def test_transaction_timeout_env_defaults_remain_unchanged() -> None:
    # env 미설정 시 기존 기본값(5s/30s/30s)과 같은 의미의 ms 값이어야 함(배포 호환)
    assert storage_engine.DB_LOCK_TIMEOUT == "5000ms"
    assert storage_engine.DB_STATEMENT_TIMEOUT == "30000ms"
    assert storage_engine.DB_IDLE_IN_TRANSACTION_TIMEOUT == "30000ms"
    assert storage_engine.DB_LOCK_TIMEOUT_MS_ENV == "DB_LOCK_TIMEOUT_MS"
    assert storage_engine.DB_STATEMENT_TIMEOUT_MS_ENV == "DB_STATEMENT_TIMEOUT_MS"
    assert (
        storage_engine.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS_ENV == "DB_IDLE_IN_TRANSACTION_TIMEOUT_MS"
    )


def test_connect_args_enable_pgbouncer_compat_only_for_psycopg() -> None:
    # psycopg 한정: PgBouncer 호환 위해 server-side prepared statement 비활성화
    args = storage_engine.connect_args_for("postgresql+psycopg://u:p@host/db")
    assert args == {"prepare_threshold": None}


def test_connect_args_empty_for_other_drivers() -> None:
    # 타 드라이버(SQLite 등)는 psycopg 전용 옵션을 모르는 인자로 거부 — 전달 금지
    assert storage_engine.connect_args_for("sqlite:///tmp/test.db") == {}
    assert storage_engine.connect_args_for("sqlite+aiosqlite:///:memory:") == {}
    # POOL_OPTIONS 자체에는 드라이버 전용 옵션이 남아 있지 않아야 함
    assert "connect_args" not in storage_engine.POOL_OPTIONS


def test_connection_reuses_active_connection_once() -> None:
    repository = object.__new__(storage_engine.DatabaseConnection)
    active = object()
    token = storage_engine._ACTIVE_CONN.set(active)  # type: ignore[arg-type]
    try:
        with repository.connection() as conn:
            assert conn is active
    finally:
        storage_engine._ACTIVE_CONN.reset(token)


def test_operational_indexes_do_not_duplicate_outbox_claim_index() -> None:
    assert all(
        "ix_outbox_unsent_source_id" not in statement
        for statement in storage_engine.OPERATIONAL_INDEXES
    )


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


def test_event_claim_upsert_guards_fresh_processing_lease() -> None:
    recorded: list[Any] = []

    class FakeResult:
        def mappings(self) -> FakeResult:
            return self

        def first(self) -> None:
            return None

    class FakeConnection:
        def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            return FakeResult()

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(EventRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    repository.begin_event_processing(
        event("git.changed", "git-pull-worker", {}, correlation_id="corr-1"),
        consumer="command-worker",
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)

    # 단일 원자 UPSERT: insert 와 claim 이 분리되지 않음
    assert "INSERT INTO event_processing" in sql
    assert "ON CONFLICT (event_id, consumer) DO UPDATE" in sql
    assert "attempts + " in sql
    # 종결 상태는 재클레임 불가 + 신선한 PROCESSING 은 신선도 창이 지나야 재클레임 가능
    assert "NOT IN" in sql
    assert f"interval '{event_repository.PROCESSING_STALE_SECONDS} seconds'" in sql
    assert "RETURNING event_processing.status, event_processing.attempts" in sql


def test_begin_event_processing_reports_blocked_when_fresh_claim_exists() -> None:
    class FakeResult:
        def __init__(self, row: dict[str, object] | None = None) -> None:
            self.row = row

        def mappings(self) -> FakeResult:
            return self

        def first(self) -> dict[str, object] | None:
            return self.row

    class FakeConnection:
        def __init__(self) -> None:
            self.calls = 0

        def execute(self, statement: Any) -> FakeResult:
            self.calls += 1
            if self.calls == 1:  # claim 거절(신선한 PROCESSING)
                return FakeResult(None)
            return FakeResult({"status": "processing", "attempts": 2})

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(EventRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    record = repository.begin_event_processing(
        event("git.changed", "git-pull-worker", {}, correlation_id="corr-1"),
        consumer="command-worker",
    )

    # PROCESSING 그대로 돌려주면 워커가 획득으로 오인 → 미획득 신호로 치환됨
    assert record.status == CLAIM_BLOCKED
    assert record.attempts == 2


def test_outbox_claim_uses_skip_locked_lease_update() -> None:
    recorded: list[Any] = []

    class FakeResult:
        def mappings(self) -> FakeResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class FakeAsyncConnection:
        async def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            return FakeResult()

    @asynccontextmanager
    async def fake_async_connection():
        yield FakeAsyncConnection()

    repository = object.__new__(OutboxRepository)
    repository.async_connection = fake_async_connection  # type: ignore[method-assign]

    asyncio.run(repository.unsent_events(100, "api-gateway"))

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)

    assert "UPDATE outbox" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "leased_until" in sql
    assert compiled.params["source_1"] == "api-gateway"


def test_evidence_event_record_stages_window_event_and_outbox_atomically() -> None:
    recorded: list[Any] = []

    class FakeResult:
        def __init__(self, row: dict[str, object] | None = None) -> None:
            self.row = row

        def mappings(self) -> FakeResult:
            return self

        def first(self) -> dict[str, object] | None:
            return self.row

    class FakeConnection:
        def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            if len(recorded) == 1:
                return FakeResult({"event_id": "evt-1", "correlation_id": "corr-1"})
            return FakeResult()

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(TargetAgentRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    result = repository.record_evidence_event_once(
        evidence_key="workspace-1:cluster-1:cluster-snapshot:window-1",
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        source_id="cluster-snapshot",
        window_start="window-1",
        agent_id="agent-1",
        event_envelope=event(
            "cluster.evidence.received",
            "api-gateway",
            {"workspace_id": "workspace-1", "cluster_id": "cluster-1"},
            "corr-1",
        ),
        payload={"workspace_id": "workspace-1", "cluster_id": "cluster-1"},
    )

    assert result == {"duplicate": False, "event_id": "evt-1", "correlation_id": "corr-1"}
    window_sql = str(recorded[0].compile(dialect=postgresql.dialect()))
    event_sql = str(recorded[1].compile(dialect=postgresql.dialect()))
    outbox_sql = str(recorded[2].compile(dialect=postgresql.dialect()))

    assert "INSERT INTO evidence_windows" in window_sql
    assert "ON CONFLICT" in window_sql
    assert "INSERT INTO events" in event_sql
    assert "INSERT INTO outbox" in outbox_sql
    assert "lease_id" in outbox_sql


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


def test_find_rendered_manifest_artifacts_scopes_cache_lookup_by_renderer_version() -> None:
    recorded: list[Any] = []
    rows = [
        {
            "artifact_id": "artifact-current",
            "workspace_id": "workspace-a",
            "binding_id": "binding-1",
            "commit_sha": "abc123",
            "manifest_path": "deploy/app.yaml#deployment/api",
            "status": "rendered",
            "rendered_manifest": {"kind": "Deployment"},
            "source_summary": {"renderer_version": "manifest-render-v2"},
        },
        {
            "artifact_id": "artifact-old",
            "workspace_id": "workspace-a",
            "binding_id": "binding-1",
            "commit_sha": "abc123",
            "manifest_path": "deploy/app.yaml#service/api",
            "status": "rendered",
            "rendered_manifest": {"kind": "Service"},
            "source_summary": {"renderer_version": "manifest-render-v1"},
        },
    ]

    class FakeResult:
        def mappings(self) -> FakeResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return rows

    class FakeConnection:
        def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            return FakeResult()

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    result = repository.find_rendered_manifest_artifacts(
        workspace_id="workspace-a",
        binding_id="binding-1",
        commit_sha="abc123",
        manifest_path="deploy/app.yaml",
        renderer_version="manifest-render-v2",
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "manifest_artifacts.workspace_id" in sql
    assert "manifest_artifacts.binding_id" in sql
    assert "manifest_artifacts.commit_sha" in sql
    assert "manifest_artifacts.manifest_path LIKE" in sql
    assert [artifact["artifact_id"] for artifact in result] == ["artifact-current"]


def test_workflow_status_ranks_never_allow_terminal_regression() -> None:
    from domains.gitops.repository import TERMINAL_WORKFLOW_STATUSES, WORKFLOW_STATUS_RANKS

    non_terminal = [
        status for status in WORKFLOW_STATUS_RANKS if status not in TERMINAL_WORKFLOW_STATUSES
    ]
    terminal_rank = max(WORKFLOW_STATUS_RANKS.values())

    # 종결(SUCCEEDED/FAILED)은 최고 순위 — 어떤 비종결 상태도 종결보다 앞설 수 없음
    for status in TERMINAL_WORKFLOW_STATUSES:
        assert WORKFLOW_STATUS_RANKS[status] == terminal_rank
    for status in non_terminal:
        assert WORKFLOW_STATUS_RANKS[status] < terminal_rank
    # 진행 단계는 선형 순서(회귀 판단 기준)
    assert (
        WORKFLOW_STATUS_RANKS["started"]
        < WORKFLOW_STATUS_RANKS["rendering"]
        < WORKFLOW_STATUS_RANKS["diffing"]
        < WORKFLOW_STATUS_RANKS["policy_checking"]
        < WORKFLOW_STATUS_RANKS["waiting_for_approval"]
        < WORKFLOW_STATUS_RANKS["applying"]
        < WORKFLOW_STATUS_RANKS["rollout_waiting"]
        < WORKFLOW_STATUS_RANKS["succeeded"]
    )


def _capture_workflow_statements() -> tuple[Any, list[Any]]:
    recorded: list[Any] = []

    class FakeConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]
    return repository, recorded


def _capture_application_statements(
    existing_application_id: str | None = None,
) -> tuple[Any, list[Any]]:
    recorded: list[Any] = []

    class FakeResult:
        def __init__(self, value: str | None = None) -> None:
            self.value = value

        def scalar_one_or_none(self) -> str | None:
            return self.value

    class FakeConnection:
        def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            if len(recorded) == 1:
                return FakeResult(existing_application_id)
            return FakeResult()

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]
    return repository, recorded


def test_application_id_uses_repo_name_hint_when_name_is_absent() -> None:
    app_id = derive_application_id(
        {
            "workspace_id": "workspace-1",
            "repo_ref": "org/checkout",
            "manifest_path": "deploy/app.yaml",
        }
    )
    same_id = derive_application_id(
        {
            "workspace_id": "workspace-1",
            "repo_ref": "org/checkout",
            "manifest_path": "deploy/app.yaml",
            "name": "checkout",
        }
    )

    assert app_id == same_id


def test_upsert_application_reuses_existing_product_identity() -> None:
    repository, recorded = _capture_application_statements(existing_application_id="app-existing")

    result = repository.upsert_application(
        {
            "workspace_id": "workspace-1",
            "repository_id": "repo-1",
            "application_id": "app-new",
            "name": "checkout-api",
            "manifest_path": "deploy/app.yaml",
        }
    )

    select_sql = str(recorded[0].compile(dialect=postgresql.dialect()))
    update_sql = str(recorded[1].compile(dialect=postgresql.dialect()))

    assert result["application_id"] == "app-existing"
    assert len(recorded) == 2
    assert "FROM applications" in select_sql
    assert "applications.workspace_id" in select_sql
    assert "applications.repository_id" in select_sql
    assert "applications.name" in select_sql
    assert "UPDATE applications" in update_sql
    assert "ON CONFLICT" not in update_sql


def test_upsert_application_keeps_application_id_conflict_for_renames() -> None:
    repository, recorded = _capture_application_statements()

    repository.upsert_application(
        {
            "workspace_id": "workspace-1",
            "repository_id": "repo-1",
            "application_id": "app-1",
            "name": "checkout-api",
            "manifest_path": "deploy/app.yaml",
        }
    )

    sql = str(recorded[1].compile(dialect=postgresql.dialect()))

    assert "ON CONFLICT (application_id) DO UPDATE" in sql


def test_start_workflow_run_upsert_guards_status_transition() -> None:
    repository, recorded = _capture_workflow_statements()

    repository.start_workflow_run(
        {
            "workspace_id": "workspace-1",
            "workflow_run_id": "workflow-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "status": "applying",
            "current_step": "apply",
        }
    )

    sql = str(recorded[0].compile(dialect=postgresql.dialect()))

    # 생성은 무조건, 기존 행 갱신은 허용 전이일 때만(WHERE 의 CASE 순위 비교)
    assert "ON CONFLICT (workflow_run_id) DO UPDATE" in sql
    assert "WHERE" in sql
    assert "CASE" in sql
    assert "NOT IN" in sql  # 종결 상태는 갱신 불가


def test_request_workflow_approval_upsert_only_refreshes_open_rows() -> None:
    repository, recorded = _capture_workflow_statements()

    repository.request_workflow_approval(
        {
            "workspace_id": "workspace-1",
            "workflow_run_id": "workflow-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "approval_id": "approval-1",
            "status": "requested",
            "reason": "review required",
        }
    )

    sql = str(recorded[0].compile(dialect=postgresql.dialect()))

    # 재전달된 정책 판정이 이미 granted/rejected 된 승인을 requested 로 되돌리지 않음
    assert "ON CONFLICT (approval_id) DO UPDATE" in sql
    assert "WHERE approvals.status IN" in sql


def test_update_workflow_run_guards_only_when_status_changes() -> None:
    repository, recorded = _capture_workflow_statements()

    repository.update_workflow_run(
        {"workflow_run_id": "workflow-1", "status": "succeeded", "summary": "done"}
    )
    repository.update_workflow_run({"workflow_run_id": "workflow-1", "summary": "note only"})

    guarded = str(recorded[0].compile(dialect=postgresql.dialect()))
    unguarded = str(recorded[1].compile(dialect=postgresql.dialect()))

    assert "CASE" in guarded
    assert "NOT IN" in guarded
    assert "CASE" not in unguarded  # 상태 미변경 갱신(요약 등)은 전이 검사 불필요


def test_update_workflow_run_for_command_guards_status_transition() -> None:
    repository, recorded = _capture_workflow_statements()

    repository.update_workflow_run_for_command(
        {"command_id": "cmd-1", "status": "applying", "summary": "redelivered"}
    )

    sql = str(recorded[0].compile(dialect=postgresql.dialect()))

    # 재배달 완료/큐잉 이벤트가 SUCCEEDED 를 APPLYING 으로 되돌릴 수 없음
    assert "UPDATE workflow_runs" in sql
    assert "CASE" in sql
    assert "NOT IN" in sql


def test_workflow_approval_atomic_resolution_only_updates_open_rows() -> None:
    recorded: list[Any] = []

    class FakeResult:
        def first(self) -> tuple[str] | None:
            return ("approval-1",)

    class FakeConnection:
        def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            return FakeResult()

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    resolved = repository.resolve_workflow_approval_if_open(
        "approval-1", "workspace-1", "granted", "user-1", "granted", {}
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)

    assert resolved is True
    # 검사와 갱신이 한 UPDATE — 열린 상태(requested/not_required)만 해결 가능
    assert "UPDATE approvals" in sql
    assert "status IN" in sql
    assert "RETURNING approvals.approval_id" in sql
    assert compiled.params["approval_id_1"] == "approval-1"
    assert compiled.params["workspace_id_1"] == "workspace-1"


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


def test_gitops_poll_targets_join_active_repository_application_binding() -> None:
    recorded: list[Any] = []

    class FakeResult:
        def mappings(self) -> FakeResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return [
                {
                    "workspace_id": "workspace-b",
                    "application_id": "app-1",
                    "repository_id": "repo-1",
                    "repo_ref": "org/checkout",
                    "credential_ref": "env:GITHUB_TOKEN",
                    "branch": "release",
                    "watch_target_id": "watch-1",
                    "binding_id": "binding-1",
                    "environment": "prod",
                    "cluster_id": "cluster-1",
                    "manifest_path": "k8s/deploy.yaml",
                    "last_seen_commit_sha": "old-sha",
                }
            ]

    class FakeConnection:
        def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            return FakeResult()

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    targets = repository.list_active_github_poll_targets("workspace-b", limit=20)

    assert targets == [
        {
            "workspace_id": "workspace-b",
            "application_id": "app-1",
            "repository_id": "repo-1",
            "repo_ref": "org/checkout",
            "credential_ref": "env:GITHUB_TOKEN",
            "branch": "release",
            "watch_target_id": "watch-1",
            "binding_id": "binding-1",
            "environment": "prod",
            "cluster_id": "cluster-1",
            "manifest_path": "k8s/deploy.yaml",
            "last_seen_commit_sha": "old-sha",
        }
    ]
    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "FROM deployment_bindings" in sql
    assert "JOIN git_repositories" in sql
    assert "JOIN applications" in sql
    assert "LEFT OUTER JOIN git_watch_targets" in sql
    assert compiled.params["workspace_id_1"] == "workspace-b"


def test_evidence_job_lease_uses_skip_locked_candidate_update() -> None:
    recorded: list[Any] = []

    class FakeResult:
        def mappings(self) -> FakeResult:
            return self

        def first(self) -> None:
            return None

    class FakeAsyncConnection:
        async def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            return FakeResult()

    @asynccontextmanager
    async def fake_async_connection():
        yield FakeAsyncConnection()

    repository = object.__new__(TargetAgentRepository)
    repository.async_connection = fake_async_connection  # type: ignore[method-assign]

    asyncio.run(
        repository.lease_evidence_job(
            workspace_id="workspace-1",
            cluster_id="cluster-1",
            provider_key="metrics",
            agent_id="agent-1",
            lease_seconds=60,
        )
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)

    assert "UPDATE evidence_jobs" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "RETURNING evidence_jobs.job_id" in sql
    assert compiled.params["workspace_id_1"] == "workspace-1"
    assert compiled.params["cluster_id_1"] == "cluster-1"
    assert compiled.params["provider_key_1"] == "metrics"


def test_evidence_job_completion_locks_one_job_before_update() -> None:
    recorded: list[Any] = []

    class FakeResult:
        def __init__(self, first_row: dict[str, object] | None = None) -> None:
            self.first_row = first_row

        def mappings(self) -> FakeResult:
            return self

        def first(self) -> dict[str, object] | None:
            return self.first_row

        def one(self) -> dict[str, object]:
            return {
                "job_id": "job-1",
                "evidence_key": "workspace-1:cluster-1:cluster-snapshot:window-1",
                "status": "completed",
            }

    class FakeConnection:
        def __init__(self) -> None:
            self.calls = 0

        def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            self.calls += 1
            if self.calls == 1:
                return FakeResult(
                    {
                        "job_id": "job-1",
                        "evidence_key": "workspace-1:cluster-1:cluster-snapshot:window-1",
                        "attempt_count": 1,
                        "max_attempts": 3,
                    }
                )
            return FakeResult()

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(TargetAgentRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    result = repository.complete_evidence_job(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        job_id="job-1",
        lease_id="lease-1",
        agent_id="agent-1",
        status="completed",
        result={"metrics": {"source": "prometheus"}},
        error="",
    )

    select_sql = str(recorded[0].compile(dialect=postgresql.dialect()))
    update_sql = str(recorded[1].compile(dialect=postgresql.dialect()))

    assert result is not None
    assert "FROM evidence_jobs" in select_sql
    assert "FOR UPDATE" in select_sql
    assert "UPDATE evidence_jobs" in update_sql
    assert "RETURNING evidence_jobs.job_id" in update_sql


def test_fail_expired_agent_commands_sweeps_abandoned_leases_atomically() -> None:
    from domains.command.repository import (
        EXPIRED_COMMAND_GRACE_SECONDS,
        AgentCommandRepository,
    )

    recorded: list[Any] = []

    class FakeResult:
        def mappings(self) -> FakeResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class FakeConnection:
        def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            return FakeResult()

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(AgentCommandRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    assert repository.fail_expired_agent_commands() == []

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)

    # 단일 원자 UPDATE ... RETURNING — LEASED/RUNNING 이면서 유예까지 지난 lease 만 종결
    assert "UPDATE agent_commands" in sql
    assert "status IN" in sql
    assert f"interval '{EXPIRED_COMMAND_GRACE_SECONDS} seconds'" in sql
    assert "RETURNING agent_commands.command_id" in sql
    assert compiled.params["status"] == "failed"


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
        "organizations",
        "organization_members",
        "groups",
        "group_members",
        "resource_assignments",
        "member_resource_roles",
        "role_permissions",
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


def test_unit_of_work_or_null_uses_db_transaction_or_noop() -> None:
    # unit_of_work 가 있으면 그 트랜잭션을 쓰고, 없으면(테스트 페이크 등) no-op 이어야 함
    class WithUow:
        def __init__(self) -> None:
            self.entered = 0

        @contextmanager
        def unit_of_work(self):
            self.entered += 1
            yield "conn"

    db = WithUow()
    with storage_engine.unit_of_work_or_null(db) as conn:
        assert conn == "conn"
    assert db.entered == 1

    with storage_engine.unit_of_work_or_null(object()) as conn:
        assert conn is None


def test_mark_dead_letter_replayed_guards_open_status_atomically() -> None:
    # SELECT 후 갱신 사이의 동시 replay 경쟁 제거 — 열린 행만 원자 UPDATE 로 표시
    recorded: list[Any] = []

    class FakeResult:
        def first(self) -> None:
            return None  # 이미 replay 된 행 → 갱신 0건

    class FakeConnection:
        def execute(self, statement: Any) -> FakeResult:
            recorded.append(statement)
            return FakeResult()

    @contextmanager
    def fake_connection():
        yield FakeConnection()

    repository = object.__new__(DeadLetterRepository)
    repository.connection = fake_connection  # type: ignore[method-assign]

    replayed = repository.mark_dead_letter_replayed(7, "evt-replay-1")

    assert replayed is False
    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "UPDATE event_dead_letters" in sql
    assert "WHERE" in sql
    assert "RETURNING event_dead_letters.id" in sql
    params = set(compiled.params.values())
    assert storage_engine.DEAD_LETTER_STATUS_OPEN in params  # WHERE: 열린 행만
    assert storage_engine.DEAD_LETTER_STATUS_REPLAYED in params  # SET: replay 표시
