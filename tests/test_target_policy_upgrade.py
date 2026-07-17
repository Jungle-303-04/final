from __future__ import annotations

from contextlib import contextmanager
from typing import Any

import pytest

from domains.target.evidence_policy import DEFAULT_EVIDENCE_PROVIDER_QUERIES
from domains.target.policy_upgrade import (
    TARGET_RBAC_ADMIN_MANIFEST_PATH,
    TargetPolicyUpgradeService,
    build_target_upgrade_plan,
)
from packages.contracts.gateway.requests import AgentPolicy
from packages.contracts.target import TARGET_RBAC_MANIFEST_VERSION

OLD_IMAGE = "registry.example.com/opsia@sha256:" + ("1" * 64)
NEW_IMAGE = "registry.example.com/opsia@sha256:" + ("2" * 64)


def _registration(*, role: str = "target") -> dict[str, Any]:
    return {
        "id": 17,
        "workspace_id": "workspace-a",
        "cluster_id": "customer-cluster",
        "settings": {
            "cluster_id": "customer-cluster",
            "cluster_role": role,
            "name": "Customer cluster",
            "image": OLD_IMAGE,
            "management_base_url": "https://agent.example.com/api",
            "provider_config": {"custom": "preserved"},
        },
    }


def _policy(*, role: str = "target") -> AgentPolicy:
    return AgentPolicy.model_validate(
        {
            "cluster_id": "customer-cluster",
            "cluster_role": role,
            "generation": 41,
            "evidence": {
                "failure_policy": "strict",
                "max_attempts": 5,
                "providers": {
                    "kubernetes": {
                        "enabled": False,
                        "interval_seconds": 91,
                        "min_workers": 0,
                        "max_workers": 1,
                        "queue_age_target_seconds": 37,
                        "queries": [
                            {
                                "name": "target_namespace_snapshot",
                                "description": "stale default",
                                "query": "stale-target",
                            },
                            {
                                "name": "customer_query",
                                "description": "customer-owned",
                                "query": "custom-value",
                                "custom_option": {"keep": True},
                            },
                        ],
                    },
                    "customer-provider": {
                        "enabled": True,
                        "interval_seconds": 73,
                        "queries": [{"name": "customer-provider-query", "query": "unchanged"}],
                    },
                },
            },
            "desired_state": {
                "resources": [
                    {
                        "resource_id": "target-agent-deployment",
                        "scope": "target-agent",
                        "kind": "Deployment",
                        "namespace": "target",
                        "name": "cluster-agent",
                        "action": "apply",
                        "state": {
                            "apiVersion": "apps/v1",
                            "kind": "Deployment",
                            "metadata": {
                                "name": "cluster-agent",
                                "namespace": "target",
                                "annotations": {"customer.example/keep": "yes"},
                            },
                            "spec": {
                                "template": {
                                    "spec": {
                                        "containers": [
                                            {
                                                "name": "cluster-agent",
                                                "image": OLD_IMAGE,
                                                "env": [{"name": "CUSTOM", "value": "keep"}],
                                            }
                                        ]
                                    }
                                }
                            },
                        },
                    }
                ]
            },
        }
    )


