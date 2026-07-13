from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/verify_dev_auth_bypass.py"
SPEC = importlib.util.spec_from_file_location("verify_dev_auth_bypass", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
verify_deployments = MODULE.verify_deployments


def deployment(value: object = "0", *, include: bool = True) -> dict[str, object]:
    env = [{"name": "DEV_AUTH_BYPASS", "value": value}] if include else []
    return {
        "kind": "Deployment",
        "metadata": {"name": "api-gateway"},
        "spec": {
            "template": {
                "spec": {"containers": [{"name": "api-gateway", "env": env}]},
            }
        },
    }


def test_gateway_requires_literal_zero_in_rendered_and_live_documents() -> None:
    verify_deployments([deployment()], source="rendered")

    for unsafe in (deployment("1"), deployment(include=False)):
        with pytest.raises(RuntimeError, match="DEV_AUTH_BYPASS=0"):
            verify_deployments([unsafe], source="rendered")


def test_gateway_rejects_secret_or_config_map_indirection() -> None:
    indirect = deployment()
    env = indirect["spec"]["template"]["spec"]["containers"][0]["env"]  # type: ignore[index]
    env[0] = {"name": "DEV_AUTH_BYPASS", "valueFrom": {"configMapKeyRef": {}}}

    with pytest.raises(RuntimeError, match="literal"):
        verify_deployments([indirect], source="live")


def test_live_reader_uses_an_explicit_context_and_namespace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[list[str]] = []

    def fake_run(command: list[str], **_: object) -> SimpleNamespace:
        calls.append(command)
        return SimpleNamespace(stdout=json.dumps({"items": [deployment()]}))

    monkeypatch.setattr(MODULE.subprocess, "run", fake_run)

    documents = MODULE._live_documents("opsia-management", "management")

    assert documents == [deployment()]
    assert calls == [
        [
            "kubectl",
            "--context",
            "opsia-management",
            "-n",
            "management",
            "get",
            "deployments.apps",
            "-o",
            "json",
        ]
    ]


def test_management_manifest_and_gate_run_the_fail_closed_verifier() -> None:
    services = (ROOT / "deploy/management/services.yaml").read_text(encoding="utf-8")
    manifest_check = (ROOT / "scripts/manifest-check.sh").read_text(encoding="utf-8")

    assert '- name: DEV_AUTH_BYPASS\n              value: "0"' in services
    assert "verify_dev_auth_bypass.py" in manifest_check
    assert "rendered" in manifest_check
