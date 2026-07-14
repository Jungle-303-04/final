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

ROLLOUT_SPEC = importlib.util.spec_from_file_location(
    "rollout_image_digest", ROOT / "scripts/rollout_image_digest.py"
)
assert ROLLOUT_SPEC is not None and ROLLOUT_SPEC.loader is not None
rollout_image_digest = importlib.util.module_from_spec(ROLLOUT_SPEC)
sys.modules[ROLLOUT_SPEC.name] = rollout_image_digest
ROLLOUT_SPEC.loader.exec_module(rollout_image_digest)
assert isinstance(rollout_image_digest, ModuleType)

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


def test_capture_rejects_missing_managed_targets_without_a_partial_escape_hatch(
    tmp_path: Path,
) -> None:
    expected = capture_image_digests.expected_deployment_containers(deployment_manifest(tmp_path))

    with pytest.raises(ValueError, match="is missing"):
        capture_image_digests.build_plan(
            expected=expected,
            live_document={"items": live_deployments()["items"][:1]},
            namespace="management",
            previous_release_sha=SHA,
        )


def test_capture_accepts_only_explicit_same_repository_tag_attestation(tmp_path: Path) -> None:
    expected = capture_image_digests.expected_deployment_containers(deployment_manifest(tmp_path))
    tagged = live_deployments(second_image="registry.example/opsia/service:release")

    plan = capture_image_digests.build_plan(
        expected=expected,
        live_document=tagged,
        namespace="management",
        previous_release_sha=SHA,
        verified_live_images={"registry.example/opsia/service:release": DIGEST},
    )

    assert plan.targets[1].image == DIGEST
    with pytest.raises(ValueError, match="same repository"):
        capture_image_digests.parse_verified_live_images(
            ["registry.example/other/service:release=" + DIGEST]
        )


def test_capture_rejects_duplicate_or_mutable_live_image_attestations() -> None:
    mapping = f"registry.example/opsia/service:release={DIGEST}"

    with pytest.raises(ValueError, match="duplicate"):
        capture_image_digests.parse_verified_live_images([mapping, mapping])
    with pytest.raises(ValueError, match="immutable sha256 digest"):
        capture_image_digests.parse_verified_live_images(
            ["registry.example/opsia/service:release=registry.example/opsia/service:other"]
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
        managed_image="service:latest",
        previous_release_sha=SHA,
        output=output,
    )

    assert calls[0] == ("kubectl", "config", "get-contexts", "opsia-dev", "-o", "name")
    assert calls[1][1:5] == ("--context", "opsia-dev", "-n", "management")
    assert output.stat().st_mode & 0o777 == 0o600
    assert revert_image_digests.load_plan(output).previous_release_sha == SHA


def test_capture_filters_out_unmanaged_deployment_images(tmp_path: Path) -> None:
    manifest = deployment_manifest(tmp_path)
    with manifest.open("a", encoding="utf-8") as handle:
        handle.write(
            """---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: console
spec:
  template:
    spec:
      containers:
        - name: console
          image: console:latest
"""
        )

    assert capture_image_digests.expected_deployment_containers(
        manifest, managed_image="service:latest"
    ) == (("api-gateway", "api-gateway"), ("audit-worker", "audit-worker"))


def test_capture_selects_every_live_container_by_exact_repository() -> None:
    live = live_deployments()
    items = live["items"]
    assert isinstance(items, list)
    items.append(
        {
            "metadata": {"name": "agent-api-proxy"},
            "spec": {
                "template": {
                    "spec": {
                        "containers": [
                            {
                                "name": "proxy",
                                "image": "nginxinc/nginx-unprivileged:1.29-alpine",
                            }
                        ]
                    }
                }
            },
        }
    )

    assert capture_image_digests.expected_repository_containers(
        live,
        managed_repository="registry.example/opsia/service",
    ) == (("api-gateway", "api-gateway"), ("audit-worker", "audit-worker"))


def test_rollout_repository_verification_fails_closed_on_stale_or_extra_target(
    tmp_path: Path,
) -> None:
    plan = revert_image_digests.load_plan(write_plan(tmp_path))
    next_digest = "registry.example/opsia/service@sha256:" + "c" * 64
    stale = live_deployments(second_image=next_digest)

    with pytest.raises(RuntimeError, match="target set changed"):
        rollout_image_digest.verify_repository_rollout(
            plan,
            image=next_digest,
            live_document=stale,
            require_exact_digest=True,
        )

    items = stale["items"]
    assert isinstance(items, list)
    only_target = {"items": [items[0]]}
    with pytest.raises(RuntimeError, match="digest mismatch"):
        rollout_image_digest.verify_repository_rollout(
            plan,
            image=next_digest,
            live_document=only_target,
            require_exact_digest=True,
        )


def test_rollout_updates_only_captured_targets_to_one_digest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plan = revert_image_digests.load_plan(write_plan(tmp_path))
    next_digest = "registry.example/opsia/service@sha256:" + "c" * 64
    calls: list[tuple[str, ...]] = []

    def fake_run(command: tuple[str, ...], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(tuple(command))
        if command[1:3] == ("config", "get-contexts"):
            stdout = "opsia-dev\n"
        elif command[-4:] == ("get", "deployments", "-o", "json"):
            stdout = json.dumps(
                {
                    "items": [
                        {
                            "metadata": {"name": "api-gateway"},
                            "spec": {
                                "template": {
                                    "spec": {
                                        "containers": [
                                            {
                                                "name": "api-gateway",
                                                "image": next_digest,
                                            }
                                        ]
                                    }
                                }
                            },
                        }
                    ]
                }
            )
        else:
            stdout = ""
        return subprocess.CompletedProcess(command, 0, stdout=stdout)

    monkeypatch.setattr(rollout_image_digest.subprocess, "run", fake_run)

    rollout_image_digest.rollout(
        plan,
        context="opsia-dev",
        image=next_digest,
        timeout="300s",
    )

    assert calls[2][-1] == f"api-gateway={next_digest}"
    assert calls[3][-2:] == ("deployment/api-gateway", "--timeout=300s")
    assert calls[1][-4:] == ("get", "deployments", "-o", "json")
    assert calls[4][-4:] == ("get", "deployments", "-o", "json")


def test_rollout_rejects_mutable_image_before_kubectl(tmp_path: Path) -> None:
    plan = revert_image_digests.load_plan(write_plan(tmp_path))

    with pytest.raises(ValueError, match="immutable sha256 digest"):
        rollout_image_digest.rollout_commands(
            plan,
            context="opsia-dev",
            image="registry.example/opsia/service:latest",
            timeout="300s",
        )
