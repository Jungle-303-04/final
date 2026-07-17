from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path
from typing import Any

import pytest

from packages.contracts.gateway.requests import (
    AgentPolicy,
    DesiredResource,
    DesiredStatePolicy,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
)

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_DIR = ROOT_DIR / "src" / "services" / "target" / "cluster-agent"


def load_control_module():
    module_names = (
        "control",
        "control.argocd_observer",
        "control.policy",
        "control.reconciler",
        "control.store",
        "kubernetes_api",
        "config",
        "span",
        "span.base",
        "span.otel",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(TARGET_AGENT_DIR))
    try:
        return importlib.import_module("control")
    finally:
        sys.path.remove(str(TARGET_AGENT_DIR))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


class StubPolicyClient:
    def __init__(self, policy: AgentPolicy | None) -> None:
        self.policy = policy
        self.policy_statuses: list[dict[str, Any]] = []
        self.reconcile_statuses: list[dict[str, Any]] = []

    async def fetch_policy(self, _cluster_id: str, _generation: int) -> dict[str, Any] | None:
        return None if self.policy is None else self.policy.model_dump()

    async def report_policy_status(self, status: dict[str, Any]) -> None:
        self.policy_statuses.append(status)

    async def report_reconcile_status(self, status: dict[str, Any]) -> None:
        self.reconcile_statuses.append(status)


class StubApplier:
    def __init__(self) -> None:
        self.applied: list[str] = []
        self.observed: list[str] = []

    async def apply(self, resource: DesiredResource) -> None:
        self.applied.append(resource.resource_id)

    async def observe(self, resource: DesiredResource) -> None:
        self.observed.append(resource.resource_id)


class FailsOnceApplier(StubApplier):
    def __init__(self) -> None:
        super().__init__()
        self.failed = False

    async def apply(self, resource: DesiredResource) -> None:
        if not self.failed:
            self.failed = True
            raise RuntimeError("temporary apply failure")
        await super().apply(resource)


class StubArgoObserver:
    def __init__(
        self,
        *,
        applications_available: bool = True,
        rollouts_available: bool = True,
    ) -> None:
        self.calls = 0
        self.applications_available = applications_available
        self.rollouts_available = rollouts_available

    async def snapshot(self) -> dict[str, object]:
        self.calls += 1
        return {
            "applications": {
                "available": self.applications_available,
                "items": [{"name": "checkout"}] if self.applications_available else [],
            },
            "rollouts": {"available": self.rollouts_available, "items": []},
        }


def test_policy_sync_applies_remote_scheduler_policy(tmp_path: Path) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    default_policy = AgentPolicy(cluster_id="cluster-1")
    remote_policy = AgentPolicy(
        cluster_id="cluster-1",
        generation=2,
        evidence=EvidenceRuntimePolicy(
            providers={
                "logs": EvidenceProviderPolicy(
                    enabled=True,
                    interval_seconds=30,
                    min_workers=1,
                    max_workers=4,
                    queue_age_target_seconds=20,
                )
            }
        ),
    )
    applied: list[AgentPolicy] = []
    sync = control.AgentPolicySync(
        cluster_id="cluster-1",
        store=store,
        default_policy=default_policy,
        apply_policy=lambda policy: applied.append(policy) or {"ok": True},
        interval_seconds=10,
    )
    client = StubPolicyClient(remote_policy)

    assert asyncio.run(sync.sync_once(client)) == "applied"

    assert store.active_generation() == 2
    assert applied[0].evidence.providers["logs"].interval_seconds == 30
    assert client.policy_statuses[0]["status"] == "applied"


def test_policy_sync_merges_partial_provider_policy(tmp_path: Path) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    default_policy = AgentPolicy(
        cluster_id="cluster-1",
        evidence=EvidenceRuntimePolicy(
            providers={
                "metrics": EvidenceProviderPolicy(interval_seconds=10),
                "logs": EvidenceProviderPolicy(interval_seconds=20),
                "traces": EvidenceProviderPolicy(interval_seconds=30),
            }
        ),
    )
    remote_policy = AgentPolicy(
        cluster_id="cluster-1",
        generation=2,
        evidence=EvidenceRuntimePolicy(
            providers={
                "logs": EvidenceProviderPolicy(interval_seconds=45),
            }
        ),
    )
    applied: list[AgentPolicy] = []
    sync = control.AgentPolicySync(
        cluster_id="cluster-1",
        store=store,
        default_policy=default_policy,
        apply_policy=lambda policy: applied.append(policy) or {"ok": True},
        interval_seconds=10,
    )

    assert asyncio.run(sync.sync_once(StubPolicyClient(remote_policy))) == "applied"

    merged_policy = store.load_policy()
    assert merged_policy is not None
    assert merged_policy.evidence.providers["metrics"].interval_seconds == 10
    assert merged_policy.evidence.providers["logs"].interval_seconds == 45
    assert merged_policy.evidence.providers["traces"].interval_seconds == 30