def test_upgrade_plan_rebases_only_named_defaults_and_preserves_custom_configuration() -> None:
    plan = build_target_upgrade_plan(
        registration=_registration(),
        policy=_policy(),
        desired_states=[
            {
                "component": "cluster-agent",
                "namespace": "target",
                "version": OLD_IMAGE,
                "spec": {"deployment": "cluster-agent", "custom": "keep"},
            },
            {
                "component": "node-collector",
                "namespace": "target",
                "version": OLD_IMAGE,
                "spec": {"enabled": False, "custom": "keep"},
            },
        ],
        target_image=NEW_IMAGE,
        rbac_actual_version=None,
    )

    assert plan.skipped_reason is None
    assert plan.changed is True
    assert plan.current_generation == 41
    assert plan.next_generation == 42
    assert plan.policy is not None
    assert plan.policy.generation == 42
    assert plan.settings_patch == {"image": NEW_IMAGE}

    kubernetes = plan.policy.evidence.providers["kubernetes"]
    assert kubernetes.enabled is False
    assert kubernetes.interval_seconds == 91
    assert kubernetes.min_workers == 0
    assert kubernetes.max_workers == 1
    assert kubernetes.queue_age_target_seconds == 37
    query_by_name = {str(item["name"]): item for item in kubernetes.queries}
    assert query_by_name["target_namespace_snapshot"] == next(
        item
        for item in DEFAULT_EVIDENCE_PROVIDER_QUERIES["kubernetes"]
        if item["name"] == "target_namespace_snapshot"
    )
    assert query_by_name["customer_query"] == {
        "name": "customer_query",
        "description": "customer-owned",
        "query": "custom-value",
        "custom_option": {"keep": True},
    }
    assert {str(item["name"]) for item in DEFAULT_EVIDENCE_PROVIDER_QUERIES["kubernetes"]}.issubset(
        query_by_name
    )
    assert plan.policy.evidence.providers["customer-provider"].model_dump() == (
        _policy().evidence.providers["customer-provider"].model_dump()
    )

    resource = plan.policy.desired_state.resources[0]
    assert resource.state["metadata"]["annotations"]["customer.example/keep"] == "yes"
    container = resource.state["spec"]["template"]["spec"]["containers"][0]
    assert container == {
        "name": "cluster-agent",
        "image": NEW_IMAGE,
        "env": [{"name": "CUSTOM", "value": "keep"}],
    }
    assert {item["component"]: item["version"] for item in plan.desired_states} == {
        "cluster-agent": NEW_IMAGE,
        "node-collector": NEW_IMAGE,
    }
    assert plan.rbac_status == "admin_apply_required"
    assert plan.rbac_expected_version == TARGET_RBAC_MANIFEST_VERSION
    assert plan.admin_manifest_path == TARGET_RBAC_ADMIN_MANIFEST_PATH.format(
        cluster_id="customer-cluster"
    )


def test_upgrade_plan_is_idempotent_and_reports_current_rbac() -> None:
    first = build_target_upgrade_plan(
        registration=_registration(),
        policy=_policy(),
        desired_states=[],
        target_image=NEW_IMAGE,
        rbac_actual_version=TARGET_RBAC_MANIFEST_VERSION,
    )
    assert first.policy is not None

    current_registration = _registration()
    current_registration["settings"]["image"] = NEW_IMAGE
    second = build_target_upgrade_plan(
        registration=current_registration,
        policy=first.policy,
        desired_states=first.desired_states,
        target_image=NEW_IMAGE,
        rbac_actual_version=TARGET_RBAC_MANIFEST_VERSION,
    )

    assert second.changed is False
    assert second.current_generation == 42
    assert second.next_generation == 42
    assert second.rbac_status == "current"


def test_upgrade_plan_skips_management_and_rejects_mutable_image() -> None:
    management = build_target_upgrade_plan(
        registration=_registration(role="management"),
        policy=_policy(role="management"),
        desired_states=[],
        target_image=NEW_IMAGE,
        rbac_actual_version=None,
    )
    assert management.changed is False
    assert management.skipped_reason == "management_cluster"

    with pytest.raises(ValueError, match="immutable sha256 digest"):
        build_target_upgrade_plan(
            registration=_registration(),
            policy=_policy(),
            desired_states=[],
            target_image="registry.example.com/opsia:latest",
            rbac_actual_version=None,
        )


class _UpgradeDb:
    def __init__(self) -> None:
        self.applied: list[object] = []
        self.uow_active = False
        self.pages = [
            [
                {
                    "registration": _registration(),
                    "policy": _policy().model_dump(),
                    "desired_states": [],
                    "policy_status": None,
                }
            ],
            [],
        ]

    def list_target_runtime_upgrade_candidates(
        self, *, after_id: int, limit: int
    ) -> list[dict[str, Any]]:
        assert limit == 100
        return self.pages.pop(0)

    @contextmanager
    def unit_of_work(self):
        self.uow_active = True
        try:
            yield self
        finally:
            self.uow_active = False

    def apply_target_runtime_upgrade(self, plan: object) -> None:
        assert self.uow_active is True
        self.applied.append(plan)


def test_upgrade_service_dry_run_is_non_mutating_and_apply_uses_transaction() -> None:
    dry_db = _UpgradeDb()
    dry_report = TargetPolicyUpgradeService(dry_db).run(
        target_image=NEW_IMAGE,
        apply=False,
    )
    assert dry_report.mode == "dry-run"
    assert dry_report.scanned == 1
    assert dry_report.changed == 1
    assert dry_report.applied == 0
    assert dry_db.applied == []

    apply_db = _UpgradeDb()
    apply_report = TargetPolicyUpgradeService(apply_db).run(
        target_image=NEW_IMAGE,
        apply=True,
    )
    assert apply_report.mode == "apply"
    assert apply_report.scanned == 1
    assert apply_report.changed == 1
    assert apply_report.applied == 1
    assert len(apply_db.applied) == 1
    assert apply_db.uow_active is False
