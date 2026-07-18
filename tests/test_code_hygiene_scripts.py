from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

ROOT = Path(__file__).resolve().parents[1]
E2E_SCRIPT = ROOT / "scripts" / "e2e_test.py"
STATUS_SCRIPT = ROOT / "scripts" / "status.sh"
CLUSTER_INTERACTIONS_SCRIPT = ROOT / "scripts" / "cluster-interactions.sh"
EXTERNAL_KUBECONFIG_SCRIPT = ROOT / "scripts" / "external-console-kubeconfig.sh"
DEMO_RESET_SCRIPT = ROOT / "scripts" / "demo-reset.sh"
EXTERNAL_CONSOLE_ENV = ROOT / "config" / "env" / "external-console.env.example"


def load_e2e_module() -> Any:
    spec = importlib.util.spec_from_file_location("code_hygiene_e2e_test", E2E_SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_gitops_flow_reports_missing_deployments_as_failures(monkeypatch) -> None:
    e2e = load_e2e_module()
    monkeypatch.setattr(e2e, "kubectl_json", lambda *_args: None)

    e2e.test_gitops_flow()

    assert len(e2e.checks) == 7
    assert all(not result.ok for result in e2e.checks)
    assert all("Deployment" in result.name for result in e2e.checks)


def test_nats_flow_only_runs_probes_used_by_checks(monkeypatch) -> None:
    e2e = load_e2e_module()
    calls: list[tuple[str, ...]] = []

    def fake_kubectl(_context: str, *args: str, timeout: int = 30) -> tuple[int, str]:
        assert timeout > 0
        calls.append(args)
        command = " ".join(args)
        if "jsz?streams=true" in command:
            return 0, "no_monitoring"
        if "deploy/api-gateway" in command:
            return 0, "outbox relay publish"
        if "deploy/audit-worker" in command:
            return 0, "consumed event " * 5
        return 0, "healthy"

    monkeypatch.setattr(e2e, "kubectl", fake_kubectl)

    e2e.test_nats_events()

    assert len(calls) == 4
    assert not any("nats-server --version" in " ".join(call) for call in calls)
    assert not any("/etc/nats/nats-server.conf" in " ".join(call) for call in calls)


@pytest.mark.parametrize(
    ("primary_status", "fallback_status", "expected_status"),
    [(1, 0, 0), (1, 1, 1)],
)
def test_status_health_fallback_preserves_failure(
    tmp_path: Path,
    primary_status: int,
    fallback_status: int,
    expected_status: int,
) -> None:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    kubectl = bin_dir / "kubectl"
    kubectl.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    kubectl.chmod(0o755)
    curl = bin_dir / "curl"
    curl.write_text(
        """#!/usr/bin/env bash
printf '%s\n' "${@: -1}" >> "${CURL_LOG}"
if [[ "${@: -1}" == */api/healthz ]]; then
  exit "${PRIMARY_STATUS}"
fi
exit "${FALLBACK_STATUS}"
""",
        encoding="utf-8",
    )
    curl.chmod(0o755)
    curl_log = tmp_path / "curl.log"
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "MGMT_CONTEXT": "management-test",
        "TARGET_CONTEXT": "target-test",
        "BASE_URL": "https://service.test",
        "CURL_LOG": str(curl_log),
        "PRIMARY_STATUS": str(primary_status),
        "FALLBACK_STATUS": str(fallback_status),
    }

    result = subprocess.run(
        ["bash", str(STATUS_SCRIPT)],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == expected_status
    assert curl_log.read_text(encoding="utf-8").splitlines() == [
        "https://service.test/api/healthz",
        "https://service.test/healthz",
    ]


def test_operational_cluster_defaults_use_canonical_real_eks_names() -> None:
    interaction_script = CLUSTER_INTERACTIONS_SCRIPT.read_text(encoding="utf-8")
    kubeconfig_script = EXTERNAL_KUBECONFIG_SCRIPT.read_text(encoding="utf-8")
    reset_script = DEMO_RESET_SCRIPT.read_text(encoding="utf-8")
    external_env = EXTERNAL_CONSOLE_ENV.read_text(encoding="utf-8")

    canonical_contexts = 'CLUSTER_CONTEXTS="management-server game-server demo-server"'
    for text in (interaction_script, kubeconfig_script, external_env):
        assert canonical_contexts in text
        assert "cluster-1" not in text
        assert "cluster-2" not in text

    assert 'TARGET_CONTEXT="${TARGET_CONTEXT:-game-server}"' in reset_script
    assert 'CLUSTER_ID="${CLUSTER_ID:-game-server}"' in reset_script
    assert "cluster-1" not in reset_script
