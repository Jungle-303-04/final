from __future__ import annotations

from conftest import ROOT, load_file

NODE_COLLECTOR_SPEC_PATH = (
    ROOT / "src" / "services" / "target" / "cluster-agent" / "node_collector_spec.py"
)


def test_node_collector_daemonset_sets_container_resources() -> None:
    module = load_file(NODE_COLLECTOR_SPEC_PATH, "test_node_collector_spec_module")

    daemonset = module.node_collector_daemonset(
        name="optional-node-collector",
        namespace="target",
        image="opsia-agent:local",
        app_label="optional-node-collector",
        managed_by_label="ops.service/managed-by",
        managed_by_value="cluster-agent",
        container_name="node-collector",
        port=9100,
        collect_interval_seconds=15,
    )

    container = daemonset["spec"]["template"]["spec"]["containers"][0]

    assert container["resources"] == {
        "requests": {"cpu": "25m", "memory": "64Mi"},
        "limits": {"cpu": "250m", "memory": "256Mi"},
    }
