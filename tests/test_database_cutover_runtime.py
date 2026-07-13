"""Fail-closed runtime contracts for the first database cutover."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, ROOT / f"scripts/{name}.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


writer_freeze = load_script("database_writer_freeze")
cutover_config = load_script("database_cutover_config")


def deployment(
    name: str,
    *,
    replicas: int = 1,
    runtime_secret: bool = False,
) -> dict[str, object]:
    container: dict[str, object] = {"name": "app", "image": "example/app@sha256:" + "a" * 64}
    if runtime_secret:
        container["envFrom"] = [{"secretRef": {"name": "management-runtime-secret"}}]
    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": name},
        "spec": {
            "replicas": replicas,
            "template": {"spec": {"containers": [container]}},
        },
    }


def test_freeze_plan_captures_every_runtime_secret_consumer_and_live_only_agent() -> None:
    document = {
        "items": [
            deployment("api-gateway", replicas=2, runtime_secret=True),
            deployment("audit-worker", runtime_secret=True),
            deployment("console"),
            deployment("cluster-agent"),
            deployment("pgbouncer"),
        ]
    }

    plan = writer_freeze.build_plan(document, namespace="management")

    assert [(target.name, target.replicas) for target in plan.targets] == [
        ("api-gateway", 2),
        ("audit-worker", 1),
        ("cluster-agent", 1),
        ("pgbouncer", 1),
    ]


def test_freeze_plan_requires_gateway_and_pooler_and_rejects_hpa_targets() -> None:
    with pytest.raises(ValueError, match="required freeze target"):
        writer_freeze.build_plan(
            {"items": [deployment("api-gateway", runtime_secret=True)]},
            namespace="management",
        )

    with pytest.raises(ValueError, match="horizontal autoscaler"):
        writer_freeze.build_plan(
            {
                "items": [
                    deployment("api-gateway", runtime_secret=True),
                    deployment("pgbouncer"),
                ]
            },
            namespace="management",
            hpa_targets={"api-gateway"},
        )


def test_database_target_url_preserves_credentials_and_changes_only_database() -> None:
    source = "postgresql://service:secret@postgresql:5432/service?sslmode=disable"

    target = cutover_config.target_database_url(source, "opsia_abcdef123456")

    assert target == (
        "postgresql://service:secret@postgresql:5432/opsia_abcdef123456?sslmode=disable"
    )
    assert cutover_config.database_name(source) == "service"
    assert cutover_config.database_name(target) == "opsia_abcdef123456"


def test_pgbouncer_switch_changes_only_the_verified_database_mapping() -> None:
    config = """[databases]
service = host=postgresql port=5432 dbname=service user=service password=secret

[pgbouncer]
pool_mode = transaction
"""

    switched = cutover_config.switch_pgbouncer_database(
        config,
        source_database="service",
        target_database="opsia_abcdef123456",
    )

    assert "service = host=postgresql port=5432 dbname=opsia_abcdef123456" in switched
    assert "pool_mode = transaction" in switched
    with pytest.raises(ValueError, match="exactly one"):
        cutover_config.switch_pgbouncer_database(
            switched,
            source_database="service",
            target_database="other",
        )


def test_cutover_job_runs_bootstrap_then_data_only_copy_without_stamp() -> None:
    source = (ROOT / "deploy/management/database-cutover-job.yaml").read_text(encoding="utf-8")

    assert "packages.storage.baseline bootstrap" in source
    assert "packages.storage.data_cutover copy" in source
    assert source.index("packages.storage.baseline bootstrap") < source.index(
        "packages.storage.data_cutover copy"
    )
    assert "BASELINE_SOURCE_DATABASE_URL" in source
    assert "BASELINE_TARGET_DATABASE_URL" in source
    assert "alembic stamp" not in source
    assert "alembic downgrade" not in source
