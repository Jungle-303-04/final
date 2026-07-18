from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_cluster_curl_normalizes_attach_fallback_duplicate_response() -> None:
    source = ROOT / "scripts/lib/cluster-curl.sh"
    marker = "__OPSIA_HTTP_STATUS__="
    duplicated = f'{{"status":"ok"}}\n{marker}200\n{{"status":"ok"}}\n{marker}200\n'

    result = subprocess.run(
        [
            "bash",
            "-c",
            f'source "{source}"; _normalize_cluster_curl_response',
        ],
        input=duplicated,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout == '{"status":"ok"}\n200\n'
    script = source.read_text(encoding="utf-8")
    assert "--rm -i --restart=Never" not in script
    assert "--pod-running-timeout=30s" in script
    assert "--follow" in script
    assert "_wait_for_cluster_curl_container" in script
    assert "_delete_cluster_curl_pod" in script


def test_pre_deploy_smoke_uses_only_legacy_safe_health_frontend_and_database_checks() -> None:
    source = read("scripts/pre-deploy-smoke.sh")

    assert "http://api-gateway.${MGMT_NS}.svc.cluster.local" in source
    assert "http://console-dev.${MGMT_NS}.svc.cluster.local" in source
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
command="${1:-}"
if [ "${command}" = "--context" ]; then command="${5:-}"; fi
if [ "${command}" = "run" ]; then
  printf '%s' "${!#}" >"${FAKE_CLUSTER_CURL_URL}"
  exit 0
fi
if [ "${command}" = "delete" ]; then
  exit 0
fi
if [ "${command}" != "logs" ]; then
  printf '1\\n'
  exit 0
fi
url="$(cat "${FAKE_CLUSTER_CURL_URL}")"
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
elif [[ "${url}" == http://console-dev.* ]]; then
  printf '%s\n%s\n' '<script src="/assets/index-newBundle.js"></script>' '200'
else
  exit 1
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
        "FAKE_CLUSTER_CURL_URL": str(tmp_path / "cluster-curl-url"),
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
    assert "http://console-dev.${MGMT_NS}.svc.cluster.local" in source
    assert "service/api-gateway :80" in source
    assert "IN_CLUSTER_FORWARD_URL" in source
    assert 'test "${health_status}" = "200"' in source
    assert 'test "${frontend_status}" = "200"' in source
    assert "PRE_DEPLOY_FRONTEND_BUNDLE" in source
    assert "REQUIRE_FRONTEND_BUNDLE_CHANGE" in source
    assert 'test "${post_bundle}" != "${PRE_DEPLOY_FRONTEND_BUNDLE}"' in source
    assert 'bash "${SCRIPT_DIR}/post_deploy_read_smoke.sh"' in source
    assert 'bash "${SCRIPT_DIR}/smoke.sh"' not in source
    assert "SELECT version_num FROM alembic_version" in source
    assert "EXPECTED_ALEMBIC_HEAD" in source
    assert 'verify_dev_auth_bypass.py" live' in source
    assert "SERVICE_ROLLBACK_PLAN" in source
    assert "CONSOLE_ROLLBACK_PLAN" in source
    assert "EXPECTED_SERVICE_IMAGE" in source
    assert "EXPECTED_CONSOLE_IMAGE" in source
    assert "@sha256:" in source
    assert "post-deploy public edge convergence" in source
    assert "wait_for_public_edge_release" in source
    assert "non-blocking" not in source


def _run_public_edge_wait(
    tmp_path: Path,
    *,
    converge: bool,
    discover_bundle: bool = False,
) -> subprocess.CompletedProcess[str]:
    expected_bundle = "" if discover_bundle else "index-newBundle.js"
    source_sha = "a" * 40
    fake_kubectl = tmp_path / "kubectl"
    fake_kubectl.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${KUBECTL_LOG}"
cat >/dev/null
count=0
if [ -f "${EDGE_COUNT}" ]; then count="$(cat "${EDGE_COUNT}")"; fi
count=$((count + 1))
printf '%s' "${count}" >"${EDGE_COUNT}"
if [ "${EDGE_CONVERGE}" = "1" ] && [ "${count}" -ge 2 ]; then
  observed_bundle="index-newBundle.js"
else
  observed_bundle="index-oldBundle.js"
fi
if [ "${EDGE_DISCOVER}" = "1" ]; then
  release_bundle="${observed_bundle}"
  if [ "${observed_bundle}" = "index-newBundle.js" ]; then
    source_valid=true
  else
    source_valid=false
  fi
else
  release_bundle="index-newBundle.js"
  source_valid=true
fi
printf '{"health_status":200,"health_valid":true,"index_status":200,'
printf '"observed_bundle":"%s","release_bundle":"%s",' \
  "${observed_bundle}" "${release_bundle}"
printf '"bundle_status":200,"source_valid":%s}\n' "${source_valid}"
""",
        encoding="utf-8",
    )
    fake_kubectl.chmod(0o755)
    env = {
        **os.environ,
        "PATH": f"{tmp_path}:{os.environ['PATH']}",
        "EDGE_CONVERGE": "1" if converge else "0",
        "EDGE_DISCOVER": "1" if discover_bundle else "0",
        "EDGE_COUNT": str(tmp_path / "edge-count"),
        "KUBECTL_LOG": str(tmp_path / "kubectl.log"),
        "MGMT_CONTEXT": "opsia-test",
        "MGMT_NS": "management",
        "PUBLIC_EDGE_MAX_ATTEMPTS": "3",
        "PUBLIC_EDGE_RETRY_SECONDS": "0",
    }
    return subprocess.run(
        [
            "bash",
            "-c",
            (
                f'source "{ROOT / "scripts/lib/public-edge.sh"}"; '
                f'wait_for_public_edge_release "https://live.invalid" '
                f'"{expected_bundle}" "{source_sha}"'
            ),
        ],
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def test_public_edge_wait_blocks_until_health_bundle_and_source_converge(
    tmp_path: Path,
) -> None:
    result = _run_public_edge_wait(tmp_path, converge=True)

    assert result.returncode == 0, result.stderr
    assert "public edge pending: attempt=1/3" in result.stderr
    assert "public edge converged: attempt=2" in result.stdout
    assert "health=200 index=200 bundle=200" in result.stderr
    kubectl_calls = (tmp_path / "kubectl.log").read_text(encoding="utf-8").splitlines()
    assert len(kubectl_calls) == 2
    assert all(
        "--context opsia-test -n management exec -i deployment/api-gateway "
        "-c gateway -- python -" in call
        for call in kubectl_calls
    )


def test_public_edge_wait_fails_after_bounded_attempts(tmp_path: Path) -> None:
    result = _run_public_edge_wait(tmp_path, converge=False)

    assert result.returncode != 0
    assert result.stderr.count("public edge pending:") == 3
    assert "public edge probe diagnostic:" in result.stderr
    assert "response=valid-json" in result.stderr
    assert "public edge failed to converge" in result.stderr


def test_public_edge_wait_can_discover_an_already_released_bundle(tmp_path: Path) -> None:
    result = _run_public_edge_wait(tmp_path, converge=True, discover_bundle=True)

    assert result.returncode == 0, result.stderr
    assert "bundle=index-newBundle.js" in result.stdout


def test_public_edge_probe_preserves_public_dns_tls_without_runner_curl() -> None:
    source = read("scripts/lib/public-edge.sh")

    assert "exec -i deployment/api-gateway -c gateway" in source
    assert "from urllib.request import Request, urlopen" in source
    assert 'parsed.scheme != "https"' in source
    assert 'release_url("/api/healthz")' in source
    assert "release_url(" in source
    assert '"source_sha": source_sha' in source
    assert 'f"/assets/{quote(release_bundle' in source
    assert "source_sha.encode" in source
    assert "public edge probe diagnostic:" in source
    assert "curl --" not in source


def _write_post_deploy_read_fakes(
    tmp_path: Path, *, login_ok: bool, reads_ok: bool
) -> dict[str, str]:
    curl_log = tmp_path / "curl.log"
    fake_curl = tmp_path / "curl"
    fake_curl.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        'printf \'%s\\n\' "$*" >>"${CURL_LOG}"\n'
        'url=""\n'
        'output=""\n'
        'cookie_jar=""\n'
        "write_out=0\n"
        'previous=""\n'
        'for argument in "$@"; do\n'
        '  if [ "${previous}" = "--output" ]; then output="${argument}"; fi\n'
        '  if [ "${previous}" = "-c" ]; then cookie_jar="${argument}"; fi\n'
        '  if [ "${argument}" = "--write-out" ]; then write_out=1; fi\n'
        '  case "${argument}" in http://*|https://*) url="${argument}" ;; esac\n'
        '  previous="${argument}"\n'
        "done\n"
        + (
            'if [[ "${url}" == */auth/login ]]; then\n'
            '  test -n "${cookie_jar}"\n'
            "  printf '%s\\n' '# Netscape HTTP Cookie File' "
            "'#HttpOnly_127.0.0.1\\tFALSE\\t/\\tTRUE\\t0\\topsia_session\\tsession-token' "
            '> "${cookie_jar}"\n'
            "  exit 0\n"
            "fi\n"
            if login_ok
            else 'if [[ "${url}" == */auth/login ]]; then echo login-denied >&2; exit 22; fi\n'
        )
        + 'test -n "${output}"\n'
        + (
            'case "${url}" in\n'
            "  */clusters*) printf '%s' '{\"clusters\":[]}' >\"${output}\" ;;\n"
            "  */resources*) printf '%s' '{\"items\":[]}' >\"${output}\" ;;\n"
            '  */auth/session) printf \'%s\' \'{"user_id":"user-1"}\' >"${output}" ;;\n'
            '  */diagnostics) printf \'%s\' \'{"observed_at":"2026-07-18T00:00:00Z"}\' >"${output}" ;;\n'
            '  */version-check) printf \'%s\' \'{"current_version":"1.0.0"}\' >"${output}" ;;\n'
            "  */dashboard/rca/issues*) printf '%s' '{\"items\":[]}' >\"${output}\" ;;\n"
            "  */applications*) printf '%s' '{\"applications\":[]}' >\"${output}\" ;;\n"
            '  */timeline/capabilities) printf \'%s\' \'{"selected_source_mode":"all"}\' >"${output}" ;;\n'
            "  */traffic/flows*) printf '%s' '{\"scope_coverage\":{}}' >\"${output}\" ;;\n"
            "  */traffic/sources*) printf '%s' '{\"clusters\":[]}' >\"${output}\" ;;\n"
            "  */helm/releases*) printf '%s' '{\"releases\":[]}' >\"${output}\" ;;\n"
            "  */gitops/overview*) printf '%s' '{\"items\":[]}' >\"${output}\" ;;\n"
            "  */checks/overview*) printf '%s' '{\"scope_coverage\":{}}' >\"${output}\" ;;\n"
            "  */cost/overview*) printf '%s' '{\"scope_coverage\":{}}' >\"${output}\" ;;\n"
            "  */cost/nodes*) printf '%s' '{\"items\":[]}' >\"${output}\" ;;\n"
            "  */alert-events*) printf '%s' '[]' >\"${output}\" ;;\n"
            "  *) exit 22 ;;\n"
            "esac\n"
            'if [ "${write_out}" = "1" ]; then printf \'0.010000\'; fi\n'
            if reads_ok
            else "printf '%s' '{\"invalid\":true}' >\"${output}\"\n"
        ),
        encoding="utf-8",
    )
    fake_curl.chmod(0o755)
    strict_log = tmp_path / "strict.log"
    fake_python = tmp_path / "python3"
    fake_python.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        'if [ "${1:-}" = "-" ]; then\n'
        '  exec "${REAL_PYTHON}" "$@"\n'
        "fi\n"
        'printf \'%s\\n\' "$*" >"${STRICT_LOG}"\n'
        'exit "${STRICT_EXIT_CODE}"\n',
        encoding="utf-8",
    )
    fake_python.chmod(0o755)
    return {
        **os.environ,
        "PATH": f"{tmp_path}:{os.environ['PATH']}",
        "API_BASE_URL": "http://127.0.0.1:18000",
        "AUTH_EMAIL": "operator@example.invalid",
        "AUTH_PASSWORD": "not-a-real-secret",
        "AUTH_LOGIN_ATTEMPTS": "1",
        "AUTH_LOGIN_RETRY_INTERVAL_SECONDS": "0",
        "AUTH_COOKIE_JAR_OUT": str(tmp_path / "auth-cookie.jar"),
        "REAL_PYTHON": sys.executable,
        "STRICT_EXIT_CODE": "0",
        "STRICT_LOG": str(strict_log),
        "CURL_LOG": str(curl_log),
    }


def _run_post_deploy_read_smoke(
    tmp_path: Path, *, login_ok: bool, reads_ok: bool
) -> tuple[subprocess.CompletedProcess[str], Path, Path]:
    env = _write_post_deploy_read_fakes(tmp_path, login_ok=login_ok, reads_ok=reads_ok)
    result = subprocess.run(
        ["bash", str(ROOT / "scripts/post_deploy_read_smoke.sh")],
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    return result, Path(env["STRICT_LOG"]), Path(env["CURL_LOG"])


def test_post_deploy_read_smoke_logs_in_and_reads_current_catalogs(tmp_path: Path) -> None:
    result, strict_log, curl_log = _run_post_deploy_read_smoke(
        tmp_path, login_ok=True, reads_ok=True
    )

    assert result.returncode == 0, result.stderr
    assert "post-deploy operator login" in result.stdout
    assert "post-deploy operational surface reads" in result.stdout
    assert not strict_log.exists()
    curl_calls = curl_log.read_text(encoding="utf-8").splitlines()
    assert len(curl_calls) == 17
    assert "/auth/login" in curl_calls[0]
    assert any("/auth/session" in call for call in curl_calls[1:])
    assert any("/diagnostics" in call for call in curl_calls[1:])
    assert any("/version-check" in call for call in curl_calls[1:])
    assert any("/clusters?limit=100" in call for call in curl_calls[1:])
    assert any("/resources?limit=1" in call for call in curl_calls[1:])
    assert any(
        "/dashboard/rca/issues?contract_version=2&limit=1" in call for call in curl_calls[1:]
    )
    assert any("/applications?limit=1" in call for call in curl_calls[1:])
    assert any("/timeline/capabilities" in call for call in curl_calls[1:])
    assert any("/traffic/flows?limit=1" in call for call in curl_calls[1:])
    assert any("/traffic/sources" in call for call in curl_calls[1:])
    assert any("/helm/releases" in call for call in curl_calls[1:])
    assert any("/gitops/overview?limit=1" in call for call in curl_calls[1:])
    assert any("/checks/overview" in call for call in curl_calls[1:])
    assert any("/cost/overview?range=6h" in call for call in curl_calls[1:])
    assert any("/cost/nodes?limit=1" in call for call in curl_calls[1:])
    assert any("/alert-events?limit=1" in call for call in curl_calls[1:])
    assert all("--connect-timeout 5" in call for call in curl_calls[1:])
    assert all("--max-time 20" in call for call in curl_calls[1:])
    handoff = tmp_path / "auth-cookie.jar"
    assert handoff.stat().st_mode & 0o777 == 0o600
    assert "session-token" in handoff.read_text(encoding="utf-8")
    assert "session-token" not in result.stdout
    assert "session-token" not in result.stderr
    assert not any(
        endpoint in curl_calls[0]
        for endpoint in ("/github/webhook", "/commands", "/recovery-actions")
    )


def test_post_deploy_read_smoke_stops_when_login_fails(tmp_path: Path) -> None:
    result, strict_log, curl_log = _run_post_deploy_read_smoke(
        tmp_path, login_ok=False, reads_ok=True
    )

    assert result.returncode != 0
    assert "login failed after 1 attempts" in result.stderr
    assert not (tmp_path / "auth-cookie.jar").exists()
    assert not strict_log.exists()
    assert "/auth/login" in curl_log.read_text(encoding="utf-8")


def test_post_deploy_read_smoke_rejects_invalid_read_contract(tmp_path: Path) -> None:
    result, strict_log, curl_log = _run_post_deploy_read_smoke(
        tmp_path, login_ok=True, reads_ok=False
    )

    assert result.returncode != 0
    assert not (tmp_path / "auth-cookie.jar").exists()
    assert not strict_log.exists()
    assert "/auth/login" in curl_log.read_text(encoding="utf-8")
