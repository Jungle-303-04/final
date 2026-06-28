"""repo-gateway(외부 GitHub 게이트웨이) 이벤트 body.

PR 생성은 repo-gateway 한 곳으로 모은다. 누구든(gitops·rca) PR 이 필요하면
safe_pr.requested → repo-gateway 가 PR 생성 → safe_pr.created.
"""

from __future__ import annotations

from dataclasses import dataclass

from packages.contracts.event_bus.bodies.base import EventBody
from packages.contracts.event_bus.registry import events
from packages.contracts.event_bus.subjects import EventSubject


@events.reg(EventSubject.SAFE_PR_REQUESTED)
@dataclass(frozen=True)
class SafePrRequestedBody(EventBody):
    """safe_pr.requested — PR 을 만들어 달라(제목/본문/공급자)."""

    title: str
    body: str
    provider: str


@events.reg(EventSubject.SAFE_PR_CREATED)
@dataclass(frozen=True)
class SafePrCreatedBody(EventBody):
    """safe_pr.created — repo-gateway 가 PR 을 만들었다."""

    pr_url: str
    provider: str
    token_ref: str
    mode: str


@events.reg(EventSubject.SAFE_PR_FAILED)
@dataclass(frozen=True)
class SafePrFailedBody(EventBody):
    """safe_pr.failed — repo-gateway 가 PR 생성을 완료하지 못했다."""

    provider: str
    title: str
    reason: str
