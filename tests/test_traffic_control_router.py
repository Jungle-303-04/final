from __future__ import annotations

import importlib
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.identity import Permission
from packages.contracts.parity import CommandReceipt
from packages.runtime.dependencies import get_db, get_events, get_operation_events

OBSERVED_AT = datetime.now(UTC).isoformat()


class TrafficControlDb:
    def __init__(self, *, allowed: bool = True, include_observation: bool = True) -> None:
        self.allowed = allowed
        self.include_observation = include_observation

    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        assert workspace_id == "workspace-a"
        if (
            self.allowed
            and resource_type == "cluster"
            and permission
            in {
                Permission.INVENTORY_READ.value,
                Permission.DEPLOY_RUN.value,
            }
        ):
            return {"cluster-a"}
        return set()

    def can_access(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        return (
            self.allowed
            and workspace_id == "workspace-a"
            and resource_type == "cluster"
            and resource_id == "cluster-a"
            and permission
            in {
                Permission.INVENTORY_READ.value,
                Permission.DEPLOY_RUN.value,
            }
        )

    def filter_snapshot_contexts(
        self,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        return {
            cluster_id: {
                "snapshot_revision": 17,
                "observed_at": OBSERVED_AT,
                "labels_complete": True,
                "resources_complete": True,
                "application_bindings_complete": True,
                "partial_reason_codes": [],
            }
            for cluster_id in cluster_ids
        }

    def latest_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        if not self.include_observation:
            return {}
        observed_at = datetime.now(UTC).isoformat()
        return {
            cluster_id: {
                "status": "connected",
                "last_seen_at": observed_at,
                "capabilities": [
                    "command_receiver",
                    "traffic_source_observer.v1",
                    "traffic_source_select.v1",
                    "traffic_source_connect.v1",
                ],
                "details": {
                    "traffic_sources": {
                        "schema_version": 1,
                        "observed_at": observed_at,
                        "active_source": "hubble",
                        "cluster": {
                            "platform": "eks",
                            "cni": "cilium",
                            "dataplane_v2": False,
                            "kubernetes_version": "v1.33.1",
                        },
                        "sources": [
                            {
                                "key": "hubble",
                                "label": "Hubble",
                                "status": "available",
                                "version": "1.17.2",
                                "native": True,
                                "message": "relay endpoints are ready",
                            },
                            {
                                "key": "caretta",
                                "label": "Caretta",
                                "status": "not_detected",
                                "version": None,
                                "native": False,
                                "message": "collector workload was not observed",
                            },
                        ],
                    }
                },
            }
            for cluster_id in cluster_ids
        }

    async def get_agent_command(
        self,
        _command_id: str,
        _workspace_id: str,
    ) -> None:
        return None

    def get_inventory_resource_by_api_version(self, **query: object) -> dict[str, object] | None:
        namespace = query.get("namespace")
        name = query.get("name")
        if query.get("resource_type") == "pod":
            labels = {"app": "api"} if name == "api-0" else {"app": "web"}
            uid = "pod-api-uid" if name == "api-0" else "pod-web-uid"
            return inventory_resource(
                resource_type="pod",
                kind="Pod",
                namespace=str(namespace),
                name=str(name),
                uid=uid,
                raw={
                    "metadata": {"labels": labels},
                    "spec": {
                        "containers": [
                            {"ports": [{"name": "http", "containerPort": 8080, "protocol": "TCP"}]}
                        ]
                    },
                    "status": {"podIP": "10.0.0.12" if name == "api-0" else "10.0.0.11"},
                },
            )
        if query.get("resource_type") == "namespace":
            return inventory_resource(
                resource_type="namespace",
                kind="Namespace",
                namespace=None,
                name=str(name),
                uid=f"namespace-{name}-uid",
                raw={"metadata": {"labels": {"tenant": str(name)}}},
            )
        return None

    def list_inventory_resources_by_api_version(self, **query: object) -> list[dict[str, object]]:
        if query.get("resource_type") != "networkpolicy":
            return []
        return [
            inventory_resource(
                resource_type="networkpolicy",
                api_version="networking.k8s.io/v1",
                kind="NetworkPolicy",
                namespace="backend",
                name="allow-frontend",
                uid="policy-uid",
                raw={
                    "spec": {
                        "podSelector": {"matchLabels": {"app": "api"}},
                        "policyTypes": ["Ingress"],
                        "ingress": [
                            {
                                "from": [
                                    {
                                        "namespaceSelector": {
                                            "matchLabels": {"tenant": "frontend"}
                                        },
                                        "podSelector": {"matchLabels": {"app": "web"}},
                                    }
                                ],
                                "ports": [{"protocol": "TCP", "port": 8080}],
                            }
                        ],
                    }
                },
            )
        ]


def inventory_resource(
    *,
    resource_type: str,
    kind: str,
    namespace: str | None,
    name: str,
    uid: str,
    raw: dict[str, object],
    api_version: str = "v1",
) -> dict[str, object]:
    return {
        "inventory_key": f"cluster-a:{resource_type}:{namespace or '-'}:{name}",
        "snapshot_id": "snapshot-17",
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "resource_type": resource_type,
        "api_version": api_version,
        "kind": kind,
        "namespace": namespace,
        "name": name,
        "uid": uid,
        "resource_version": "17",
        "labels": (raw.get("metadata") or {}).get("labels", {}),
        "raw": raw,
        "observed_at": OBSERVED_AT,
    }


def current() -> SimpleNamespace:
    return SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )


def _client(
    monkeypatch,
    *,
    db: TrafficControlDb | None = None,
) -> tuple[TestClient, list[object]]:
    module = importlib.import_module("domains.traffic.router")
    accepted_commands: list[object] = []

    async def accept(_events, command, *, actor, **_kwargs):
        accepted_commands.append(command)
        assert actor.user_id == "user-a"
        return (
            SimpleNamespace(
                event=SimpleNamespace(
                    event_id="evt-traffic-1",
                    correlation_id="corr-traffic-1",
                )
            ),
            None,
        )

    async def announce(*_args, **_kwargs):
        return True

    monkeypatch.setattr(module, "accept_command_with_receipt_stage", accept)
    monkeypatch.setattr(module, "announce_staged_operation_event", announce)
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = current
    app.dependency_overrides[get_db] = lambda: db or TrafficControlDb()
    app.dependency_overrides[get_events] = lambda: SimpleNamespace()
    app.dependency_overrides[get_operation_events] = lambda: SimpleNamespace()
    return TestClient(app), accepted_commands


def test_sources_are_agent_observed_scoped_and_descriptor_driven(monkeypatch) -> None:
    client, _commands = _client(monkeypatch)

    response = client.get("/traffic/sources?clusters=cluster-a")

    assert response.status_code == 200
    body = response.json()
    assert body["availability"] == "available"
    assert body["coverage"]["scopes"][0]["cluster_id"] == "cluster-a"
    catalog = body["clusters"][0]
    assert catalog["active_source"] == "hubble"
    assert catalog["freshness"] == "live"
    assert len(catalog["capability_revision"]) == 64
    assert [source["label"] for source in catalog["sources"]] == ["Caretta", "Hubble"]
    assert catalog["sources"][1]["actions"] == [
        {
            "id": "connect",
            "kind": "connect",
            "label": "Connect Hubble",
            "enabled": True,
            "confirmation_required": True,
            "reason_code": None,
        }
    ]


def test_sources_report_no_data_and_rbac_denial_without_sample_fallback(monkeypatch) -> None:
    no_data, _ = _client(
        monkeypatch,
        db=TrafficControlDb(include_observation=False),
    )
    unavailable = no_data.get("/traffic/sources?clusters=cluster-a")

    assert unavailable.status_code == 200
    assert unavailable.json()["availability"] == "unavailable"
    assert unavailable.json()["clusters"][0]["sources"] == []
    assert unavailable.json()["clusters"][0]["reason_codes"] == [
        "traffic_source_observation_unavailable"
    ]

    denied, _ = _client(monkeypatch, db=TrafficControlDb(allowed=False))
    assert denied.get("/traffic/sources?clusters=cluster-a").status_code == 404


def test_source_probe_errors_are_partial_instead_of_available(monkeypatch) -> None:
    db = TrafficControlDb()
    original = db.latest_cluster_agent_statuses

    def error_statuses(workspace_id: str, cluster_ids: set[str]):
        statuses = original(workspace_id, cluster_ids)
        for status in statuses.values():
            observation = status["details"]["traffic_sources"]
            observation["active_source"] = None
            for source in observation["sources"]:
                source["status"] = "error"
                source["message"] = "source observation is forbidden by cluster RBAC"
        return statuses

    db.latest_cluster_agent_statuses = error_statuses  # type: ignore[method-assign]
    client, _commands = _client(monkeypatch, db=db)

    response = client.get("/traffic/sources?clusters=cluster-a")

    assert response.status_code == 200
    assert response.json()["availability"] == "partial"
    assert response.json()["reason_codes"] == ["traffic_source_detection_error"]
    assert response.json()["clusters"][0]["reason_codes"] == ["traffic_source_detection_error"]


def test_source_selection_and_connect_queue_idempotent_audited_agent_commands(monkeypatch) -> None:
    client, commands = _client(monkeypatch)
    catalog = client.get("/traffic/sources?clusters=cluster-a").json()["clusters"][0]
    common = {
        "scope": {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "namespaces": [],
            "freshness": "live",
        },
        "source_key": "hubble",
        "capability_revision": catalog["capability_revision"],
        "confirmation": True,
        "reason": "Enable observed traffic collection",
    }

    selected = client.post(
        "/traffic/source",
        json=common,
        headers={"Idempotency-Key": "traffic-source-0001"},
    )
    connected = client.post(
        "/traffic/connect",
        json=common,
        headers={"Idempotency-Key": "traffic-connect-0001"},
    )

    assert selected.status_code == connected.status_code == 202
    assert selected.json()["audit_event_id"] == "evt-traffic-1"
    assert connected.json()["command_id"].startswith("cmd-traffic-")
    assert [command.action for command in commands] == [
        "traffic.source.select",
        "traffic.source.connect",
    ]
    assert commands[0].diff.basis["cache_invalidations"] == [
        "traffic.sources",
        "traffic.flows",
        "traffic.overview",
    ]
    assert commands[1].payload["source_key"] == "hubble"


def test_source_capability_revision_ignores_observation_clock_only_changes() -> None:
    module = importlib.import_module("domains.traffic.source_projection")
    db = TrafficControlDb()
    now = datetime(2026, 7, 17, 7, 0, tzinfo=UTC)
    statuses = db.latest_cluster_agent_statuses("workspace-a", {"cluster-a"})
    first_status = statuses["cluster-a"]
    first_status["last_seen_at"] = now.isoformat()
    first_observation = first_status["details"]["traffic_sources"]
    assert isinstance(first_observation, dict)
    first_observation["observed_at"] = now.isoformat()
    second_status = {
        **first_status,
        "details": {
            "traffic_sources": {
                **first_observation,
                "observed_at": "2026-07-17T06:59:50+00:00",
            }
        },
    }
    context = db.filter_snapshot_contexts("workspace-a", ("cluster-a",))["cluster-a"]

    first = module.traffic_source_catalog(
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        context=context,
        status=first_status,
        deploy_allowed=True,
        now=now,
    )
    second = module.traffic_source_catalog(
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        context=context,
        status=second_status,
        deploy_allowed=True,
        now=now,
    )

    assert first.freshness == second.freshness == "live"
    assert first.capability_revision == second.capability_revision


def test_idempotent_replay_precedes_live_capability_revalidation(monkeypatch) -> None:
    client, commands = _client(monkeypatch)
    module = importlib.import_module("domains.traffic.router")
    receipt = CommandReceipt(
        command_id="cmd-traffic-existing",
        event_id="evt-existing",
        audit_event_id="evt-existing",
        correlation_id="corr-existing",
        status="completed",
    )

    async def replay(*_args, **_kwargs):
        return receipt

    async def stale_catalog(*_args, **_kwargs):
        raise AssertionError("a replay must not depend on a newer source observation")

    monkeypatch.setattr(module, "replay_resource_action_receipt", replay)
    monkeypatch.setattr(module, "_current_source_catalog", stale_catalog)
    response = client.post(
        "/traffic/source",
        headers={"Idempotency-Key": "traffic-source-replay"},
        json={
            "scope": {
                "workspace_id": "workspace-a",
                "cluster_id": "cluster-a",
                "namespaces": [],
                "freshness": "live",
            },
            "source_key": "hubble",
            "capability_revision": "0" * 64,
            "confirmation": True,
            "reason": "Retry the accepted source selection",
        },
    )

    assert response.status_code == 202
    assert response.json()["command_id"] == "cmd-traffic-existing"
    assert commands == []


def test_network_policy_evaluation_uses_exact_pod_identity_and_kubernetes_union_semantics(
    monkeypatch,
) -> None:
    client, _commands = _client(monkeypatch)
    query = (
        "/network-policies/evaluate?cluster=cluster-a"
        "&namespace=backend&pod_name=api-0&pod_uid=pod-api-uid"
        "&peer_namespace=frontend&peer_pod_name=web-0&peer_pod_uid=pod-web-uid"
        "&direction=ingress&port=8080&protocol=TCP"
    )

    allowed = client.get(query)
    wrong_uid = client.get(query.replace("pod-api-uid", "stale-pod-uid"))
    denied = client.get(query.replace("port=8080", "port=8443"))

    assert allowed.status_code == 200
    assert allowed.json()["verdict"] == "allowed"
    assert allowed.json()["coverage"] == {
        "state": "complete",
        "evaluated_count": 1,
        "returned_count": 1,
        "reason_codes": [],
    }
    assert allowed.json()["selecting_policies"][0]["resource"]["uid"] == "policy-uid"
    assert wrong_uid.status_code == 409
    assert denied.status_code == 200
    assert denied.json()["verdict"] == "denied"


def test_network_policy_batch_is_bounded() -> None:
    module = importlib.import_module("domains.traffic.network_policy")
    requests = [
        {
            "direction": "ingress",
            "port": 8080,
            "protocol": "TCP",
        }
        for _ in range(module.MAX_NETWORK_POLICY_EVALUATION_BATCH + 1)
    ]

    try:
        module.require_bounded_evaluation_batch(requests)
    except ValueError as error:
        assert "batch" in str(error)
    else:
        raise AssertionError("oversized NetworkPolicy evaluation batch was accepted")


class MissingNamespaceLabelsDb(TrafficControlDb):
    def get_inventory_resource_by_api_version(self, **query: object) -> dict[str, object] | None:
        if query.get("resource_type") == "namespace":
            return None
        return super().get_inventory_resource_by_api_version(**query)


class CiliumPolicyDb(TrafficControlDb):
    def list_inventory_resources_by_api_version(self, **query: object) -> list[dict[str, object]]:
        if query.get("resource_type") == "networkpolicy":
            return []
        if query.get("resource_type") != "ciliumnetworkpolicy":
            return []
        return [
            inventory_resource(
                resource_type="ciliumnetworkpolicy",
                api_version="cilium.io/v2",
                kind="CiliumNetworkPolicy",
                namespace="backend",
                name="api-policy",
                uid="cilium-policy-uid",
                raw={"spec": {"endpointSelector": {"matchLabels": {"app": "api"}}}},
            )
        ]


def test_network_policy_missing_namespace_labels_is_indeterminate(monkeypatch) -> None:
    client, _commands = _client(monkeypatch, db=MissingNamespaceLabelsDb())
    response = client.get(
        "/network-policies/evaluate?cluster=cluster-a"
        "&namespace=backend&pod_name=api-0&pod_uid=pod-api-uid"
        "&peer_namespace=frontend&peer_pod_name=web-0&peer_pod_uid=pod-web-uid"
        "&direction=ingress&port=8080&protocol=TCP"
    )

    assert response.status_code == 200
    assert response.json()["verdict"] == "indeterminate"
    assert response.json()["coverage"] == {
        "state": "partial",
        "evaluated_count": 1,
        "returned_count": 1,
        "reason_codes": ["network_policy_namespace_labels_unavailable"],
    }
    assert response.json()["selecting_policies"][0]["effect"] == "unknown"


def test_cilium_selecting_policy_is_reported_as_indeterminate(monkeypatch) -> None:
    client, _commands = _client(monkeypatch, db=CiliumPolicyDb())
    response = client.get(
        "/network-policies/evaluate?cluster=cluster-a"
        "&namespace=backend&pod_name=api-0&pod_uid=pod-api-uid"
        "&peer_namespace=frontend&peer_pod_name=web-0&peer_pod_uid=pod-web-uid"
        "&direction=ingress&port=8080&protocol=TCP"
    )

    assert response.status_code == 200
    assert response.json()["verdict"] == "indeterminate"
    assert response.json()["selecting_policies"][0]["resource"]["kind"] == ("CiliumNetworkPolicy")
    assert response.json()["coverage"]["reason_codes"] == ["cilium_network_policy_rule_unsupported"]
