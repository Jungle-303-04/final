"""storage 계층 단위 검증 — 실 DB 없이 가능한 부분(헬퍼·빌더·URL·schema 정의).

repository 의 실제 SQL 실행은 Postgres 전용(jsonb·on_conflict)이라 실 DB smoke·크래시
테스트가 검증한다. 여기서는 DB 연결 없이 결정적으로 확인 가능한 로직만 단위로 잠근다.
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest

from domains import registry
from packages.storage import database as db
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
        "evidence",
        "rca_reports",
        "pull_requests",
        "agent_commands",
        "dashboard_cards",
        "audit_log",
        "user_accounts",
        "workspaces",
        "workspace_members",
        "cluster_registrations",
    }
    assert expected <= set(metadata.tables)


def test_user_account_schema_supports_password_login() -> None:
    columns = set(metadata.tables["user_accounts"].c.keys())
    assert {"email", "password_hash", "role"} <= columns


def test_workspace_access_repository_declares_management_tables() -> None:
    expected = {
        "user_accounts",
        "workspaces",
        "workspace_members",
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
