"""Blue/green baseline bootstrap contracts for legacy create-all databases."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from packages.storage.baseline import (
    BASELINE_CONFIRM_DESTRUCTIVE_RESET_ENV,
    BASELINE_CONFIRM_EMPTY_TARGET_ENV,
    BASELINE_CONFIRM_SOURCE_COMMIT_ENV,
    BASELINE_DESTRUCTIVE_RESET_CONFIRMATION,
    BASELINE_EMPTY_TARGET_CONFIRMATION,
    BASELINE_SOURCE_COMMIT,
    BASELINE_SQL_PATH,
    BASELINE_SQL_SHA256,
    BaselineDecision,
    _validate_operator_confirmation,
    _validate_reset_confirmation,
    decide_bootstrap,
    load_baseline_sql,
)
from packages.storage.initialization import InitializationPath, decide_initialization

ROOT = Path(__file__).resolve().parents[1]


def test_baseline_snapshot_is_immutable_and_precedes_alembic_history() -> None:
    sql = load_baseline_sql()

    assert BASELINE_SOURCE_COMMIT == "017b2485b2c408c2f7e928379ebf6541526d32ab"
    assert BASELINE_SQL_PATH == ROOT / "alembic/baselines/20260708_pre_alembic.sql"
    assert hashlib.sha256(sql.encode("utf-8")).hexdigest() == BASELINE_SQL_SHA256
    assert "CREATE TABLE public.rca_timeline" in sql
    assert "CREATE TABLE public.alembic_version" not in sql
    assert "\\restrict" not in sql
    assert "\\unrestrict" not in sql


@pytest.mark.parametrize(
    ("table_names", "expected"),
    [
        ([], BaselineDecision.READY),
        (["alembic_version"], BaselineDecision.BLOCKED_NOT_EMPTY),
        (["workspaces"], BaselineDecision.BLOCKED_NOT_EMPTY),
    ],
)
def test_bootstrap_only_accepts_an_empty_target_database(
    table_names: list[str], expected: BaselineDecision
) -> None:
    assert decide_bootstrap(table_names) is expected


@pytest.mark.parametrize(
    ("table_names", "expected"),
    [
        ([], InitializationPath.BASELINE),
        (["alembic_version"], InitializationPath.MIGRATION),
        (["workspaces"], InitializationPath.MIGRATION),
    ],
)
def test_initialization_routes_only_empty_databases_to_the_baseline(
    table_names: list[str],
    expected: InitializationPath,
) -> None:
    assert decide_initialization(table_names) is expected


def test_initialization_never_uses_create_all_or_alembic_stamp() -> None:
    source = (ROOT / "src/packages/storage/initialization.py").read_text(encoding="utf-8")

    assert "run_bootstrap()" in source
    assert "run_upgrade()" in source
    assert "verify_schema()" in source
    assert "create_all" not in source
    assert "command.stamp" not in source


def test_baseline_runner_never_uses_alembic_stamp() -> None:
    source = (ROOT / "src/packages/storage/baseline.py").read_text(encoding="utf-8")

    assert "command.upgrade" in source
    assert "command.stamp" not in source
    assert "alembic stamp" not in source
    assert "DROP SCHEMA public CASCADE" in source


@pytest.mark.parametrize(
    ("source_commit", "empty_target"),
    [
        ("wrong", BASELINE_EMPTY_TARGET_CONFIRMATION),
        (BASELINE_SOURCE_COMMIT, "wrong"),
    ],
)
def test_operator_must_confirm_the_pinned_source_and_isolated_target(
    monkeypatch: pytest.MonkeyPatch,
    source_commit: str,
    empty_target: str,
) -> None:
    monkeypatch.setenv(BASELINE_CONFIRM_SOURCE_COMMIT_ENV, source_commit)
    monkeypatch.setenv(BASELINE_CONFIRM_EMPTY_TARGET_ENV, empty_target)

    with pytest.raises(RuntimeError):
        _validate_operator_confirmation()


@pytest.mark.parametrize(
    ("source_commit", "confirmation"),
    [
        ("wrong", BASELINE_DESTRUCTIVE_RESET_CONFIRMATION),
        (BASELINE_SOURCE_COMMIT, "wrong"),
    ],
)
def test_dev_reset_requires_independent_destructive_confirmation(
    monkeypatch: pytest.MonkeyPatch,
    source_commit: str,
    confirmation: str,
) -> None:
    monkeypatch.setenv(BASELINE_CONFIRM_SOURCE_COMMIT_ENV, source_commit)
    monkeypatch.setenv(BASELINE_CONFIRM_DESTRUCTIVE_RESET_ENV, confirmation)

    with pytest.raises(RuntimeError):
        _validate_reset_confirmation()


def test_dev_reset_accepts_only_the_exact_destructive_confirmation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(BASELINE_CONFIRM_SOURCE_COMMIT_ENV, BASELINE_SOURCE_COMMIT)
    monkeypatch.setenv(
        BASELINE_CONFIRM_DESTRUCTIVE_RESET_ENV,
        BASELINE_DESTRUCTIVE_RESET_CONFIRMATION,
    )

    _validate_reset_confirmation()
