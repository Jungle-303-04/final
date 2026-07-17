from __future__ import annotations

from pathlib import Path
from typing import Any

from conftest import ROOT, SpyDb, load_service, run_handler

from domains.gitops.events import (
    ManifestRenderedBody,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)

DIFF_WORKER_ROOT = ROOT / "src" / "services" / "gitops" / "diff-worker"
DIFF_WORKER_PATH = DIFF_WORKER_ROOT / "app.py"
DIRECT_KUBECTL_ADAPTER_PATH = DIFF_WORKER_ROOT / "kubernetes_dry_run.py"
CLUSTER_AGENT_PATH = ROOT / "src" / "services" / "target" / "cluster-agent" / "agent.py"
PRODUCT_SOURCE_ROOT = ROOT / "src"


def test_diff_worker_ignores_legacy_direct_ssa_flag_and_uses_observed_fallback(
    monkeypatch,
) -> None:
    monkeypatch.setenv("GITOPS_ENABLE_SSA_DRY_RUN", "1")
    diff = load_service("gitops/diff-worker")
    direct_calls: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    def forbidden_direct_call(*args: Any, **kwargs: Any) -> None:
        direct_calls.append((args, kwargs))
        raise AssertionError("diff-worker must not execute target-cluster SSA")

    # The legacy module exposes this symbol. ``raising=False`` keeps the test
    # valid after the symbol is removed while still proving it is never called.
    monkeypatch.setattr(diff, "load_dry_run_objects", forbidden_direct_call, raising=False)
    payload = ManifestRenderedBody(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        rendered_manifest=RenderedManifest(
            api_version="apps/v1",
            kind="Deployment",
            metadata=RenderedMetadata(name="payments", namespace="tenant-a"),
            spec=RenderedSpec(replicas=2, image="payments:v2"),
            manifest={
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {"name": "payments", "namespace": "tenant-a"},
                "spec": {
                    "replicas": 2,
                    "template": {
                        "spec": {"containers": [{"name": "payments", "image": "payments:v2"}]}
                    },
                },
            },
        ),
    )

    events = run_handler(
        diff.on_manifest_rendered,
        payload,
        db=SpyDb(get_actual_resource_image="payments:v1"),
    )

    assert direct_calls == []
    assert events[0].diff.actual_image == "payments:v1"
    assert events[0].diff.basis["live_source"] == "observed_actual_image"
    assert events[0].diff.basis["ssa_execution_boundary"] == "cluster_agent"
    assert events[0].diff.basis["ssa_evidence"] == "unavailable"


def test_cluster_agent_is_the_only_product_ssa_dry_run_executor() -> None:
    assert not DIRECT_KUBECTL_ADAPTER_PATH.exists()

    diff_source = DIFF_WORKER_PATH.read_text(encoding="utf-8")
    assert "kubernetes_dry_run" not in diff_source
    assert "GITOPS_ENABLE_SSA_DRY_RUN" not in diff_source
    assert "GITOPS_FIELD_MANAGER" not in diff_source
    assert "subprocess" not in diff_source
    assert "kubectl" not in diff_source

    executors = _ssa_executor_paths(ROOT / "src")
    assert executors == [CLUSTER_AGENT_PATH]
    agent_source = CLUSTER_AGENT_PATH.read_text(encoding="utf-8")
    assert "@command.handler(AgentConfig.APPLY_MANIFEST_ACTION)" in agent_source
    assert 'query = f"{query}&dryRun=All"' in agent_source


def test_prometheus_target_network_authority_is_cluster_agent_only() -> None:
    forbidden_registration_tokens = {
        "PROMETHEUS_BASE_URL",
        "prometheus_base_url",
        "PROMETHEUS_VALIDATE_BASE_URL",
    }
    query_executors: list[Path] = []

    for path in sorted(PRODUCT_SOURCE_ROOT.rglob("*.py")):
        source = path.read_text(encoding="utf-8")
        for token in forbidden_registration_tokens:
            assert token not in source, f"{token} reintroduced in {path}"
        if "/api/v1/query" in source:
            query_executors.append(path)

    assert query_executors
    assert all(
        ROOT / "src" / "services" / "target" / "cluster-agent" in path.parents
        for path in query_executors
    )


def _ssa_executor_paths(root: Path) -> list[Path]:
    executors: list[Path] = []
    for path in sorted(root.rglob("*.py")):
        source = path.read_text(encoding="utf-8")
        if "--dry-run=server" in source or "dryRun=All" in source:
            executors.append(path)
    return executors
