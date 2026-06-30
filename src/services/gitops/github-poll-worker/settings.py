from __future__ import annotations

from packages.config.constants import Target
from packages.contracts.gitops import (
    DEFAULT_DEPLOYMENT_BINDING_ID as CONTRACT_DEFAULT_DEPLOYMENT_BINDING_ID,
)
from packages.contracts.gitops import (
    DEFAULT_MANIFEST_PATH as CONTRACT_DEFAULT_MANIFEST_PATH,
)
from packages.contracts.gitops import (
    DEFAULT_REPO_BRANCH as CONTRACT_DEFAULT_REPO_BRANCH,
)
from packages.contracts.gitops import (
    DEFAULT_REPO_REF as CONTRACT_DEFAULT_REPO_REF,
)
from packages.contracts.gitops import (
    DEFAULT_REPOSITORY_ID as CONTRACT_DEFAULT_REPOSITORY_ID,
)
from packages.contracts.gitops import (
    DEFAULT_WATCH_TARGET_ID as CONTRACT_DEFAULT_WATCH_TARGET_ID,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID as CONTRACT_DEFAULT_WORKSPACE_ID


class Settings:
    SERVICE_NAME = "github-poll-worker"

    # api-gateway 의 webhook 입구로 POST(폴링이 당겨온 변경을 webhook 과 동일 경로로 흘림).
    DEFAULT_MANAGEMENT_BASE_URL = "http://api-gateway:8000"
    MANAGEMENT_BASE_URL_ENV = "MANAGEMENT_BASE_URL"

    # 폴링 대상 repo(owner/name)와 주기. 데모 기본 30초(상주 워커 내부 루프).
    GITHUB_REPO_ENV = "GITHUB_REPO"
    DEFAULT_GITHUB_REPO = CONTRACT_DEFAULT_REPO_REF
    GITHUB_BRANCH_ENV = "GITHUB_BRANCH"
    DEFAULT_GITHUB_BRANCH = CONTRACT_DEFAULT_REPO_BRANCH
    WORKSPACE_ID_ENV = "WORKSPACE_ID"
    DEFAULT_WORKSPACE_ID = CONTRACT_DEFAULT_WORKSPACE_ID
    REPOSITORY_ID_ENV = "REPOSITORY_ID"
    DEFAULT_REPOSITORY_ID = CONTRACT_DEFAULT_REPOSITORY_ID
    WATCH_TARGET_ID_ENV = "WATCH_TARGET_ID"
    DEFAULT_WATCH_TARGET_ID = CONTRACT_DEFAULT_WATCH_TARGET_ID
    DEPLOYMENT_BINDING_ID_ENV = "DEPLOYMENT_BINDING_ID"
    DEFAULT_DEPLOYMENT_BINDING_ID = CONTRACT_DEFAULT_DEPLOYMENT_BINDING_ID
    TARGET_CLUSTER_ID_ENV = "TARGET_CLUSTER_ID"
    DEFAULT_TARGET_CLUSTER_ID = Target.DEFAULT_CLUSTER_ID
    MANIFEST_PATH_ENV = "MANIFEST_PATH"
    DEFAULT_MANIFEST_PATH = CONTRACT_DEFAULT_MANIFEST_PATH
    POLL_INTERVAL_ENV = "POLL_INTERVAL_SECONDS"
    DEFAULT_POLL_INTERVAL_SECONDS = "30"

    # POLL_ONCE=1 → 한 번 당기고 종료(프로덕션 CronJob 모드). 미설정 → 무한 루프(데모 Deployment).
    POLL_ONCE_ENV = "POLL_ONCE"

    # 공개 repo 는 무인증도 되나 시간당 60회 제한 → 토큰 있으면 인증(5000회). 데모 30초=120회/시.
    GITHUB_TOKEN_ENV = "GITHUB_TOKEN"
    GITHUB_API_BASE = "https://api.github.com"

    # webhook 입구가 HMAC 서명을 검증 → 폴러도 같은 시크릿으로 서명해 통과(gateway 와 동일 키).
    WEBHOOK_SECRET_ENV = "GITHUB_WEBHOOK_SECRET"
    SIGNATURE_HEADER = "x-hub-signature-256"
    SIGNATURE_PREFIX = "sha256="

    HTTP_TIMEOUT_SECONDS = 20
    POLL_RETRY_DELAY_SECONDS = 5
    POLL_MAX_BACKOFF_SECONDS = 300  # 연속 실패 지수 백오프 상한(5분)
    POLL_BACKOFF_JITTER_SECONDS = 3  # thundering herd 완화용 지터
    SOFT_SKIP_STATUS_CODES = {403, 429}

    # webhook 바디 기본값(폴러는 commit_sha 만 실제로 채우고 image/replicas 는 데모 기본).
    DEFAULT_IMAGE = "service:local"
    DEFAULT_REPLICAS = 2
