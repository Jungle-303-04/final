"""개발·테스트 인증 우회 설정의 단일 기준.

운영 기본값은 항상 비활성화다. ``APP_ENV=test`` 또는 명시적인
``DEV_SECURITY_BYPASS=1``에서만 사용자 세션, 리소스 권한, agent 토큰 검증을
우회한다. 실제 cluster identity는 등록 레지스트리에서 다시 읽어 요청 입력을
권위값으로 사용하지 않는다.
"""

from __future__ import annotations

from packages.config.settings import env

APP_ENV_ENV = "APP_ENV"
TEST_APP_ENV = "test"
DEV_SECURITY_BYPASS_ENV = "DEV_SECURITY_BYPASS"
DEV_SECURITY_BYPASS_USER_ID_ENV = "DEV_SECURITY_BYPASS_USER_ID"
DEV_SECURITY_BYPASS_WORKSPACE_ID_ENV = "DEV_SECURITY_BYPASS_WORKSPACE_ID"
DEV_SECURITY_BYPASS_CLUSTER_ID_ENV = "DEV_SECURITY_BYPASS_CLUSTER_ID"
DEV_SECURITY_BYPASS_CLUSTER_HEADER = "x-dev-cluster-id"
LEGACY_DEV_AUTH_BYPASS_ENV = "DEV_AUTH_BYPASS"
TRUE_ENV_VALUES = frozenset({"1", "true", "yes", "on"})


def env_enabled(name: str) -> bool:
    return env(name, "").strip().lower() in TRUE_ENV_VALUES


def development_security_bypass_enabled() -> bool:
    """통합 개발 우회가 켜졌는지 매 요청 시 평가한다."""
    return env(APP_ENV_ENV, "").strip().lower() == TEST_APP_ENV or env_enabled(
        DEV_SECURITY_BYPASS_ENV
    )


def development_session_bypass_enabled() -> bool:
    """통합 플래그와 기존 세션 전용 플래그를 하위 호환한다."""
    return development_security_bypass_enabled() or env_enabled(LEGACY_DEV_AUTH_BYPASS_ENV)


def development_bypass_user_id(default: str, legacy_env: str = "") -> str:
    return _first_configured(DEV_SECURITY_BYPASS_USER_ID_ENV, legacy_env, default=default)


def development_bypass_workspace_id(default: str, legacy_env: str = "") -> str:
    return _first_configured(DEV_SECURITY_BYPASS_WORKSPACE_ID_ENV, legacy_env, default=default)


def development_bypass_cluster_id(requested_cluster_id: str = "") -> str:
    return requested_cluster_id.strip() or env(DEV_SECURITY_BYPASS_CLUSTER_ID_ENV, "").strip()


def _first_configured(*names: str, default: str) -> str:
    for name in names:
        if not name:
            continue
        value = env(name, "").strip()
        if value:
            return value
    return default
