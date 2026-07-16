from __future__ import annotations

import asyncio
import re
import subprocess
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml
from fastapi import HTTPException
from fastapi.routing import APIRoute

from domains.identity.dependencies import (
    ClusterAgentIdentity,
    hash_agent_token,
    require_admin_session,
)
from domains.target.router import (
    EXTERNAL_ACCESS_REQUIRED,
    KUBE_CONTEXT_NOT_ALLOWED,
    MANAGEMENT_BASE_URL_NOT_CONFIGURED,
    apply_manifest_with_kubectl,
    cluster_connection_stage,
    cluster_connection_status,
    cluster_summary,
    connect_cluster,
    get_cluster_connection,
    get_cluster_connection_status,
    get_cluster_scheduling_profiles,
    install_manifest_by_token,
    list_clusters,
    normalize_target_provider_defaults,
    register_target,
    reissue_cluster_connect_command,
    router,
    schedule_evidence_jobs,
    target_install_manifest,
    target_registration_preflight,
    unregister_cluster,
    update_cluster_policy,
    update_cluster_scheduling_profiles,
    validate_target_bootstrap_config,
    validate_target_install_providers,
    visible_cluster_agent_statuses,
)
from packages.contracts.gateway.requests import (
    AgentPolicy,
    BootstrapPolicy,
    ClusterConnectRequest,
    DesiredResource,
    EvidenceJobScheduleRequest,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
    SchedulingPolicy,
    SchedulingProfile,
    SchedulingSelector,
    TargetPreflightRequest,
    TargetRegisterRequest,
)
from packages.contracts.gateway.responses import ClusterSummary


class StubDb:
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


class StubEvents:
    def __init__(self) -> None:
        self.accepted: list[object] = []

    async def accept_body(self, body: object, *_args: object) -> object:
        self.accepted.append(body)
        return object()


class StubEvidenceJobDb:
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


class StubPolicyDb:
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


class StubManagementPolicyDb(StubPolicyDb):
    def __init__(self) -> None:
        super().__init__(AgentPolicy(cluster_id="cluster-1", cluster_role="management"))

    def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, object]:
        assert workspace_id == "default"
        assert cluster_id == "cluster-1"
        return {
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "settings": {"cluster_role": "management"},
        }


