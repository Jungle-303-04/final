from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATH = ROOT / "alembic/versions/20260716_1000_helm_chart_source_rbac.py"


def _migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("helm_chart_source_rbac", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_helm_chart_source_rbac_reuses_catalog_policy_and_is_reversible(
    monkeypatch,
) -> None:
    migration = _migration()
    statements: list[str] = []
    monkeypatch.setattr(migration.op, "execute", statements.append)

    migration.upgrade()
    migration.downgrade()

    upgrade = " ".join(statements[0].split()).casefold()
    downgrade = " ".join(statements[1].split()).casefold()
    assert "insert into role_permissions" in upgrade
    assert "where resource_type = 'catalog_item'" in upgrade
    assert "'helm_chart_source'" in upgrade
    assert "on conflict" in upgrade
    assert "delete from role_permissions" in downgrade
    assert "where resource_type = 'helm_chart_source'" in downgrade
