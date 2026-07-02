from __future__ import annotations

import asyncio
import re
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from domains.identity.dependencies import ClusterAgentIdentity, hash_agent_token
from domains.target.router import (
    KUBE_CONTEXT_NOT_ALLOWED,
    apply_manifest_with_kubectl,
    lease_evidence_source,
    register_target,
    target_install_manifest,
    update_cluster_policy,
)
from packages.contracts.gateway.requests import (
    AgentPolicy,
    BootstrapPolicy,
    DesiredResource,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
    EvidenceSourceLeaseRequest,
    TargetRegisterRequest,
)


class FakeDb:
    def __init__(self) -> None:
        self.registered: list[dict[str, object]] = []
        self.desired_states: list[dict[str, object]] = []

    def register_target_cluster(self, payload: dict[str, object]) -> dict[str, object]:
        self.registered.append(payload)
        return payload

    def upsert_target_desired_states(
        self,
        workspace_id: str,
        cluster_id: str,
        components: list[dict[str, object]],
        updated_by: str | None,
    ) -> list[dict[str, object]]:
        self.desired_states.extend(
            {
                **component,
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "updated_by": updated_by,
            }
            for component in components
        )
        return self.desired_states


class FakeEvents:
    def __init__(self) -> None:
        self.accepted: list[object] = []

    async def accept_body(self, body: object, *_args: object) -> object:
        self.accepted.append(body)
        return object()


class FakeLeaseDb:
    def lease_evidence_source(
        self,
        cluster_id: str,
        workspace_id: str,
        source_id: str,
        agent_id: str,
        window_start: str,
        lease_seconds: int,
    ) -> dict[str, object]:
        return {
            "leased": True,
            "lease_id": f"{cluster_id}:{workspace_id}:{source_id}:{agent_id}:{window_start}:{lease_seconds}",
            "leased_until": "2026-06-30T00:00:30+00:00",
        }


class FakePolicyDb:
    def __init__(self, existing: AgentPolicy) -> None:
        self.current = existing.model_dump()
        self.saved: list[dict[str, object]] = []

    def get_cluster_policy(self, workspace_id: str, cluster_id: str) -> dict[str, object]:
        assert workspace_id == "default"
        assert cluster_id == "cluster-1"
        return self.current

    def upsert_cluster_policy(
        self,
        workspace_id: str,
        cluster_id: str,
        policy: dict[str, object],
    ) -> dict[str, object]:
        assert workspace_id == "default"
        assert cluster_id == "cluster-1"
        self.current = policy
        self.saved.append(policy)
        return policy


def target_request() -> TargetRegisterRequest:
    return TargetRegisterRequest(
        cluster_id="target-cluster-01",
        name="local-target",
        environment="sandbox",
        workspace_id="default",
        management_base_url="http://management.local:30080",
        image="service:local",
    )


def test_target_register_request_requires_management_base_url() -> None:
    with pytest.raises(ValidationError):
        TargetRegisterRequest(management_base_url="")


def test_target_install_manifest_sets_agent_and_telemetry_config() -> None:
    manifest = target_install_manifest(target_request(), "agent-secret")

    assert "name: cluster-agent" in manifest
    assert "name: checkout-api" in manifest
    assert "kind: DaemonSet" not in manifest
    assert "cluster-agent-target-manage" in manifest
    assert 'MANAGEMENT_BASE_URL\n              value: "http://management.local:30080"' in manifest
    assert 'PROMETHEUS_BASE_URL: "http://fake-prometheus:8000"' in manifest
    assert 'LOKI_BASE_URL: "http://fake-loki:8000"' in manifest
    assert 'NODE_COLLECTOR_ENABLED: "true"' in manifest
    assert 'NODE_COLLECTOR_IMAGE: "service:local"' in manifest
    assert 'AGENT_TOKEN: "agent-secret"' in manifest
    assert 'resources: ["services", "configmaps"]' in manifest
    assert 'verbs: ["get", "list", "create", "update", "patch"]' in manifest


