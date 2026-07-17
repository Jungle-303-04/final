from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from packages.config.helm import helm_owned_resource_query_limit

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATH = ROOT / "alembic/versions/20260716_0800_helm_ownership_index.py"


def _migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("helm_ownership_index", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_helm_ownership_index_migration_is_reversible(monkeypatch) -> None:
    migration = _migration()
    statements: list[str] = []
    dropped: list[tuple[str, str]] = []
    monkeypatch.setattr(migration.op, "execute", statements.append)
    monkeypatch.setattr(
        migration.op,
        "drop_index",
        lambda name, *, table_name: dropped.append((name, table_name)),
    )

    migration.upgrade()
    migration.downgrade()

    sql = "\n".join(statements)
    assert "ix_inventory_resources_helm_ownership" in sql
    assert "meta.helm.sh/release-name" in sql
    assert "meta.helm.sh/release-namespace" in sql
    assert "app.kubernetes.io/managed-by" in sql
    assert dropped == [("ix_inventory_resources_helm_ownership", "cluster_inventory_resources")]


def test_helm_owned_resource_query_limit_is_operator_configurable(monkeypatch) -> None:
    monkeypatch.setenv("HELM_OWNED_RESOURCE_QUERY_LIMIT", "321")
    assert helm_owned_resource_query_limit() == 321

    monkeypatch.setenv("HELM_OWNED_RESOURCE_QUERY_LIMIT", "invalid")
    assert helm_owned_resource_query_limit() == 5_000

    monkeypatch.setenv("HELM_OWNED_RESOURCE_QUERY_LIMIT", "999999")
    assert helm_owned_resource_query_limit() == 50_000
