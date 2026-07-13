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