def test_target_registration_records_cluster_and_returns_install_manifest() -> None:
    db = FakeDb()
    events = FakeEvents()

    async def run():
        return await register_target(
            target_request(),
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    response = asyncio.run(run())

    assert response.registered is True
    assert response.applied is False
    assert response.install_manifest
    assert db.registered[0]["cluster_id"] == "target-cluster-01"
    assert db.registered[0]["user_id"] == "local-user"
    assert db.registered[0]["workspace_id"] == "default"
    assert {item["component"] for item in db.desired_states} == {
        "cluster-agent",
        "fake-telemetry",
        "node-collector",
    }
    assert len(events.accepted) == 1
    assert events.accepted[0].cluster_id == "target-cluster-01"
    assert events.accepted[0].requested_by == "local-user"
    match = re.search(r'AGENT_TOKEN: "([^"]+)"', response.install_manifest)
    assert match is not None
    assert db.registered[0]["agent_token_hash"] == hash_agent_token(match.group(1))
    assert "agent_token" not in db.registered[0]
    # 응답의 agent_token 은 매니페스트에 주입된 원문과 동일(대시보드가 x-agent-token 으로 사용)
    assert response.agent_token == match.group(1)


def test_target_registration_apply_failure_does_not_record_state(monkeypatch) -> None:
    db = FakeDb()
    events = FakeEvents()
    request = target_request().model_copy(update={"apply": True})

    def fail_apply(_manifest: str, _kube_context: str | None) -> str:
        raise HTTPException(status_code=502, detail="apply failed")

    monkeypatch.setattr("domains.target.router.apply_manifest_with_kubectl", fail_apply)

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    with pytest.raises(HTTPException):
        asyncio.run(run())

    assert db.registered == []
    assert db.desired_states == []
    assert events.accepted == []


def test_target_apply_requires_context_when_allowlist_is_configured(monkeypatch) -> None:
    monkeypatch.setenv("KUBE_CONTEXT_ALLOWLIST", "kind-target")

    with pytest.raises(HTTPException) as exc:
        apply_manifest_with_kubectl("apiVersion: v1\nkind: Namespace\nmetadata:\n  name: x\n", None)

    assert exc.value.status_code == 403
    assert exc.value.detail == KUBE_CONTEXT_NOT_ALLOWED


def test_evidence_source_lease_route_delegates_to_management_store() -> None:
    async def run():
        return await lease_evidence_source(
            "prometheus.default",
            EvidenceSourceLeaseRequest(
                cluster_id="cluster-1",
                workspace_id="workspace-1",
                agent_id="agent-1",
                window_start="2026-06-30T00:00:00+00:00",
                lease_seconds=30,
            ),
            identity=ClusterAgentIdentity(
                workspace_id="trusted-workspace",
                cluster_id="trusted-cluster",
            ),
            db=FakeLeaseDb(),
        )

    response = asyncio.run(run())

    assert response.leased is True
    assert str(response.lease_id).startswith("trusted-cluster:trusted-workspace:")
    assert "prometheus.default" in str(response.lease_id)


def test_cluster_policy_update_preserves_existing_unset_fields() -> None:
    existing_policy = AgentPolicy(
        cluster_id="cluster-1",
        generation=1,
        evidence=EvidenceRuntimePolicy(
            failure_policy="strict",
            providers={
                "metrics": EvidenceProviderPolicy(interval_seconds=10),
                "logs": EvidenceProviderPolicy(interval_seconds=20),
            },
        ),
        bootstrap=BootstrapPolicy(
            resources=[
                DesiredResource(
                    resource_id="target-agent-policy",
                    kind="ConfigMap",
                    namespace="target",
                    name="target-agent-policy",
                )
            ]
        ),
    )
    db = FakePolicyDb(existing_policy)
    partial_update = AgentPolicy(
        cluster_id="cluster-1",
        generation=2,
        evidence=EvidenceRuntimePolicy(
            providers={"logs": EvidenceProviderPolicy(interval_seconds=45)}
        ),
    )

    response = asyncio.run(
        update_cluster_policy(
            "cluster-1",
            partial_update,
            current=SimpleNamespace(workspace_id="default"),
            db=db,
        )
    )

    merged = AgentPolicy.model_validate(response["policy"])
    assert merged.generation == 2
    assert merged.evidence.failure_policy == "strict"
    assert merged.evidence.providers["metrics"].interval_seconds == 10
    assert merged.evidence.providers["logs"].interval_seconds == 45
    assert merged.bootstrap.resources[0].resource_id == "target-agent-policy"
