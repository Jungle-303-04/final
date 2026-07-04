"""github-poll-worker — GitHub 주기 polling, 새 commit을 webhook 입구로 전달

ArgoCD와 같은 방향: "polling 기본 + webhook 가속(옵션)".
외부 endpoint를 못 여는 환경이나 webhook 누락 보정용 polling.

cluster-agent와 같은 timer producer 형태: 주기마다 외부 호출 후
api-gateway의 /github/webhook으로 POST. 이후 경로는 webhook과 동일
(outbox → NATS → git-pull-worker → pipeline).

현재 구현은 최신 commit 1건을 조회하고, 같은 commit 반복은 메모리 가드와
ledger dedup으로 흡수한다. ETag/cursor 기반 incremental 조회는 provider
adapter 내부 최적화로 추가할 수 있다.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import random

import httpx
from settings import Settings

from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes

LOGGER = get_logger(__name__)
TRUTHY_VALUES = {"1", "true", "yes", "on"}


def env_truthy(name: str) -> bool:
    return env(name, "").strip().lower() in TRUTHY_VALUES


class GitHubPoller:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self.base_url = env(
            Settings.MANAGEMENT_BASE_URL_ENV, Settings.DEFAULT_MANAGEMENT_BASE_URL
        ).rstrip("/")
        self.repo = env(Settings.GITHUB_REPO_ENV, Settings.DEFAULT_GITHUB_REPO)
        self.branch = env(Settings.GITHUB_BRANCH_ENV, Settings.DEFAULT_GITHUB_BRANCH)
        self.workspace_id = env(Settings.WORKSPACE_ID_ENV, Settings.DEFAULT_WORKSPACE_ID)
        self.repository_id = env(Settings.REPOSITORY_ID_ENV, Settings.DEFAULT_REPOSITORY_ID)
        self.watch_target_id = env(Settings.WATCH_TARGET_ID_ENV, Settings.DEFAULT_WATCH_TARGET_ID)
        self.binding_id = env(
            Settings.DEPLOYMENT_BINDING_ID_ENV,
            Settings.DEFAULT_DEPLOYMENT_BINDING_ID,
        )
        self.cluster_id = env(Settings.TARGET_CLUSTER_ID_ENV, Settings.DEFAULT_TARGET_CLUSTER_ID)
        self.manifest_path = env(Settings.MANIFEST_PATH_ENV, Settings.DEFAULT_MANIFEST_PATH)
        self.interval = int(env(Settings.POLL_INTERVAL_ENV, Settings.DEFAULT_POLL_INTERVAL_SECONDS))
        self.token = env(Settings.GITHUB_TOKEN_ENV, "")
        self.github_api_base = env(
            Settings.GITHUB_API_BASE_ENV, Settings.DEFAULT_GITHUB_API_BASE
        ).rstrip("/")
        self.webhook_secret = env(Settings.WEBHOOK_SECRET_ENV, "")  # webhook 입구 HMAC 서명 키.
        self.image = env(Settings.WEBHOOK_IMAGE_ENV, Settings.DEFAULT_IMAGE)
        self.once = env_truthy(Settings.POLL_ONCE_ENV)  # CronJob 모드면 1회 후 종료.
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
        failures = 0
        while True:
            try:
                await self.poll_once(client)
            except Exception as exc:
                failures += 1
                # 지수 백오프(+지터, 상한) — 연속 실패 시 GitHub/게이트웨이를 두드리지 않게.
                backoff = min(
                    Settings.POLL_RETRY_DELAY_SECONDS * (2 ** (failures - 1)),
                    Settings.POLL_MAX_BACKOFF_SECONDS,
                )
                backoff += random.uniform(0, Settings.POLL_BACKOFF_JITTER_SECONDS)
                LOGGER.warning(
                    "github_poll_failed",
                    extra={
                        CONTEXT_KEY: {
                            "repo": self.repo,
                            "exception_type": type(exc).__name__,
                            "failures": failures,
                            "backoff_seconds": round(backoff, 1),
                        }
                    },
                )
                await asyncio.sleep(backoff)
                continue
            failures = 0  # 성공 → 백오프 리셋
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
        self.require_poll_config()
        response = await client.get(
            f"{self.github_api_base}/repos/{self.repo}/commits",
            params={"per_page": 1, "sha": self.branch},
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
        if response.status_code in Settings.ACCESS_ERROR_STATUS_CODES:
            # 인증/접근 오류 → 예외로 CronJob 을 죽이지 않고 명확한 경고 후 스킵.
            LOGGER.warning(
                "github_poll_access_denied",
                extra={
                    CONTEXT_KEY: {
                        "repo": self.repo,
                        "branch": self.branch,
                        "status_code": response.status_code,
                        "hint": "GITHUB_TOKEN/GITHUB_REPO 확인 — private repo 는 읽기 토큰 필요",
                    }
                },
            )
            return None
        response.raise_for_status()
        commits = response.json()
        return commits[0]["sha"] if commits else None

    async def emit_webhook(self, client: httpx.AsyncClient, commit_sha: str) -> None:
        if not self.image:
            raise ValueError(f"{Settings.WEBHOOK_IMAGE_ENV} is required")
        # 서명은 전송 바이트와 정확히 일치 필요 → json= 대신 직접 직렬화한 content 전송
        body = json.dumps(
            {
                "commit_sha": commit_sha,
                "image": self.image,
                "replicas": Settings.DEFAULT_REPLICAS,
                "workspace_id": self.workspace_id,
                "repository_id": self.repository_id,
                "repo_ref": self.repo,
                "branch": self.branch,
                "watch_target_id": self.watch_target_id,
                "binding_id": self.binding_id,
                "cluster_id": self.cluster_id,
                "manifest_path": self.manifest_path,
            }
        ).encode()
        response = await client.post(
            f"{self.base_url}{gateway_routes.GITHUB_WEBHOOK_PATH}",
            content=body,
            headers=self._webhook_headers(body),
        )
        response.raise_for_status()

    def require_poll_config(self) -> None:
        if not self.repo or "/" not in self.repo:
            raise ValueError(f"{Settings.GITHUB_REPO_ENV} must be set to owner/repo")

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