def test_policy_sync_reports_failed_payload_generation(tmp_path: Path) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    remote_policy = AgentPolicy(cluster_id="cluster-1", generation=7)
    sync = control.AgentPolicySync(
        cluster_id="cluster-1",
        store=store,
        default_policy=AgentPolicy(cluster_id="cluster-1"),
        apply_policy=lambda _policy: (_ for _ in ()).throw(RuntimeError("apply failed")),
        interval_seconds=10,
    )
    client = StubPolicyClient(remote_policy)

    assert asyncio.run(sync.sync_once(client)) == "failed"

    assert client.policy_statuses[0]["generation"] == 7
    assert client.policy_statuses[0]["status"] == "failed"


def test_policy_sync_merges_runtime_drift_details_for_unchanged_policy(tmp_path: Path) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    store.save_policy(AgentPolicy(cluster_id="cluster-1", generation=3))

    async def status_details() -> dict[str, object]:
        return {
            "target_rbac_manifest": {
                "status": "admin_apply_required",
                "actual_version": None,
                "expected_version": "2026-07-17.1",
            }
        }

    sync = control.AgentPolicySync(
        cluster_id="cluster-1",
        store=store,
        default_policy=AgentPolicy(cluster_id="cluster-1"),
        apply_policy=lambda _policy: {},
        interval_seconds=10,
        status_details=status_details,
    )
    client = StubPolicyClient(None)

    assert asyncio.run(sync.sync_once(client)) == "unchanged"
    assert client.policy_statuses[0]["details"] == asyncio.run(status_details())


def test_reconciler_rejects_user_workload_until_scope_is_enabled(tmp_path: Path) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    resource = DesiredResource(
        resource_id="user-app",
        scope="user-workload",
        kind="Deployment",
        namespace="target",
        name="checkout",
        action="apply",
    )
    policy = AgentPolicy(
        cluster_id="cluster-1",
        desired_state=DesiredStatePolicy(resources=[resource]),
    )
    store.save_policy(policy)
    applier = StubApplier()
    reconciler = control.DesiredStateReconciler(
        cluster_id="cluster-1",
        cluster_role="target",
        store=store,
        interval_seconds=30,
        resource_applier=applier,
    )

    report = asyncio.run(reconciler.reconcile_once())

    assert report["status"] == "failed"
    assert applier.applied == []
    result = report["details"]["resources"][0]
    assert result["status"] == "failed"
    assert "user workload" in result["message"]


def test_reconciler_applies_target_agent_owned_configmap(tmp_path: Path) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    resource = DesiredResource(
        resource_id="target-agent-policy",
        scope="target-agent",
        kind="ConfigMap",
        namespace="target",
        name="target-agent-policy",
        action="apply",
        state={"data": {"owner": "cluster-agent"}},
    )
    policy = AgentPolicy(
        cluster_id="cluster-1",
        desired_state=DesiredStatePolicy(resources=[resource]),
    )
    store.save_policy(policy)
    applier = StubApplier()
    observer = StubArgoObserver()
    reconciler = control.DesiredStateReconciler(
        cluster_id="cluster-1",
        cluster_role="target",
        store=store,
        interval_seconds=30,
        resource_applier=applier,
        argo_observer=observer,
    )

    report = asyncio.run(reconciler.reconcile_once())

    assert report["status"] == "applied"
    assert applier.applied == ["target-agent-policy"]
    assert observer.calls == 0


