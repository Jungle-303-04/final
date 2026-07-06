from __future__ import annotations

import asyncio
import re
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from domains.identity.dependencies import ClusterAgentIdentity, hash_agent_token
from domains.target.router import (
    KUBE_CONTEXT_NOT_ALLOWED,
    apply_manifest_with_kubectl,
    cluster_connection_status,
    get_cluster_connection_status,
    install_manifest_by_token,
    list_clusters,
    register_target,
    schedule_evidence_jobs,
    target_install_manifest,
    update_cluster_policy,
    validate_target_install_providers,
)
from packages.contracts.gateway.requests import (
    AgentPolicy,
    BootstrapPolicy,
    DesiredResource,
    EvidenceJobScheduleRequest,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
    TargetRegisterRequest,
)


class FakeDb:
    def __init__(self) -> None:
        self.registered: list[dict[str, object]] = []
        self.desired_states: list[dict[str, object]] = []
        self.policy: dict[str, object] | None = None

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

    def get_cluster_policy(self, _workspace_id: str, _cluster_id: str) -> dict[str, object] | None:
        return self.policy

    def upsert_cluster_policy(
        self,
        _workspace_id: str,
        _cluster_id: str,
        policy: dict[str, object],
    ) -> dict[str, object]:
        self.policy = policy
        return policy


class FakeEvents:
    def __init__(self) -> None:
        self.accepted: list[object] = []

    async def accept_body(self, body: object, *_args: object) -> object:
        self.accepted.append(body)
        return object()


