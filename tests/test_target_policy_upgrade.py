from domains.target.evidence_policy import default_agent_policy
from domains.target.policy_upgrade import build_target_upgrade_plan
from packages.contracts.gateway.requests import AgentPolicy
from packages.contracts.target import (
    NODE_COLLECTOR_IMAGE_KEY,
    TARGET_AGENT_IMAGE_KEY,
    TARGET_NAMESPACE,
    TARGET_OTEL_TRACES_ENDPOINT,
    TARGET_RUNTIME_CONFIG_NAME,
)

OLD_IMAGE = f"registry.example.test/opsia@sha256:{'a' * 64}"
NEW_IMAGE = f"registry.example.test/opsia@sha256:{'b' * 64}"


def legacy_policy(cluster_id: str) -> AgentPolicy:
    body = default_agent_policy(cluster_id=cluster_id).model_dump()
    body["evidence"]["providers"]["traces"]["enabled"] = False
    return AgentPolicy.model_validate(body)


def desired_runtime_config(policy: AgentPolicy) -> dict[str, object]:
    for resource in policy.bootstrap.resources:
        if (
            resource.kind == "ConfigMap"
            and resource.namespace == TARGET_NAMESPACE
            and resource.name == TARGET_RUNTIME_CONFIG_NAME
        ):
            return resource.state
    raise AssertionError("target runtime ConfigMap was not planned")


def test_policy_upgrade_enables_traces_and_keeps_self_upgrade_image_only() -> None:
    cluster_id = "legacy-target"
    plan = build_target_upgrade_plan(
        registration={
            "id": 1,
            "workspace_id": "default",
            "cluster_id": cluster_id,
            "settings": {
                "name": "legacy-target",
                "cluster_role": "target",
                "image": OLD_IMAGE,
                "otel_traces_endpoint": "",
            },
        },
        policy=legacy_policy(cluster_id),
        desired_states=[],
        target_image=NEW_IMAGE,
        rbac_actual_version=None,
    )

    assert plan.changed is True
    assert plan.policy is not None
    assert plan.policy.evidence.providers["traces"].enabled is True
    assert plan.policy.evidence.providers["traces"].queries
    assert plan.settings_patch["otel_traces_endpoint"] == TARGET_OTEL_TRACES_ENDPOINT
    runtime_config = desired_runtime_config(plan.policy)
    assert runtime_config["data"] == {
        TARGET_AGENT_IMAGE_KEY: NEW_IMAGE,
        NODE_COLLECTOR_IMAGE_KEY: NEW_IMAGE,
    }
