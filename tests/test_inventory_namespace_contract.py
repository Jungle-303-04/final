"""G3 W5 namespace distribution contract."""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from domains.inventory.repository import InventoryRepository
from domains.inventory.router import get_inventory_summary
from packages.contracts.gateway.responses import InventoryNamespaceSummary


class _Rows:
    def mappings(self) -> _Rows:
        return self

    def all(self) -> list[dict[str, object]]:
        return [
            {
                "namespace": "shop",
                "resource_type": "workload",
                "kind": "Deployment",
                "health": "degraded",
                "count": 2,
            },
            {
                "namespace": "system",
                "resource_type": "pod",
                "kind": "Pod",
                "health": "critical",
                "count": 1,
            },
        ]


class _Connection:
    def __init__(self) -> None:
        self.statement: Any = None

    def execute(self, statement: Any) -> _Rows:
        self.statement = statement
        return _Rows()


def test_inventory_repository_groups_live_namespaced_product_counts() -> None:
    connection = _Connection()
    repository = object.__new__(InventoryRepository)

    @contextmanager
    def connect():
        yield connection

    repository.connection = connect  # type: ignore[method-assign]

    rows = repository.inventory_namespace_resource_counts(
        "workspace-a",
        "cluster-a",
    )

    assert rows == [
        {
            "namespace": "shop",
            "total": 2,
            "counts": [{"resource_type": "deployment", "health": "degraded", "count": 2}],
        },
        {
            "namespace": "system",
            "total": 1,
            "counts": [{"resource_type": "pod", "health": "critical", "count": 1}],
        },
    ]
    sql = str(
        connection.statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).casefold()
    assert "cluster_inventory_resources.workspace_id = 'workspace-a'" in sql
    assert "cluster_inventory_resources.cluster_id = 'cluster-a'" in sql
    assert "cluster_inventory_resources.namespace is not null" in sql
    assert "cluster_inventory_resources.deleted_at is null" in sql
    assert "group by" in sql


def test_inventory_namespace_schema_is_typed_and_total_is_exact() -> None:
    namespace = InventoryNamespaceSummary.model_validate(
        {
            "namespace": "shop",
            "total": 2,
            "counts": [{"resource_type": "deployment", "health": "degraded", "count": 2}],
        }
    )

    assert namespace.counts[0].resource_type == "deployment"
    with pytest.raises(ValidationError):
        InventoryNamespaceSummary.model_validate(
            {
                **namespace.model_dump(),
                "total": 3,
            }
        )
    with pytest.raises(ValidationError):
        InventoryNamespaceSummary.model_validate(
            {
                **namespace.model_dump(),
                "counts": [{**namespace.counts[0].model_dump(), "raw": {}}],
            }
        )


class _InventoryDb:
    def can_access(self, *_args: Any) -> bool:
        return True

    def latest_inventory_snapshot(self, _workspace_id: str, _cluster_id: str) -> None:
        return None

    def inventory_product_resource_counts(
        self,
        _workspace_id: str,
        _cluster_id: str,
        *,
        namespaces: tuple[str, ...],
    ) -> list[dict[str, object]]:
        assert namespaces == ()
        return []

    def inventory_namespace_resource_counts(
        self,
        _workspace_id: str,
        _cluster_id: str,
        *,
        namespaces: tuple[str, ...],
    ) -> list[dict[str, object]]:
        assert namespaces == ()
        return [
            {
                "namespace": "shop",
                "total": 1,
                "counts": [{"resource_type": "pod", "health": "healthy", "count": 1}],
            }
        ]


def test_inventory_summary_returns_namespace_distribution_from_server() -> None:
    response = asyncio.run(
        get_inventory_summary(
            "cluster-a",
            namespaces=None,
            current=SimpleNamespace(user_id="user-a", workspace_id="workspace-a"),
            db=_InventoryDb(),
        )
    )

    assert response.namespaces[0].namespace == "shop"
    assert response.namespaces[0].counts[0].count == 1


class _UnavailableNamespaceDb:
    def __init__(self, *, allowed: bool = True) -> None:
        self.allowed = allowed
        self.count_reads = 0

    def can_access(self, *_args: Any) -> bool:
        return self.allowed

    def latest_inventory_snapshot(self, _workspace_id: str, _cluster_id: str) -> None:
        return None

    def inventory_product_resource_counts(
        self,
        _workspace_id: str,
        _cluster_id: str,
        *,
        namespaces: tuple[str, ...],
    ) -> list[dict[str, object]]:
        self.count_reads += 1
        return []


def test_inventory_summary_fails_closed_when_namespace_projection_is_unavailable() -> None:
    db = _UnavailableNamespaceDb()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            get_inventory_summary(
                "cluster-a",
                namespaces=None,
                current=SimpleNamespace(user_id="user-a", workspace_id="workspace-a"),
                db=db,
            )
        )

    assert exc.value.status_code == 503
    assert db.count_reads == 0


def test_inventory_summary_denies_cluster_before_reading_any_projection() -> None:
    db = _UnavailableNamespaceDb(allowed=False)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            get_inventory_summary(
                "cluster-forbidden",
                namespaces=None,
                current=SimpleNamespace(user_id="user-a", workspace_id="workspace-a"),
                db=db,
            )
        )

    assert exc.value.status_code == 403
    assert db.count_reads == 0


def test_inventory_summary_rejects_invalid_namespace_scope_before_count_queries() -> None:
    db = _UnavailableNamespaceDb()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            get_inventory_summary(
                "cluster-a",
                namespaces="shop,,system",
                current=SimpleNamespace(user_id="user-a", workspace_id="workspace-a"),
                db=db,
            )
        )

    assert exc.value.status_code == 422
    assert db.count_reads == 0
