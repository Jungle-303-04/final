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


def _render_notes(*extra_args: str) -> str:
    result = subprocess.run(
        [
            "helm",
            "install",
            "opsia",
            str(CHART),
            "--namespace",
            "opsia-system",
            "--dry-run=client",
            "--debug",
            *extra_args,
        ],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


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
        (80, "console")
    ]
    metrics = services["opsia-metrics"]
    assert metrics["spec"].get("type", "ClusterIP") == "ClusterIP"
    assert [(item["port"], item["targetPort"]) for item in metrics["spec"]["ports"]] == [
        (9090, "http")
    ]
    postgres = services["opsia-postgresql"]
    assert postgres["spec"].get("type", "ClusterIP") == "ClusterIP"
    assert [item["port"] for item in postgres["spec"]["ports"]] == [5432]


def test_default_access_is_self_only_same_origin_with_console_and_realtime() -> None:
    documents = _render_chart()
    deployment = next(
        item
        for item in documents
        if item["kind"] == "Deployment" and item["metadata"]["name"] == "opsia-controller"
    )
    containers = {
        item["name"]: item for item in deployment["spec"]["template"]["spec"]["containers"]
    }
    controller_env = {item["name"]: item.get("value") for item in containers["controller"]["env"]}

    assert containers["console"]["image"] == "ghcr.io/opsia/opsia-console:0.1.0"
    assert containers["console"]["ports"] == [{"name": "console", "containerPort": 8080}]
    assert containers["console"]["securityContext"] == {
        "allowPrivilegeEscalation": False,
        "readOnlyRootFilesystem": True,
        "capabilities": {"drop": ["ALL"]},
    }
    assert controller_env["CONSOLE_ORIGIN"] == "http://127.0.0.1:8080"
    assert controller_env["REALTIME_ORIGIN"] == "ws://127.0.0.1:8001"
    assert controller_env["PUBLIC_MANAGEMENT_BASE_URL"] == "http://opsia.opsia-system.svc"
    assert controller_env["OPSIA_ACCESS_MODE"] == "portforward"
    assert controller_env["OPSIA_EXTERNAL_URL"] == ""
    assert controller_env["COOKIE_SECURE"] == "0"

    config_map = next(
        item
        for item in documents
        if item["kind"] == "ConfigMap" and item["metadata"]["name"] == "opsia-console"
    )["data"]
    config = config_map["default.conf"]
    security_headers = config_map["security-headers.inc"]
    assert "proxy_pass http://127.0.0.1:8000/;" in config
    assert "proxy_pass http://127.0.0.1:8001/live/;" in config
    assert "location ^~ /api/install/" in config
    assert "proxy_pass http://127.0.0.1:8000/install/;" in config
    assert "location = /api/agent/inventory/snapshots" in config
    assert "client_max_body_size 16m;" in config
    assert "proxy_pass http://127.0.0.1:8000/agent/inventory/snapshots;" in config
    assert "access_log off;" in config
    assert "location = /api/metrics" in config
    assert 'proxy_set_header X-Kubeheal-Internal-Auth "";' in config
    assert 'X-Content-Type-Options "nosniff"' in security_headers
    assert config.count("include /etc/nginx/conf.d/security-headers.inc;") >= 3
    assets_location = config.split("location /assets/", maxsplit=1)[1].split("}", maxsplit=1)[0]
    root_location = config.split("location / {", maxsplit=1)[1].split("}", maxsplit=1)[0]
    assert "security-headers.inc" in assets_location
    assert "security-headers.inc" in root_location

    mounts = containers["console"]["volumeMounts"]
    assert {item["mountPath"] for item in mounts} == {"/etc/nginx/conf.d", "/tmp"}


def test_self_agent_uses_the_same_origin_internal_api_and_realtime_paths() -> None:
    documents = _render_chart()
    agent = next(
        item
        for item in documents
        if item["kind"] == "DaemonSet" and item["metadata"]["name"] == "opsia-agent"
    )
    container = _container(agent, "agent")
    agent_env = {item["name"]: item.get("value") for item in container["env"]}

    assert agent_env["MANAGEMENT_BASE_URL"] == "http://opsia.opsia-system.svc/api"
    assert agent_env["REALTIME_GATEWAY_URL"] == "ws://opsia.opsia-system.svc/api"


