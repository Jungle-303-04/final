from __future__ import annotations

import pytest

from packages.runtime import service as runtime_service


def test_configure_event_loop_policy_uses_selector_policy_on_windows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class SelectorPolicy:
        pass

    configured: list[object] = []

    monkeypatch.setattr(runtime_service.os, "name", "nt")
    monkeypatch.setattr(
        runtime_service.asyncio,
        "WindowsSelectorEventLoopPolicy",
        SelectorPolicy,
        raising=False,
    )
    monkeypatch.setattr(runtime_service.asyncio, "set_event_loop_policy", configured.append)

    runtime_service.configure_event_loop_policy()

    assert isinstance(configured[0], SelectorPolicy)


def test_configure_event_loop_policy_skips_non_windows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_if_called(_policy: object) -> None:
        raise AssertionError("event loop policy should not be changed")

    monkeypatch.setattr(runtime_service.os, "name", "posix")
    monkeypatch.setattr(runtime_service.asyncio, "set_event_loop_policy", fail_if_called)

    runtime_service.configure_event_loop_policy()
