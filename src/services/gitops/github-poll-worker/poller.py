"""github-poll-worker — GitHub 주기 polling, 새 commit을 webhook 입구로 전달

GitOps 컨트롤러류와 같은 방향: "polling 기본 + webhook 가속(옵션)".
외부 endpoint를 못 여는 환경이나 webhook 누락 보정용 polling.

cluster-agent와 같은 timer producer 형태: 주기마다 외부 호출 후
api-gateway의 /github/webhook으로 POST. 이후 경로는 webhook과 동일
(outbox → NATS → git-pull-worker → pipeline).

현재 구현은 최신 commit 1건 조회, 같은 commit 반복은 메모리 가드와
ledger dedup으로 흡수. ETag/cursor 기반 incremental 조회는 provider
adapter 내부 최적화로 추가 가능.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import random
from dataclasses import dataclass
from typing import Any

import httpx
from settings import Settings

from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.security import SecretRef
from packages.security import SecretNotFound, build_token_vault

LOGGER = get_logger(__name__)
TRUTHY_VALUES = {"1", "true", "yes", "on"}


def env_truthy(name: str) -> bool:
    return env(name, "").strip().lower() in TRUTHY_VALUES


@dataclass(frozen=True)
class GitHubPollTarget:
    workspace_id: str
    repository_id: str
    repo_ref: str
    branch: str
    watch_target_id: str
    binding_id: str
    application_id: str
    environment: str
    cluster_id: str
    manifest_path: str
    source_type: str = ""
    credential_ref: str = ""

    @property
    def key(self) -> str:
        return "|".join(
            (
                self.workspace_id,
                self.repository_id,
                self.watch_target_id,
                self.binding_id,
                self.application_id,
                self.environment,
                self.repo_ref,
                self.branch,
                self.manifest_path,
                self.source_type,
            )
        )

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> GitHubPollTarget:
        return cls(
            workspace_id=str(row.get("workspace_id") or Settings.DEFAULT_WORKSPACE_ID),
            repository_id=str(row.get("repository_id") or ""),
            repo_ref=str(row.get("repo_ref") or ""),
            branch=str(row.get("branch") or Settings.DEFAULT_GITHUB_BRANCH),
            watch_target_id=str(row.get("watch_target_id") or ""),
            binding_id=str(row.get("binding_id") or ""),
            application_id=str(row.get("application_id") or Settings.DEFAULT_APPLICATION_ID),
            environment=str(row.get("environment") or Settings.DEFAULT_ENVIRONMENT),
            cluster_id=str(row.get("cluster_id") or Settings.DEFAULT_TARGET_CLUSTER_ID),
            manifest_path=str(row.get("manifest_path") or Settings.DEFAULT_MANIFEST_PATH),
            source_type=str(row.get("source_type") or ""),
            credential_ref=str(row.get("credential_ref") or ""),
        )


class GitHubPoller:
    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        *,
        db: Any | None = None,
        token_vault: Any | None = None,
    ) -> None:
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
        self.source_type = env(Settings.MANIFEST_SOURCE_TYPE_ENV, "")
        self.interval = int(env(Settings.POLL_INTERVAL_ENV, Settings.DEFAULT_POLL_INTERVAL_SECONDS))
        self.token_ref = env(Settings.GITHUB_TOKEN_REF_ENV, "").strip()
        self.token = env(Settings.GITHUB_TOKEN_ENV, "")
        self.github_api_base = env(
            Settings.GITHUB_API_BASE_ENV, Settings.DEFAULT_GITHUB_API_BASE
        ).rstrip("/")
        self.webhook_secret = env(Settings.WEBHOOK_SECRET_ENV, "")  # webhook 입구 HMAC 서명 키.
        self.image = env(Settings.WEBHOOK_IMAGE_ENV, Settings.DEFAULT_IMAGE)
        self.once = env_truthy(Settings.POLL_ONCE_ENV)  # CronJob 모드면 1회 후 종료.
        self._client = client
        self.db = db
        self.token_vault = token_vault or build_token_vault()
        self._last_sha_by_target: dict[str, str] = {}
        # ETag 조건부 요청 — 변경 없으면 304 로 응답받아 GitHub rate limit 을 소모하지 않음
        # (SCM provider 를 압박하지 않는 폴링 원칙).
        self._etag_by_target: dict[str, str] = {}

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
            await self.poll_once_with_retry(client)
            return
        await self.loop(client)

    async def poll_once_with_retry(self, client: httpx.AsyncClient) -> None:
        # once 모드는 곧 프로세스가 끝나므로 일시 네트워크 오류만 짧게 자체 재시도.
        max_attempts = max(1, Settings.POLL_ONCE_MAX_ATTEMPTS)
        for attempt in range(1, max_attempts + 1):
            try:
                await self.poll_once(client)
                return
            except Exception as exc:
                if attempt >= max_attempts or not self.is_transient_poll_error(exc):
                    raise
                backoff = self.retry_backoff_seconds(attempt)
                LOGGER.warning(
                    "github_poll_retrying",
                    extra={
                        CONTEXT_KEY: {
                            "exception_type": type(exc).__name__,
                            "status_code": self.http_status_code(exc),
                            "attempt": attempt,
                            "max_attempts": max_attempts,
                            "backoff_seconds": round(backoff, 1),
                        }
                    },
                )
                await asyncio.sleep(backoff)

    async def loop(self, client: httpx.AsyncClient) -> None:
        failures = 0
        while True:
            try:
                await self.poll_once(client)
            except Exception as exc:
                failures += 1
                # 지수 백오프(+지터, 상한) — 연속 실패 시 GitHub/게이트웨이를 두드리지 않게.
                backoff = self.retry_backoff_seconds(failures)
                LOGGER.warning(
                    "github_poll_failed",
                    extra={
                        CONTEXT_KEY: {
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

    @staticmethod
    def retry_backoff_seconds(failures: int) -> float:
        backoff = min(
            Settings.POLL_RETRY_DELAY_SECONDS * (2 ** (failures - 1)),
            Settings.POLL_MAX_BACKOFF_SECONDS,
        )
        return backoff + random.uniform(0, Settings.POLL_BACKOFF_JITTER_SECONDS)

    @staticmethod
    def is_transient_poll_error(exc: Exception) -> bool:
        if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
            return True
        if isinstance(exc, httpx.HTTPStatusError):
            return exc.response.status_code in Settings.TRANSIENT_RETRY_STATUS_CODES
        return False

    @staticmethod
    def http_status_code(exc: Exception) -> int | None:
        if isinstance(exc, httpx.HTTPStatusError):
            return exc.response.status_code
        return None

    async def poll_once(self, client: httpx.AsyncClient) -> None:
        for target in self.poll_targets():
            commit_sha = await self.latest_commit_sha(client, target)
            if commit_sha is None or commit_sha == self._last_sha_by_target.get(target.key):
                continue  # 새 커밋 없음 → webhook 안 쏨(dedup 은 ledger 가 최종 보장).
            await self.emit_webhook(client, target, commit_sha)
            self._last_sha_by_target[target.key] = commit_sha
            LOGGER.info(
                "github_change_detected",
                extra={
                    CONTEXT_KEY: {
                        "repo": target.repo_ref,
                        "branch": target.branch,
                        "watch_target_id": target.watch_target_id,
                        "binding_id": target.binding_id,
                        "application_id": target.application_id,
                        "commit_sha": commit_sha,
                    }
                },
            )

    def poll_targets(self) -> list[GitHubPollTarget]:
        db_targets = self.db_poll_targets()
        if db_targets:
            return db_targets
        if self.repo:
            return [
                GitHubPollTarget(
                    workspace_id=self.workspace_id,
                    repository_id=self.repository_id,
                    repo_ref=self.repo,
                    branch=self.branch,
                    watch_target_id=self.watch_target_id,
                    binding_id=self.binding_id,
                    application_id=Settings.DEFAULT_APPLICATION_ID,
                    environment=Settings.DEFAULT_ENVIRONMENT,
                    cluster_id=self.cluster_id,
                    manifest_path=self.manifest_path,
                    source_type=self.source_type,
                )
            ]
        return []

    def db_poll_targets(self) -> list[GitHubPollTarget]:
        list_targets = getattr(self.db, "list_active_github_poll_targets", None)
        if not callable(list_targets):
            return []
        rows = list_targets()
        return [GitHubPollTarget.from_row(dict(row)) for row in rows]

    async def latest_commit_sha(
        self, client: httpx.AsyncClient, target: GitHubPollTarget
    ) -> str | None:
        self.require_poll_config(target)
        response = await client.get(
            f"{self.github_api_base}/repos/{target.repo_ref}/commits",
            params={"per_page": 1, "sha": target.branch},
            headers=self._github_headers(target),
        )
        if response.status_code == Settings.NOT_MODIFIED_STATUS_CODE:
            return None  # ETag 일치 — 새 커밋 없음(rate limit 미소모).
        if response.status_code in Settings.SOFT_SKIP_STATUS_CODES:
            LOGGER.info(
                "github_poll_skipped",
                extra={
                    CONTEXT_KEY: {
                        "repo": target.repo_ref,
                        "branch": target.branch,
                        "watch_target_id": target.watch_target_id,
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
                        "repo": target.repo_ref,
                        "branch": target.branch,
                        "watch_target_id": target.watch_target_id,
                        "status_code": response.status_code,
                        "hint": "GITHUB_TOKEN/GITHUB_REPO 확인 — private repo 는 읽기 토큰 필요",
                    }
                },
            )
            return None
        response.raise_for_status()
        etag = response.headers.get("etag")
        if etag:
            self._etag_by_target[target.key] = etag
        commits = response.json()
        return commits[0]["sha"] if commits else None

    async def emit_webhook(
        self,
        client: httpx.AsyncClient,
        target: GitHubPollTarget,
        commit_sha: str,
    ) -> None:
        if not self.image:
            raise ValueError(f"{Settings.WEBHOOK_IMAGE_ENV} is required")
        # 서명은 전송 바이트와 정확히 일치 필요 → json= 대신 직접 직렬화한 content 전송
        body = json.dumps(
            {
                "commit_sha": commit_sha,
                "image": self.image,
                "replicas": Settings.DEFAULT_REPLICAS,
                "workspace_id": target.workspace_id,
                "repository_id": target.repository_id,
                "repo_ref": target.repo_ref,
                "branch": target.branch,
                "watch_target_id": target.watch_target_id,
                "binding_id": target.binding_id,
                "application_id": target.application_id,
                "environment": target.environment,
                "cluster_id": target.cluster_id,
                "manifest_path": target.manifest_path,
                "source_type": target.source_type,
            }
        ).encode()
        response = await client.post(
            f"{self.base_url}{gateway_routes.GITHUB_WEBHOOK_PATH}",
            content=body,
            headers=self._webhook_headers(body),
        )
        response.raise_for_status()

    def require_poll_config(self, target: GitHubPollTarget) -> None:
        if not target.repo_ref or "/" not in target.repo_ref:
            raise ValueError(f"{Settings.GITHUB_REPO_ENV} must be set to owner/repo")

    def _webhook_headers(self, body: bytes) -> dict[str, str]:
        headers = {"content-type": "application/json"}
        if self.webhook_secret:  # 시크릿 있으면 HMAC 서명 첨부(없으면 입구가 거부 → fail-closed).
            digest = hmac.new(self.webhook_secret.encode(), body, hashlib.sha256).hexdigest()
            headers[Settings.SIGNATURE_HEADER] = f"{Settings.SIGNATURE_PREFIX}{digest}"
        return headers

    def _github_headers(self, target: GitHubPollTarget) -> dict[str, str]:
        headers: dict[str, str] = {}
        token = self._github_token(target)
        if token:
            headers["Authorization"] = f"Bearer {token}"
        etag = self._etag_by_target.get(target.key)
        if etag:  # 조건부 요청 — 변경 없으면 304.
            headers["If-None-Match"] = etag
        return headers

    def _github_token(self, target: GitHubPollTarget) -> str:
        if target.credential_ref:
            return self._read_token_ref(target.credential_ref, target)
        if self.token_ref:
            return self._read_token_ref(self.token_ref, target)
        return self.token

    def _read_token_ref(self, ref: str, target: GitHubPollTarget) -> str:
        try:
            return self.token_vault.read_token(SecretRef(ref))
        except SecretNotFound:
            LOGGER.warning(
                "github_poll_token_ref_not_found",
                extra={
                    CONTEXT_KEY: {
                        "repo": target.repo_ref,
                        "branch": target.branch,
                        "watch_target_id": target.watch_target_id,
                    }
                },
            )
            return ""
