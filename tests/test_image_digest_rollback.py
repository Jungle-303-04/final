from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "revert_image_digests", ROOT / "scripts/revert_image_digests.py"
)
assert SPEC is not None and SPEC.loader is not None
revert_image_digests = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = revert_image_digests
SPEC.loader.exec_module(revert_image_digests)
assert isinstance(revert_image_digests, ModuleType)

CAPTURE_SPEC = importlib.util.spec_from_file_location(
    "capture_image_digests", ROOT / "scripts/capture_image_digests.py"
)
assert CAPTURE_SPEC is not None and CAPTURE_SPEC.loader is not None
capture_image_digests = importlib.util.module_from_spec(CAPTURE_SPEC)
sys.modules[CAPTURE_SPEC.name] = capture_image_digests
CAPTURE_SPEC.loader.exec_module(capture_image_digests)
assert isinstance(capture_image_digests, ModuleType)

DIGEST = "registry.example/opsia/service@sha256:" + "a" * 64
SHA = "b" * 40


def write_plan(tmp_path: Path, *, image: str = DIGEST) -> Path:
    path = tmp_path / "rollback.json"
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "previous_release_sha": SHA,
                "targets": [
                    {
                        "namespace": "management",
                        "resource": "deployment/api-gateway",
                        "container": "api-gateway",
                        "image": image,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return path


def test_rollback_plan_requires_immutable_digest(tmp_path: Path) -> None:
    path = write_plan(tmp_path, image="registry.example/opsia/service:latest")

    with pytest.raises(ValueError, match="immutable sha256 digest"):
        revert_image_digests.load_plan(path)


def test_rollback_plan_rejects_command_injection_fields(tmp_path: Path) -> None:
    path = write_plan(tmp_path)
    document = json.loads(path.read_text())
    document["targets"][0]["resource"] = "deployment/api-gateway;rm"
    path.write_text(json.dumps(document))

    with pytest.raises(ValueError, match="deployment/<name>"):
        revert_image_digests.load_plan(path)


def test_apply_uses_explicit_context_digest_and_rollout_status(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plan = revert_image_digests.load_plan(write_plan(tmp_path))
    calls: list[tuple[str, ...]] = []

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(tuple(command))
        stdout = "opsia-dev\n" if command[1:3] == ("config", "get-contexts") else ""
        return subprocess.CompletedProcess(command, 0, stdout=stdout)

    monkeypatch.setattr(revert_image_digests.subprocess, "run", fake_run)

    revert_image_digests.apply_plan(plan, context="opsia-dev", timeout="300s")

    assert calls == [
        ("kubectl", "config", "get-contexts", "opsia-dev", "-o", "name"),
        (
            "kubectl",
            "--context",
            "opsia-dev",
            "-n",
            "management",
            "set",
            "image",
            "deployment/api-gateway",
            f"api-gateway={DIGEST}",
        ),
        (
            "kubectl",
            "--context",
            "opsia-dev",
            "-n",
            "management",
            "rollout",
            "status",
            "deployment/api-gateway",
            "--timeout=300s",
        ),
    ]
    assert all("undo" not in command for call in calls for command in call)
    assert all("alembic" not in command for call in calls for command in call)


def test_apply_fails_closed_when_explicit_context_is_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plan = revert_image_digests.load_plan(write_plan(tmp_path))
    calls = 0

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        nonlocal calls
        calls += 1
        return subprocess.CompletedProcess(command, 0, stdout="")

    monkeypatch.setattr(revert_image_digests.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="context was not found"):
        revert_image_digests.apply_plan(plan, context="opsia-dev", timeout="300s")

    assert calls == 1


def deployment_manifest(tmp_path: Path) -> Path:
    path = tmp_path / "services.yaml"
    path.write_text(
        """apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  template:
    spec:
      containers:
        - name: api-gateway
          image: service:latest
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: audit-worker
spec:
  template:
    spec:
      containers:
        - name: audit-worker
          image: service:latest
""",
        encoding="utf-8",
    )
    return path


def live_deployments(*, second_image: str = DIGEST) -> dict[str, object]:
    return {
        "items": [
            {
                "metadata": {"name": "api-gateway"},
                "spec": {
                    "template": {"spec": {"containers": [{"name": "api-gateway", "image": DIGEST}]}}
                },
            },
            {
                "metadata": {"name": "audit-worker"},
                "spec": {
                    "template": {
                        "spec": {"containers": [{"name": "audit-worker", "image": second_image}]}
                    }
                },
            },
        ]
    }


def test_capture_builds_complete_plan_from_manifest_and_live_digests(tmp_path: Path) -> None:
    expected = capture_image_digests.expected_deployment_containers(deployment_manifest(tmp_path))

    plan = capture_image_digests.build_plan(
        expected=expected,
        live_document=live_deployments(),
        namespace="management",
        previous_release_sha=SHA,
    )

    assert [(target.resource, target.container, target.image) for target in plan.targets] == [
        ("deployment/api-gateway", "api-gateway", DIGEST),
        ("deployment/audit-worker", "audit-worker", DIGEST),
    ]


def test_capture_rejects_tagged_or_missing_live_targets(tmp_path: Path) -> None:
    expected = capture_image_digests.expected_deployment_containers(deployment_manifest(tmp_path))

    with pytest.raises(ValueError, match="not digest-pinned"):
        capture_image_digests.build_plan(
            expected=expected,
            live_document=live_deployments(second_image="service:latest"),
            namespace="management",
            previous_release_sha=SHA,
        )

    with pytest.raises(ValueError, match="is missing"):
        capture_image_digests.build_plan(
            expected=expected,
            live_document={"items": live_deployments()["items"][:1]},
            namespace="management",
            previous_release_sha=SHA,
        )


def test_capture_checks_context_and_writes_private_plan(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    manifest = deployment_manifest(tmp_path)
    output = tmp_path / "rollback.json"
    calls: list[tuple[str, ...]] = []

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(tuple(command))
        stdout = (
            "opsia-dev\n"
            if command[1:3] == ("config", "get-contexts")
            else json.dumps(live_deployments())
        )
        return subprocess.CompletedProcess(command, 0, stdout=stdout)

    monkeypatch.setattr(capture_image_digests.subprocess, "run", fake_run)

    capture_image_digests.capture(
        context="opsia-dev",
        namespace="management",
        manifest=manifest,
        previous_release_sha=SHA,
        output=output,
    )

    assert calls[0] == ("kubectl", "config", "get-contexts", "opsia-dev", "-o", "name")
    assert calls[1][1:5] == ("--context", "opsia-dev", "-n", "management")
    assert output.stat().st_mode & 0o777 == 0o600
    assert revert_image_digests.load_plan(output).previous_release_sha == SHA
