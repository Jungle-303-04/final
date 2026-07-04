"""한 워커가 여러 subject 를 구독할 수 있음(다중 구독) + subject 라우팅 검증."""

from __future__ import annotations

import asyncio

import pytest

from domains.gitops.events import DesiredDesiredDiffDetectedBody, GitChangedBody
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.events.envelope import event
from packages.runtime.app import App
from packages.runtime.dispatch import make_router


def test_router_dispatches_by_subject() -> None:
    async def run() -> None:
        seen: list[tuple[str, str]] = []

        async def handler_a(evt: EventEnvelope) -> list[EventEnvelope]:
            seen.append(("a", evt.subject))
            return []

        async def handler_b(evt: EventEnvelope) -> list[EventEnvelope]:
            seen.append(("b", evt.subject))
            return []

        router = make_router({"git.changed": handler_a, "diff.analyzed": handler_b})
        await router(event("git.changed", "src", {}, "c1"))
        await router(event("diff.analyzed", "src", {}, "c1"))
        assert seen == [("a", "git.changed"), ("b", "diff.analyzed")]

    asyncio.run(run())


def test_app_allows_multiple_subscriptions() -> None:
    app = App("multi-worker")

    @app.on(GitChangedBody)
    async def on_git(evt: GitChangedBody, ctx: object) -> list[EventBody]:
        return []

    @app.on(DesiredDesiredDiffDetectedBody)
    async def on_diff(evt: DesiredDesiredDiffDetectedBody, ctx: object) -> list[EventBody]:
        return []

    subjects, factory = app._resolve()
    assert len(subjects) == 2  # 같은 워커가 두 이벤트 구독 — 더 이상 1개 강제 아님
    assert set(subjects) == {GitChangedBody.__subject__, DesiredDesiredDiffDetectedBody.__subject__}
    assert callable(factory)


def test_same_subject_twice_in_one_worker_is_rejected() -> None:
    app = App("dup-worker")

    @app.on(GitChangedBody)
    async def first(evt: GitChangedBody, ctx: object) -> list[EventBody]:
        return []

    with pytest.raises(TypeError):  # 같은 subject 중복 구독 → 시작 시 거부

        @app.on(GitChangedBody)
        async def second(evt: GitChangedBody, ctx: object) -> list[EventBody]:
            return []
