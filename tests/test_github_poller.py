"""github-poller 단위 검증 — 실제 GitHub/네트워크 없이 httpx MockTransport 로.

once 모드(CronJob): 최신 커밋을 webhook 입구로 1회 POST.
dedup 가드: 같은 커밋이면 두 번째 폴은 POST 안 함(최종 dedup 은 ledger 가 보장).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
from conftest import ROOT, load_file


def _load_poller() -> Any:
    return load_file(ROOT / "src" / "services" / "gitops" / "github-poller" / "poller.py", "svc_poller")


def _transport(posted: list[dict[str, Any]], sha: str = "abc123def456") -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            return httpx.Response(200, json=[{"sha": sha}])
        posted.append(json.loads(request.content))  # api-gateway 로의 webhook POST
        return httpx.Response(200, json={"accepted": True})

    return httpx.MockTransport(handler)


def test_once_mode_posts_latest_commit_to_webhook() -> None:
    module = _load_poller()
    posted: list[dict[str, Any]] = []

    async def go() -> None:
        async with httpx.AsyncClient(transport=_transport(posted)) as client:
            poller = module.GitHubPoller(client=client)
            poller.once = True  # CronJob 모드: 1회 당기고 종료
            await poller.run()

    asyncio.run(go())
    assert posted == [
        {"commit_sha": "abc123def456", "image": "ghcr.io/project/checkout-api:bad", "replicas": 2}
    ]


def test_dedup_guard_skips_unchanged_sha() -> None:
    module = _load_poller()
    posted: list[dict[str, Any]] = []

    async def go() -> None:
        async with httpx.AsyncClient(transport=_transport(posted)) as client:
            poller = module.GitHubPoller(client=client)
            await poller.poll_once(client)  # 새 커밋 → POST
            await poller.poll_once(client)  # 동일 커밋 → skip

    asyncio.run(go())
    assert len(posted) == 1
