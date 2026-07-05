from __future__ import annotations

import asyncio
from types import SimpleNamespace

from domains.catalog.repository import BOOTSTRAP_CATALOG_ITEMS, catalog_item_version_id
from domains.catalog.router import install_catalog_item, list_catalog_items
from packages.contracts.gateway.requests import CatalogInstallRequest


class FakeCatalogDb:
    def __init__(self) -> None:
        self.install_runs: list[dict[str, object]] = []
        self.access_checks: list[tuple[str, str, str, str, str]] = []

    def list_catalog_items(self) -> list[dict[str, object]]:
        return [
            {
                "item_id": "catalog-postgresql",
                "slug": "postgresql",
                "name": "PostgreSQL",
                "category": "database",
                "description": "PostgreSQL",
                "default_version": "1.0.0",
                "status": "active",
                "metadata": {},
            }
        ]

    def get_catalog_item(self, item_id: str) -> dict[str, object] | None:
        if item_id not in {"catalog-postgresql", "postgresql"}:
            return None
        return {
            "item_id": "catalog-postgresql",
            "slug": "postgresql",
            "name": "PostgreSQL",
            "category": "database",
            "description": "PostgreSQL",
            "default_version": "1.0.0",
            "status": "active",
            "metadata": {},
            "versions": [
                {
                    "version": "1.0.0",
                    "package_type": "helm",
                    "package_ref": "oci://registry-1.docker.io/bitnamicharts/postgresql",
                    "values_schema": {},
                    "template": {"runner": "helm"},
                }
            ],
        }

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.access_checks.append((user_id, workspace_id, resource_type, resource_id, permission))
        return True

    def record_catalog_install_run(self, **kwargs: object) -> dict[str, object]:
        self.install_runs.append(kwargs)
        return {"install_id": "install-1", "status": "planned", **kwargs}


def current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id="ws-1")


def test_bootstrap_catalog_contains_initial_open_source_recipes() -> None:
    slugs = {item["slug"] for item in BOOTSTRAP_CATALOG_ITEMS}

    assert {"postgresql", "redis", "fastapi-template", "nextjs-template"} <= slugs


def test_catalog_list_route_returns_catalog_items() -> None:
    async def run():
        return await list_catalog_items(current=current_session(), db=FakeCatalogDb())

    response = asyncio.run(run())

    assert response.items[0]["slug"] == "postgresql"


def test_catalog_install_records_planned_run_and_requires_cluster_access() -> None:
    db = FakeCatalogDb()

    async def run():
        return await install_catalog_item(
            "postgresql",
            CatalogInstallRequest(
                cluster_id="cluster-1",
                namespace="data",
                application_name="orders-db",
                values={"auth.database": "orders"},
            ),
            current=current_session(),
            db=db,
        )

    response = asyncio.run(run())

    assert response.install["install_id"] == "install-1"
    assert response.install["status"] == "planned"
    assert db.access_checks == [("user-1", "ws-1", "cluster", "cluster-1", "deploy.run")]
    assert db.install_runs[0]["item_id"] == "catalog-postgresql"
    assert db.install_runs[0]["plan"]["package_type"] == "helm"
    assert db.install_runs[0]["values"] == {"auth.database": "orders"}


def test_catalog_version_id_is_stable() -> None:
    first = catalog_item_version_id("catalog-postgresql", "1.0.0")
    second = catalog_item_version_id("catalog-postgresql", "1.0.0")

    assert first == second
    assert first != catalog_item_version_id("catalog-postgresql", "2.0.0")
