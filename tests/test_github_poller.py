"""github-poll-worker 단위 검증 — 실제 GitHub/네트워크 없이 httpx MockTransport 로.

once 모드(CronJob): 최신 커밋을 webhook 입구로 1회 POST.
dedup 가드: 같은 커밋이면 두 번째 폴은 POST 안 함(최종 dedup 은 ledger 가 보장).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest
from conftest import ROOT, load_file


def _load_poller() -> Any:
    return load_file(
        ROOT / "src" / "services" / "gitops" / "github-poll-worker" / "poller.py", "svc_poller"
    )


@pytest.fixture(autouse=True)
def poller_config(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GITHUB_REPO", "example/repo")
    monkeypatch.setenv("GITOPS_WEBHOOK_IMAGE", "ghcr.io/example/app:test")


def _transport(posted: list[dict[str, Any]], sha: str = "abc123def456") -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            return httpx.Response(200, json=[{"sha": sha}])
        posted.append(json.loads(request.content))  # api-gateway 로의 webhook POST
        return httpx.Response(200, json={"accepted": True})

    return httpx.MockTransport(handler)


def _recording_transport(calls: list[str], sha: str = "abc123def456") -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if request.url.path.endswith("/commits"):
            return httpx.Response(200, json=[{"sha": sha}])
        return httpx.Response(200, json={"accepted": True})

    return httpx.MockTransport(handler)


def _rate_limited_transport(posted: list[dict[str, Any]]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.github.com":
            return httpx.Response(403, json={"message": "rate limit exceeded"})
        posted.append(json.loads(request.content))
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
        {
            "commit_sha": "abc123def456",
            "image": "ghcr.io/example/app:test",
            "replicas": 2,
            "workspace_id": "default",
            "repository_id": "",
            "repo_ref": "example/repo",
            "branch": "main",
            "watch_target_id": "",
            "binding_id": "",
            "cluster_id": "target-cluster-01",
            "manifest_path": "deploy.yaml",
        }
    ]


def test_poll_once_env_parses_only_truthy_values(monkeypatch) -> None:
    module = _load_poller()

    monkeypatch.setenv("POLL_ONCE", "0")
    assert module.GitHubPoller().once is False

    monkeypatch.setenv("POLL_ONCE", "true")
    assert module.GitHubPoller().once is True


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


def test_github_api_base_env_controls_poll_endpoint(monkeypatch) -> None:
    module = _load_poller()
    calls: list[str] = []
    monkeypatch.setenv("GITHUB_API_BASE", "https://github.enterprise.local/api/v3")

    async def go() -> None:
        async with httpx.AsyncClient(transport=_recording_transport(calls)) as client:
            poller = module.GitHubPoller(client=client)
            await poller.poll_once(client)

    asyncio.run(go())
    assert calls[0].startswith("https://github.enterprise.local/api/v3/repos/example/repo/commits")


def test_rate_limited_poll_exits_without_webhook_or_failure() -> None:
    module = _load_poller()
    posted: list[dict[str, Any]] = []

    async def go() -> None:
        async with httpx.AsyncClient(transport=_rate_limited_transport(posted)) as client:
            poller = module.GitHubPoller(client=client)
            await poller.poll_once(client)

    asyncio.run(go())
    assert posted == []