class StubUnregisterDb:
    def __init__(
        self,
        *,
        cluster_role: str = "target",
        environment: str = "production",
    ) -> None:
        self.cluster_role = cluster_role
        self.environment = environment
        self.unregistered: list[tuple[str, str]] = []
        self.purged: list[tuple[str, str]] = []

    def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, object]:
        return {
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "environment": self.environment,
            "settings": {"cluster_role": self.cluster_role},
        }

    def unregister_target_cluster(self, workspace_id: str, cluster_id: str) -> bool:
        self.unregistered.append((workspace_id, cluster_id))
        return True

    def list_cluster_agent_statuses(
        self, _workspace_id: str, _cluster_id: str
    ) -> list[dict[str, object]]:
        return []

    def purge_test_target_cluster_registration(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> bool:
        self.purged.append((workspace_id, cluster_id))
        return True


class TransactionalStubPurgeDb(StubUnregisterDb):
    """테스트 fixture purge가 저장소 UoW 안에서 실행되는지 기록함."""

    def __init__(
        self,
        *,
        cluster_role: str = "target",
        environment: str = "test",
    ) -> None:
        super().__init__(cluster_role=cluster_role, environment=environment)
        self.uow_active = False
        self.uow_count = 0
        self.purge_uow_states: list[bool] = []

    @contextmanager
    def unit_of_work(self):
        self.uow_count += 1
        self.uow_active = True
        try:
            yield self
        finally:
            self.uow_active = False

    def purge_test_target_cluster_registration(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> bool:
        self.purge_uow_states.append(self.uow_active)
        return super().purge_test_target_cluster_registration(workspace_id, cluster_id)


class StubClusterDb:
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

    def count_open_rca_incidents(
        self,
        _workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, int]:
        assert cluster_ids == {"cluster-1"}
        return {"cluster-1": 3}

    def inventory_resource_counts(
        self,
        _workspace_id: str,
        cluster_id: str,
    ) -> list[dict[str, object]]:
        assert cluster_id == "cluster-1"
        return [
            {"resource_type": "node", "health": "healthy", "count": 2},
            {"resource_type": "pod", "health": "healthy", "count": 9},
        ]

    def latest_inventory_snapshots(
        self,
        _workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        assert cluster_ids == {"cluster-1"}
        return {"cluster-1": self.latest_inventory_snapshot("default", "cluster-1")}

    def latest_inventory_snapshot(
        self,
        _workspace_id: str,
        cluster_id: str,
    ) -> dict[str, object]:
        assert cluster_id == "cluster-1"
        return {
            "snapshot_id": "snapshot-1",
            "agent_id": "agent-1",
            "summary": {"detected_provider": "eks"},
            "created_at": (datetime.now(UTC) - timedelta(seconds=30)).isoformat(),
        }

    def get_cluster_registration(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> dict[str, object] | None:
        assert workspace_id == "default"
        if cluster_id != "cluster-1":
            return None
        return {
            "workspace_id": "default",
            "cluster_id": "cluster-1",
            "name": "prod",
            "environment": "production",
            "status": "registered",
            "settings": {"cloud_provider": "existing-k8s"},
            "created_at": "2026-07-05T00:00:00+00:00",
            "updated_at": "2026-07-05T00:00:00+00:00",
        }

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


class StubPreflightDb(StubClusterDb):
    def get_cluster_registration(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> dict[str, object] | None:
        if workspace_id == "default" and cluster_id == "cluster-1":
            return {
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "name": "prod",
                "environment": "production",
                "status": "registered",
                "settings": {"cloud_provider": "existing-k8s"},
            }
        return None

    def list_cluster_agent_statuses(
        self,
        _workspace_id: str,
        cluster_id: str,
    ) -> list[dict[str, object]]:
        return [self.agent] if cluster_id == "cluster-1" else []


class StubPendingClusterDb(StubClusterDb):
    def __init__(self, expires_at: str) -> None:
        super().__init__()
        self.expires_at = expires_at

    def list_cluster_agent_statuses(
        self,
        _workspace_id: str,
        _cluster_id: str,
    ) -> list[dict[str, object]]:
        return []

    def get_cluster_registration(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> dict[str, object] | None:
        assert workspace_id == "default"
        assert cluster_id == "cluster-1"
        return {
            "workspace_id": "default",
            "cluster_id": "cluster-1",
            "name": "prod",
            "environment": "production",
            "status": "pending_install",
            "settings": {
                "cloud_provider": "existing-k8s",
                "connect_timeout_seconds": 1800,
                "connect_expires_at": self.expires_at,
            },
            "created_at": "2026-07-05T00:00:00+00:00",
            "updated_at": "2026-07-05T00:00:00+00:00",
        }


def target_request() -> TargetRegisterRequest:
    return TargetRegisterRequest(
        cluster_id="target-cluster-01",
        name="local-target",
        environment="sandbox",
        workspace_id="default",
        management_base_url="http://management.local:30080",
        image="ghcr.io/acme/kubeheal-agent:test",
    )


def assert_guarded_install_command(
    command: str,
    *,
    cluster_id: str,
    manifest_url_prefix: str,
) -> None:
    assert "\n" not in command
    assert command.startswith('existing="$(kubectl -n target get configmap ')
    assert "jsonpath='{.data.TARGET_CLUSTER_ID}'" in command
    assert f'[ "$existing" != {cluster_id} ]' in command
    assert "Opsia agent is already registered as" in command
    assert f"curl -fsSL {manifest_url_prefix}" in command
    assert command.endswith("| kubectl apply -f -")


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
    assert 'NODE_CONTROL_ENABLED: "true"' in manifest
    assert "name: cluster-agent-node-control" in manifest
    assert 'resources: ["nodes"]\n    verbs: ["get", "patch"]' in manifest
    assert 'REALTIME_GATEWAY_URL: "ws://management.local:30080"' in manifest
    assert (
        'name: REALTIME_GATEWAY_URL\n              value: "ws://management.local:30080"' in manifest
    )
    assert 'NODE_COLLECTOR_IMAGE: "ghcr.io/acme/kubeheal-agent:test"' in manifest
    assert 'AGENT_TOKEN: "agent-secret"' in manifest
    assert 'apiGroups: ["metrics.k8s.io"]' in manifest
    assert 'resources: ["pods", "nodes"]' in manifest
    assert 'resources: ["services"]' in manifest
    assert 'resources: ["configmaps"]' in manifest
    assert 'verbs: ["get", "list", "create", "update", "patch"]' in manifest
    assert 'verbs: ["get", "list", "create", "update", "patch", "delete"]' in manifest


def test_target_uninstall_rbac_is_exact_name_scoped_and_cannot_delete_namespaces() -> None:
    docs = [
        doc
        for doc in yaml.safe_load_all(target_install_manifest(target_request(), "agent-secret"))
        if doc
    ]
    role = next(
        doc
        for doc in docs
        if doc.get("kind") == "ClusterRole"
        and doc.get("metadata", {}).get("name") == "cluster-agent-uninstall"
    )

    assert all(rule.get("resourceNames") for rule in role["rules"])
    assert all("namespaces" not in rule.get("resources", []) for rule in role["rules"])
    assert all("pods" not in rule.get("resources", []) for rule in role["rules"])
    assert all(rule["verbs"] == ["delete"] for rule in role["rules"])


def test_target_install_manifest_uses_agent_proxy_root_for_secure_realtime() -> None:
    request = target_request().model_copy(
        update={"management_base_url": "https://opsia.example.com/api"}
    )

    manifest = target_install_manifest(request, "agent-secret")

    assert 'REALTIME_GATEWAY_URL: "wss://opsia.example.com"' in manifest
    assert 'name: REALTIME_GATEWAY_URL\n              value: "wss://opsia.example.com"' in manifest
    assert 'REALTIME_GATEWAY_URL: "wss://opsia.example.com/api"' not in manifest
    assert ":30090" not in manifest


def test_target_rca_cleanup_delete_permission_is_limited_to_owned_manifest_kinds() -> None:
    manifest = target_install_manifest(target_request(), "agent-secret")
    docs = [doc for doc in yaml.safe_load_all(manifest) if doc]
    sandbox_role = next(
        doc
        for doc in docs
        if doc.get("kind") == "Role"
        and doc.get("metadata", {}).get("name") == "cluster-agent-sandbox-write"
    )
    delete_rules = [rule for rule in sandbox_role["rules"] if "delete" in rule.get("verbs", [])]

    assert {
        (tuple(rule.get("apiGroups", [])), tuple(rule.get("resources", [])))
        for rule in delete_rules
    } == {
        (("",), ("services",)),
        (("apps",), ("deployments",)),
    }


def test_static_target_manifest_keeps_the_same_minimal_rca_cleanup_permissions() -> None:
    manifest_path = Path(__file__).resolve().parents[1] / "deploy/target/target.yaml"
    docs = [doc for doc in yaml.safe_load_all(manifest_path.read_text()) if doc]
    sandbox_role = next(
        doc
        for doc in docs
        if doc.get("kind") == "Role"
        and doc.get("metadata", {}).get("name") == "cluster-agent-sandbox-write"
    )
    delete_rules = [rule for rule in sandbox_role["rules"] if "delete" in rule.get("verbs", [])]

    assert {
        (tuple(rule.get("apiGroups", [])), tuple(rule.get("resources", [])))
        for rule in delete_rules
    } == {
        (("",), ("services",)),
        (("apps",), ("deployments",)),
    }


@pytest.mark.parametrize(
    "manifest",
    [
        target_install_manifest(target_request(), "agent-secret"),
        (Path(__file__).resolve().parents[1] / "deploy/target/target.yaml").read_text(
            encoding="utf-8"
        ),
    ],
)
def test_target_catalog_install_rbac_is_namespaced_to_rendered_helm_resources(
    manifest: str,
) -> None:
    docs = [doc for doc in yaml.safe_load_all(manifest) if doc]
    role = next(
        doc
        for doc in docs
        if doc.get("kind") == "Role"
        and doc.get("metadata", {}).get("name") == "cluster-agent-catalog-install"
    )

    assert role["metadata"]["namespace"] == "sandbox"
    assert {(tuple(rule["apiGroups"]), tuple(rule["resources"])) for rule in role["rules"]} == {
        (("",), ("configmaps", "secrets", "serviceaccounts", "services")),
        (("apps",), ("statefulsets",)),
        (("networking.k8s.io",), ("networkpolicies",)),
        (("policy",), ("poddisruptionbudgets",)),
    }
    for rule in role["rules"]:
        assert rule["verbs"] == ["get", "list", "watch", "create", "update", "patch", "delete"]


@pytest.mark.parametrize("registration_environment", ["test", "aws-test"])
def test_target_install_manifest_enables_rca_test_actions_only_for_test_registrations(
    monkeypatch: pytest.MonkeyPatch,
    registration_environment: str,
) -> None:
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", "1")
    request = target_request().model_copy(update={"environment": registration_environment})

    manifest = target_install_manifest(request, "agent-secret")

    assert "APP_ENV:" not in manifest
    assert 'RCA_TEST_RUNS_ENABLED: "1"' in manifest


@pytest.mark.parametrize(
    ("enabled", "registration_environment"),
    [
        ("0", "test"),
        ("1", "sandbox"),
        ("1", "production"),
    ],
)
def test_target_install_manifest_does_not_enable_rca_test_actions_without_both_guards(
    monkeypatch: pytest.MonkeyPatch,
    enabled: str,
    registration_environment: str,
) -> None:
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", enabled)
    request = target_request().model_copy(update={"environment": registration_environment})

    manifest = target_install_manifest(request, "agent-secret")

    assert "APP_ENV:" not in manifest
    assert "RCA_TEST_RUNS_ENABLED:" not in manifest


def test_management_install_manifest_is_read_only() -> None:
    request = target_request().model_copy(update={"cluster_role": "management"})

    manifest = target_install_manifest(request, "agent-secret")

    assert "namespace: management" in manifest
    assert 'CLUSTER_ROLE: "management"' in manifest
    assert 'BOOTSTRAP_MODE: "management"' in manifest
    assert 'NODE_COLLECTOR_ENABLED: "false"' in manifest
    assert 'REALTIME_GATEWAY_URL: "ws://management.local:30080"' in manifest
    assert "cluster-agent-sandbox-write" not in manifest
    assert "cluster-agent-catalog-install" not in manifest
    assert "cluster-agent-target-manage" not in manifest
    assert "cluster-agent-uninstall" not in manifest
    assert "cluster-agent-node-control" not in manifest
    assert 'NODE_CONTROL_ENABLED: "false"' in manifest
    assert 'verbs: ["get", "update", "patch"]' not in manifest
    assert 'verbs: ["get", "list", "create", "update", "patch"]' not in manifest
    assert 'verbs: ["get", "list", "watch"]' in manifest
    assert 'apiGroups: ["metrics.k8s.io"]' in manifest
    assert 'verbs: ["get", "list"]' in manifest
    docs = [doc for doc in yaml.safe_load_all(manifest) if doc]
    read_role = next(doc for doc in docs if doc.get("kind") == "ClusterRole")
    argo_rule = next(
        rule for rule in read_role["rules"] if "argoproj.io" in rule.get("apiGroups", [])
    )
    assert set(argo_rule["resources"]) == {"applications", "rollouts"}
    assert argo_rule["verbs"] == ["get", "list"]


@pytest.mark.parametrize(
    "manifest_path",
    [
        "deploy/target/target.yaml",
        "deploy/management/target-agent.yaml",
        "deploy/oss/kubeheal-oss.yaml",
    ],
)
def test_static_agent_manifests_grant_argocd_read_only(manifest_path: str) -> None:
    root = Path(__file__).resolve().parents[1]
    docs = [doc for doc in yaml.safe_load_all((root / manifest_path).read_text()) if doc]
    read_roles = [doc for doc in docs if doc.get("kind") == "ClusterRole"]
    argo_rules = [
        rule
        for role in read_roles
        for rule in role.get("rules", [])
        if "argoproj.io" in rule.get("apiGroups", [])
    ]

    assert len(argo_rules) == 1
    assert set(argo_rules[0]["resources"]) == {"applications", "rollouts"}
    assert argo_rules[0]["verbs"] == ["get", "list"]
    forbidden = {"create", "update", "patch", "delete", "deletecollection", "apply"}
    assert forbidden.isdisjoint(argo_rules[0]["verbs"])


def test_static_management_agent_manifest_is_read_only() -> None:
    manifest_path = Path(__file__).resolve().parents[1] / "deploy/management/target-agent.yaml"
    docs = [doc for doc in yaml.safe_load_all(manifest_path.read_text()) if doc]
    forbidden_verbs = {"create", "update", "patch", "delete", "deletecollection", "apply"}

    for doc in docs:
        if doc.get("kind") not in {"Role", "ClusterRole"}:
            continue
        verbs = {verb for rule in doc.get("rules", []) for verb in rule.get("verbs", [])}
        assert verbs.isdisjoint(forbidden_verbs)

    read_role = next(doc for doc in docs if doc.get("kind") == "ClusterRole")
    metrics_rule = next(
        rule for rule in read_role["rules"] if "metrics.k8s.io" in rule.get("apiGroups", [])
    )
    apps_rule = next(rule for rule in read_role["rules"] if "apps" in rule.get("apiGroups", []))
    discovery_rule = next(
        rule for rule in read_role["rules"] if "discovery.k8s.io" in rule.get("apiGroups", [])
    )
    deployment = next(doc for doc in docs if doc.get("kind") == "Deployment")
    env = {
        item["name"]: item
        for item in deployment["spec"]["template"]["spec"]["containers"][0]["env"]
    }
    assert env["TARGET_CLUSTER_ID"]["valueFrom"]["configMapKeyRef"] == {
        "name": "management-runtime-config",
        "key": "MANAGEMENT_CLUSTER_ID",
    }
    assert set(apps_rule["resources"]) == {
        "deployments",
        "replicasets",
        "controllerrevisions",
        "daemonsets",
        "statefulsets",
    }
    assert discovery_rule["resources"] == ["endpointslices"]
    assert metrics_rule["resources"] == ["pods", "nodes"]
    assert metrics_rule["verbs"] == ["get", "list"]

    deployment = next(doc for doc in docs if doc.get("kind") == "Deployment")
    env = {
        item["name"]: item.get("value")
        for item in deployment["spec"]["template"]["spec"]["containers"][0]["env"]
    }
    env_raw = {
        item["name"]: item
        for item in deployment["spec"]["template"]["spec"]["containers"][0]["env"]
    }
    assert env["CLUSTER_ROLE"] == "management"
    assert env["REALTIME_GATEWAY_URL"] == (
        "ws://realtime-gateway.management.svc.cluster.local:8000"
    )
    assert env["NODE_COLLECTOR_ENABLED"] == "false"
    assert env["PROMETHEUS_BASE_URL"] == ""
    assert env["LOKI_BASE_URL"] == ""
    assert env["TEMPO_BASE_URL"] == ""
    assert env["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] == ""
    assert env_raw["AGENT_TOKEN"]["valueFrom"]["secretKeyRef"] == {
        "name": "target-runtime-secret",
        "key": "AGENT_TOKEN",
    }


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
    assert "priorityClassName: gitops-demo-fast" in manifest
    assert "terminationGracePeriodSeconds: 1" in manifest


def test_target_registration_records_cluster_and_returns_install_manifest() -> None:
    db = StubDb()
    events = StubEvents()

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
    assert "kind: PriorityClass" in response.install_manifest
    assert "priorityClassName: gitops-control-critical" in response.install_manifest
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
    assert response.status == "pending_install"
    assert response.connection_stage == "token_issued"
    assert response.connect_timeout_seconds == 1800
    assert response.connect_expires_at is not None
    assert db.registered[0]["status"] == "pending_install"
    assert db.registered[0]["settings"]["connect_timeout_seconds"] == 1800
    assert db.registered[0]["settings"]["connect_expires_at"] == response.connect_expires_at


def test_management_registration_defaults_to_kubernetes_evidence_only() -> None:
    db = StubDb()
    events = StubEvents()
    request = target_request().model_copy(
        update={
            "cluster_id": "kubernetes-ops",
            "cluster_role": "management",
            "environment": "management",
        }
    )

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    response = asyncio.run(run())

    assert response.install_manifest
    assert "http://prometheus.target.svc:9090" not in response.install_manifest
    assert "http://loki-gateway.target.svc" not in response.install_manifest
    assert "http://tempo.target.svc:3200" not in response.install_manifest
    assert (
        "http://opentelemetry-collector.target.svc:4318/v1/traces" not in response.install_manifest
    )
    agent_state = next(item for item in db.desired_states if item["component"] == "cluster-agent")
    assert agent_state["spec"]["prometheus_base_url"] == ""
    assert agent_state["spec"]["loki_base_url"] == ""
    assert agent_state["spec"]["tempo_base_url"] == ""
    assert db.policy is not None
    providers = db.policy["evidence"]["providers"]
    assert providers["kubernetes"]["enabled"] is True
    assert providers["kubernetes"]["queries"] == [
        {
            "name": "management_namespace_snapshot",
            "description": (
                "Kubernetes pods, events, nodes, workloads, services, and endpoint slices "
                "in the management namespace."
            ),
            "query": "management",
        },
        {
            "name": "cluster_wide_event_capture",
            "description": "Paginated all-namespace Kubernetes Event capture with coverage proof.",
            "query": "*",
            "collection_scope": "cluster_events",
        },
        {
            "name": "cluster_api_discovery",
            "description": "Discover authorized Kubernetes API resources and CRD identities.",
            "query": "*",
            "collection_scope": "cluster_discovery",
        },
        {
            "name": "cluster_access_snapshot",
            "description": "Collect complete bounded Kubernetes RBAC reverse-lookup evidence.",
            "query": "*",
            "collection_scope": "cluster_access",
        },
    ]
    assert all(
        provider_key == "kubernetes" or provider["enabled"] is False
        for provider_key, provider in providers.items()
    )
    assert agent_state["spec"]["otel_traces_endpoint"] == ""
    policy = AgentPolicy.model_validate(db.policy)
    enabled = {
        provider_key
        for provider_key, provider_policy in policy.evidence.providers.items()
        if provider_policy.enabled
    }
    assert enabled == {"kubernetes"}


def test_target_registration_generates_cluster_id_when_missing(monkeypatch) -> None:
    monkeypatch.setattr("domains.target.router.secrets.randbelow", lambda _max: 42)
    db = StubDb()
    events = StubEvents()
    request = target_request().model_copy(update={"cluster_id": None, "name": "Customer Prod"})

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    response = asyncio.run(run())

    assert response.cluster_id == "customer-prod-0042"
    assert db.registered[0]["cluster_id"] == "customer-prod-0042"


def test_target_registration_returns_provider_bootstrap_command() -> None:
    db = StubDb()
    events = StubEvents()
    request = target_request().model_copy(
        update={
            "cloud_provider": "eks",
            "provider_config": {
                "region": "ap-northeast-2",
                "eks_cluster_name": "prod cluster",
                "context_alias": "prod ctx",
            },
        }
    )

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    response = asyncio.run(run())

    assert response.bootstrap_command.startswith("aws eks update-kubeconfig")
    assert "--name 'prod cluster'" in response.bootstrap_command
    assert "kubectl --context 'prod ctx' get nodes" in response.bootstrap_command
    assert response.agent_token in response.bootstrap_command
    assert response.bootstrap_steps[1].command == response.bootstrap_command


def test_target_registration_rejects_missing_provider_config_before_write() -> None:
    db = StubDb()
    events = StubEvents()
    request = target_request().model_copy(
        update={"cloud_provider": "eks", "provider_config": {"region": "ap-northeast-2"}}
    )

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 422
    assert "eks_cluster_name" in exc.value.detail
    assert db.registered == []
    assert events.accepted == []


def test_target_bootstrap_config_rejects_invalid_gke_location_type() -> None:
    request = target_request().model_copy(
        update={
            "cloud_provider": "gke",
            "provider_config": {
                "project_id": "project-1",
                "location_type": "metro",
                "location": "asia-northeast3",
                "gke_cluster_name": "prod",
            },
        }
    )

    with pytest.raises(HTTPException) as exc:
        validate_target_bootstrap_config(request)

    assert exc.value.status_code == 422
    assert exc.value.detail == "provider_config.location_type must be region or zone"


def test_target_registration_apply_failure_does_not_record_state(monkeypatch) -> None:
    db = StubDb()
    events = StubEvents()
    request = target_request().model_copy(update={"apply": True})
    apply_calls: list[tuple[str, str | None]] = []

    def fail_apply(manifest: str, kube_context: str | None) -> str:
        apply_calls.append((manifest, kube_context))
        raise HTTPException(status_code=502, detail="apply failed")

    monkeypatch.setattr(
        "domains.target.router.kube_context_connectivity_error",
        lambda _kube_context: None,
    )
    monkeypatch.setattr("domains.target.router.apply_manifest_with_kubectl", fail_apply)

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 502
    assert exc.value.detail == "apply failed"
    assert len(apply_calls) == 1
    assert apply_calls[0][1] is None
    assert db.registered == []
    assert db.desired_states == []
    assert events.accepted == []


def test_target_registration_apply_defaults_to_kube_context_provider(monkeypatch) -> None:
    db = StubDb()
    events = StubEvents()
    request = target_request().model_copy(update={"apply": True})
    apply_calls: list[tuple[str, str | None]] = []

    def stub_apply(manifest: str, kube_context: str | None) -> str:
        apply_calls.append((manifest, kube_context))
        return "applied"

    monkeypatch.setattr(
        "domains.target.router.kube_context_connectivity_error",
        lambda _kube_context: None,
    )
    monkeypatch.setattr("domains.target.router.apply_manifest_with_kubectl", stub_apply)

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    response = asyncio.run(run())

    assert response.applied is True
    assert len(apply_calls) == 1
    assert apply_calls[0][1] is None
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
            db=StubEvidenceJobDb(),
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


def test_visible_cluster_agent_statuses_keeps_only_online_agents(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_ONLINE_WINDOW_SECONDS", "120")
    now = datetime.now(UTC)
    agents = [
        {"agent_id": "current", "last_seen_at": now.isoformat()},
        {
            "agent_id": "rolling",
            "last_seen_at": (now - timedelta(seconds=30)).isoformat(),
        },
        {"agent_id": "old", "last_seen_at": (now - timedelta(hours=1)).isoformat()},
    ]

    assert [agent["agent_id"] for agent in visible_cluster_agent_statuses(agents)] == [
        "current",
        "rolling",
    ]


def test_visible_cluster_agent_statuses_keeps_latest_when_all_are_stale(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_ONLINE_WINDOW_SECONDS", "120")
    now = datetime.now(UTC)
    agents = [
        {"agent_id": "latest", "last_seen_at": (now - timedelta(minutes=5)).isoformat()},
        {"agent_id": "old", "last_seen_at": (now - timedelta(hours=1)).isoformat()},
    ]

    assert visible_cluster_agent_statuses(agents) == agents[:1]


def test_cluster_list_uses_access_filter_and_agent_status() -> None:
    db = StubClusterDb()

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
    assert response.clusters[0].provider == "eks"
    assert response.clusters[0].connection_stage == "ready"
    assert response.clusters[0].last_agent_id == "agent-1"
    assert response.clusters[0].node_count == 2
    assert response.clusters[0].server_count == 2
    assert response.clusters[0].pod_count == 9
    assert response.clusters[0].incident_count == 3
    assert response.clusters[0].open_incidents == 3
    assert response.clusters[0].app_count is None
    assert response.clusters[0].last_seen_at == db.agent["last_seen_at"]


def test_cluster_connect_returns_only_server_generated_one_line_command(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_MANAGEMENT_BASE_URL", "https://opsia.example.com/api")
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")
    db = StubDb()

    async def run():
        return await connect_cluster(
            ClusterConnectRequest(name="new production", provider="aws"),
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=db,
            events=StubEvents(),
        )

    response = asyncio.run(run())

    assert response.cluster_id.startswith("new-production-")
    assert_guarded_install_command(
        response.install_command,
        cluster_id=response.cluster_id,
        manifest_url_prefix="https://opsia.example.com/api/install/",
    )
    assert response.expires_at
    assert db.registered[0]["settings"]["provider_config"] == {"provider_hint": "eks"}


def test_cluster_connect_request_rejects_whitespace_only_name() -> None:
    with pytest.raises(ValueError):
        ClusterConnectRequest(name="   ", provider="onprem")


def test_cluster_connect_rejects_duplicate_workspace_display_name_before_issuing_token(
    monkeypatch,
) -> None:
    monkeypatch.setenv("PUBLIC_MANAGEMENT_BASE_URL", "https://opsia.example.com/api")
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")

    class DuplicateNameDb(StubDb):
        def list_cluster_registrations(
            self,
            workspace_id: str,
            *,
            cluster_ids: set[str] | None = None,
            limit: int = 100,
        ) -> list[dict[str, object]]:
            assert workspace_id == "default"
            assert cluster_ids is None
            assert limit >= 1
            return [{"cluster_id": "existing", "name": "  PRODUCTION  ", "status": "registered"}]

    db = DuplicateNameDb()

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            connect_cluster(
                ClusterConnectRequest(name="Production", provider="aws"),
                current=SimpleNamespace(user_id="user-1", workspace_id="default"),
                db=db,
                events=StubEvents(),
            )
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "cluster_name_conflict"
    assert db.registered == []


def test_reissue_cluster_connect_command_rotates_token_for_existing_pending_registration(
    monkeypatch,
) -> None:
    monkeypatch.setenv("PUBLIC_MANAGEMENT_BASE_URL", "https://opsia.example.com/api")
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")

    class ReissueDb(StubDb):
        def __init__(self) -> None:
            super().__init__()
            self.rotated: list[dict[str, object]] = []

        def get_cluster_registration(
            self,
            workspace_id: str,
            cluster_id: str,
        ) -> dict[str, object] | None:
            assert workspace_id == "default"
            assert cluster_id == "pending-cluster"
            return {
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "name": "Production",
                "environment": "development",
                "status": "install_expired",
                "settings": TargetRegisterRequest(
                    cluster_id=cluster_id,
                    name="Production",
                    environment="development",
                    cloud_provider="existing-k8s",
                    deploy_provider="manual-manifest",
                    provider_config={"provider_hint": "eks"},
                ).model_dump(exclude={"apply", "kube_context"}),
            }

        def list_cluster_agent_statuses(
            self,
            workspace_id: str,
            cluster_id: str,
        ) -> list[dict[str, object]]:
            assert (workspace_id, cluster_id) == ("default", "pending-cluster")
            return []

        def reissue_target_cluster_install(
            self,
            workspace_id: str,
            cluster_id: str,
            *,
            agent_token_hash: str,
            settings: dict[str, object],
        ) -> bool:
            self.rotated.append(
                {
                    "workspace_id": workspace_id,
                    "cluster_id": cluster_id,
                    "agent_token_hash": agent_token_hash,
                    "settings": settings,
                }
            )
            return True

    db = ReissueDb()
    response = asyncio.run(
        reissue_cluster_connect_command(
            "pending-cluster",
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=db,
        )
    )

    assert response.cluster_id == "pending-cluster"
    assert_guarded_install_command(
        response.install_command,
        cluster_id="pending-cluster",
        manifest_url_prefix="https://opsia.example.com/api/install/",
    )
    assert response.expires_at
    assert len(db.rotated) == 1
    assert db.rotated[0]["agent_token_hash"]
    assert "connect_expires_at" in db.rotated[0]["settings"]


def test_cluster_connect_status_maps_online_agent_without_inventing_metadata() -> None:
    db = StubClusterDb()

    async def run():
        return await get_cluster_connection(
            "cluster-1",
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=db,
        )

    response = asyncio.run(run())

    assert response.status == "connected"
    assert response.agent_version is None
    assert response.connected_at is None


def test_cluster_connection_status_route_returns_agent_details() -> None:
    async def run():
        return await get_cluster_connection_status(
            "cluster-1",
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubClusterDb(),
        )

    response = asyncio.run(run())

    assert response.cluster_id == "cluster-1"
    assert response.connection_status == "online"
    assert response.connection_stage == "ready"
    assert response.refresh_after_seconds == 0.5
    assert response.last_agent_id == "agent-1"
    assert response.agents[0].capabilities == ["inventory", "commands"]


def test_cluster_connection_status_reports_pending_install_before_ttl() -> None:
    expires_at = (datetime.now(UTC) + timedelta(minutes=20)).isoformat()

    async def run():
        return await get_cluster_connection_status(
            "cluster-1",
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubPendingClusterDb(expires_at),
        )

    response = asyncio.run(run())

    assert response.connection_status == "pending_install"
    assert response.connection_stage == "awaiting_install"
    assert response.refresh_after_seconds == 0.5
    assert response.connect_timeout_seconds == 1800
    assert response.connect_expires_at == expires_at


def test_cluster_connection_status_reports_install_expired_after_ttl() -> None:
    expires_at = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()

    async def run():
        return await get_cluster_connection_status(
            "cluster-1",
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubPendingClusterDb(expires_at),
        )

    response = asyncio.run(run())

    assert response.connection_status == "install_expired"
    assert response.connection_stage == "expired"
    assert response.refresh_after_seconds is None


def test_cluster_summary_registered_provider_overrides_detected_provider() -> None:
    now = datetime.now(UTC)
    summary = cluster_summary(
        {
            "workspace_id": "default",
            "cluster_id": "cluster-1",
            "name": "prod",
            "environment": "production",
            "status": "registered",
            "settings": {"cloud_provider": "gke"},
            "updated_at": (now - timedelta(minutes=5)).isoformat(),
        },
        {
            "agent_id": "agent-1",
            "status": "connected",
            "last_seen_at": now.isoformat(),
        },
        latest_snapshot={
            "agent_id": "agent-1",
            "summary": {"detected_provider": "eks"},
            "created_at": (now - timedelta(minutes=1)).isoformat(),
        },
    )

    assert summary.provider == "gke"
    assert summary.connection_stage == "ready"


def test_cluster_summary_generic_registration_falls_back_to_onprem() -> None:
    summary = cluster_summary(
        {
            "workspace_id": "default",
            "cluster_id": "cluster-1",
            "name": "local",
            "environment": "development",
            "status": "pending_install",
            "settings": {"cloud_provider": "existing-k8s"},
        },
        None,
        latest_snapshot=None,
    )

    assert summary.provider == "onprem"
    assert summary.connection_stage == "awaiting_install"
    assert summary.server_count is None
    assert summary.pod_count is None
    assert summary.app_count is None
    assert summary.open_incidents is None
    assert summary.last_seen_at is None


def test_cluster_connection_stage_uses_current_snapshot_and_later_heartbeat() -> None:
    now = datetime.now(UTC)
    registration = {
        "status": "registered",
        "updated_at": (now - timedelta(minutes=5)).isoformat(),
    }
    agent = {
        "agent_id": "agent-1",
        "status": "connected",
        "last_seen_at": (now - timedelta(seconds=20)).isoformat(),
    }

    assert cluster_connection_stage(registration, agent, None) == "agent_connected"
    assert (
        cluster_connection_stage(
            registration,
            agent,
            {
                "agent_id": "agent-1",
                "created_at": (now - timedelta(seconds=10)).isoformat(),
            },
        )
        == "snapshot_received"
    )
    assert (
        cluster_connection_stage(
            registration,
            {**agent, "last_seen_at": now.isoformat()},
            {
                "agent_id": "agent-1",
                "created_at": (now - timedelta(seconds=10)).isoformat(),
            },
        )
        == "ready"
    )


def test_cluster_connection_stage_rejects_old_epoch_snapshot_and_stale_agent() -> None:
    now = datetime.now(UTC)
    registration = {
        "status": "registered",
        "updated_at": (now - timedelta(minutes=2)).isoformat(),
    }
    current_agent = {
        "agent_id": "agent-1",
        "status": "connected",
        "last_seen_at": now.isoformat(),
    }
    old_snapshot = {
        "agent_id": "agent-1",
        "created_at": (now - timedelta(minutes=3)).isoformat(),
    }

    assert cluster_connection_stage(registration, current_agent, old_snapshot) == "agent_connected"
    assert (
        cluster_connection_stage(
            registration,
            {**current_agent, "last_seen_at": (now - timedelta(hours=1)).isoformat()},
            None,
        )
        == "error"
    )


def test_cluster_summary_additive_fields_accept_legacy_payload() -> None:
    legacy = ClusterSummary.model_validate(
        {
            "workspace_id": "default",
            "cluster_id": "cluster-1",
            "name": "legacy",
            "environment": "production",
            "status": "registered",
            "settings": {},
            "connection_status": "online",
        }
    )

    assert legacy.provider is None
    assert legacy.connection_stage is None


def test_target_registration_preflight_reports_duplicate_and_agent_status(monkeypatch) -> None:
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://k8s.woonyong.org")

    async def run():
        return await target_registration_preflight(
            TargetPreflightRequest(
                cluster_id="cluster-1",
                cloud_provider="existing-k8s",
                deploy_provider="manual-manifest",
            ),
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubPreflightDb(),
        )

    response = asyncio.run(run())

    assert response.valid is False
    assert response.duplicate_cluster_id is True
    assert response.provider_ready is True
    assert response.agent_install_status == "online"
    assert response.last_agent_id == "agent-1"
    assert "cluster_id is already registered" in response.errors


def test_target_registration_preflight_accepts_new_ready_provider(monkeypatch) -> None:
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://k8s.woonyong.org")

    async def run():
        return await target_registration_preflight(
            TargetPreflightRequest(
                cluster_id="new-cluster",
                cloud_provider="existing-k8s",
                deploy_provider="manual-manifest",
            ),
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubPreflightDb(),
        )

    response = asyncio.run(run())

    assert response.valid is True
    assert response.duplicate_cluster_id is False
    assert response.provider_ready is True
    assert response.agent_install_status == "not_registered"
    assert response.errors == []


def test_target_registration_preflight_reports_self_only_access_contract(monkeypatch) -> None:
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")
    monkeypatch.setenv("PUBLIC_MANAGEMENT_BASE_URL", "http://opsia.opsia-system.svc")
    monkeypatch.setenv("OPSIA_ACCESS_MODE", "portforward")
    monkeypatch.setenv("OPSIA_EXTERNAL_URL", "")

    async def run():
        return await target_registration_preflight(
            TargetPreflightRequest(
                cluster_id="self-cluster",
                cloud_provider="existing-k8s",
                deploy_provider="manual-manifest",
            ),
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubPreflightDb(),
        )

    response = asyncio.run(run())

    assert response.valid is False
    assert "external access URL is required to enroll another cluster" in response.errors
    assert response.management_access.model_dump() == {
        "mode": "portforward",
        "external_url": None,
        "agent_server_url": "http://opsia.opsia-system.svc",
        "reachability": "self_only",
        "limitation_reason": "external_url_not_configured",
    }


def test_self_only_preflight_allows_management_cluster(monkeypatch) -> None:
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")
    monkeypatch.setenv("PUBLIC_MANAGEMENT_BASE_URL", "http://opsia.opsia-system.svc")
    monkeypatch.setenv("OPSIA_ACCESS_MODE", "portforward")
    monkeypatch.setenv("OPSIA_EXTERNAL_URL", "")

    async def run():
        return await target_registration_preflight(
            TargetPreflightRequest(
                cluster_id="self-cluster",
                cluster_role="management",
                cloud_provider="existing-k8s",
                deploy_provider="manual-manifest",
            ),
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubPreflightDb(),
        )

    response = asyncio.run(run())

    assert response.valid is True
    assert EXTERNAL_ACCESS_REQUIRED not in response.errors


def test_target_registration_preflight_tolerates_display_fields(monkeypatch) -> None:
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://k8s.woonyong.org")

    async def run():
        return await target_registration_preflight(
            TargetPreflightRequest(
                cluster_id="new-cluster",
                name="테스트",
                environment="dev",
                cloud_provider="kind",
                deploy_provider="manual-manifest",
                provider_config={"local_provider": "kind", "kind_cluster_name": "new-cluster"},
            ),
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubPreflightDb(),
        )

    response = asyncio.run(run())

    assert response.valid is True
    assert response.errors == []


def test_target_registration_preflight_requires_management_base_url(monkeypatch) -> None:
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")
    monkeypatch.delenv("PUBLIC_MANAGEMENT_BASE_URL", raising=False)
    monkeypatch.delenv("PUBLIC_API_BASE_URL", raising=False)
    monkeypatch.delenv("PUBLIC_BASE_URL", raising=False)

    async def run():
        return await target_registration_preflight(
            TargetPreflightRequest(
                cluster_id="new-cluster",
                cloud_provider="existing-k8s",
                deploy_provider="manual-manifest",
            ),
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubPreflightDb(),
        )

    response = asyncio.run(run())

    assert response.valid is False
    assert MANAGEMENT_BASE_URL_NOT_CONFIGURED in response.errors


def test_target_registration_preflight_checks_direct_apply_connectivity(monkeypatch) -> None:
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://k8s.woonyong.org")
    monkeypatch.setenv("KUBE_CONTEXT_ALLOWLIST", "cluster-1")
    monkeypatch.setattr("domains.target.router.shutil.which", lambda _name: "/usr/bin/kubectl")
    calls: list[list[str]] = []

    def stub_run(command, **_kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, stdout='{"gitVersion":"v1"}', stderr="")

    monkeypatch.setattr("domains.target.router.subprocess.run", stub_run)

    async def run():
        return await target_registration_preflight(
            TargetPreflightRequest(
                cluster_id="new-cluster",
                cloud_provider="existing-k8s",
                deploy_provider="kube-context",
                apply=True,
                kube_context="cluster-1",
            ),
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubPreflightDb(),
        )

    response = asyncio.run(run())

    assert response.valid is True
    assert response.kube_context_allowed is True
    assert response.errors == []
    assert calls == [
        ["kubectl", "--context", "cluster-1", "get", "--raw=/version", "--request-timeout=5s"]
    ]


def test_target_registration_preflight_rejects_unreachable_direct_apply_context(
    monkeypatch,
) -> None:
    monkeypatch.setenv("TARGET_AGENT_IMAGE", "ghcr.io/acme/kubeheal-agent:test")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://k8s.woonyong.org")
    monkeypatch.setenv("KUBE_CONTEXT_ALLOWLIST", "cluster-1")
    monkeypatch.setattr("domains.target.router.shutil.which", lambda _name: "/usr/bin/kubectl")

    def stub_run(command, **_kwargs):
        return subprocess.CompletedProcess(command, 1, stdout="", stderr="cluster unreachable")

    monkeypatch.setattr("domains.target.router.subprocess.run", stub_run)

    async def run():
        return await target_registration_preflight(
            TargetPreflightRequest(
                cluster_id="new-cluster",
                cloud_provider="existing-k8s",
                deploy_provider="kube-context",
                apply=True,
                kube_context="cluster-1",
            ),
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=StubPreflightDb(),
        )

    response = asyncio.run(run())

    assert response.valid is False
    assert response.kube_context_allowed is True
    assert any("kubernetes preflight connection failed" in error for error in response.errors)


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
    db = StubPolicyDb(existing_policy)
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


def test_cluster_scheduling_profiles_update_is_selector_based() -> None:
    db = StubPolicyDb(AgentPolicy(cluster_id="cluster-1", generation=3))
    scheduling = SchedulingPolicy(
        profiles=[
            SchedulingProfile(
                profile_id="fast-lane",
                selector=SchedulingSelector(
                    namespaces=["sandbox", "payments"],
                    labels={"app.kubernetes.io/part-of": "checkout"},
                ),
                priority_class_name="gitops-demo-fast",
                placement_mode="preferred",
                preferred_node_labels={"workload-tier": "demo-fast"},
                pre_pull_images=["ghcr.io/example/orders-api:v1"],
                termination_grace_period_seconds=1,
            )
        ]
    )

    response = asyncio.run(
        update_cluster_scheduling_profiles(
            "cluster-1",
            scheduling,
            current=SimpleNamespace(workspace_id="default"),
            db=db,
        )
    )

    stored = AgentPolicy.model_validate(db.saved[-1])
    assert response.accepted is True
    assert response.scheduling["profiles"][0]["profile_id"] == "fast-lane"
    assert stored.generation == 4
    assert stored.scheduling.profiles[0].selector.namespaces == ["sandbox", "payments"]
    assert stored.scheduling.profiles[0].preferred_node_labels == {"workload-tier": "demo-fast"}


def test_cluster_scheduling_profile_requires_selector() -> None:
    with pytest.raises(ValueError, match="selector"):
        SchedulingProfile(profile_id="global-fast-lane")


def test_cluster_scheduling_profiles_read_returns_policy_section() -> None:
    db = StubPolicyDb(
        AgentPolicy(
            cluster_id="cluster-1",
            scheduling=SchedulingPolicy(
                profiles=[
                    SchedulingProfile(
                        profile_id="fast-lane",
                        selector=SchedulingSelector(namespaces=["sandbox"]),
                    )
                ]
            ),
        )
    )
    db.can_access = lambda *_args: True  # type: ignore[attr-defined]

    response = asyncio.run(
        get_cluster_scheduling_profiles(
            "cluster-1",
            current=SimpleNamespace(user_id="user-1", workspace_id="default"),
            db=db,
        )
    )

    assert response.cluster_id == "cluster-1"
    assert response.scheduling["profiles"][0]["selector"]["namespaces"] == ["sandbox"]


def test_management_scheduling_profile_update_is_rejected() -> None:
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            update_cluster_scheduling_profiles(
                "cluster-1",
                SchedulingPolicy(
                    profiles=[
                        SchedulingProfile(
                            profile_id="fast-lane",
                            selector=SchedulingSelector(namespaces=["management"]),
                        )
                    ]
                ),
                current=SimpleNamespace(workspace_id="default"),
                db=StubManagementPolicyDb(),
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "management_readonly"


def test_management_policy_update_rejects_write_policy() -> None:
    write_update = AgentPolicy(
        cluster_id="cluster-1",
        generation=2,
        cluster_role="management",
        bootstrap=BootstrapPolicy(
            mode="management",
            resources=[
                DesiredResource(
                    resource_id="write-config",
                    kind="ConfigMap",
                    namespace="management",
                    name="target-agent-policy",
                    action="apply",
                )
            ],
        ),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            update_cluster_policy(
                "cluster-1",
                write_update,
                current=SimpleNamespace(workspace_id="default"),
                db=StubManagementPolicyDb(),
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "management_readonly"


def test_management_policy_update_rejects_scheduling_policy() -> None:
    scheduling_update = AgentPolicy(
        cluster_id="cluster-1",
        generation=2,
        cluster_role="management",
        scheduling=SchedulingPolicy(
            profiles=[
                SchedulingProfile(
                    profile_id="ops-fast",
                    selector=SchedulingSelector(namespaces=["management"]),
                )
            ]
        ),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            update_cluster_policy(
                "cluster-1",
                scheduling_update,
                current=SimpleNamespace(workspace_id="default"),
                db=StubManagementPolicyDb(),
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "management_readonly"


def test_management_policy_update_allows_read_only_evidence_change() -> None:
    db = StubManagementPolicyDb()
    read_only_update = AgentPolicy(
        cluster_id="cluster-1",
        generation=2,
        evidence=EvidenceRuntimePolicy(
            providers={"kubernetes": EvidenceProviderPolicy(interval_seconds=90)}
        ),
    )

    response = asyncio.run(
        update_cluster_policy(
            "cluster-1",
            read_only_update,
            current=SimpleNamespace(workspace_id="default"),
            db=db,
        )
    )

    merged = AgentPolicy.model_validate(response["policy"])
    assert merged.cluster_role == "management"
    assert merged.bootstrap.resources == []
    assert merged.desired_state.resources == []
    assert merged.scheduling.profiles == []
    assert merged.evidence.providers["kubernetes"].interval_seconds == 90


def test_cluster_unregister_route_requires_admin_session() -> None:
    route = next(
        route
        for route in router.routes
        if isinstance(route, APIRoute)
        and route.path == "/clusters/{cluster_id}"
        and "DELETE" in route.methods
    )

    assert any(
        dependency.call is require_admin_session for dependency in route.dependant.dependencies
    )


def test_management_cluster_unregister_is_rejected() -> None:
    db = StubUnregisterDb(cluster_role="management")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            unregister_cluster(
                "cluster-1",
                current=SimpleNamespace(workspace_id="default"),
                db=db,
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "management_readonly"
    assert db.unregistered == []
    assert db.purged == []


def test_management_cluster_purge_is_rejected_even_in_test_environment(monkeypatch) -> None:
    monkeypatch.setenv("TEST_FIXTURE_PURGE_ENABLED", "1")
    db = TransactionalStubPurgeDb(cluster_role="management")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            unregister_cluster(
                "cluster-1",
                purge=True,
                current=SimpleNamespace(workspace_id="default"),
                db=db,
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "management_readonly"
    assert db.unregistered == []
    assert db.purged == []


def test_target_cluster_unregister_updates_registration() -> None:
    db = StubUnregisterDb(cluster_role="target")

    asyncio.run(
        unregister_cluster(
            "cluster-1",
            manual_cleanup_attested=True,
            current=SimpleNamespace(workspace_id="default"),
            db=db,
        )
    )

    assert db.unregistered == [("default", "cluster-1")]
    assert db.purged == []


def test_explicit_purge_false_keeps_soft_delete_compatibility(monkeypatch) -> None:
    monkeypatch.setenv("TEST_FIXTURE_PURGE_ENABLED", "1")
    db = TransactionalStubPurgeDb(environment="test")

    asyncio.run(
        unregister_cluster(
            "cluster-1",
            purge=False,
            manual_cleanup_attested=True,
            current=SimpleNamespace(workspace_id="default"),
            db=db,
        )
    )

    assert db.unregistered == [("default", "cluster-1")]
    assert db.purged == []
    assert db.uow_count == 0


def test_offline_target_requires_actual_cleanup_before_registration_revocation() -> None:
    db = StubUnregisterDb(cluster_role="target")

    response = asyncio.run(
        unregister_cluster(
            "cluster-1",
            current=SimpleNamespace(workspace_id="default", user_id="admin"),
            db=db,
        )
    )

    assert response.status == "cleanup_required"
    assert response.stage == "manual_cleanup_required"
    assert "kubectl delete -n target deployment/cluster-agent" in response.uninstall_command
    assert "namespace/target" not in response.uninstall_command
    assert "namespace/sandbox" not in response.uninstall_command
    assert db.unregistered == []


class OnlineUnregisterDb(StubUnregisterDb):
    def __init__(self) -> None:
        super().__init__(cluster_role="target")
        self.queued: list[dict[str, object]] = []

    def list_cluster_agent_statuses(
        self, workspace_id: str, cluster_id: str
    ) -> list[dict[str, object]]:
        return [
            {
                "workspace_id": workspace_id,
                "cluster_id": cluster_id,
                "agent_id": "agent-1",
                "last_seen_at": datetime.now(UTC).isoformat(),
            }
        ]

    def queue_agent_command(
        self, correlation_id: str, plan: dict[str, object], status: str
    ) -> bool:
        self.queued.append({"correlation_id": correlation_id, "plan": plan, "status": status})
        return True


def test_online_target_queues_agent_cleanup_and_keeps_registration_until_confirmation() -> None:
    db = OnlineUnregisterDb()

    response = asyncio.run(
        unregister_cluster(
            "cluster-1",
            current=SimpleNamespace(workspace_id="default", user_id="admin"),
            db=db,
        )
    )

    assert response.status == "uninstalling"
    assert response.stage == "agent_cleanup_queued"
    assert response.command_id.startswith("cmd-uninstall-")
    assert response.command_status_path == f"/commands/{response.command_id}"
    assert db.queued[0]["plan"]["action"] == "cluster.agent.uninstall"
    assert db.unregistered == []


@pytest.mark.parametrize(
    ("purge_enabled", "registration_environment"),
    [
        ("0", "test"),
        ("1", "production"),
        ("1", "TEST"),
    ],
)
def test_purge_rejects_non_test_environment_boundary(
    monkeypatch,
    purge_enabled: str,
    registration_environment: str,
) -> None:
    monkeypatch.setenv("TEST_FIXTURE_PURGE_ENABLED", purge_enabled)
    db = TransactionalStubPurgeDb(environment=registration_environment)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            unregister_cluster(
                "cluster-1",
                purge=True,
                current=SimpleNamespace(workspace_id="default"),
                db=db,
            )
        )

    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "test_fixture_purge_forbidden"
    assert db.unregistered == []
    assert db.purged == []


def test_test_fixture_purge_is_explicit_transactional_and_prefix_independent(monkeypatch) -> None:
    monkeypatch.setenv("TEST_FIXTURE_PURGE_ENABLED", "1")
    db = TransactionalStubPurgeDb(environment="test")

    asyncio.run(
        unregister_cluster(
            "customer-prod-0042",
            purge=True,
            current=SimpleNamespace(workspace_id="default"),
            db=db,
        )
    )

    assert db.unregistered == []
    assert db.purged == [("default", "customer-prod-0042")]
    assert db.uow_count == 1
    assert db.purge_uow_states == [True]


class TransactionalStubDb(StubDb):
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


class UowTrackingEvents(StubEvents):
    def __init__(self, db: TransactionalStubDb) -> None:
        super().__init__()
        self.db = db
        self.accepted_in_uow: list[bool] = []

    async def accept_body(self, body: object, *args: object) -> object:
        self.accepted_in_uow.append(self.db.uow_active)
        return await super().accept_body(body, *args)


def test_target_registration_wraps_writes_and_event_in_single_transaction() -> None:
    # 등록·정책·desired-state·이벤트 스테이징이 하나의 unit_of_work 안에서 실행돼야 함
    # (부분 실패 시 정책/desired-state 없는 반쪽 등록 고아 방지).
    db = TransactionalStubDb()
    events = UowTrackingEvents(db)

    async def run():
        current = SimpleNamespace(user_id="admin-1", workspace_id="default")
        return await register_target(target_request(), current=current, db=db, events=events)

    response = asyncio.run(run())

    assert response.registered is True
    assert db.calls == [("register", True), ("policy", True), ("desired_states", True)]
    assert events.accepted_in_uow == [True]
    assert db.uow_active is False


class StubInstallLinkDb:
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
    db = StubInstallLinkDb(token, settings)

    response = asyncio.run(install_manifest_by_token(token, db=db))

    assert response.media_type == "text/yaml"
    assert response.headers.get("cache-control") == "no-store"
    body = response.body.decode()
    assert 'AGENT_TOKEN: "install-token-1"' in body
    assert "name: cluster-agent" in body
    assert body == target_install_manifest(target_request(), token)


def test_install_manifest_by_token_rejects_unknown_token() -> None:
    db = StubInstallLinkDb(
        "real-token", target_request().model_dump(exclude={"apply", "kube_context"})
    )
    try:
        asyncio.run(install_manifest_by_token("wrong-token", db=db))
    except HTTPException as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("expected HTTPException")


def test_target_registration_returns_one_line_install_command() -> None:
    db = StubDb()
    events = StubEvents()

    async def run():
        return await register_target(
            target_request(),
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    response = asyncio.run(run())

    assert_guarded_install_command(
        response.install_command,
        cluster_id="target-cluster-01",
        manifest_url_prefix="http://management.local:30080/api/install/",
    )
    assert response.agent_token in response.install_command


def test_target_registration_uses_public_base_url_when_request_omits_management_url(
    monkeypatch,
) -> None:
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://k8s.woonyong.org")
    db = StubDb()
    events = StubEvents()
    request = target_request().model_copy(update={"management_base_url": ""})

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    response = asyncio.run(run())

    assert_guarded_install_command(
        response.install_command,
        cluster_id="target-cluster-01",
        manifest_url_prefix="https://k8s.woonyong.org/api/install/",
    )
    assert db.registered[0]["settings"]["management_base_url"] == "https://k8s.woonyong.org/api"


def test_deployment_external_url_overrides_untrusted_registration_url(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_MANAGEMENT_BASE_URL", "https://opsia.example.com")
    monkeypatch.setenv("OPSIA_ACCESS_MODE", "ingress")
    monkeypatch.setenv("OPSIA_EXTERNAL_URL", "https://opsia.example.com")
    db = StubDb()
    events = StubEvents()
    request = target_request().model_copy(update={"management_base_url": "http://localhost:8080"})

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    response = asyncio.run(run())

    assert_guarded_install_command(
        response.install_command,
        cluster_id="target-cluster-01",
        manifest_url_prefix="https://opsia.example.com/api/install/",
    )
    assert "localhost" not in response.install_command
    assert db.registered[0]["settings"]["management_base_url"] == "https://opsia.example.com/api"
    assert response.management_access.model_dump() == {
        "mode": "ingress",
        "external_url": "https://opsia.example.com",
        "agent_server_url": "https://opsia.example.com",
        "reachability": "external",
        "limitation_reason": None,
    }


def test_self_only_deployment_rejects_remote_cluster_registration(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_MANAGEMENT_BASE_URL", "http://opsia.opsia-system.svc")
    monkeypatch.setenv("OPSIA_ACCESS_MODE", "portforward")
    monkeypatch.setenv("OPSIA_EXTERNAL_URL", "")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            register_target(
                target_request(),
                current=SimpleNamespace(user_id="local-user", workspace_id="default"),
                db=StubDb(),
                events=StubEvents(),
            )
        )

    assert exc.value.status_code == 422
    assert exc.value.detail == "external access URL is required to enroll another cluster"


@pytest.mark.parametrize(
    "unsafe_url",
    [
        "file:///etc/passwd",
        "https://user@opsia.example.com",
        "https://opsia.example.com/path",
        "https://opsia.example.com?next=evil",
    ],
)
def test_target_registration_rejects_unsafe_management_url(monkeypatch, unsafe_url: str) -> None:
    monkeypatch.delenv("PUBLIC_MANAGEMENT_BASE_URL", raising=False)
    monkeypatch.delenv("PUBLIC_API_BASE_URL", raising=False)
    monkeypatch.delenv("PUBLIC_BASE_URL", raising=False)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            register_target(
                target_request().model_copy(update={"management_base_url": unsafe_url}),
                current=SimpleNamespace(user_id="local-user", workspace_id="default"),
                db=StubDb(),
                events=StubEvents(),
            )
        )

    assert exc.value.status_code == 422
    assert exc.value.detail == MANAGEMENT_BASE_URL_NOT_CONFIGURED


def test_target_registration_rejects_missing_management_url(monkeypatch) -> None:
    monkeypatch.delenv("PUBLIC_MANAGEMENT_BASE_URL", raising=False)
    monkeypatch.delenv("PUBLIC_API_BASE_URL", raising=False)
    monkeypatch.delenv("PUBLIC_BASE_URL", raising=False)
    db = StubDb()
    events = StubEvents()
    request = target_request().model_copy(update={"management_base_url": ""})

    async def run():
        return await register_target(
            request,
            current=SimpleNamespace(user_id="local-user", workspace_id="default"),
            db=db,
            events=events,
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 422
    assert exc.value.detail == MANAGEMENT_BASE_URL_NOT_CONFIGURED


def test_install_manifest_injects_control_namespaces_when_specified() -> None:
    request = target_request().model_copy(update={"control_namespaces": "sandbox,prod-web"})
    manifest = target_install_manifest(request, "agent-secret")
    assert 'CONTROL_ALLOWED_NAMESPACES: "sandbox,prod-web"' in manifest
    assert 'POD_EXEC_ALLOWED_NAMESPACES: "sandbox,prod-web"' in manifest

    docs = [document for document in yaml.safe_load_all(manifest) if document]
    cronjob_roles = [
        document
        for document in docs
        if document.get("kind") == "Role"
        and document.get("metadata", {}).get("name") == "cluster-agent-cronjob-control"
    ]
    cronjob_bindings = [
        document
        for document in docs
        if document.get("kind") == "RoleBinding"
        and document.get("metadata", {}).get("name") == "cluster-agent-cronjob-control"
    ]
    assert {role["metadata"]["namespace"] for role in cronjob_roles} == {
        "sandbox",
        "prod-web",
    }
    assert {binding["metadata"]["namespace"] for binding in cronjob_bindings} == {
        "sandbox",
        "prod-web",
    }
    for role in cronjob_roles:
        assert role["rules"] == [
            {"apiGroups": ["batch"], "resources": ["jobs"], "verbs": ["create"]},
            {"apiGroups": ["batch"], "resources": ["cronjobs"], "verbs": ["patch"]},
        ]


def test_install_manifest_omits_control_namespaces_by_default() -> None:
    manifest = target_install_manifest(target_request(), "agent-secret")
    assert "CONTROL_ALLOWED_NAMESPACES" not in manifest
    assert 'POD_EXEC_ALLOWED_NAMESPACES: "sandbox"' in manifest


@pytest.mark.parametrize(
    "manifest",
    [
        target_install_manifest(target_request(), "agent-secret"),
        (Path(__file__).resolve().parents[1] / "deploy/target/target.yaml").read_text(
            encoding="utf-8"
        ),
    ],
)
def test_target_manifest_packages_exact_cronjob_read_and_control_rbac(manifest: str) -> None:
    docs = [document for document in yaml.safe_load_all(manifest) if document]
    read_role = next(
        document
        for document in docs
        if document.get("kind") == "ClusterRole"
        and document.get("metadata", {}).get("name") == "cluster-agent-read"
    )
    batch_read = next(rule for rule in read_role["rules"] if rule.get("apiGroups") == ["batch"])
    assert batch_read == {
        "apiGroups": ["batch"],
        "resources": ["jobs", "cronjobs"],
        "verbs": ["get", "list", "watch"],
    }
    core_read = next(rule for rule in read_role["rules"] if rule.get("apiGroups") == [""])
    assert {"serviceaccounts", "resourcequotas"}.issubset(core_read["resources"])
    rbac_read = next(
        rule
        for rule in read_role["rules"]
        if rule.get("apiGroups") == ["rbac.authorization.k8s.io"]
    )
    assert rbac_read == {
        "apiGroups": ["rbac.authorization.k8s.io"],
        "resources": ["roles", "clusterroles", "rolebindings", "clusterrolebindings"],
        "verbs": ["get", "list", "watch"],
    }

    control_role = next(
        document
        for document in docs
        if document.get("kind") == "Role"
        and document.get("metadata", {}).get("name") == "cluster-agent-cronjob-control"
    )
    assert control_role["metadata"]["namespace"] == "sandbox"
    assert control_role["rules"] == [
        {"apiGroups": ["batch"], "resources": ["jobs"], "verbs": ["create"]},
        {"apiGroups": ["batch"], "resources": ["cronjobs"], "verbs": ["patch"]},
    ]


def test_dev_runtime_can_default_target_control_namespaces(monkeypatch) -> None:
    monkeypatch.setenv("TARGET_DEFAULT_CONTROL_NAMESPACES", "sandbox,color-turf")

    normalized = normalize_target_provider_defaults(target_request())

    assert normalized.control_namespaces == "sandbox,color-turf"
