import yaml

from domains.target.install_manifest import (
    cluster_uninstall_rbac_manifest,
    priority_class_manifest,
)
from domains.target.uninstall import (
    PRE_ACK_CLUSTER_CLEANUP,
    UNINSTALL_CLEANUP_RESOURCE_REFS,
    UNINSTALL_CONTRACT_VERSION,
    agent_uninstall_plan,
)
from packages.contracts.target import (
    CONTROL_PRIORITY_CLASS_NAME,
    FAST_LANE_PRIORITY_CLASS_NAME,
)


def test_agent_uninstall_never_owns_shared_priority_classes() -> None:
    assert UNINSTALL_CONTRACT_VERSION == 2
    assert all(item.resource != "priorityclasses" for item in PRE_ACK_CLUSTER_CLEANUP)
    assert all("priorityclass" not in reference for reference in UNINSTALL_CLEANUP_RESOURCE_REFS)

    rules = next(yaml.safe_load_all(cluster_uninstall_rbac_manifest("target")))["rules"]
    assert all("priorityclasses" not in rule.get("resources", []) for rule in rules)


def test_uninstall_plan_advertises_the_safe_contract_version() -> None:
    plan = agent_uninstall_plan(
        cluster_id="cluster-1",
        workspace_id="workspace-1",
        requested_by="user-1",
        correlation_id="correlation-1",
    )

    assert plan["payload"]["contract_version"] == 2
    assert plan["diff"]["basis"]["contract_version"] == 2


def test_install_still_reconciles_canonical_shared_priority_classes() -> None:
    documents = list(yaml.safe_load_all(priority_class_manifest()))
    names = {document["metadata"]["name"] for document in documents}

    assert names == {
        CONTROL_PRIORITY_CLASS_NAME,
        FAST_LANE_PRIORITY_CLASS_NAME,
    }
