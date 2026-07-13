"""storage 계층 단위 검증 — 실 DB 없이 가능한 부분(헬퍼·빌더·URL·schema 정의).

repository 의 실제 SQL 실행은 Postgres 전용(jsonb·on_conflict)이라 실 DB smoke·크래시
테스트가 검증. 여기서는 DB 연결 없이 결정적으로 확인 가능한 로직만 단위로 잠금.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, contextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy.dialects import postgresql

from domains import registry
from domains.ai.repository import AiConversationRepository
from domains.audit.repository import AuditLogRepository
from domains.dashboard.repository import DashboardRepository
from domains.gitops.repository import (
    RepoChangeRepository,
    current_workflow_approval,
    derive_application_id,
    derive_deployment_binding_id,
    derive_repository_id,
    derive_watch_target_id,
)
from domains.rca.repository import RcaRepository
from domains.target.repository import TargetAgentRepository, agent_status_retention_seconds
from packages.ai.metrics import LlmInvocationMetric
from packages.contracts.event_bus.interfaces import EventConsumerMetrics
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


class _StartupStore:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def init(self) -> None:
        self.calls.append("init")

    def verify_schema(self) -> None:
        self.calls.append("verify_schema")


def test_wait_for_database_uses_verify_mode_without_schema_mutation(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_STARTUP_MODE", "verify")
    store = _StartupStore()

    asyncio.run(db.wait_for_database(store))

    assert store.calls == ["verify_schema"]


def test_wait_for_database_keeps_initialize_compatibility(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_STARTUP_MODE", "initialize")
    store = _StartupStore()

    asyncio.run(db.wait_for_database(store))

    assert store.calls == ["init"]


def test_production_defaults_to_read_only_schema_verification(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_STARTUP_MODE", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    store = _StartupStore()

    asyncio.run(db.wait_for_database(store))

    assert store.calls == ["verify_schema"]


def test_schema_compatibility_issues_reports_missing_tables_and_columns() -> None:
    issues = storage_engine.schema_compatibility_issues(
        {"events": {"event_id", "payload"}, "outbox": {"event_id"}},
        {"events": {"event_id"}},
    )

    assert issues == ["column:events.payload", "table:outbox"]


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
        "metric_query_presets",
        "metric_widgets",
    }
    assert expected <= set(metadata.tables)


def test_event_schema_preserves_causation_id() -> None:
    assert "causation_id" in set(metadata.tables["events"].c.keys())


def test_audit_log_schema_tracks_causation_and_correlation_timeline_index() -> None:
    table = metadata.tables["audit_log"]

    assert table.c.causation_id.nullable is True
    assert table.c.workspace_id.nullable is True
    indexes = {index.name: index for index in table.indexes}
    assert tuple(
        column.name for column in indexes["ix_audit_log_correlation_id_created_at"].columns
    ) == ("correlation_id", "created_at")
    assert tuple(column.name for column in indexes["ix_audit_log_created_at"].columns) == (
        "created_at",
    )
    assert tuple(
        column.name
        for column in indexes["ix_audit_log_workspace_id_correlation_id_created_at"].columns
    ) == ("workspace_id", "correlation_id", "created_at")


def test_event_processing_schema_tracks_processing_duration() -> None:
    assert "processing_duration_ms" in set(metadata.tables["event_processing"].c.keys())


def test_event_consumer_metrics_schema_tracks_nats_lag() -> None:
    columns = set(metadata.tables["event_consumer_metrics"].c.keys())
    assert {
        "consumer",
        "subject",
        "stream",
        "pending_events",
        "ack_pending_events",
        "redelivered_events",
        "observed_at",
    }.issubset(columns)


def test_ai_llm_invocation_metrics_schema_tracks_latency_cost() -> None:
    columns = set(metadata.tables["ai_llm_invocation_metrics"].c.keys())
    assert {
        "workspace_id",
        "provider",
        "model",
        "operation",
        "status",
        "latency_ms",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "estimated_cost_micros",
        "event_id",
        "correlation_id",
        "causation_id",
        "error_type",
        "created_at",
    }.issubset(columns)


def test_ai_llm_invocation_metric_compat_migration_adds_trace_columns() -> None:
    columns = storage_engine.AI_LLM_INVOCATION_METRIC_COMPAT_COLUMNS
    assert "event_id" in columns
    assert "correlation_id" in columns
    assert "causation_id" in columns
    assert (
        "alter table ai_llm_invocation_metrics add column if not exists correlation_id text"
        in columns["correlation_id"]
    )


def test_ai_llm_invocation_metric_correlation_index_is_operational() -> None:
    assert any(
        "ix_ai_llm_invocation_correlation_created" in statement
        and "where correlation_id is not null" in statement
        for statement in storage_engine.OPERATIONAL_INDEXES
    )


def test_event_processing_compat_migration_adds_processing_duration() -> None:
    assert "processing_duration_ms" in storage_engine.EVENT_PROCESSING_COMPAT_COLUMNS
    assert (
        "alter table event_processing add column if not exists processing_duration_ms integer"
        in storage_engine.EVENT_PROCESSING_COMPAT_COLUMNS["processing_duration_ms"]
    )


def test_alert_channel_schema_tracks_validation_status() -> None:
    columns = set(metadata.tables["alert_channels"].c.keys())
    assert {
        "last_tested_at",
        "last_test_status",
        "last_test_detail",
        "last_test_status_code",
    } <= columns


def test_alert_channel_compat_migration_adds_validation_status() -> None:
    assert set(storage_engine.ALERT_CHANNEL_COMPAT_COLUMNS) == {
        "last_tested_at",
        "last_test_status",
        "last_test_detail",
        "last_test_status_code",
    }
    assert all(
        "add column if not exists" in statement
        for statement in storage_engine.ALERT_CHANNEL_COMPAT_COLUMNS.values()
    )


def test_outbox_schema_supports_relay_leases() -> None:
    columns = set(metadata.tables["outbox"].c.keys())
    assert {"lease_id", "leased_until", "sent_at", "workspace_id"} <= columns


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
    assert "ix_outbox_claim_all_sources" in storage_engine.OUTBOX_CLAIM_ALL_SOURCES_INDEX


def test_record_event_persists_causation_id() -> None:
    recorded: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(EventRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

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


def test_record_event_logs_correlation_context(caplog) -> None:
    class StubConnection:
        def execute(self, _statement: Any) -> None:
            return None

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(EventRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    evt = event(
        "git.changed",
        "git-pull-worker",
        {"commit_sha": "abc123"},
        correlation_id="corr-1",
        causation_id="parent-event-1",
    )
    caplog.set_level(logging.INFO)

    repository.record_event(evt)

    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == "db_event_recorded"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    assert contexts[-1]["event_id"] == evt.event_id
    assert contexts[-1]["subject"] == "git.changed"
    assert contexts[-1]["correlation_id"] == "corr-1"
    assert contexts[-1]["causation_id"] == "parent-event-1"


def test_event_claim_upsert_guards_fresh_processing_lease() -> None:
    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def first(self) -> None:
            return None

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(EventRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

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
    class StubResult:
        def __init__(self, row: dict[str, object] | None = None) -> None:
            self.row = row

        def mappings(self) -> StubResult:
            return self

        def first(self) -> dict[str, object] | None:
            return self.row

    class StubConnection:
        def __init__(self) -> None:
            self.calls = 0

        def execute(self, statement: Any) -> StubResult:
            self.calls += 1
            if self.calls == 1:  # claim 거절(신선한 PROCESSING)
                return StubResult(None)
            return StubResult({"status": "processing", "attempts": 2})

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(EventRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    record = repository.begin_event_processing(
        event("git.changed", "git-pull-worker", {}, correlation_id="corr-1"),
        consumer="command-worker",
    )

    # PROCESSING 그대로 돌려주면 워커가 획득으로 오인 → 미획득 신호로 치환됨
    assert record.status == CLAIM_BLOCKED
    assert record.attempts == 2


def test_finish_event_processing_records_processing_duration() -> None:
    recorded: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(EventRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    evt = event("git.changed", "git-pull-worker", {}, correlation_id="corr-1")

    repository.finish_event_processing(evt, "command-worker", duration_ms=123)

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "processing_duration_ms" in sql
    assert compiled.params["processing_duration_ms"] == 123


def test_finish_event_processing_logs_status_context(caplog) -> None:
    class StubConnection:
        def execute(self, _statement: Any) -> None:
            return None

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(EventRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    evt = event("git.changed", "git-pull-worker", {}, correlation_id="corr-1")
    caplog.set_level(logging.INFO)

    repository.finish_event_processing(evt, "workflow-controller", duration_ms=17)

    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == "db_event_processing_finished"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    assert contexts[-1]["event_id"] == evt.event_id
    assert contexts[-1]["correlation_id"] == "corr-1"
    assert contexts[-1]["consumer"] == "workflow-controller"
    assert contexts[-1]["status"] == "processed"
    assert contexts[-1]["processing_duration_ms"] == 17


def test_event_processing_duration_metrics_group_by_consumer() -> None:
    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return [{"consumer": "command-worker", "duration": 12.5}]

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(EventRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.event_processing_duration_avg_ms_by_consumer() == {"command-worker": 12.5}

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "avg(event_processing.processing_duration_ms)" in sql
    assert "event_processing.processing_duration_ms IS NOT NULL" in sql
    assert "GROUP BY event_processing.consumer" in sql


def test_record_event_consumer_metrics_upserts_by_consumer_subject() -> None:
    recorded: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(EventRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    sample = EventConsumerMetrics(
        stream="SERVICE_EVENTS",
        subject="command.requested",
        durable="command-worker",
        pending=4,
        ack_pending=1,
        redelivered=2,
    )

    repository.record_event_consumer_metrics(sample)

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "INSERT INTO event_consumer_metrics" in sql
    assert "ON CONFLICT (consumer, subject) DO UPDATE" in sql
    assert compiled.params["consumer"] == "command-worker"
    assert compiled.params["pending_events"] == 4
    assert compiled.params["ack_pending_events"] == 1
    assert compiled.params["redelivered_events"] == 2


def test_event_consumer_pending_metric_reads_latest_samples() -> None:
    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return [
                {
                    "consumer": "command-worker",
                    "subject": "command.requested",
                    "pending_events": 4,
                }
            ]

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(EventRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.event_consumer_pending_by_consumer_subject() == {
        ("command-worker", "command.requested"): 4
    }

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "event_consumer_metrics.consumer" in sql
    assert "event_consumer_metrics.pending_events" in sql


def test_record_llm_invocation_metric_inserts_latency_cost_sample() -> None:
    recorded: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(AiConversationRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    sample = LlmInvocationMetric(
        workspace_id="ws-1",
        provider="openai",
        model="gpt-test",
        operation="complete",
        status="succeeded",
        latency_ms=25,
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
        estimated_cost_micros=3,
        event_id="evt-1",
        correlation_id="corr-1",
        causation_id="parent-1",
    )

    repository.record_llm_invocation_metric(sample)

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "INSERT INTO ai_llm_invocation_metrics" in sql
    assert compiled.params["provider"] == "openai"
    assert compiled.params["latency_ms"] == 25
    assert compiled.params["estimated_cost_micros"] == 3
    assert compiled.params["event_id"] == "evt-1"
    assert compiled.params["correlation_id"] == "corr-1"
    assert compiled.params["causation_id"] == "parent-1"


def test_llm_latency_metric_groups_by_provider_model_operation_status() -> None:
    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return [
                {
                    "provider": "openai",
                    "model": "gpt-test",
                    "operation": "complete",
                    "status": "succeeded",
                    "value": 25.5,
                }
            ]

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(AiConversationRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.llm_invocation_latency_avg_ms_by_provider_model_operation_status() == {
        ("openai", "gpt-test", "complete", "succeeded"): 25.5
    }

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "avg(ai_llm_invocation_metrics.latency_ms)" in sql
    assert "GROUP BY ai_llm_invocation_metrics.provider" in sql
    assert "ai_llm_invocation_metrics.operation" in sql


def test_outbox_claim_uses_skip_locked_lease_update() -> None:
    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class StubAsyncConnection:
        async def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @asynccontextmanager
    async def stub_async_connection():
        yield StubAsyncConnection()

    repository = object.__new__(OutboxRepository)
    repository.async_connection = stub_async_connection  # type: ignore[method-assign]

    asyncio.run(repository.unsent_events(100, "api-gateway"))

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)

    assert "UPDATE outbox" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "leased_until" in sql
    assert compiled.params["source_1"] == "api-gateway"


def test_outbox_stage_logs_event_context(caplog) -> None:
    class StubConnection:
        def execute(self, _statement: Any) -> None:
            return None

    repository = object.__new__(OutboxRepository)
    evt = event(
        "safe_pr.created",
        "scm-worker",
        {"workflow_run_id": "run-1"},
        correlation_id="corr-1",
        causation_id="parent-1",
    )
    caplog.set_level(logging.INFO)

    repository.stage_events(StubConnection(), [evt])

    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == "db_outbox_event_staged"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    assert contexts[-1]["event_id"] == evt.event_id
    assert contexts[-1]["subject"] == "safe_pr.created"
    assert contexts[-1]["source"] == "scm-worker"
    assert contexts[-1]["correlation_id"] == "corr-1"
    assert contexts[-1]["causation_id"] == "parent-1"


def test_outbox_oldest_age_uses_unsent_occurred_at() -> None:
    recorded: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> Any:
            recorded.append(statement)
            return SimpleNamespace(scalar=lambda: 12.5)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(OutboxRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.outbox_oldest_age_seconds() == 12.5

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "CAST(outbox.occurred_at AS TIMESTAMP WITH TIME ZONE)" in sql
    assert "outbox.sent_at IS NULL" in sql


def test_outbox_claim_without_source_omits_source_filter() -> None:
    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class StubAsyncConnection:
        async def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @asynccontextmanager
    async def stub_async_connection():
        yield StubAsyncConnection()

    repository = object.__new__(OutboxRepository)
    repository.async_connection = stub_async_connection  # type: ignore[method-assign]

    asyncio.run(repository.unsent_events(100, None))

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "UPDATE outbox" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "outbox.source =" not in sql
    assert "source_1" not in compiled.params


def test_evidence_event_record_stages_window_event_and_outbox_atomically() -> None:
    recorded: list[Any] = []

    class StubResult:
        def __init__(self, row: dict[str, object] | None = None) -> None:
            self.row = row

        def mappings(self) -> StubResult:
            return self

        def first(self) -> dict[str, object] | None:
            return self.row

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            if len(recorded) == 1:
                return StubResult({"event_id": "evt-1", "correlation_id": "corr-1"})
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(TargetAgentRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

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
    outbox_compiled = recorded[2].compile(dialect=postgresql.dialect())
    outbox_sql = str(outbox_compiled)

    assert "INSERT INTO evidence_windows" in window_sql
    assert "ON CONFLICT" in window_sql
    assert "INSERT INTO events" in event_sql
    assert "INSERT INTO outbox" in outbox_sql
    assert "lease_id" in outbox_sql
    assert outbox_compiled.params["workspace_id"] == "workspace-1"


def test_agent_status_upsert_prunes_only_superseded_expired_agents(monkeypatch) -> None:
    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def one(self) -> dict[str, object]:
            return {
                "workspace_id": "workspace-1",
                "cluster_id": "cluster-1",
                "agent_id": "agent-current",
                "status": "connected",
                "capabilities": ["commands"],
                "details": {},
                "last_seen_at": datetime.now(UTC),
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC),
            }

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    monkeypatch.setenv("AGENT_STATUS_RETENTION_SECONDS", "600")
    repository = object.__new__(TargetAgentRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    saved = repository.save_cluster_agent_status(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        agent_id="agent-current",
        capabilities=["commands"],
    )

    assert saved["agent_id"] == "agent-current"
    assert len(recorded) == 2
    delete_statement = recorded[1].compile(dialect=postgresql.dialect())
    delete_sql = str(delete_statement)
    assert "DELETE FROM cluster_agent_status" in delete_sql
    assert "cluster_agent_status.agent_id !=" in delete_sql
    assert "cluster_agent_status.last_seen_at <" in delete_sql
    assert "agent-current" in delete_statement.params.values()


def test_agent_status_retention_uses_safe_default_and_minimum(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_STATUS_RETENTION_SECONDS", "invalid")
    assert agent_status_retention_seconds() == 3600

    monkeypatch.setenv("AGENT_STATUS_RETENTION_SECONDS", "1")
    assert agent_status_retention_seconds() == 300


def test_manifest_artifact_upsert_is_scoped_by_workspace() -> None:
    recorded: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

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

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return rows

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

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


def test_manifest_artifact_provenance_requires_exact_tenant_resource_and_digest() -> None:
    recorded: list[Any] = []
    digest = "sha256:" + "a" * 64
    rows = [
        {
            "artifact_id": "artifact-current",
            "workspace_id": "workspace-a",
            "repository_id": "repo-1",
            "binding_id": "binding-1",
            "commit_sha": "abc123",
            "manifest_path": "deploy/app.yaml#deployment/api",
            "status": "rendered",
            "rendered_manifest": {
                "kind": "Deployment",
                "artifact_digest": digest,
                "sensitive": "must-not-be-returned",
            },
            "source_summary": {
                "source_type": "raw-yaml",
                "source_origin": "github_contents",
                "source_is_file": True,
                "source_document_count": 1,
                "source_manifest_sha256": digest,
                "repo_ref": "owner/repo",
                "branch": "main",
                "application_id": "app-1",
                "workflow_run_id": "workflow-1",
            },
        }
    ]

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return rows

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    result = repository.get_manifest_artifact_provenance(
        workspace_id="workspace-a",
        binding_id="binding-1",
        commit_sha="abc123",
        manifest_path="deploy/app.yaml",
        resource="deployment/api",
        artifact_digest=digest,
    )
    mismatched = repository.get_manifest_artifact_provenance(
        workspace_id="workspace-a",
        binding_id="binding-1",
        commit_sha="abc123",
        manifest_path="deploy/app.yaml",
        resource="deployment/api",
        artifact_digest="sha256:wrong",
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "manifest_artifacts.workspace_id" in sql
    assert "manifest_artifacts.binding_id" in sql
    assert "manifest_artifacts.commit_sha" in sql
    assert "manifest_artifacts.manifest_path LIKE" in sql
    assert result == {
        "source_type": "raw-yaml",
        "source_origin": "github_contents",
        "source_is_file": True,
        "source_document_count": 1,
        "source_manifest_sha256": digest,
        "repo_ref": "owner/repo",
        "branch": "main",
        "application_id": "app-1",
        "workflow_run_id": "workflow-1",
        "workspace_id": "workspace-a",
        "repository_id": "repo-1",
        "binding_id": "binding-1",
        "commit_sha": "abc123",
        "manifest_path": "deploy/app.yaml",
        "artifact_manifest_path": "deploy/app.yaml#deployment/api",
        "artifact_digest": digest,
        "artifact_count": 1,
    }
    assert "rendered_manifest" not in result
    assert mismatched is None


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


def test_workflow_step_status_ranks_never_allow_terminal_regression() -> None:
    from domains.gitops.repository import (
        TERMINAL_WORKFLOW_STEP_STATUSES,
        WORKFLOW_STEP_STATUS_RANKS,
    )

    terminal_rank = max(WORKFLOW_STEP_STATUS_RANKS.values())
    for status in TERMINAL_WORKFLOW_STEP_STATUSES:
        assert WORKFLOW_STEP_STATUS_RANKS[status] == terminal_rank
    assert (
        WORKFLOW_STEP_STATUS_RANKS["pending"]
        < WORKFLOW_STEP_STATUS_RANKS["running"]
        < WORKFLOW_STEP_STATUS_RANKS["succeeded"]
    )


def _capture_workflow_statements() -> tuple[Any, list[Any]]:
    recorded: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    repository.unit_of_work = stub_connection  # type: ignore[method-assign]
    return repository, recorded


def _capture_application_statements(
    existing_application_id: str | None = None,
) -> tuple[Any, list[Any]]:
    recorded: list[Any] = []

    class StubResult:
        def __init__(self, value: str | None = None) -> None:
            self.value = value

        def scalar_one_or_none(self) -> str | None:
            return self.value

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            if len(recorded) == 1:
                return StubResult(existing_application_id)
            return StubResult("app-persisted")

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    repository.unit_of_work = stub_connection  # type: ignore[method-assign]
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


def test_current_workflow_approval_prefers_open_then_latest() -> None:
    approvals = [
        {"approval_id": "approval-granted", "status": "granted"},
        {"approval_id": "approval-requested", "status": "requested"},
        {"approval_id": "approval-not-required", "status": "not_required"},
    ]

    assert current_workflow_approval(approvals)["approval_id"] == "approval-requested"
    assert current_workflow_approval(approvals[:1])["approval_id"] == "approval-granted"
    assert current_workflow_approval([]) is None


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


def test_record_workflow_step_guards_status_transition() -> None:
    repository, recorded = _capture_workflow_statements()

    repository.record_workflow_step(
        {
            "workspace_id": "workspace-1",
            "workflow_run_id": "workflow-1",
            "application_id": "app-1",
            "binding_id": "binding-1",
            "name": "apply",
            "status": "running",
        }
    )

    sql = str(recorded[0].compile(dialect=postgresql.dialect()))

    # 늦게 재전달된 queued 이벤트가 이미 완료된 apply 단계를 RUNNING 으로 되돌릴 수 없음
    assert "ON CONFLICT (workflow_run_id, name) DO UPDATE" in sql
    assert "CASE" in sql
    assert "NOT IN" in sql


def test_workflow_approval_atomic_resolution_only_updates_open_rows() -> None:
    recorded: list[Any] = []

    class StubResult:
        def first(self) -> tuple[str] | None:
            return ("approval-1",)

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

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

    class StubResult:
        def __init__(self, statement: Any) -> None:
            self.statement = statement

        def mappings(self) -> StubResult:
            return self

        def first(self) -> dict[str, object] | None:
            if getattr(self.statement, "is_select", False):
                return None
            compiled = self.statement.compile(dialect=postgresql.dialect())
            return dict(compiled.params)

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult(statement)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    repository.unit_of_work = stub_connection  # type: ignore[method-assign]
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

    compiled = [
        statement.compile(dialect=postgresql.dialect())
        for statement in recorded
        if not getattr(statement, "is_select", False)
    ]
    assert compiled[0].params["repository_id"] == repo["repository_id"]
    assert compiled[1].params["watch_target_id"] == watch["watch_target_id"]
    assert compiled[2].params["binding_id"] == binding["binding_id"]


def test_application_deployment_bindings_match_manifest_when_app_name_drifted() -> None:
    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    repository.get_application = lambda workspace_id, application_id: {  # type: ignore[method-assign]
        "workspace_id": workspace_id,
        "application_id": application_id,
        "repository_id": "repo-1",
        "name": "storefront-web",
        "manifest_path": "deploy/k8s",
    }

    assert repository.list_application_deployment_bindings("ws-1", "app-1") == []

    sql = str(recorded[0].compile(dialect=postgresql.dialect()))
    assert "deployment_bindings.app_name" in sql
    assert "deployment_bindings.manifest_path" in sql
    assert "LEFT OUTER JOIN git_watch_targets AS binding_watch_by_id" in sql
    assert "LEFT OUTER JOIN git_watch_targets AS binding_watch_by_source" in sql
    assert "binding_watch_by_id.watch_target_id IS NULL" in sql
    assert "binding_watch_by_source.manifest_path = deployment_bindings.manifest_path" in sql
    assert "last_polled_at" in sql
    assert " OR " in sql


def test_application_deployment_bindings_include_gitops_poll_status() -> None:
    recorded: list[Any] = []
    now = datetime.now(UTC)

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return [
                {
                    "binding_id": "binding-1",
                    "workspace_id": "ws-1",
                    "repository_id": "repo-1",
                    "watch_target_id": "watch-1",
                    "cluster_id": "cluster-1",
                    "namespace": "prod",
                    "app_name": "checkout-api",
                    "manifest_path": "deploy.yaml",
                    "environment": "prod",
                    "resource_class": "application",
                    "status": "active",
                    "deploy_policy": {},
                    "access_policy": {},
                    "created_at": now,
                    "updated_at": now,
                    "watch_last_seen_commit_sha": "sha-1",
                    "watch_last_polled_at": now,
                    "watch_settings": {
                        "poll_status": "failed",
                        "poll_status_code": 403,
                        "poll_error_kind": "access_denied",
                        "poll_error": "GitHub token cannot read repository",
                    },
                }
            ]

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    repository.get_application = lambda workspace_id, application_id: {  # type: ignore[method-assign]
        "workspace_id": workspace_id,
        "application_id": application_id,
        "repository_id": "repo-1",
        "name": "checkout-api",
        "manifest_path": "deploy.yaml",
    }

    deployments = repository.list_application_deployment_bindings("ws-1", "app-1")

    assert deployments[0]["gitops_poll"] == {
        "status": "failed",
        "status_code": 403,
        "error_kind": "access_denied",
        "error": "GitHub token cannot read repository",
        "last_seen_commit_sha": "sha-1",
        "last_polled_at": now.isoformat(),
    }
    assert "watch_settings" not in deployments[0]
    sql = str(recorded[0].compile(dialect=postgresql.dialect()))
    assert "binding_watch_by_source" in sql
    assert "coalesce(binding_watch_by_id.last_seen_commit_sha" in sql


def test_gitops_poll_targets_join_active_repository_application_binding() -> None:
    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
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
                    "source_type": "kustomize",
                    "last_seen_commit_sha": "old-sha",
                }
            ]

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

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
            "source_type": "kustomize",
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


def test_gitops_watch_poll_result_records_status_in_settings() -> None:
    recorded: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    repository.record_watch_poll_result(
        "watch-1",
        workspace_id="workspace-b",
        repository_id="repo-1",
        branch="release",
        manifest_path="k8s/deploy.yaml",
        ok=False,
        status_code=403,
        error_kind="access_denied",
        error="GitHub token cannot read repository",
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "INSERT INTO git_watch_targets" in sql
    assert "ON CONFLICT (workspace_id, repository_id, branch, manifest_path) DO UPDATE" in sql
    assert "last_polled_at" in sql
    assert "settings = (git_watch_targets.settings || excluded.settings)" in sql
    assert compiled.params["watch_target_id"] == "watch-1"
    assert compiled.params["workspace_id"] == "workspace-b"
    assert compiled.params["settings"]["poll_status"] == "failed"
    assert compiled.params["settings"]["poll_status_code"] == 403
    assert compiled.params["settings"]["poll_error_kind"] == "access_denied"


def test_gitops_mark_watch_observed_uses_source_identity_for_upsert() -> None:
    recorded: list[Any] = []

    class StubConnection:
        def execute(self, statement: Any) -> None:
            recorded.append(statement)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    repository.mark_watch_observed(
        "watch-derived",
        "commit-sha",
        workspace_id="workspace-b",
        repository_id="repo-1",
        branch="release",
        manifest_path="k8s/deploy.yaml",
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "INSERT INTO git_watch_targets" in sql
    assert "ON CONFLICT (workspace_id, repository_id, branch, manifest_path) DO UPDATE" in sql
    assert "last_seen_commit_sha" in sql
    assert compiled.params["watch_target_id"] == "watch-derived"
    assert compiled.params["last_seen_commit_sha"] == "commit-sha"
    assert compiled.params["workspace_id"] == "workspace-b"


def test_gitops_workflow_status_metrics_are_workspace_scoped() -> None:
    recorded: list[Any] = []

    class StubResult:
        def all(self) -> list[tuple[str, int]]:
            return [("applying", 2), ("failed", 1)]

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.workflow_run_status_counts("workspace-b") == {
        "applying": 2,
        "failed": 1,
    }

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "workflow_runs.workspace_id" in sql
    assert "GROUP BY workflow_runs.status" in sql
    assert compiled.params["workspace_id_1"] == "workspace-b"


def test_gitops_workflow_current_step_metrics_ignore_terminal_runs() -> None:
    recorded: list[Any] = []

    class StubResult:
        def all(self) -> list[tuple[str, int]]:
            return [("approval", 3), ("apply", 1)]

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(RepoChangeRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.workflow_run_current_step_counts("workspace-b") == {
        "approval": 3,
        "apply": 1,
    }

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "workflow_runs.workspace_id" in sql
    assert "workflow_runs.status NOT IN" in sql
    assert "GROUP BY workflow_runs.current_step" in sql
    assert compiled.params["workspace_id_1"] == "workspace-b"


def test_evidence_job_lease_uses_skip_locked_candidate_update() -> None:
    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def first(self) -> None:
            return None

    class StubAsyncConnection:
        async def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @asynccontextmanager
    async def stub_async_connection():
        yield StubAsyncConnection()

    repository = object.__new__(TargetAgentRepository)
    repository.async_connection = stub_async_connection  # type: ignore[method-assign]

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

    class StubResult:
        def __init__(self, first_row: dict[str, object] | None = None) -> None:
            self.first_row = first_row

        def mappings(self) -> StubResult:
            return self

        def first(self) -> dict[str, object] | None:
            return self.first_row

        def one(self) -> dict[str, object]:
            return {
                "job_id": "job-1",
                "evidence_key": "workspace-1:cluster-1:cluster-snapshot:window-1",
                "status": "completed",
            }

    class StubConnection:
        def __init__(self) -> None:
            self.calls = 0

        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            self.calls += 1
            if self.calls == 1:
                return StubResult(
                    {
                        "job_id": "job-1",
                        "evidence_key": "workspace-1:cluster-1:cluster-snapshot:window-1",
                        "provider_key": "metrics",
                        "attempt_count": 1,
                        "max_attempts": 3,
                    }
                )
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(TargetAgentRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

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
        QUEUED_COMMAND_TTL_SECONDS,
        AgentCommandRepository,
    )

    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(AgentCommandRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.fail_expired_agent_commands() == []

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)

    # 단일 원자 UPDATE ... RETURNING — 미수신 queue와 만료 lease를 함께 종결
    assert "UPDATE agent_commands" in sql
    assert "status IN" in sql
    assert "created_at" in sql
    assert f"interval '{QUEUED_COMMAND_TTL_SECONDS} seconds'" in sql
    assert f"interval '{EXPIRED_COMMAND_GRACE_SECONDS} seconds'" in sql
    assert "RETURNING agent_commands.command_id" in sql
    assert compiled.params["status"] == "failed"


def test_expire_stale_open_rca_incidents_closes_old_rows_atomically() -> None:
    from domains.dashboard.repository import DashboardRepository

    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(DashboardRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.expire_stale_open_rca_incidents(max_age_days=3, limit=100) == []

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)

    # 단일 UPDATE ... RETURNING — 오래 열린 incident row 를 닫아 fleet 집계 폭증을 막는다.
    assert "UPDATE rca_timeline" in sql
    assert "stale_open_incidents" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "incident_expired" in compiled.params.values()
    status_values = next(value for value in compiled.params.values() if isinstance(value, list))
    assert "incident_detected" in status_values
    assert "evidence_received" not in status_values
    assert "RETURNING rca_timeline.id" in sql


def test_delete_stale_pre_incident_timeline_is_bounded_and_scoped() -> None:
    from domains.dashboard.repository import DashboardRepository

    recorded: list[Any] = []

    class StubResult:
        def all(self) -> list[object]:
            return [(1,), (2,)]

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(DashboardRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.delete_stale_pre_incident_timeline(retention_hours=12, limit=50) == 2

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "DELETE FROM rca_timeline" in sql
    assert "stale_pre_incident_timeline" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    status_values = next(value for value in compiled.params.values() if isinstance(value, list))
    assert "evidence_received" in status_values
    assert "evidence_built" in status_values
    assert "incident_detected" not in status_values


def test_resolve_recovered_ephemeral_incidents_is_bounded_and_inventory_aware() -> None:
    from domains.dashboard.repository import DashboardRepository

    recorded: list[Any] = []

    class StubResult:
        def mappings(self) -> StubResult:
            return self

        def all(self) -> list[dict[str, object]]:
            return []

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(DashboardRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

    assert repository.resolve_recovered_ephemeral_incidents(grace_minutes=5, limit=25) == []

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "UPDATE rca_timeline" in sql
    assert "cluster_inventory_resources" in sql
    assert "recovered_ephemeral_incidents" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "incident_resolved" in compiled.params.values()
    assert ["Pod", "ReplicaSet"] in compiled.params.values()


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
    # unit_of_work 가 있으면 그 트랜잭션을 쓰고, 없으면(테스트 비실데이터 등) no-op 이어야 함
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

    class StubResult:
        def first(self) -> None:
            return None  # 이미 replay 된 행 → 갱신 0건

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(DeadLetterRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]

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


class _SqlRecordingResult:
    def __init__(self, rows: list[Any] | None = None) -> None:
        self._rows = rows or []

    def all(self) -> list[Any]:
        return self._rows

    def mappings(self) -> _SqlRecordingResult:
        return self

    def first(self) -> Any | None:
        return self._rows[0] if self._rows else None


def _repository_with_recorded_sql(
    repository_type: type, recorded: list[Any], rows: list[Any] | None = None
):
    class StubConnection:
        def execute(self, statement: Any, *args: Any, **kwargs: Any) -> _SqlRecordingResult:
            recorded.append(statement)
            return _SqlRecordingResult(rows)

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(repository_type)
    repository.connection = stub_connection  # type: ignore[method-assign]
    return repository


def test_rca_query_keyset_uses_created_at_and_id_without_offset() -> None:
    recorded: list[Any] = []
    repository = _repository_with_recorded_sql(RcaRepository, recorded)

    repository.list_evidence_records(
        "workspace-1",
        limit=11,
        offset=999,
        cursor=(datetime(2026, 7, 8, 5, 0, tzinfo=UTC), 42),
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "FROM evidence" in sql
    assert "evidence.created_at <" in sql
    assert "evidence.id <" in sql
    assert "OFFSET" not in sql


def test_rca_query_without_cursor_keeps_offset_compatibility() -> None:
    recorded: list[Any] = []
    repository = _repository_with_recorded_sql(RcaRepository, recorded)

    repository.list_rca_report_records("workspace-1", limit=11, offset=30, cursor=None)

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "FROM rca_reports" in sql
    assert "OFFSET" in sql


def test_rca_report_query_omits_payload_from_select_list() -> None:
    recorded: list[Any] = []
    repository = _repository_with_recorded_sql(RcaRepository, recorded)

    repository.list_rca_report_records("workspace-1", limit=11, offset=0, cursor=None)

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    select_list = sql.split("\nFROM rca_reports", maxsplit=1)[0]
    assert "rca_reports.payload" not in select_list
    assert "rca_reports.candidates" in select_list
    assert "rca_reports.supporting_evidence_refs" in select_list


def test_rca_test_analysis_outcome_reads_terminal_events_with_tenant_scope() -> None:
    recorded: list[Any] = []
    repository = _repository_with_recorded_sql(
        RcaRepository,
        recorded,
        rows=[
            {
                "subject": "rca.analysis_blocked",
                "payload": {"workspace_id": "workspace-1", "reason": "logs missing"},
            }
        ],
    )

    outcome = repository.get_rca_test_analysis_outcome("corr-1", "workspace-1")

    assert outcome == {
        "subject": "rca.analysis_blocked",
        "payload": {"workspace_id": "workspace-1", "reason": "logs missing"},
    }
    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "FROM events" in sql
    assert "events.correlation_id =" in sql
    assert "events.payload" in sql
    assert "ORDER BY events.created_at DESC" in sql
    assert "rca.analysis_blocked" in compiled.params.values()
    assert "incident.detected" in compiled.params.values()
    assert "workspace-1" in compiled.params.values()


def test_queue_agent_command_reports_insert_and_notifies_only_new_commands() -> None:
    from domains.command.repository import AgentCommandRepository

    recorded: list[Any] = []
    scalar_values = ["cmd-1", None]

    class StubResult:
        def scalar_one_or_none(self) -> str | None:
            return scalar_values.pop(0)

    class StubConnection:
        def execute(self, statement: Any, *_args: Any, **_kwargs: Any) -> StubResult:
            recorded.append(statement)
            return StubResult()

    @contextmanager
    def stub_connection():
        yield StubConnection()

    repository = object.__new__(AgentCommandRepository)
    repository.connection = stub_connection  # type: ignore[method-assign]
    plan = {
        "command_id": "cmd-1",
        "workspace_id": "workspace-1",
        "cluster_id": "cluster-1",
        "action": "rollout_restart",
    }

    assert repository.queue_agent_command("corr-1", plan, "queued") is True
    assert repository.queue_agent_command("corr-1", plan, "queued") is False
    assert len(recorded) == 3
    assert "RETURNING agent_commands.command_id" in str(
        recorded[0].compile(dialect=postgresql.dialect())
    )
    assert "pg_notify" in str(recorded[1])


def test_rca_report_save_writes_projection_columns() -> None:
    recorded: list[Any] = []
    repository = _repository_with_recorded_sql(RcaRepository, recorded)
    body = {
        "evidence_ref": "evidence://cluster-1/incident-1",
        "incident": {
            "incident_id": "incident-1",
            "cluster_id": "cluster-1",
            "resource_kind": "Deployment",
            "resource_name": "checkout-api",
            "namespace": "sandbox",
            "symptom": "ImagePullBackOff",
            "severity": "high",
            "secondary_symptoms": ["restart_spike"],
        },
        "candidates": [{"candidate_id": "image-pull-backoff", "title": "이미지 풀 실패"}],
        "evaluations": [{"candidate_id": "image-pull-backoff", "score": 1.0}],
        "rca_detail": {
            "confidence": 0.91,
            "reason": "필요한 근거가 모두 수집되었습니다.",
            "selected_candidate_id": "image-pull-backoff",
            "supporting_evidence": ["kubernetes"],
            "missing_evidence": [],
        },
    }

    repository.save_rca_report(
        correlation_id="corr-1",
        workspace_id="workspace-1",
        root_cause="image_pull_backoff",
        action="restart deployment",
        body=body,
    )

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    assert compiled.params["incident_id"] == "incident-1"
    assert compiled.params["cluster_id"] == "cluster-1"
    assert compiled.params["confidence"] == 0.91
    assert compiled.params["supporting_evidence"] == ["kubernetes"]
    assert compiled.params["candidates"][0]["candidate_id"] == "image-pull-backoff"


def test_rca_report_dedup_reads_projection_without_payload() -> None:
    recorded: list[Any] = []
    repository = _repository_with_recorded_sql(
        RcaRepository,
        recorded,
        rows=[
            {
                "id": 7,
                "correlation_id": "corr-7",
                "cluster_id": "cluster-1",
                "namespace": "sandbox",
                "resource_kind": "Deployment",
                "resource_name": "checkout-api",
                "created_at": datetime(2026, 7, 8, tzinfo=UTC),
            }
        ],
    )

    row = repository.find_recent_rca_report(
        "workspace-1",
        "image_pull_backoff",
        "sandbox/Deployment/checkout-api",
        300,
    )

    assert row == {
        "id": 7,
        "correlation_id": "corr-7",
        "created_at": "2026-07-08T00:00:00+00:00",
    }
    compiled = recorded[0].compile(dialect=postgresql.dialect())
    select_list = str(compiled).split("\nFROM rca_reports", maxsplit=1)[0]
    assert "rca_reports.payload" not in select_list
    assert "rca_reports.resource_name" in select_list


def test_dashboard_timeline_query_omits_payload_from_select_list() -> None:
    recorded: list[Any] = []
    repository = _repository_with_recorded_sql(DashboardRepository, recorded)

    repository.list_rca_timeline("workspace-1", allowed_cluster_ids=None, limit=10)

    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    select_list = sql.split("\nFROM rca_timeline", maxsplit=1)[0]
    assert "rca_timeline.payload" not in select_list
    assert "rca_timeline.last_event_id" not in select_list
    assert "rca_timeline.last_event_at" not in select_list
    assert "rca_timeline.updated_at" in select_list


def test_rca_backlog_resolve_updates_open_missing_rule_item() -> None:
    recorded: list[Any] = []
    repository = _repository_with_recorded_sql(RcaRepository, recorded, rows=[("backlog-1",)])

    count = repository.resolve_rca_backlog_item_for_rule(
        "workspace-1",
        "CrashLoopBackOff",
        "matching RCA rule is now available",
    )

    assert count == 1
    compiled = recorded[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "UPDATE rca_backlog_items" in sql
    assert "missing-cause-rule:workspace-1:CrashLoopBackOff" in set(compiled.params.values())
    assert "resolved" in set(compiled.params.values())
    assert "open" in set(compiled.params.values())


def test_retention_delete_queries_are_batched() -> None:
    cutoff = datetime(2026, 7, 1, tzinfo=UTC)
    cases = (
        (OutboxRepository, "delete_sent_outbox_older_than", "expired_outbox", "DELETE FROM outbox"),
        (EventRepository, "delete_events_older_than", "expired_events", "DELETE FROM events"),
        (
            AuditLogRepository,
            "delete_audit_logs_older_than",
            "expired_audit_log",
            "DELETE FROM audit_log",
        ),
    )
    for repository_type, method_name, cte_name, delete_sql in cases:
        recorded: list[Any] = []
        repository = _repository_with_recorded_sql(repository_type, recorded, rows=[(1,), (2,)])

        count = getattr(repository, method_name)(cutoff, limit=500)

        assert count == 2
        compiled = recorded[0].compile(dialect=postgresql.dialect())
        sql = str(compiled)
        assert cte_name in sql
        assert delete_sql in sql
        assert "LIMIT" in sql
        assert "RETURNING" in sql
