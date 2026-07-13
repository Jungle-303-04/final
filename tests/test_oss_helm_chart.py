from __future__ import annotations

import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CHART = ROOT / "charts" / "opsia"


def _render_chart(*extra_args: str) -> list[dict[str, object]]:
    result = subprocess.run(
        [
            "helm",
            "template",
            "opsia",
            str(CHART),
            "--namespace",
            "opsia-system",
            *extra_args,
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return [item for item in yaml.safe_load_all(result.stdout) if item]


def _container(workload: dict[str, object], name: str) -> dict[str, object]:
    spec = workload["spec"]
    assert isinstance(spec, dict)
    template = spec["template"]
    assert isinstance(template, dict)
    pod_spec = template["spec"]
    assert isinstance(pod_spec, dict)
    containers = pod_spec["containers"]
    assert isinstance(containers, list)
    return next(item for item in containers if item["name"] == name)


def test_helm_chart_renders_the_three_component_oss_profile() -> None:
    documents = _render_chart()
    workloads = {
        (item["kind"], item["metadata"]["name"]): item
        for item in documents
        if item["kind"] in {"Deployment", "StatefulSet", "DaemonSet"}
    }

    assert set(workloads) == {
        ("Deployment", "opsia-controller"),
        ("StatefulSet", "opsia-postgresql"),
        ("DaemonSet", "opsia-agent"),
    }
    rendered = yaml.safe_dump_all(documents)
    assert "NATS_URL" not in rendered
    assert "REDIS_URL" not in rendered
    assert "MINIO" not in rendered


def test_helm_chart_keeps_the_public_profile_fail_closed() -> None:
    documents = _render_chart()
    workloads = {
        item["metadata"]["name"]: item
        for item in documents
        if item["kind"] in {"Deployment", "DaemonSet"}
    }
    controller = _container(workloads["opsia-controller"], "controller")
    agent = _container(workloads["opsia-agent"], "agent")
    controller_env = {item["name"]: item.get("value") for item in controller["env"]}
    agent_env = {item["name"]: item.get("value") for item in agent["env"]}

    assert controller_env["CONTROLLER_EVENT_BUS_MODE"] == "inprocess"
    assert controller_env["DEV_AUTH_BYPASS"] == "0"
    assert controller_env["REMEDIATION_DELIVERY_MODE"] == "pull_request"
    assert controller_env["PRODUCTION_AUTO_MERGE_ENABLED"] == "false"
    assert agent_env["AGENT_ACCESS_MODE"] == "read_only"
    assert agent_env["AGENT_DIRECT_COMMANDS_ENABLED"] == "false"
    assert agent_env["RECONCILER_MODE"] == "argocd"


def test_helm_chart_uses_one_public_origin_and_keeps_postgres_internal() -> None:
    documents = _render_chart()
    services = {item["metadata"]["name"]: item for item in documents if item["kind"] == "Service"}

    controller = services["opsia"]
    assert controller["spec"].get("type", "ClusterIP") == "ClusterIP"
    assert [(item["port"], item["targetPort"]) for item in controller["spec"]["ports"]] == [
        (80, "http")
    ]
    postgres = services["opsia-postgresql"]
    assert postgres["spec"].get("type", "ClusterIP") == "ClusterIP"
    assert [item["port"] for item in postgres["spec"]["ports"]] == [5432]


def test_helm_chart_orders_database_readiness_before_bootstrap() -> None:
    documents = _render_chart("--set", "postgresql.persistence.enabled=false")
    workloads = {
        item["metadata"]["name"]: item
        for item in documents
        if item["kind"] in {"Deployment", "StatefulSet"}
    }
    init_names = [
        container["name"]
        for container in workloads["opsia-controller"]["spec"]["template"]["spec"]["initContainers"]
    ]
    assert init_names == ["wait-for-database", "bootstrap"]

    capabilities = workloads["opsia-postgresql"]["spec"]["template"]["spec"]["containers"][0][
        "securityContext"
    ]["capabilities"]
    assert capabilities["drop"] == ["ALL"]
    assert set(capabilities["add"]) == {
        "CHOWN",
        "DAC_OVERRIDE",
        "FOWNER",
        "SETGID",
        "SETUID",
    }


def test_make_demo_installs_the_chart_before_injecting_the_bad_rollout() -> None:
    script = (ROOT / "scripts" / "oss-demo.sh").read_text(encoding="utf-8")

    assert "helm upgrade --install" in script
    assert '"${ROOT_DIR}/charts/opsia"' in script
    assert "rollout status deployment/opsia-controller" in script
    assert script.index("helm upgrade --install") < script.rindex('scene "bad-rollout-observed"')
