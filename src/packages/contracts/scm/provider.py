"""safe PR 생성 전략 계약."""

from __future__ import annotations

from typing import Any, Protocol


class ScmProvider(Protocol):
    """safe PR 생성 outbound 경계 전략 — 성공 시 PR URL 을 반환함.

    request 는 domains.scm.events.SafePrRequestedBody, ctx 는 EventContext 임
    (레이어 규칙상 packages 는 domains 를 import 못 해 구조적 시그니처로 둠).
    """

    async def create_pull_request(self, request: Any, ctx: Any) -> str: ...