def test_access_modes_render_explicit_exposure_without_exposing_internal_ports() -> None:
    load_balancer = _render_chart(
        "--set",
        "access.mode=loadbalancer",
        "--set-string",
        "access.externalUrl=https://opsia.example.com",
    )
    node_port = _render_chart(
        "--set",
        "access.mode=nodeport",
        "--set",
        "access.nodePort=30080",
    )
    ingress = _render_chart(
        "--set",
        "access.mode=ingress",
        "--set-string",
        "access.host=opsia.example.com",
        "--set",
        "access.ingress.tls.enabled=true",
        "--set-string",
        "access.ingress.tls.secretName=opsia-tls",
    )

    def services(documents: list[dict[str, object]]) -> dict[str, dict[str, object]]:
        return {item["metadata"]["name"]: item for item in documents if item["kind"] == "Service"}

    load_balancer_service = services(load_balancer)["opsia"]
    assert load_balancer_service["spec"]["type"] == "LoadBalancer"
    assert [item["port"] for item in load_balancer_service["spec"]["ports"]] == [80]

    node_port_service = services(node_port)["opsia"]
    assert node_port_service["spec"]["type"] == "NodePort"
    assert node_port_service["spec"]["ports"][0]["nodePort"] == 30080

    ingress_service = services(ingress)["opsia"]
    assert ingress_service["spec"]["type"] == "ClusterIP"
    ingress_resource = next(item for item in ingress if item["kind"] == "Ingress")
    assert ingress_resource["spec"]["rules"][0]["host"] == "opsia.example.com"
    assert ingress_resource["spec"]["tls"] == [
        {"hosts": ["opsia.example.com"], "secretName": "opsia-tls"}
    ]

    for documents in (load_balancer, node_port, ingress):
        rendered_services = services(documents)
        assert [item["port"] for item in rendered_services["opsia"]["spec"]["ports"]] == [80]
        assert rendered_services["opsia-metrics"]["spec"]["type"] == "ClusterIP"
        assert [item["port"] for item in rendered_services["opsia-metrics"]["spec"]["ports"]] == [
            9090
        ]
        assert rendered_services["opsia-postgresql"]["spec"]["type"] == "ClusterIP"
        assert [
            item["port"] for item in rendered_services["opsia-postgresql"]["spec"]["ports"]
        ] == [5432]


def test_external_access_drives_secure_cookie_and_authoritative_agent_url() -> None:
    documents = _render_chart(
        "--set",
        "access.mode=loadbalancer",
        "--set-string",
        "access.externalUrl=https://opsia.example.com",
    )
    deployment = next(
        item
        for item in documents
        if item["kind"] == "Deployment" and item["metadata"]["name"] == "opsia-controller"
    )
    controller = _container(deployment, "controller")
    controller_env = {item["name"]: item.get("value") for item in controller["env"]}

    assert controller_env["PUBLIC_MANAGEMENT_BASE_URL"] == "https://opsia.example.com"
    assert controller_env["OPSIA_EXTERNAL_URL"] == "https://opsia.example.com"
    assert controller_env["COOKIE_SECURE"] == "1"
    assert controller_env["DEV_AUTH_BYPASS"] == "0"
    assert controller_env["TARGET_AGENT_IMAGE"] == "ghcr.io/opsia/opsia:0.1.0"


def test_access_notes_are_mode_specific_and_reveal_bootstrap_only_on_demand() -> None:
    port_forward_notes = _render_notes()
    load_balancer_notes = _render_notes(
        "--set",
        "access.mode=loadbalancer",
        "--set-string",
        "access.externalUrl=https://opsia.example.com",
    )
    ingress_notes = _render_notes(
        "--set",
        "access.mode=ingress",
        "--set-string",
        "access.host=opsia.example.com",
    )

    assert "kubectl -n opsia-system port-forward service/opsia 8080:80" in port_forward_notes
    assert "http://127.0.0.1:8080" in port_forward_notes
    assert "opsia.opsia-system.svc" in port_forward_notes
    assert "self cluster only" in port_forward_notes
    assert "AUTH_PASSWORD" in port_forward_notes
    assert "https://opsia.example.com" in load_balancer_notes
    assert "kubectl get service opsia" in load_balancer_notes
    assert "http://opsia.example.com" in ingress_notes


