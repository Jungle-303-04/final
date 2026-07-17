from __future__ import annotations

import ast
from collections.abc import Mapping
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
TARGET_RUNTIME_EXCEPTIONS = {
    TARGET_BOOTSTRAP: frozenset({"target_process"}),
    **{path: frozenset({"target_process"}) for path in LOCAL_RENDERERS},
    ROOT / "src" / "packages" / "security" / "vault.py": frozenset({"target_network"}),
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
            "kube_token.py",
            """import httpx
KUBE_TOKEN = "target-token"
httpx.get("https://target.svc/version", headers={"Authorization": KUBE_TOKEN})
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
            "argocd.py",
            """import httpx
ARGOCD_URL = "https://argocd.target.svc"
httpx.post(ARGOCD_URL + "/api/v1/applications/shop/sync")
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
        exception_paths={},
    ) == [Path(name)]


def _target_runtime_authority_offenders(
    root: Path,
    *,
    allowed_roots: tuple[Path, ...],
    exception_paths: Mapping[Path, frozenset[str]],
) -> list[Path]:
    allowed = tuple(path.resolve() for path in allowed_roots)
    exceptions = {path.resolve(): kinds for path, kinds in exception_paths.items()}
    offenders: list[Path] = []

    for path in _python_sources(root):
        resolved = path.resolve()
        if any(
            resolved == allowed_root or allowed_root in resolved.parents for allowed_root in allowed
        ):
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        authority = _target_runtime_authority(tree) - exceptions.get(resolved, frozenset())
        if authority:
            offenders.append(path.relative_to(root))

    return offenders


def _target_runtime_authority(tree: ast.AST) -> set[str]:
    authority: set[str] = set()
    imports = _imported_modules(tree)
    if any(
        module == "kubernetes"
        or module.startswith("kubernetes.")
        or module == "kubernetes_asyncio"
        or module.startswith("kubernetes_asyncio.")
        for module in imports
    ):
        authority.add("kubernetes_client")

    strings = {
        value.casefold()
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
        for value in (node.value,)
    }
    identifiers = {node.id.casefold() for node in ast.walk(tree) if isinstance(node, ast.Name)}
    call_names = {
        name.casefold()
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        if (name := _qualified_name(node.func))
    }

    if _has_target_process_authority(imports, strings, call_names):
        authority.add("target_process")
    if _has_target_network_authority(imports, strings, identifiers, call_names):
        authority.add("target_network")
    return authority


def _has_target_process_authority(
    imports: set[str],
    strings: set[str],
    call_names: set[str],
) -> bool:
    process_imported = "subprocess" in imports or "asyncio" in imports
    process_called = any(
        name.startswith("subprocess.")
        or name.endswith("create_subprocess_exec")
        or name.endswith("create_subprocess_shell")
        for name in call_names
    )
    command_tokens = {token for value in strings for token in value.replace("=", " ").split()}
    target_tools = {"kubectl", "helm", "argocd", "flux"}
    return (
        process_imported
        and process_called
        and (
            bool(command_tokens & target_tools)
            or any(tool in value for tool in target_tools for value in strings)
        )
    )


def _has_target_network_authority(
    imports: set[str],
    strings: set[str],
    identifiers: set[str],
    call_names: set[str],
) -> bool:
    outbound_modules = {"httpx", "requests", "aiohttp", "socket", "websockets"}
    outbound_imported = any(
        module.split(".", 1)[0] in outbound_modules
        or module == "urllib.request"
        or module.startswith("urllib.request.")
        for module in imports
    )
    outbound_called = any(
        name.startswith(("httpx.", "requests.", "aiohttp.", "websockets.", "socket."))
        or name.endswith((".request", ".get", ".post", ".put", ".patch", ".delete"))
        or name.endswith((".urlopen", ".create_connection", ".asyncclient", ".clientsession"))
        for name in call_names
    )
    if not (outbound_imported and outbound_called):
        return False

    target_identifiers = {
        "prometheus_base_url",
        "prometheus_url",
        "loki_base_url",
        "tempo_base_url",
        "kubeconfig",
        "kube_token",
        "kubernetes_token",
        "kubernetes_api",
        "kubernetes_api_url",
        "kubernetes_api_base_url",
        "kubernetes_service_host",
        "kubernetes_service_port",
        "service_account_token",
        "target_api_url",
        "target_cluster_url",
        "target_url",
        "argocd_url",
        "flux_url",
    }
    endpoint_markers = (
        "/api/v1/query",
        "/loki/api/v1/",
        "/api/search",
        "/api/traces",
        "/api/v1/namespaces/",
        "/apis/apps/",
        "/apis/batch/",
        "/apis/argoproj.io/",
        "/apis/kustomize.toolkit.fluxcd.io/",
        "/apis/helm.toolkit.fluxcd.io/",
        "/var/run/secrets/kubernetes.io/serviceaccount/",
    )
    return bool((identifiers | strings) & target_identifiers) or any(
        marker in value for marker in endpoint_markers for value in strings
    )


def _imported_modules(tree: ast.AST) -> set[str]:
    modules = {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    }
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        module = node.module or ""
        modules.add(module)
        modules.update(f"{module}.{alias.name}" for alias in node.names if module)
    return modules


def _qualified_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = _qualified_name(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr
    return ""


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