class FakeEvidenceJobDb:
    def get_cluster_policy(self, _workspace_id: str, _cluster_id: str) -> None:
        return None

    def queue_evidence_jobs(self, **kwargs: object) -> dict[str, object]:
        return {
            "accepted": True,
            "evidence_key": (
                f"{kwargs['workspace_id']}:{kwargs['cluster_id']}:"
                f"{kwargs['source_id']}:{kwargs['window_start']}"
            ),
            "queued": len(kwargs["provider_keys"]),
            "job_ids": [f"job-{provider}" for provider in kwargs["provider_keys"]],
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


class FakeClusterDb:
    def __init__(self) -> None:
        self.access_filter: set[str] | None = None
        self.agent = {
            "workspace_id": "default",
            "cluster_id": "cluster-1",
            "agent_id": "agent-1",
            "status": "connected",
            "capabilities": ["inventory", "commands"],
            "details": {},
            "last_seen_at": datetime.now(UTC).isoformat(),
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        _resource_type: str,
        _permission: str,
    ) -> set[str]:
        return {"cluster-1"}

    def list_cluster_registrations(
        self,
        workspace_id: str,
        *,
        cluster_ids: set[str] | None,
        limit: int,
    ) -> list[dict[str, object]]:
        self.access_filter = cluster_ids
        assert workspace_id == "default"
        assert limit == 50
        return [
            {
                "workspace_id": "default",
                "cluster_id": "cluster-1",
                "name": "prod",
                "environment": "production",
                "status": "registered",
                "settings": {"cloud_provider": "existing-k8s"},
                "created_at": "2026-07-05T00:00:00+00:00",
                "updated_at": "2026-07-05T00:00:00+00:00",
            }
        ]

    def latest_cluster_agent_statuses(
        self,
        _workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        assert cluster_ids == {"cluster-1"}
        return {"cluster-1": self.agent}

    def can_access(
        self,
        _user_id: str,
        _workspace_id: str,
        _resource_type: str,
        resource_id: str,
        _permission: str,
    ) -> bool:
        return resource_id == "cluster-1"

    def list_cluster_agent_statuses(
        self,
        _workspace_id: str,
        cluster_id: str,
    ) -> list[dict[str, object]]:
        assert cluster_id == "cluster-1"
        return [self.agent]


def target_request() -> TargetRegisterRequest:
    return TargetRegisterRequest(
        cluster_id="target-cluster-01",
        name="local-target",
        environment="sandbox",
        workspace_id="default",
        management_base_url="http://management.local:30080",
        image="ghcr.io/acme/kubeheal-agent:test",
    )


def test_target_install_manifest_sets_agent_and_telemetry_config() -> None:
    manifest = target_install_manifest(target_request(), "agent-secret")

    assert "name: cluster-agent" in manifest
    assert "name: checkout-api" not in manifest
    assert "kind: DaemonSet" not in manifest
    assert "cluster-agent-target-manage" in manifest
    assert 'MANAGEMENT_BASE_URL\n              value: "http://management.local:30080"' in manifest
    assert 'PROMETHEUS_BASE_URL: "http://prometheus.target.svc:9090"' in manifest
    assert 'LOKI_BASE_URL: "http://loki-gateway.target.svc"' in manifest
    assert 'TEMPO_BASE_URL: "http://tempo.target.svc:3200"' in manifest
    assert (
        "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "
        '"http://opentelemetry-collector.target.svc:4318/v1/traces"'
    ) in manifest
    assert 'NODE_COLLECTOR_ENABLED: "true"' in manifest
    assert 'NODE_COLLECTOR_IMAGE: "ghcr.io/acme/kubeheal-agent:test"' in manifest
    assert 'AGENT_TOKEN: "agent-secret"' in manifest
    assert 'resources: ["services", "configmaps"]' in manifest
    assert 'verbs: ["get", "list", "create", "update", "patch"]' in manifest


def test_target_install_manifest_can_include_explicit_sample_workload() -> None:
    request = target_request().model_copy(
        update={
            "install_sample_workload": True,
            "sample_workload_name": "demo-api",
            "sample_workload_image": "ghcr.io/acme/demo-api:test",
        }
    )

    manifest = target_install_manifest(request, "agent-secret")

    assert 'name: "demo-api"' in manifest
    assert 'image: "ghcr.io/acme/demo-api:test"' in manifest


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
        "node-collector",
    }
    agent_state = next(item for item in db.desired_states if item["component"] == "cluster-agent")
    assert agent_state["spec"]["prometheus_base_url"] == "http://prometheus.target.svc:9090"
    assert agent_state["spec"]["loki_base_url"] == "http://loki-gateway.target.svc"
    assert agent_state["spec"]["tempo_base_url"] == "http://tempo.target.svc:3200"
    assert (
        agent_state["spec"]["otel_traces_endpoint"]
        == "http://opentelemetry-collector.target.svc:4318/v1/traces"
    )
    assert len(events.accepted) == 1
    assert events.accepted[0].cluster_id == "target-cluster-01"
    assert events.accepted[0].requested_by == "local-user"
    match = re.search(r'AGENT_TOKEN: "([^"]+)"', response.install_manifest)
    assert match is not None
    assert db.registered[0]["agent_token_hash"] == hash_agent_token(match.group(1))
    assert "agent_token" not in db.registered[0]
    assert db.policy is not None
    assert db.policy["cluster_id"] == "target-cluster-01"
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


def test_target_registration_apply_defaults_to_kube_context_provider(monkeypatch) -> None:
    db = FakeDb()
    events = FakeEvents()
    request = target_request().model_copy(update={"apply": True})

    def fake_apply(_manifest: str, _kube_context: str | None) -> str:
        return "applied"

    monkeypatch.setattr("domains.target.router.apply_manifest_with_kubectl", fake_apply)

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    response = asyncio.run(run())

    assert response.applied is True
    assert db.registered[0]["settings"]["deploy_provider"] == "kube-context"


def test_target_registration_rejects_explicit_manual_provider_for_direct_apply() -> None:
    request = target_request().model_copy(
        update={"apply": True, "deploy_provider": "manual-manifest"}
    )

    with pytest.raises(HTTPException) as exc:
        validate_target_install_providers(request)

    assert exc.value.status_code == 422
    assert "direct apply requires deploy_provider=kube-context" in exc.value.detail


def test_target_registration_rejects_unavailable_cloud_provider() -> None:
    request = target_request().model_copy(update={"cloud_provider": "gcp"})

    with pytest.raises(HTTPException) as exc:
        validate_target_install_providers(request)

    assert exc.value.status_code == 422
    assert "cloud provider 'gcp' unavailable" in exc.value.detail


def test_target_apply_requires_context_when_allowlist_is_configured(monkeypatch) -> None:
    monkeypatch.setenv("KUBE_CONTEXT_ALLOWLIST", "kind-target")

    with pytest.raises(HTTPException) as exc:
        apply_manifest_with_kubectl("apiVersion: v1\nkind: Namespace\nmetadata:\n  name: x\n", None)

    assert exc.value.status_code == 403
    assert exc.value.detail == KUBE_CONTEXT_NOT_ALLOWED


def test_evidence_job_schedule_route_delegates_to_management_store() -> None:
    async def run():
        return await schedule_evidence_jobs(
            EvidenceJobScheduleRequest(
                source_id="cluster-snapshot",
                window_start="2026-06-30T00:00:00+00:00",
                provider_keys=["metrics", "logs"],
            ),
            identity=ClusterAgentIdentity(
                workspace_id="trusted-workspace",
                cluster_id="trusted-cluster",
            ),
            db=FakeEvidenceJobDb(),
        )

    response = asyncio.run(run())

    assert response.evidence_key.startswith("trusted-workspace:trusted-cluster:")
    assert response.queued == 2
    assert response.job_ids == ["job-metrics", "job-logs"]


def test_cluster_connection_status_uses_last_seen_window(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_ONLINE_WINDOW_SECONDS", "120")

    assert cluster_connection_status(None) == "never_connected"
    assert cluster_connection_status({"last_seen_at": datetime.now(UTC).isoformat()}) == "online"
    assert (
        cluster_connection_status(
            {"last_seen_at": (datetime.now(UTC) - timedelta(seconds=300)).isoformat()}
        )
        == "stale"
    )


def test_cluster_list_uses_access_filter_and_agent_status() -> None:
    db = FakeClusterDb()

    async def run():
        return await list_clusters(
            limit=50,
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=db,
        )

    response = asyncio.run(run())

    assert db.access_filter == {"cluster-1"}
    assert len(response.clusters) == 1
    assert response.clusters[0].cluster_id == "cluster-1"
    assert response.clusters[0].connection_status == "online"
    assert response.clusters[0].last_agent_id == "agent-1"


def test_cluster_connection_status_route_returns_agent_details() -> None:
    async def run():
        return await get_cluster_connection_status(
            "cluster-1",
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=FakeClusterDb(),
        )

    response = asyncio.run(run())

    assert response.cluster_id == "cluster-1"
    assert response.connection_status == "online"
    assert response.last_agent_id == "agent-1"
    assert response.agents[0].capabilities == ["inventory", "commands"]


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


class TransactionalFakeDb(FakeDb):
    """unit_of_work 를 제공해 등록·정책·desired-state 쓰기가 한 트랜잭션인지 기록함."""

    def __init__(self) -> None:
        super().__init__()
        self.uow_active = False
        self.calls: list[tuple[str, bool]] = []

    @contextmanager
    def unit_of_work(self):
        self.uow_active = True
        try:
            yield self
        finally:
            self.uow_active = False

    def register_target_cluster(self, payload: dict[str, object]) -> dict[str, object]:
        self.calls.append(("register", self.uow_active))
        return super().register_target_cluster(payload)

    def upsert_cluster_policy(
        self,
        workspace_id: str,
        cluster_id: str,
        policy: dict[str, object],
    ) -> dict[str, object]:
        self.calls.append(("policy", self.uow_active))
        return super().upsert_cluster_policy(workspace_id, cluster_id, policy)

    def upsert_target_desired_states(
        self,
        workspace_id: str,
        cluster_id: str,
        components: list[dict[str, object]],
        updated_by: str | None,
    ) -> list[dict[str, object]]:
        self.calls.append(("desired_states", self.uow_active))
        return super().upsert_target_desired_states(
            workspace_id, cluster_id, components, updated_by
        )


class UowTrackingEvents(FakeEvents):
    def __init__(self, db: TransactionalFakeDb) -> None:
        super().__init__()
        self.db = db
        self.accepted_in_uow: list[bool] = []

    async def accept_body(self, body: object, *args: object) -> object:
        self.accepted_in_uow.append(self.db.uow_active)
        return await super().accept_body(body, *args)


def test_target_registration_wraps_writes_and_event_in_single_transaction() -> None:
    # 등록·정책·desired-state·이벤트 스테이징이 하나의 unit_of_work 안에서 실행돼야 함
    # (부분 실패 시 정책/desired-state 없는 반쪽 등록 고아 방지).
    db = TransactionalFakeDb()
    events = UowTrackingEvents(db)

    async def run():
        current = SimpleNamespace(user_id="admin-1", workspace_id="default")
        return await register_target(target_request(), current=current, db=db, events=events)

    response = asyncio.run(run())

    assert response.registered is True
    assert db.calls == [("register", True), ("policy", True), ("desired_states", True)]
    assert events.accepted_in_uow == [True]
    assert db.uow_active is False


class FakeInstallLinkDb:
    """원라인 인스톨러용 — 토큰 해시 대조 + 등록 설정 재조회만 제공."""

    def __init__(self, token: str, settings: dict[str, object]) -> None:
        self.token_hash = hash_agent_token(token)
        self.settings = settings

    def authenticate_cluster_agent(self, token_hash: str) -> dict[str, object] | None:
        if token_hash != self.token_hash:
            return None
        return {"workspace_id": "default", "cluster_id": "target-cluster-01"}

    def get_cluster_registration(
        self, workspace_id: str, cluster_id: str
    ) -> dict[str, object] | None:
        return {
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "settings": self.settings,
        }


def test_install_manifest_by_token_serves_same_manifest_as_registration() -> None:
    token = "install-token-1"
    settings = target_request().model_dump(exclude={"apply", "kube_context"})
    db = FakeInstallLinkDb(token, settings)

    response = asyncio.run(install_manifest_by_token(token, db=db))

    assert response.media_type == "text/yaml"
    body = response.body.decode()
    assert 'AGENT_TOKEN: "install-token-1"' in body
    assert "name: cluster-agent" in body
    assert body == target_install_manifest(target_request(), token)


def test_install_manifest_by_token_rejects_unknown_token() -> None:
    db = FakeInstallLinkDb(
        "real-token", target_request().model_dump(exclude={"apply", "kube_context"})
    )
    try:
        asyncio.run(install_manifest_by_token("wrong-token", db=db))
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("expected HTTPException")


def test_target_registration_returns_one_line_install_command() -> None:
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

    assert response.install_command.startswith(
        "curl -fsSL http://management.local:30080/api/install/"
    )
    assert response.install_command.endswith("| kubectl apply -f -")
    assert response.agent_token in response.install_command


def test_install_manifest_injects_control_namespaces_when_specified() -> None:
    request = target_request().model_copy(update={"control_namespaces": "sandbox,prod-web"})
    manifest = target_install_manifest(request, "agent-secret")
    assert 'CONTROL_ALLOWED_NAMESPACES: "sandbox,prod-web"' in manifest


def test_install_manifest_omits_control_namespaces_by_default() -> None:
    manifest = target_install_manifest(target_request(), "agent-secret")
    assert "CONTROL_ALLOWED_NAMESPACES" not in manifest
