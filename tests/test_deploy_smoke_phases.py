from __future__ import annotations

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pre_deploy_smoke_uses_only_legacy_safe_health_frontend_and_database_checks() -> None:
    source = read("scripts/pre-deploy-smoke.sh")

    assert "http://api-gateway.${MGMT_NS}.svc.cluster.local" in source
    assert "http://console.${MGMT_NS}.svc.cluster.local" in source
    assert "curlimages/curl:8.11.1" in source
    assert 'cluster_curl "${IN_CLUSTER_API_URL}/api/healthz"' in source
    assert 'cluster_curl "${IN_CLUSTER_CONSOLE_URL}/"' in source
    assert "PRE_DEPLOY_HEALTH_MAX_ATTEMPTS" in source
    assert "PRE_DEPLOY_HEALTH_BACKOFF_MAX_SECONDS" in source
    assert "pre-deploy health attempt=" in source
    assert 'test "${health_ready}" = "1"' in source
    assert 'test "${frontend_status}" = "200"' in source
    assert "SELECT 1" in source
    assert "frontend_bundle=" in source
    for forbidden in (
        "AUTH_EMAIL",
        "AUTH_PASSWORD",
        "SMOKE_RCA",
        "strict_api_smoke",
        "rca/bundles",
    ):
        assert forbidden not in source


def _write_fake_pre_deploy_commands(tmp_path: Path) -> Path:
    count_file = tmp_path / "health-count"
    fake_kubectl = tmp_path / "kubectl"
    fake_kubectl.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
url="${!#}"
if [[ "${url}" == */api/healthz ]]; then
  count=0
  if [ -f "${FAKE_CURL_COUNT}" ]; then count="$(cat "${FAKE_CURL_COUNT}")"; fi
  count=$((count + 1))
  printf '%s' "${count}" >"${FAKE_CURL_COUNT}"
  if [ "${FAKE_HEALTH_ALWAYS_FAIL:-0}" = "1" ] || [ "${count}" -lt 3 ]; then
    printf '%s\n%s\n' '{"status":"warming"}' '503'
  else
    printf '%s\n%s\n' '{"status":"ok"}' '200'
  fi
elif [[ "${url}" == http://console.* ]]; then
  printf '%s\n%s\n' '<script src="/assets/index-newBundle.js"></script>' '200'
else
  printf '1\n'
fi
""",
        encoding="utf-8",
    )
    fake_kubectl.chmod(0o755)
    return count_file


def _run_fake_pre_deploy(
    tmp_path: Path, *, always_fail: bool = False
) -> subprocess.CompletedProcess:
    count_file = _write_fake_pre_deploy_commands(tmp_path)
    env = {
        **os.environ,
        "PATH": f"{tmp_path}:{os.environ['PATH']}",
        "BASE_URL": "https://live.invalid",
        "MGMT_CONTEXT": "opsia-dev",
        "MGMT_NS": "management",
        "FAKE_CURL_COUNT": str(count_file),
        "FAKE_HEALTH_ALWAYS_FAIL": "1" if always_fail else "0",
        "PRE_DEPLOY_HEALTH_MAX_ATTEMPTS": "3",
        "PRE_DEPLOY_HEALTH_BACKOFF_MAX_SECONDS": "0",
    }
    return subprocess.run(
        ["bash", str(ROOT / "scripts/pre-deploy-smoke.sh")],
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def test_pre_deploy_health_retries_transient_status_and_requires_final_ok(tmp_path: Path) -> None:
    result = _run_fake_pre_deploy(tmp_path)

    assert result.returncode == 0, result.stderr
    assert "attempt=1/3 status=503" in result.stderr
    assert "attempt=2/3 status=503" in result.stderr
    assert "attempt=3/3 status=200" in result.stderr
    assert result.stdout == "frontend_bundle=index-newBundle.js\n"


def test_pre_deploy_health_fails_after_bounded_attempts(tmp_path: Path) -> None:
    result = _run_fake_pre_deploy(tmp_path, always_fail=True)

    assert result.returncode != 0
    assert result.stderr.count("pre-deploy health attempt=") == 3
    assert "attempt=3/3 status=503" in result.stderr


def test_post_deploy_smoke_enforces_new_release_contracts() -> None:
    source = read("scripts/post-deploy-smoke.sh")

    assert "http://api-gateway.${MGMT_NS}.svc.cluster.local" in source
    assert "http://console.${MGMT_NS}.svc.cluster.local" in source
    assert "service/api-gateway :80" in source
    assert "IN_CLUSTER_FORWARD_URL" in source
    assert 'test "${health_status}" = "200"' in source
    assert 'test "${frontend_status}" = "200"' in source
    assert "PRE_DEPLOY_FRONTEND_BUNDLE" in source
    assert "REQUIRE_FRONTEND_BUNDLE_CHANGE" in source
    assert 'test "${post_bundle}" != "${PRE_DEPLOY_FRONTEND_BUNDLE}"' in source
    assert 'bash "${SCRIPT_DIR}/smoke.sh"' in source
    assert "SELECT version_num FROM alembic_version" in source
    assert "EXPECTED_ALEMBIC_HEAD" in source
    assert 'verify_dev_auth_bypass.py" live' in source
    assert "SERVICE_ROLLBACK_PLAN" in source
    assert "CONSOLE_ROLLBACK_PLAN" in source
    assert "EXPECTED_SERVICE_IMAGE" in source
    assert "EXPECTED_CONSOLE_IMAGE" in source
    assert "@sha256:" in source
    assert "post-deploy public edge reachability (non-blocking)" in source
    assert "in-cluster smoke remains authoritative" in source
