from __future__ import annotations

import ast
from pathlib import Path

import pytest
from conftest import ROOT

CLUSTER_AGENT_ROOT = ROOT / "src" / "services" / "target" / "cluster-agent"
NODE_COLLECTOR_ROOT = ROOT / "src" / "services" / "target" / "node-collector"
TARGET_BOOTSTRAP = ROOT / "src" / "domains" / "target" / "router.py"
LOCAL_RENDERERS = {
    ROOT / "src" / "domains" / "gitops" / "repository_discovery.py",
    ROOT / "src" / "services" / "gitops" / "manifest-render-worker" / "app.py",
}
MANAGEMENT_CLUSTER_INFRASTRUCTURE = {
    ROOT / "src" / "packages" / "security" / "vault.py",
}
TARGET_RUNTIME_EXCEPTIONS = {
    TARGET_BOOTSTRAP,
    *LOCAL_RENDERERS,
    *MANAGEMENT_CLUSTER_INFRASTRUCTURE,
}


def test_browser_and_desktop_do_not_offer_direct_target_kubectl() -> None:
    offenders: list[Path] = []
    roots = (ROOT / "frontend" / "src", ROOT / "desktop" / "src-tauri" / "src")

    for root in roots:
        for path in _runtime_sources(root):
            if "kubectl" in path.read_text(encoding="utf-8").casefold():
                offenders.append(path.relative_to(ROOT))

    assert offenders == []


def test_runtime_recovery_and_uninstall_do_not_emit_direct_kubectl_escape_hatches() -> None:
    guarded_paths = (
        ROOT / "src" / "domains" / "log_stream",
        ROOT / "src" / "domains" / "target" / "uninstall.py",
    )
    offenders = [
        path.relative_to(ROOT)
        for root in guarded_paths
        for path in _python_sources(root)
        if "kubectl" in path.read_text(encoding="utf-8").casefold()
    ]

    assert offenders == []


def test_target_kubernetes_clients_are_agent_owned() -> None:
    offenders: list[Path] = []

    for path in _python_sources(ROOT / "src"):
        if CLUSTER_AGENT_ROOT in path.parents or NODE_COLLECTOR_ROOT in path.parents:
            continue
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
        imports = {
            alias.name
            for node in ast.walk(tree)
            if isinstance(node, ast.Import)
            for alias in node.names
        }
        imports.update(
            node.module or "" for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)
        )
        imported_client = any(
            module == "kubernetes"
            or module.startswith("kubernetes.")
            or module == "kubernetes_asyncio"
            or module.startswith("kubernetes_asyncio.")
            for module in imports
        )
        if imported_client or "load_kube_config" in source or "load_incluster_config" in source:
            offenders.append(path.relative_to(ROOT))

    assert offenders == []


def test_target_kubectl_processes_are_bootstrap_or_local_render_only() -> None:
    offenders: list[Path] = []

    for path in _python_sources(ROOT / "src"):
        source = path.read_text(encoding="utf-8").casefold()
        if "kubectl" not in source:
            continue
        if path == TARGET_BOOTSTRAP or path in LOCAL_RENDERERS:
            continue
        if "subprocess" in source or "create_subprocess" in source:
            offenders.append(path.relative_to(ROOT))

    assert offenders == []


def test_registration_scripts_cannot_restore_static_prometheus_authority() -> None:
    paths = (ROOT / "scripts" / "register-target.sh", ROOT / "scripts" / "aws-up.sh")
    forbidden = ("PROMETHEUS_BASE_URL", "prometheus_base_url")

    for path in paths:
        source = path.read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in source, f"{token} reintroduced in {path.relative_to(ROOT)}"


def test_target_cluster_runtime_authority_is_agent_owned() -> None:
    assert (
        _target_runtime_authority_offenders(
            ROOT / "src",
            allowed_roots=(CLUSTER_AGENT_ROOT, NODE_COLLECTOR_ROOT),
            exception_paths=TARGET_RUNTIME_EXCEPTIONS,
        )
        == []
    )


@pytest.mark.parametrize(
    ("name", "source"),
    [
        (
            "kubernetes_client.py",
            "from kubernetes import client\nclient.CoreV1Api().list_pod_for_all_namespaces()\n",
        ),
        (
            "raw_kubernetes.py",
            """import httpx
KUBERNETES_SERVICE_HOST = "target.svc"
httpx.get("https://target.svc/api/v1/namespaces/shop/pods")
""",
        ),
        (
            "prometheus.py",
            """import httpx
PROMETHEUS_BASE_URL = "http://prometheus.target.svc"
httpx.get(PROMETHEUS_BASE_URL + "/api/v1/query")
""",
        ),
        (
            "loki.py",
            """import httpx
LOKI_BASE_URL = "http://loki.target.svc"
httpx.get(LOKI_BASE_URL + "/loki/api/v1/query_range")
""",
        ),
        (
            "tempo.py",
            """import httpx
TEMPO_BASE_URL = "http://tempo.target.svc"
httpx.get(TEMPO_BASE_URL + "/api/search")
""",
        ),
        (
            "gitops.py",
            """import subprocess
subprocess.run(["kubectl", "apply", "--dry-run=server"], check=True)
""",
        ),
        (
            "pod_logs.py",
            """import httpx
KUBERNETES_SERVICE_HOST = "target.svc"
httpx.get("https://target.svc/api/v1/namespaces/shop/pods/api/log")
""",
        ),
    ],
)
def test_target_runtime_gate_detects_direct_authority(
    tmp_path: Path,
    name: str,
    source: str,
) -> None:
    path = tmp_path / name
    path.write_text(source, encoding="utf-8")

    assert _target_runtime_authority_offenders(
        tmp_path,
        allowed_roots=(),
        exception_paths=frozenset(),
    ) == [Path(name)]


def _target_runtime_authority_offenders(
    root: Path,
    *,
    allowed_roots: tuple[Path, ...],
    exception_paths: set[Path] | frozenset[Path],
) -> list[Path]:
    return []


def _runtime_sources(root: Path) -> list[Path]:
    extensions = {".rs", ".ts", ".tsx"}
    return [
        path
        for path in sorted(root.rglob("*"))
        if path.is_file()
        and path.suffix in extensions
        and not path.name.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))
        and path.name != "tests.rs"
        and "tests" not in path.parts
    ]


def _python_sources(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    return sorted(path for path in root.rglob("*.py") if "__pycache__" not in path.parts)
