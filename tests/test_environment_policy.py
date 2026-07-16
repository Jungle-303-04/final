from __future__ import annotations

import pytest
from conftest import load_service

from domains.command.actions import CommandActionSpec
from domains.diagnostics.router import yaml_diagnostics
from domains.release_flow.execution import requires_manual_approval
from packages.config.constants import RiskLevel, Sandbox
from packages.config.environments import (
    EnvironmentClass,
    classify_environment,
    is_production_environment,
    is_protected_runtime_environment,
    is_sandbox_environment,
    is_staging_environment,
    normalize_environment,
)
from packages.storage.database import (
    DATABASE_STARTUP_INITIALIZE,
    DATABASE_STARTUP_MODE_ENV,
    DATABASE_STARTUP_VERIFY,
    database_startup_mode,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (" sandbox ", EnvironmentClass.SANDBOX),
        ("staging", EnvironmentClass.STAGING),
        ("prod", EnvironmentClass.PRODUCTION),
        ("PRODUCTION", EnvironmentClass.PRODUCTION),
        ("preview", EnvironmentClass.OTHER),
        (None, EnvironmentClass.OTHER),
    ],
)
def test_environment_classification_is_canonical(
    raw: object,
    expected: EnvironmentClass,
) -> None:
    assert classify_environment(raw) is expected


def test_environment_predicates_keep_safety_tiers_distinct() -> None:
    assert normalize_environment(" PRODUCTION ") == "production"
    assert is_sandbox_environment("sandbox")
    assert is_staging_environment("staging")
    assert is_production_environment("prod")
    assert is_production_environment("production")
    assert not is_production_environment("staging")
    assert is_protected_runtime_environment("prod")
    assert is_protected_runtime_environment("production")
    assert is_protected_runtime_environment("staging")
    assert not is_protected_runtime_environment("sandbox")


@pytest.mark.parametrize(
    ("app_env", "expected"),
    [
        ("prod", DATABASE_STARTUP_VERIFY),
        ("production", DATABASE_STARTUP_VERIFY),
        ("staging", DATABASE_STARTUP_VERIFY),
        ("sandbox", DATABASE_STARTUP_INITIALIZE),
    ],
)
def test_database_startup_uses_canonical_environment_policy(
    monkeypatch: pytest.MonkeyPatch,
    app_env: str,
    expected: str,
) -> None:
    monkeypatch.delenv(DATABASE_STARTUP_MODE_ENV, raising=False)
    monkeypatch.setenv("APP_ENV", app_env)

    assert database_startup_mode() == expected


@pytest.mark.parametrize(
    ("environment", "production"),
    [
        ("prod", True),
        ("production", True),
        ("staging", False),
        ("sandbox", False),
    ],
)
def test_release_diagnostics_and_diff_share_production_aliases(
    environment: str,
    production: bool,
) -> None:
    diagnostics = yaml_diagnostics(
        "\n".join(
            [
                "apiVersion: apps/v1",
                "kind: Deployment",
                "metadata:",
                "  name: checkout",
                f"  namespace: {environment}",
                "spec:",
                "  replicas: 1",
            ]
        )
    )
    diagnostic_codes = {item.code for item in diagnostics}
    diff_worker = load_service("gitops/diff-worker")

    assert ("risk.production_namespace" in diagnostic_codes) is production
    assert requires_manual_approval("production_only", "inherit", environment) is production
    assert (
        diff_worker.risk_for_diff(Sandbox.NAMESPACE, "changed", environment)
        is RiskLevel.REVIEW_REQUIRED
    ) is production


@pytest.mark.parametrize(
    ("scope", "approval_required"),
    [
        ("sandbox", False),
        ("staging", True),
        ("prod", True),
        ("production", True),
    ],
)
def test_command_non_sandbox_policy_uses_canonical_normalization(
    scope: str,
    approval_required: bool,
) -> None:
    spec = CommandActionSpec(
        action="test",
        requires_approval_outside_sandbox=True,
    )

    assert spec.requires_approval_for(scope.upper()) is approval_required
