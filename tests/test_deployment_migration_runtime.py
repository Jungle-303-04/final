"""Production migration image, baseline adoption, and Job contracts."""

from __future__ import annotations

from pathlib import Path

import pytest

from packages.storage.migration import (
    MigrationDecision,
    decide_upgrade,
)

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_service_image_contains_alembic_runtime_and_revision_assets() -> None:
    dockerfile = read("src/services/Dockerfile")
    requirements = read("src/services/requirements.txt")

    assert "alembic==" in requirements
    assert "COPY --chown=appuser:appuser alembic ./alembic" in dockerfile
    assert "COPY --chown=appuser:appuser alembic.ini ./alembic.ini" in dockerfile
    assert "alembic heads" in dockerfile
    assert "alembic heads | wc -l" in dockerfile
    assert "grep -Eq '^[0-9_]+ \\(head\\)$'" in dockerfile
    assert "python -m packages.storage.baseline verify" in dockerfile


def test_migration_job_uses_direct_postgres_and_expected_head_guard() -> None:
    manifest = read("deploy/management/migration-job.yaml")

    assert "name: management-database-migration" in manifest
    assert "python" in manifest
    assert "-m" in manifest
    assert "packages.storage.migration" in manifest
    assert "upgrade" in manifest
    assert "key: COMMAND_NOTIFY_DATABASE_URL" in manifest
    assert "name: MIGRATION_EXPECTED_HEAD" in manifest
    assert 'value: "20260715_0250"' in manifest
    assert "MIGRATION_BASELINE" not in manifest
    assert "automountServiceAccountToken: false" in manifest
    assert "DEV_AUTH_BYPASS" not in manifest


def test_admin_bootstrap_job_runs_only_after_versioning_with_ephemeral_secret() -> None:
    manifest = read("deploy/management/admin-bootstrap-job.yaml")

    assert "name: management-admin-bootstrap" in manifest
    assert "controller.bootstrap_admin" in manifest
    assert "key: COMMAND_NOTIFY_DATABASE_URL" in manifest
    assert 'value: "20260715_0250"' in manifest
    assert "name: AUTH_PASSWORD" in manifest
    assert "key: AUTH_PASSWORD" in manifest
    assert "automountServiceAccountToken: false" in manifest


@pytest.mark.parametrize(
    ("version_table_exists", "current_revisions", "expected"),
    [
        (False, [], MigrationDecision.BLOCKED_UNVERSIONED),
        (True, [], MigrationDecision.BLOCKED_EMPTY_VERSION),
        (True, ["unknown"], MigrationDecision.BLOCKED_UNKNOWN_REVISION),
        (True, ["base"], MigrationDecision.UPGRADE),
        (True, ["head"], MigrationDecision.CURRENT),
        (True, ["base", "head"], MigrationDecision.BLOCKED_MULTIPLE_REVISIONS),
    ],
)
def test_upgrade_decision_never_adopts_an_unversioned_database(
    version_table_exists: bool,
    current_revisions: list[str],
    expected: MigrationDecision,
) -> None:
    assert (
        decide_upgrade(
            version_table_exists=version_table_exists,
            current_revisions=current_revisions,
            known_revisions={"base", "head"},
            head_revision="head",
        )
        is expected
    )


def test_aws_deploy_does_not_wire_migration_job_before_baseline_is_proven() -> None:
    script = read("scripts/aws-up.sh")

    assert "management-database-migration" not in script
    assert "packages.storage.migration" not in script
