from __future__ import annotations

from domains.target.uninstall import agent_uninstall_plan, target_uninstall_command


def test_uninstall_command_is_exact_name_allowlist_without_namespace_or_workload_deletion() -> None:
    command = target_uninstall_command()

    assert "deployment/cluster-agent" in command
    assert "daemonset/optional-node-collector" in command
    assert "clusterrole/cluster-agent-uninstall" in command
    assert "clusterrole/cluster-agent-node-control" in command
    assert "clusterrolebinding/cluster-agent-node-control" in command
    assert "namespace/target" not in command
    assert "namespace/sandbox" not in command
    assert "deployment/color-turf-server" not in command
    assert "--ignore-not-found --wait=true" in command


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
