from __future__ import annotations

import inspect

import domains.target.uninstall as uninstall_contract
from domains.target.uninstall import agent_uninstall_plan


def test_uninstall_contract_exposes_no_local_kubectl_escape_hatch() -> None:
    assert "kubectl" not in inspect.getsource(uninstall_contract)


def test_uninstall_plan_routes_only_to_the_authenticated_cluster_agent() -> None:
    plan = agent_uninstall_plan(
        cluster_id="cluster-2",
        workspace_id="workspace-1",
        requested_by="admin",
        correlation_id="corr-1",
    )

    assert plan["action"] == "cluster.agent.uninstall"
    assert plan["cluster_id"] == "cluster-2"
    assert plan["payload"] == {"cluster_id": "cluster-2", "contract_version": 1}
    assert plan["routing_constraint"] == {
        "channel": "agent",
        "cluster_id": "cluster-2",
        "workspace_id": "workspace-1",
        "required_capability": "commands",
    }