def test_access_values_reject_unknown_mode_and_unsafe_external_url() -> None:
    for args in (
        ("--set", "access.mode=public"),
        ("--set-string", "access.externalUrl=javascript:alert(1)"),
        ("--set-string", "access.externalUrl=https://user@opsia.example.com"),
        ("--set-string", "access.externalUrl=https://opsia.example.com/path"),
        ("--set-string", "access.externalUrl=https://opsia.example.com?next=evil"),
        (
            "--set",
            "access.mode=ingress",
            "--set-string",
            "access.host=opsia.example.com",
            "--set",
            "access.ingress.tls.enabled=true",
        ),
    ):
        result = subprocess.run(
            ["helm", "template", "opsia", str(CHART), *args],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        assert result.returncode != 0


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


def test_controller_uses_a_startup_probe_before_liveness_can_restart_it() -> None:
    documents = _render_chart("--set", "postgresql.persistence.enabled=false")
    deployment = next(
        item
        for item in documents
        if item["kind"] == "Deployment" and item["metadata"]["name"] == "opsia-controller"
    )
    controller = next(
        item
        for item in deployment["spec"]["template"]["spec"]["containers"]
        if item["name"] == "controller"
    )

    assert controller["startupProbe"]["httpGet"] == {"path": "/healthz", "port": "http"}
    assert controller["startupProbe"]["failureThreshold"] >= 60
    assert "initialDelaySeconds" not in controller["livenessProbe"]


def test_make_demo_installs_the_chart_before_injecting_the_bad_rollout() -> None:
    script = (ROOT / "scripts" / "oss-demo.sh").read_text(encoding="utf-8")

    assert "helm upgrade --install" in script
    assert '"${ROOT_DIR}/charts/opsia"' in script
    assert '"${ROOT_DIR}/references/ui-layer-lab/Dockerfile"' in script
    assert 'kind load docker-image "${OPSIA_CONSOLE_IMAGE}"' in script
    assert '--set "console.image.repository=${CONSOLE_IMAGE_REPOSITORY}"' in script
    assert '--set "console.image.tag=${CONSOLE_IMAGE_TAG}"' in script
    assert 'API_BASE="http://127.0.0.1:${API_PORT}/api"' in script
    assert 'wait_for_url "${API_BASE}/healthz"' in script
    assert "rollout status deployment/opsia-controller" in script
    assert script.index("helm upgrade --install") < script.rindex('scene "bad-rollout-observed"')


def test_helm_chart_can_inject_a_demo_scm_without_changing_the_default_provider() -> None:
    defaults = _render_chart("--set", "postgresql.persistence.enabled=false")
    configured = _render_chart(
        "--set",
        "postgresql.persistence.enabled=false",
        "--set",
        "scm.repository=opsia/demo",
        "--set",
        "scm.github.apiBase=http://opsia-demo-scm:8080",
        "--set",
        "scm.github.tokenSecretName=opsia-demo-scm",
    )

    def controller_env(documents: list[dict[str, object]]) -> dict[str, dict[str, object]]:
        deployment = next(
            item
            for item in documents
            if item["kind"] == "Deployment" and item["metadata"]["name"] == "opsia-controller"
        )
        container = next(
            item
            for item in deployment["spec"]["template"]["spec"]["containers"]
            if item["name"] == "controller"
        )
        return {item["name"]: item for item in container["env"]}

    default_env = controller_env(defaults)
    configured_env = controller_env(configured)
    assert default_env["SCM_PROVIDER"]["value"] == "github"
    assert "GITHUB_API_BASE" not in default_env
    assert "GITHUB_TOKEN" not in default_env
    assert configured_env["SCM_REPO"]["value"] == "opsia/demo"
    assert configured_env["GITHUB_API_BASE"]["value"] == "http://opsia-demo-scm:8080"
    assert configured_env["GITHUB_TOKEN"]["valueFrom"]["secretKeyRef"] == {
        "name": "opsia-demo-scm",
        "key": "token",
    }


def test_controller_rolls_when_the_injected_scm_credentials_rotate() -> None:
    documents = _render_chart(
        "--set",
        "postgresql.persistence.enabled=false",
        "--set-string",
        "scm.credentialVersion=credential-hash",
    )
    deployment = next(
        item
        for item in documents
        if item["kind"] == "Deployment" and item["metadata"]["name"] == "opsia-controller"
    )

    annotations = deployment["spec"]["template"]["metadata"]["annotations"]
    assert annotations["opsia.io/scm-credential-version"] == "credential-hash"
    assert annotations["checksum/console-config"]
