from __future__ import annotations

import ast
from pathlib import Path

from conftest import ROOT

CLUSTER_AGENT_ROOT = ROOT / "src" / "services" / "target" / "cluster-agent"
NODE_COLLECTOR_ROOT = ROOT / "src" / "services" / "target" / "node-collector"
TARGET_BOOTSTRAP = ROOT / "src" / "domains" / "target" / "router.py"
LOCAL_RENDERERS = {
    ROOT / "src" / "domains" / "gitops" / "repository_discovery.py",
    ROOT / "src" / "services" / "gitops" / "manifest-render-worker" / "app.py",
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
