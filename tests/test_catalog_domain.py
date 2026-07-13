from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.catalog.repository import BOOTSTRAP_CATALOG_ITEMS, catalog_item_version_id
from domains.catalog.router import list_catalog_items
from domains.catalog.router import router as catalog_router
from domains.identity.dependencies import require_session
from packages.runtime.dependencies import get_db


class StubCatalogDb:
    def __init__(self) -> None:
        self.access_checks: list[tuple[str, str, str, str, str]] = []
        self.cluster_role = "target"
        self.connected = True
        self.command_capabilities = ["collector", "command_receiver", "catalog_helm_install"]
        self.commands: dict[str, dict[str, object]] = {}
        self.queue_attempts = 0

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
        if item_id in {"catalog-fastapi-template", "fastapi-template"}:
            return {
                "item_id": "catalog-fastapi-template",
                "slug": "fastapi-template",
                "name": "FastAPI Service",
                "category": "application",
                "description": "FastAPI template",
                "default_version": "1.0.0",
                "status": "active",
                "metadata": {},
                "versions": [
                    {
                        "version": "1.0.0",
                        "package_type": "template",
                        "package_ref": "builtin://templates/fastapi",
                        "values_schema": {},
                        "template": {"runner": "manifest-renderer"},
                    }
                ],
            }
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
                    "values_schema": {
                        "type": "object",
                        "required": [
                            "auth.database",
                            "primary.persistence.storageClass",
                        ],
                        "properties": {
                            "auth.database": {"type": "string"},
                            "primary.persistence.storageClass": {"type": "string"},
                        },
                    },
                    "template": {"runner": "helm", "chart_version": "18.7.13"},
                }
            ],
        }

    def get_cluster_registration(
        self, workspace_id: str, cluster_id: str
    ) -> dict[str, object] | None:
        if cluster_id != "cluster-1":
            return None
        return {
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "status": "connected",
            "settings": {"cluster_role": self.cluster_role},
        }

    def get_cluster_policy(self, _workspace_id: str, _cluster_id: str) -> dict[str, object]:
        return {"cluster_role": self.cluster_role}

    def list_cluster_agent_statuses(
        self, _workspace_id: str, _cluster_id: str
    ) -> list[dict[str, object]]:
        if not self.connected:
            return []
        return [
            {
                "agent_id": "agent-1",
                "status": "connected",
                "capabilities": self.command_capabilities,
                "last_seen_at": datetime.now(UTC).isoformat(),
            }
        ]

    def queue_agent_command(
        self, correlation_id: str, plan: dict[str, object], status: str
    ) -> bool:
        self.queue_attempts += 1
        command_id = str(plan["command_id"])
        if command_id in self.commands:
            return False
        self.commands[command_id] = {
            "command_id": command_id,
            "cluster_id": plan["cluster_id"],
            "correlation_id": correlation_id,
            "action": plan["action"],
            "payload": plan,
            "status": status,
            "result": {},
            "completed_at": None,
        }
        return True

    async def get_agent_command(
        self, command_id: str, _workspace_id: str
    ) -> dict[str, object] | None:
        return self.commands.get(command_id)

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


def current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id="ws-1")


def catalog_client(db: StubCatalogDb) -> TestClient:
    app = FastAPI()
    app.include_router(catalog_router)
    app.dependency_overrides[require_session] = current_session
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def install_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "cluster_id": "cluster-1",
        "namespace": "sandbox",
        "application_name": "orders-db",
        "release_name": "orders-db",
        "values": {
            "auth.database": "orders",
            "primary.persistence.storageClass": "gp2",
        },
    }
    body.update(overrides)
    return body


def install_headers(key: str = "catalog-install-request-001") -> dict[str, str]:
    return {"Idempotency-Key": key}


def test_bootstrap_catalog_contains_initial_open_source_recipes() -> None:
    slugs = {item["slug"] for item in BOOTSTRAP_CATALOG_ITEMS}

    assert {"postgresql", "redis", "fastapi-template", "nextjs-template"} <= slugs
    helm_items = {
        str(item["slug"]): item["versions"][0]
        for item in BOOTSTRAP_CATALOG_ITEMS
        if item["versions"][0]["package_type"] == "helm"
    }
    assert helm_items["postgresql"]["values_schema"]["required"] == [
        "auth.database",
        "primary.persistence.storageClass",
    ]
    assert helm_items["redis"]["values_schema"]["required"] == ["master.persistence.storageClass"]
    for version in helm_items.values():
        assert "image.digest" in version["template"]["fixed_values"]
        assert "image.digest" not in version["values_schema"]["properties"]


def test_catalog_list_route_returns_catalog_items() -> None:
    async def run():
        return await list_catalog_items(current=current_session(), db=StubCatalogDb())

    response = asyncio.run(run())

    assert response.items[0]["slug"] == "postgresql"


