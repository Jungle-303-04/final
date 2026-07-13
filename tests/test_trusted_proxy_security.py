from __future__ import annotations

import pytest

from packages.security.trusted_proxy import (
    TRUSTED_PROXY_AUTH_HEADER,
    assert_trusted_proxy_config_safe,
    trusted_proxy_identity,
)


def configure_proxy(monkeypatch: pytest.MonkeyPatch, secret: str = "a" * 64) -> None:
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_SECRET", secret)
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_USER_ID", "operator-dev")
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_WORKSPACE_ID", "workspace-dev")


def test_trusted_proxy_requires_matching_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    configure_proxy(monkeypatch)

    assert trusted_proxy_identity({TRUSTED_PROXY_AUTH_HEADER: "wrong"}) is None
    identity = trusted_proxy_identity({TRUSTED_PROXY_AUTH_HEADER: "a" * 64})

    assert identity is not None
    assert identity.user_id == "operator-dev"
    assert identity.workspace_id == "workspace-dev"


def test_trusted_proxy_is_disabled_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TRUSTED_PROXY_AUTH_SECRET", raising=False)
    monkeypatch.delenv("TRUSTED_PROXY_AUTH_USER_ID", raising=False)
    monkeypatch.delenv("TRUSTED_PROXY_AUTH_WORKSPACE_ID", raising=False)

    assert trusted_proxy_identity({TRUSTED_PROXY_AUTH_HEADER: "anything"}) is None
    assert_trusted_proxy_config_safe()


@pytest.mark.parametrize(
    ("secret", "user_id", "workspace_id"),
    [
        ("short", "operator-dev", "workspace-dev"),
        ("a" * 64, "", "workspace-dev"),
        ("a" * 64, "operator-dev", ""),
    ],
)
def test_trusted_proxy_rejects_partial_or_weak_configuration(
    monkeypatch: pytest.MonkeyPatch,
    secret: str,
    user_id: str,
    workspace_id: str,
) -> None:
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_SECRET", secret)
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_USER_ID", user_id)
    monkeypatch.setenv("TRUSTED_PROXY_AUTH_WORKSPACE_ID", workspace_id)

    with pytest.raises(RuntimeError):
        assert_trusted_proxy_config_safe()
