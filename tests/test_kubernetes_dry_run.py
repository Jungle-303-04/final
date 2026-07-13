from __future__ import annotations

import json
import subprocess
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from conftest import ROOT, load_file

ADAPTER_PATH = ROOT / "src" / "services" / "gitops" / "diff-worker" / "kubernetes_dry_run.py"
MODULE = load_file(ADAPTER_PATH, "test_kubernetes_dry_run_module")


def _rendered() -> SimpleNamespace:
    return SimpleNamespace(
        manifest={
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "payments", "namespace": "tenant-a"},
            "spec": {"replicas": 2},
        }
    )


def test_load_dry_run_objects_applies_then_reads_live_resource(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    predicted = {"kind": "Deployment", "metadata": {"name": "payments"}, "spec": {"replicas": 2}}
    live = {"kind": "Deployment", "metadata": {"name": "payments"}, "spec": {"replicas": 1}}
    calls: list[tuple[list[str], dict[str, Any]]] = []
    written_manifest: dict[str, Any] = {}
    manifest_paths: list[Path] = []

    def run(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append((command, kwargs))
        if command[1] == "apply":
            manifest_path = Path(command[6])
            manifest_paths.append(manifest_path)
            written_manifest.update(json.loads(manifest_path.read_text(encoding="utf-8")))
            return subprocess.CompletedProcess(command, 0, json.dumps(predicted), "")
        return subprocess.CompletedProcess(command, 0, json.dumps(live), "")

    monkeypatch.setattr(MODULE.subprocess, "run", run)

    result = MODULE.load_dry_run_objects(
        _rendered(),
        kubectl="/opt/bin/kubectl",
        field_manager="opsia-test",
        timeout_seconds=7,
    )

    assert result == MODULE.DryRunObjects(predicted=predicted, live=live)
    assert written_manifest == _rendered().manifest
    assert calls[0][0][:6] == [
        "/opt/bin/kubectl",
        "apply",
        "--server-side",
        "--dry-run=server",
        "--field-manager=opsia-test",
        "-f",
    ]
    assert calls[0][0][7:] == ["-o", "json"]
    assert calls[1][0] == [
        "/opt/bin/kubectl",
        "get",
        "deployment",
        "payments",
        "-n",
        "tenant-a",
        "-o",
        "json",
    ]
    assert [kwargs for _command, kwargs in calls] == [
        {"check": True, "capture_output": True, "text": True, "timeout": 7},
        {"check": True, "capture_output": True, "text": True, "timeout": 7},
    ]
    assert len(manifest_paths) == 1
    assert not manifest_paths[0].exists()


def test_apply_failure_short_circuits_live_read(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []

    def fail_apply(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(command)
        raise subprocess.CalledProcessError(1, command, stderr="apply forbidden\n")

    monkeypatch.setattr(MODULE.subprocess, "run", fail_apply)

    result = MODULE.load_dry_run_objects(_rendered())

    assert result == MODULE.DryRunObjects(
        predicted=None,
        live=None,
        error="apply forbidden",
    )
    assert len(calls) == 1
    assert calls[0][1] == "apply"


def test_live_read_failure_preserves_predicted_object(monkeypatch: pytest.MonkeyPatch) -> None:
    predicted = {"kind": "Deployment", "metadata": {"name": "payments"}}
    calls = 0

    def fail_get(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        nonlocal calls
        calls += 1
        if command[1] == "apply":
            return subprocess.CompletedProcess(command, 0, json.dumps(predicted), "")
        raise subprocess.CalledProcessError(1, command, output="resource not found\n")

    monkeypatch.setattr(MODULE.subprocess, "run", fail_get)

    result = MODULE.load_dry_run_objects(_rendered())

    assert result == MODULE.DryRunObjects(
        predicted=predicted,
        live=None,
        error="resource not found",
    )
    assert calls == 2


@pytest.mark.parametrize(
    ("error", "expected"),
    (
        (FileNotFoundError(), "kubectl_not_found"),
        (subprocess.TimeoutExpired(["kubectl"], 3), "kubectl_timeout"),
        (
            subprocess.CalledProcessError(1, ["kubectl"], output="stdout failure\n"),
            "stdout failure",
        ),
    ),
)
def test_run_json_maps_process_failures(
    monkeypatch: pytest.MonkeyPatch,
    error: BaseException,
    expected: str,
) -> None:
    def fail(*args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        raise error

    monkeypatch.setattr(MODULE.subprocess, "run", fail)

    assert MODULE._run_json(["kubectl", "version"], timeout_seconds=3) == expected


def test_run_json_reports_invalid_stdout(monkeypatch: pytest.MonkeyPatch) -> None:
    def invalid_json(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, 0, "{", "")

    monkeypatch.setattr(MODULE.subprocess, "run", invalid_json)

    result = MODULE._run_json(["kubectl", "version"], timeout_seconds=3)

    assert result.startswith("kubectl_invalid_json:")


def test_default_timeout_is_bound_from_environment_at_import(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GITOPS_DRY_RUN_TIMEOUT_SECONDS", "17")
    fresh = load_file(ADAPTER_PATH, "test_kubernetes_dry_run_timeout_module")
    timeouts: list[int] = []

    def run_json(command: list[str], *, timeout_seconds: int) -> dict[str, Any]:
        timeouts.append(timeout_seconds)
        return {"kind": "Deployment", "metadata": {"name": "payments"}}

    monkeypatch.setattr(fresh, "_run_json", run_json)

    result = fresh.load_dry_run_objects(_rendered())

    assert fresh.DRY_RUN_TIMEOUT_SECONDS == 17
    assert result.error is None
    assert timeouts == [17, 17]
