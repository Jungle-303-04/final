"""github-poll-worker — GitHub 주기 polling, 새 commit을 webhook 입구로 전달

ArgoCD와 같은 방향: "polling 기본 + webhook 가속(옵션)".
외부 endpoint를 못 여는 환경이나 webhook 누락 보정용 polling.

cluster-agent와 같은 timer producer 형태: 주기마다 외부 호출 후
api-gateway의 /github/webhook으로 POST. 이후 경로는 webhook과 동일
(outbox → NATS → git-pull-worker → pipeline).

TODO(handoff): 실제 조회 최소 흐름(매번 최신 commit 1건)
  production optimization:
    - cursor/ETag(If-None-Match)로 incremental 조회 → 변경 없으면 304, rate limit 절약
    - X-RateLimit-Remaining 기반 throttle + 실패 시 exponential backoff
  같은 commit 반복 조회도 기존 ledger dedup(정확히 한 번)으로 흡수
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json

import httpx
from settings import Settings

from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes

LOGGER = get_logger(__name__)


class GitHubPoller:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self.base_url = env(
            Settings.MANAGEMENT_BASE_URL_ENV, Settings.DEFAULT_MANAGEMENT_BASE_URL
        ).rstrip("/")
        self.repo = env(Settings.GITHUB_REPO_ENV, Settings.DEFAULT_GITHUB_REPO)
        self.interval = int(env(Settings.POLL_INTERVAL_ENV, Settings.DEFAULT_POLL_INTERVAL_SECONDS))
        self.token = env(Settings.GITHUB_TOKEN_ENV, "")
        self.webhook_secret = env(Settings.WEBHOOK_SECRET_ENV, "")  # webhook 입구 HMAC 서명 키.
        self.once = bool(env(Settings.POLL_ONCE_ENV, ""))  # CronJob 모드면 1회 후 종료.
        self._client = client
        self._last_sha: str | None = None  # 같은 커밋 중복 POST 만 줄이는 메모리 가드(최소)

    async def run(self) -> None:
        if self._client is not None:
            await self.drive(self._client)
            return
        async with httpx.AsyncClient(timeout=Settings.HTTP_TIMEOUT_SECONDS) as client:
            await self.drive(client)

    async def drive(self, client: httpx.AsyncClient) -> None:
        # 프로덕션: CronJob 이 주기를 들고 POLL_ONCE 로 1회 실행 → 위임(겹침·복구는 k8s).
        # 데모: 상주 워커가 직접 interval 루프(replica 1 이라 중복발화 없음).
        if self.once:
            await self.poll_once(client)
            return
        await self.loop(client)

    async def loop(self, client: httpx.AsyncClient) -> None:
        while True:
            try:
                await self.poll_once(client)
            except Exception as exc:
                LOGGER.warning(
                    "github_poll_failed",
                    extra={CONTEXT_KEY: {"repo": self.repo, "exception_type": type(exc).__name__}},
                )
                await asyncio.sleep(Settings.POLL_RETRY_DELAY_SECONDS)
                continue
            await asyncio.sleep(self.interval)

    async def poll_once(self, client: httpx.AsyncClient) -> None:
        commit_sha = await self.latest_commit_sha(client)
        if commit_sha is None or commit_sha == self._last_sha:
            return  # 새 커밋 없음 → webhook 안 쏨(dedup 은 ledger 가 최종 보장).
        await self.emit_webhook(client, commit_sha)
        self._last_sha = commit_sha
        LOGGER.info(
            "github_change_detected",
            extra={CONTEXT_KEY: {"repo": self.repo, "commit_sha": commit_sha}},
        )

    async def latest_commit_sha(self, client: httpx.AsyncClient) -> str | None:
        response = await client.get(
            f"{Settings.GITHUB_API_BASE}/repos/{self.repo}/commits",
            params={"per_page": 1},
            headers=self._github_headers(),
        )
        if response.status_code in Settings.SOFT_SKIP_STATUS_CODES:
            LOGGER.info(
                "github_poll_skipped",
                extra={
                    CONTEXT_KEY: {
                        "repo": self.repo,
                        "status_code": response.status_code,
                    }
                },
            )
            return None
        response.raise_for_status()
        commits = response.json()
        return commits[0]["sha"] if commits else None

    async def emit_webhook(self, client: httpx.AsyncClient, commit_sha: str) -> None:
        # 서명은 전송 바이트와 정확히 일치 필요 → json= 대신 직접 직렬화한 content 전송
        body = json.dumps(
            {
                "commit_sha": commit_sha,
                "image": Settings.DEFAULT_IMAGE,
                "replicas": Settings.DEFAULT_REPLICAS,
            }
        ).encode()
        response = await client.post(
            f"{self.base_url}{gateway_routes.GITHUB_WEBHOOK_PATH}",
            content=body,
            headers=self._webhook_headers(body),
        )
        response.raise_for_status()

    def _webhook_headers(self, body: bytes) -> dict[str, str]:
        headers = {"content-type": "application/json"}
        if self.webhook_secret:  # 시크릿 있으면 HMAC 서명 첨부(없으면 입구가 거부 → fail-closed).
            digest = hmac.new(self.webhook_secret.encode(), body, hashlib.sha256).hexdigest()
            headers[Settings.SIGNATURE_HEADER] = f"{Settings.SIGNATURE_PREFIX}{digest}"
        return headers

    def _github_headers(self) -> dict[str, str]:
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}
