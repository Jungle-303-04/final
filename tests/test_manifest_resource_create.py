from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from domains.manifest_editor.router import (
    apply_resource_manifest_create,
    dry_run_resource_manifest_create,
    get_resource_manifest_create_capability,
)
from packages.contracts.auth import Actor
from packages.contracts.gateway.requests import (
    ResourceManifestCreateDryRunRequest,
    ResourceManifestCreateRequest,
)
from packages.contracts.gateway.responses import ResourceManifestCreateCapabilityResponse

CREATE_YAML = """\
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: shop
  uid: must-be-stripped
  resourceVersion: "42"
spec:
  replicas: 2
  selector:
    matchLabels:
      app: checkout-api
  template:
    metadata:
      labels:
        app: checkout-api
    spec:
      containers:
        - name: app
          image: example/checkout:v1
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: checkout-config
data:
  mode: live
"""


class CreateDb:
    def __init__(self) -> None:
        self.command: dict[str, object] | None = None

    def can_access(self, *_args: object) -> bool:
        return True

    def latest_inventory_snapshot(self, workspace_id: str, cluster_id: str) -> dict[str, object]:
        assert (workspace_id, cluster_id) == ("workspace-1", "cluster-1")
        resources = [
            descriptor("apps", "v1", "apps/v1", "deployments", "Deployment"),
            descriptor("", "v1", "v1", "configmaps", "ConfigMap"),
        ]
        return {
            "snapshot_id": "snapshot-1",
            "summary": {
                "summary": {
                    "api_resource_discovery": {
                        "observed_at": "2026-07-17T00:00:00Z",
                        "completeness": "exact",
                        "reason_codes": [],
                        "resources": resources,
                    }
                }
            },
        }

    def list_cluster_agent_statuses(
        self, workspace_id: str, cluster_id: str
    ) -> list[dict[str, object]]:
        assert (workspace_id, cluster_id) == ("workspace-1", "cluster-1")
        return [{"status": "connected", "capabilities": ["command_receiver"]}]

    async def get_agent_command(
        self, _command_id: str, _workspace_id: str
    ) -> dict[str, object] | None:
        return self.command


class CreateEvents:
    def __init__(self) -> None:
        self.bodies: list[object] = []

    async def accept_body(self, body: object, *, actor: Actor, **kwargs: object) -> SimpleNamespace:
        assert actor.user_id == "operator-1"
        self.bodies.append(body)
        return SimpleNamespace(
            event=SimpleNamespace(
                event_id=f"event-{len(self.bodies)}",
                correlation_id=f"correlation-{len(self.bodies)}",
            )
        )


class OperationEvents:
    def __init__(self) -> None:
        self.published: list[dict[str, object]] = []

    async def publish(self, **payload: object) -> None:
        self.published.append(payload)


def descriptor(
    group: str,
    version: str,
    api_version: str,
    name: str,
    kind: str,
) -> dict[str, object]:
    return {
        "group": group,
        "version": version,
        "api_version": api_version,
        "name": name,
        "singular_name": name.removesuffix("s"),
        "kind": kind,
        "namespaced": True,
        "is_crd": False,
        "verbs": ["create", "get", "patch"],
    }


def session() -> SimpleNamespace:
    return SimpleNamespace(
        workspace_id="workspace-1",
        user_id="operator-1",
        roles=("release_operator",),
    )


def test_create_capability_is_server_discovered_and_namespace_scoped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "shop")

    response = get_resource_manifest_create_capability("cluster-1", "shop", session(), CreateDb())

    assert isinstance(response, ResourceManifestCreateCapabilityResponse)
    assert response.available is True
    assert response.snapshot_id == "snapshot-1"
    assert {(item.api_version, item.kind) for item in response.resources} == {
        ("apps/v1", "Deployment"),
        ("v1", "ConfigMap"),
    }


def test_create_dry_run_strips_server_fields_and_dispatches_no_live_apply(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "shop")
    db = CreateDb()
    events = CreateEvents()
    operations = OperationEvents()

    receipt = asyncio.run(
        dry_run_resource_manifest_create(
            ResourceManifestCreateDryRunRequest(
                cluster_id="cluster-1",
                namespace="shop",
                snapshot_id="snapshot-1",
                edited_yaml=CREATE_YAML,
                force=False,
                reason="validate two resources",
            ),
            "create-dry-run-key-001",
            session(),
            db,
            events,
            operations,
        )
    )

    assert receipt.status == "queued"
    command = events.bodies[0]
    assert command.payload["create_mode"] is True
    assert command.payload["dry_run"] is True
    assert command.payload["force"] is False
    documents = command.payload["desired_documents"]
    assert len(documents) == 2
    assert documents[0]["metadata"]["namespace"] == "shop"
    assert "uid" not in documents[0]["metadata"]
    assert "resourceVersion" not in documents[0]["metadata"]
    assert operations.published[0]["command_id"] == receipt.command_id


def test_create_rejects_disallowed_or_duplicate_documents_before_dispatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "shop")
    duplicate = CREATE_YAML + "\n---\n" + CREATE_YAML.split("---", maxsplit=1)[1]
    events = CreateEvents()

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            dry_run_resource_manifest_create(
                ResourceManifestCreateDryRunRequest(
                    cluster_id="cluster-1",
                    namespace="shop",
                    snapshot_id="snapshot-1",
                    edited_yaml=duplicate,
                    force=False,
                    reason="invalid duplicate",
                ),
                "create-dry-run-key-002",
                session(),
                CreateDb(),
                events,
                OperationEvents(),
            )
        )

    assert error.value.status_code == 422
    assert events.bodies == []


def test_force_requires_explicit_second_confirmation() -> None:
    with pytest.raises(ValidationError):
        ResourceManifestCreateRequest(
            cluster_id="cluster-1",
            namespace="shop",
            snapshot_id="snapshot-1",
            edited_yaml=CREATE_YAML,
            desired_sha256="sha256:" + "a" * 64,
            dry_run_command_id="cmd-create-dry-run-1",
            confirmation=True,
            force=True,
            force_confirmation=False,
            reason="force ownership",
        )


def test_create_requires_matching_successful_server_dry_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "shop")
    db = CreateDb()
    db.command = {
        "action": "apply_manifest",
        "status": "failed",
        "payload": {"payload": {"create_mode": True, "dry_run": True}},
        "result": {"dry_run": True, "completeness": "partial"},
    }

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            apply_resource_manifest_create(
                ResourceManifestCreateRequest(
                    cluster_id="cluster-1",
                    namespace="shop",
                    snapshot_id="snapshot-1",
                    edited_yaml=CREATE_YAML,
                    desired_sha256="sha256:" + "a" * 64,
                    dry_run_command_id="cmd-create-dry-run-1",
                    confirmation=True,
                    force=False,
                    reason="create resources",
                ),
                "create-apply-key-001",
                session(),
                db,
                CreateEvents(),
                OperationEvents(),
            )
        )

    assert error.value.status_code == 409
