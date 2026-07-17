from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path
from types import ModuleType

from packages.contracts.helm.operations import (
    HelmReleaseGuard,
    HelmReleaseOperationCommandPayload,
)
from packages.contracts.parity import ResourceRef

ROOT_DIR = Path(__file__).resolve().parents[1]
RUNNER_PATH = ROOT_DIR / "src" / "services" / "target" / "cluster-agent" / "commands" / "helm.py"


def load_runner_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "test_helm_release_operations_runner", RUNNER_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {RUNNER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(spec.name, None)
    return module


def _guard() -> HelmReleaseGuard:
    return HelmReleaseGuard(
        expected_revision=3,
        storage=ResourceRef(
            api_group="",
            version="v1",
            kind="Secret",
            namespace="sandbox",
            name="sh.helm.release.v1.storefront.v3",
            uid="storage-uid-v3",
        ),
        storage_resource_version="1042",
        chart_name="redis",
        chart_version="22.0.0",
    )


def _status() -> str:
    return (
        '{"name":"storefront","namespace":"sandbox","version":3,'
        '"chart":{"metadata":{"name":"redis","version":"22.0.0"}}}'
    )


def test_release_rollback_revalidates_status_then_runs_bounded_exact_revision() -> None:
    calls: list[list[str]] = []

    def run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        return subprocess.CompletedProcess(
            args,
            0,
            stdout=_status() if args[1] == "status" else "",
            stderr="",
        )

    result = load_runner_module().run_helm_release_operation(
        HelmReleaseOperationCommandPayload(
            operation="rollback",
            namespace="sandbox",
            release_name="storefront",
            guard=_guard(),
            rollback_revision=2,
        ),
        helm_binary="/usr/bin/helm",
        run=run,
    )

    assert result.succeeded is True
    assert calls[0][1:] == [
        "status",
        "storefront",
        "--namespace",
        "sandbox",
        "--output",
        "json",
    ]
    assert calls[1][1:] == [
        "rollback",
        "storefront",
        "2",
        "--namespace",
        "sandbox",
        "--wait",
        "--cleanup-on-fail",
        "--timeout",
        "300s",
    ]


def test_release_uninstall_fails_closed_when_agent_status_evidence_is_stale() -> None:
    calls: list[list[str]] = []

    def run(args: list[str], **_kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(args)
        stale = _status().replace('"version":3', '"version":4')
        return subprocess.CompletedProcess(args, 0, stdout=stale, stderr="")

    result = load_runner_module().run_helm_release_operation(
        HelmReleaseOperationCommandPayload(
            operation="uninstall",
            namespace="sandbox",
            release_name="storefront",
            guard=_guard(),
        ),
        helm_binary="/usr/bin/helm",
        run=run,
    )

    assert result.succeeded is False
    assert result.error_code == "helm_release_guard_stale"
    assert len(calls) == 1


def test_release_operation_contract_rejects_ambiguous_revision_inputs() -> None:
    payload = {
        "operation": "uninstall",
        "namespace": "sandbox",
        "release_name": "storefront",
        "guard": _guard().model_dump(mode="json"),
        "rollback_revision": 2,
    }

    try:
        HelmReleaseOperationCommandPayload.model_validate(payload)
    except ValueError as error:
        assert "rollback revision" in str(error).casefold()
    else:
        raise AssertionError("uninstall must reject rollback-only inputs")
