"""storage 계층 단위 검증 — 실 DB 없이 가능한 부분(헬퍼·빌더·URL·schema 정의).

repository 의 실제 SQL 실행은 Postgres 전용(jsonb·on_conflict)이라 실 DB smoke·크래시
테스트가 검증한다. 여기서는 DB 연결 없이 결정적으로 확인 가능한 로직만 단위로 잠근다.
"""

from __future__ import annotations

from datetime import datetime

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


def test_sqlalchemy_url_uses_psycopg_driver() -> None:
    conn = db.Database()  # 엔진은 지연 생성(연결 안 함)
    assert conn.sqlalchemy_url.startswith("postgresql+psycopg://")


def test_oauth_scopes_appends_github_repo_scope() -> None:
    scopes = db.Database._oauth_scopes("github", {"scopes": ["profile"]})
    assert "repo" in scopes  # GitHub 은 repo 스코프 강제
    default = db.Database._oauth_scopes("github", {})
    assert "repo" in default and "profile" in default


def test_oauth_scopes_non_github_untouched() -> None:
    scopes = db.Database._oauth_scopes("gitlab", {"scopes": ["profile"]})
    assert scopes == ["profile"]  # GitHub 아니면 repo 안 붙음


def test_fake_token_payload_shape() -> None:
    payload = db.Database._fake_token_payload("github")
    assert payload["access_token"] == "fake-github-access-token"
    assert payload["refresh_token"] == "fake-github-refresh-token"
    assert "expires_at" in payload and "note" in payload


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
        "oauth_accounts",
        "token_vault",
    }
    assert expected <= set(metadata.tables)  # 13개 테이블 정의 존재