def test_catalog_install_queues_real_high_priority_agent_command() -> None:
    db = StubCatalogDb()
    response = catalog_client(db).post(
        "/catalog/items/postgresql/installs",
        json=install_body(),
        headers=install_headers(),
    )

    assert response.status_code == 202
    body = response.json()
    assert body["accepted"] is True
    assert body["status"] == "queued"
    assert body["command_id"].startswith("cmd-catalog-")
    assert body["correlation_id"].startswith("corr-catalog-")
    assert db.access_checks == [("user-1", "ws-1", "cluster", "cluster-1", "deploy.run")]
    command = db.commands[body["command_id"]]
    plan = command["payload"]
    assert plan["action"] == "catalog.helm.install"
    assert plan["priority"] == 100
    assert plan["payload"] == {
        "catalog_item_id": "catalog-postgresql",
        "catalog_version": "1.0.0",
        "namespace": "sandbox",
        "application_name": "orders-db",
        "release_name": "orders-db",
        "values": {
            "auth.database": "orders",
            "primary.persistence.storageClass": "gp2",
        },
    }
    assert "package_ref" not in plan["payload"]
    assert "chart_url" not in plan["payload"]


def test_catalog_install_requires_online_command_receiver() -> None:
    db = StubCatalogDb()
    db.connected = False

    response = catalog_client(db).post(
        "/catalog/items/postgresql/installs",
        json=install_body(),
        headers=install_headers(),
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "cluster_not_connected"
    assert db.commands == {}


def test_catalog_install_requires_agent_runner_capability() -> None:
    db = StubCatalogDb()
    db.command_capabilities = ["collector", "command_receiver"]

    response = catalog_client(db).post(
        "/catalog/items/postgresql/installs",
        json=install_body(),
        headers=install_headers(),
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "catalog_install_runner_unavailable"
    assert db.commands == {}


@pytest.mark.parametrize("role_source", ["registration", "policy"])
def test_catalog_install_never_targets_management_cluster(role_source: str) -> None:
    db = StubCatalogDb()
    db.cluster_role = "management"
    if role_source == "registration":
        db.get_cluster_policy = lambda *_args: {"cluster_role": "target"}  # type: ignore[method-assign]
    else:
        original_registration = db.get_cluster_registration

        def target_registration(workspace_id: str, cluster_id: str):
            registration = original_registration(workspace_id, cluster_id)
            assert registration is not None
            registration["settings"] = {"cluster_role": "target"}
            return registration

        db.get_cluster_registration = target_registration  # type: ignore[method-assign]

    response = catalog_client(db).post(
        "/catalog/items/postgresql/installs",
        json=install_body(),
        headers=install_headers(),
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "management_readonly"
    assert db.commands == {}


@pytest.mark.parametrize(
    "body",
    [
        install_body(values={}),
        install_body(
            values={"auth.database": "orders"},
        ),
        install_body(
            values={"auth.database": 123, "primary.persistence.storageClass": "gp2"},
        ),
        install_body(
            values={
                "auth.database": "orders",
                "primary.persistence.storageClass": "gp2",
                "chart.url": "https://evil.invalid",
            },
        ),
        install_body(
            values={
                "auth.database": "orders",
                "primary.persistence.storageClass": "INVALID..class",
            },
        ),
        install_body(application_name="Orders_DB"),
        install_body(namespace="management"),
        install_body(release_name="unsafe.release"),
    ],
)
def test_catalog_install_rejects_invalid_names_and_values(body: dict[str, object]) -> None:
    db = StubCatalogDb()

    response = catalog_client(db).post(
        "/catalog/items/postgresql/installs",
        json=body,
        headers=install_headers(),
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "catalog_install_validation_error"
    assert db.commands == {}


def test_catalog_install_rejects_non_server_runner_recipe() -> None:
    db = StubCatalogDb()

    response = catalog_client(db).post(
        "/catalog/items/fastapi-template/installs",
        json=install_body(values={}),
        headers=install_headers(),
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "catalog_recipe_unsupported"
    assert db.commands == {}


def test_catalog_install_is_idempotent_and_rejects_key_reuse_with_new_payload() -> None:
    db = StubCatalogDb()
    client = catalog_client(db)
    headers = install_headers("catalog-idempotency-key-001")

    first = client.post("/catalog/items/postgresql/installs", json=install_body(), headers=headers)
    replay = client.post("/catalog/items/postgresql/installs", json=install_body(), headers=headers)
    conflict = client.post(
        "/catalog/items/postgresql/installs",
        json=install_body(
            values={
                "auth.database": "billing",
                "primary.persistence.storageClass": "gp2",
            }
        ),
        headers=headers,
    )

    assert first.status_code == replay.status_code == 202
    assert first.json() == replay.json()
    assert len(db.commands) == 1
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "idempotency_key_reused"


def test_catalog_install_requires_idempotency_key_and_rejects_raw_runner_fields() -> None:
    db = StubCatalogDb()
    client = catalog_client(db)

    missing_key = client.post("/catalog/items/postgresql/installs", json=install_body())
    raw_chart = client.post(
        "/catalog/items/postgresql/installs",
        json={**install_body(), "chart_url": "https://evil.invalid/chart.tgz"},
        headers=install_headers(),
    )

    assert missing_key.status_code == 422
    assert raw_chart.status_code == 422
    assert db.commands == {}


def test_catalog_install_openapi_declares_accepted_response() -> None:
    app = FastAPI()
    app.include_router(catalog_router)

    operation = app.openapi()["paths"]["/catalog/items/{item_id}/installs"]["post"]

    assert "202" in operation["responses"]


def test_catalog_version_id_is_stable() -> None:
    first = catalog_item_version_id("catalog-postgresql", "1.0.0")
    second = catalog_item_version_id("catalog-postgresql", "1.0.0")

    assert first == second
    assert first != catalog_item_version_id("catalog-postgresql", "2.0.0")
