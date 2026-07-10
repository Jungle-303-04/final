from __future__ import annotations

import pytest

from packages.config import bypass_guard
from packages.config.security import (
    development_security_bypass_enabled,
    development_session_bypass_enabled,
)


@pytest.mark.parametrize("app_env", ["production", "prod", "staging"])
@pytest.mark.parametrize("flag", ["DEV_SECURITY_BYPASS", "DEV_AUTH_BYPASS"])
def test_protected_environment_rejects_every_development_bypass_flag(
    monkeypatch: pytest.MonkeyPatch,
    app_env: str,
    flag: str,
) -> None:
    monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.setenv(flag, "1")

    assert development_security_bypass_enabled() is False
    assert development_session_bypass_enabled() is False
    with pytest.raises(RuntimeError, match=flag):
        bypass_guard.assert_bypass_safe_at_startup()


def test_test_environment_keeps_the_team_development_bypass(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.delenv("DEV_SECURITY_BYPASS", raising=False)
    monkeypatch.delenv("DEV_AUTH_BYPASS", raising=False)

    assert development_security_bypass_enabled() is True
    assert development_session_bypass_enabled() is True
    bypass_guard.assert_bypass_safe_at_startup()


def test_production_without_bypass_flags_starts_fail_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("DEV_SECURITY_BYPASS", raising=False)
    monkeypatch.delenv("DEV_AUTH_BYPASS", raising=False)

    assert development_security_bypass_enabled() is False
    assert development_session_bypass_enabled() is False
    bypass_guard.assert_bypass_safe_at_startup()
