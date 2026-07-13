from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_pre_deploy_smoke_uses_only_legacy_safe_health_frontend_and_database_checks() -> None:
    source = read("scripts/pre-deploy-smoke.sh")

    assert '"${BASE_URL}/api/healthz"' in source
    assert '"${BASE_URL}/"' in source
    assert source.count("--write-out '%{http_code}'") == 2
    assert 'test "${health_status}" = "200"' in source
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


def test_post_deploy_smoke_enforces_new_release_contracts() -> None:
    source = read("scripts/post-deploy-smoke.sh")

    assert source.count("--write-out '%{http_code}'") == 2
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