def test_argocd_reconciler_observes_apply_without_emitting_apply(tmp_path: Path) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    resource = DesiredResource(
        resource_id="target-agent-policy",
        scope="target-agent",
        kind="ConfigMap",
        namespace="target",
        name="target-agent-policy",
        action="apply",
        state={"data": {"owner": "cluster-agent"}},
    )
    store.save_policy(
        AgentPolicy(
            cluster_id="cluster-1",
            desired_state=DesiredStatePolicy(resources=[resource]),
        )
    )
    applier = StubApplier()
    observer = StubArgoObserver()
    reconciler = control.DesiredStateReconciler(
        cluster_id="cluster-1",
        cluster_role="target",
        store=store,
        interval_seconds=30,
        resource_applier=applier,
        reconciler_mode="argocd",
        argo_observer=observer,
    )

    report = asyncio.run(reconciler.reconcile_once())

    assert report["status"] == "unchanged"
    assert applier.applied == []
    assert applier.observed == ["target-agent-policy"]
    assert report["details"]["resources"][0]["message"] == ("observed (argocd single-writer mode)")
    assert observer.calls == 1
    assert report["details"]["argocd"]["applications"]["items"] == [{"name": "checkout"}]


def test_argocd_reconciler_fails_closed_when_application_observation_is_unavailable(
    tmp_path: Path,
) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    store.save_policy(AgentPolicy(cluster_id="cluster-1"))
    applier = StubApplier()
    observer = StubArgoObserver(applications_available=False, rollouts_available=False)
    reconciler = control.DesiredStateReconciler(
        cluster_id="cluster-1",
        cluster_role="target",
        store=store,
        interval_seconds=30,
        resource_applier=applier,
        reconciler_mode="argocd",
        argo_observer=observer,
    )

    report = asyncio.run(reconciler.reconcile_once())

    assert report["status"] == "failed"
    assert report["details"]["argocd"]["error"] == ("Argo CD Application observation unavailable")
    assert applier.applied == []
    assert observer.calls == 1


def test_argocd_reconciler_allows_optional_rollout_observation_to_be_unavailable(
    tmp_path: Path,
) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    store.save_policy(AgentPolicy(cluster_id="cluster-1"))
    observer = StubArgoObserver(rollouts_available=False)
    reconciler = control.DesiredStateReconciler(
        cluster_id="cluster-1",
        cluster_role="target",
        store=store,
        interval_seconds=30,
        reconciler_mode="argocd",
        argo_observer=observer,
    )

    report = asyncio.run(reconciler.reconcile_once())

    assert report["status"] == "unchanged"
    assert report["details"]["argocd"]["applications"]["available"] is True
    assert report["details"]["argocd"]["rollouts"]["available"] is False


def test_reconciler_rejects_unknown_mode(tmp_path: Path) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))

    with pytest.raises(ValueError, match="reconciler_mode"):
        control.DesiredStateReconciler(
            cluster_id="cluster-1",
            cluster_role="target",
            store=store,
            interval_seconds=30,
            reconciler_mode="unknown",
        )


def test_reconciler_retries_failed_apply_for_same_hash(tmp_path: Path) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    resource = DesiredResource(
        resource_id="target-agent-policy",
        scope="target-agent",
        kind="ConfigMap",
        namespace="target",
        name="target-agent-policy",
        action="apply",
        state={"data": {"owner": "cluster-agent"}},
    )
    store.save_policy(
        AgentPolicy(
            cluster_id="cluster-1",
            desired_state=DesiredStatePolicy(resources=[resource]),
        )
    )
    applier = FailsOnceApplier()
    reconciler = control.DesiredStateReconciler(
        cluster_id="cluster-1",
        cluster_role="target",
        store=store,
        interval_seconds=30,
        resource_applier=applier,
    )

    first_report = asyncio.run(reconciler.reconcile_once())
    second_report = asyncio.run(reconciler.reconcile_once())

    assert first_report["status"] == "failed"
    assert second_report["status"] == "applied"
    assert applier.applied == ["target-agent-policy"]


def test_reconciler_observe_calls_resource_observer(tmp_path: Path) -> None:
    control = load_control_module()
    store = control.AgentControlStore(str(tmp_path / "agent-control.db"))
    resource = DesiredResource(
        resource_id="target-agent-policy",
        scope="target-agent",
        kind="ConfigMap",
        namespace="target",
        name="target-agent-policy",
        action="observe",
    )
    store.save_policy(
        AgentPolicy(
            cluster_id="cluster-1",
            desired_state=DesiredStatePolicy(resources=[resource]),
        )
    )
    applier = StubApplier()
    reconciler = control.DesiredStateReconciler(
        cluster_id="cluster-1",
        cluster_role="target",
        store=store,
        interval_seconds=30,
        resource_applier=applier,
    )

    report = asyncio.run(reconciler.reconcile_once())

    assert report["status"] == "unchanged"
    assert applier.observed == ["target-agent-policy"]
