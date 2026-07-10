"""운영 환경에서 개발 인증 우회를 차단하는 fail-closed 안전장치.

개발 인증 우회 로직(``security.py``)과 최대한 분리한 별도 모듈이다. 목적은
production/staging 에서는 어떤 개발 우회 플래그(``APP_ENV=test``,
``DEV_SECURITY_BYPASS``, ``DEV_AUTH_BYPASS``)가 남아 있어도 항상 우회를 닫는
것이다.

이 모듈은 ``security.py`` 를 import 하지 않아 순환 의존 없이 요청 시점과
Gateway 기동 시점에 같은 운영 환경 판정을 제공한다.
"""

from __future__ import annotations

from packages.config.settings import env

APP_ENV_ENV = "APP_ENV"

# 이 환경에서는 개발 우회를 절대 허용하지 않는다(대소문자·공백 무시).
PROTECTED_APP_ENVS = frozenset({"production", "prod", "staging"})

# 기동 시 활성화 여부를 검사할 개발 우회 플래그들.
_BYPASS_FLAG_ENVS = ("DEV_SECURITY_BYPASS", "DEV_AUTH_BYPASS")
_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})


def _current_app_env() -> str:
    return env(APP_ENV_ENV, "").strip().lower()


def is_protected_env() -> bool:
    """운영/스테이징 등 우회를 절대 허용하지 않는 환경인지."""
    return _current_app_env() in PROTECTED_APP_ENVS


def enforce_fail_closed(bypass_enabled: bool) -> bool:
    """계산된 우회 값을 보호 환경에서는 무조건 False 로 덮는다.

    멱등이며 호출부의 내부 로직과 무관하게 최종값만 닫는다. 비보호 환경
    (test/dev 등)에서는 입력값을 그대로 통과시켜 개발 편의를 유지한다.
    """
    if bypass_enabled and is_protected_env():
        return False
    return bypass_enabled


def assert_bypass_safe_at_startup() -> None:
    """보호 환경에서 개발 우회 플래그가 켜져 있으면 기동을 막는다.

    런타임 요청 단위 방어(enforce_fail_closed)만으로도 우회는 닫히지만,
    설정 실수를 조용히 넘기지 않고 부팅 시점에 크게 실패시켜 즉시 드러낸다.
    """
    if not is_protected_env():
        return
    for name in _BYPASS_FLAG_ENVS:
        if env(name, "").strip().lower() in _TRUE_VALUES:
            raise RuntimeError(
                f"APP_ENV={_current_app_env()} 에서 개발 우회 플래그 {name} 가 "
                "설정됨 — fail-closed 위반. 운영 배포에서 해당 플래그를 제거하라."
            )
