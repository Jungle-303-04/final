from __future__ import annotations

from packages.config.constants import Target
from packages.config.settings import env
from packages.contracts.gitops import (
    DEFAULT_DEPLOYMENT_BINDING_ID as CONTRACT_DEFAULT_DEPLOYMENT_BINDING_ID,
)
from packages.contracts.gitops import DEFAULT_GITHUB_API_BASE as CONTRACT_DEFAULT_GITHUB_API_BASE
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
from packages.contracts.gitops import GITHUB_API_BASE_ENV as CONTRACT_GITHUB_API_BASE_ENV
from packages.contracts.gitops import GITHUB_TOKEN_ENV as CONTRACT_GITHUB_TOKEN_ENV
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
    GITHUB_TOKEN_ENV = CONTRACT_GITHUB_TOKEN_ENV
    GITHUB_API_BASE_ENV = CONTRACT_GITHUB_API_BASE_ENV
    DEFAULT_GITHUB_API_BASE = CONTRACT_DEFAULT_GITHUB_API_BASE

    # webhook 입구가 HMAC 서명을 검증 → 폴러도 같은 시크릿으로 서명해 통과(gateway 와 동일 키).
    WEBHOOK_SECRET_ENV = "GITHUB_WEBHOOK_SECRET"
    SIGNATURE_HEADER = "x-hub-signature-256"
    SIGNATURE_PREFIX = "sha256="

    # 폴링 튜닝값 — env 미설정 시 기존 하드코딩 값과 동일한 기본값이 적용됨(배포 호환)
    HTTP_TIMEOUT_SECONDS_ENV = "HTTP_TIMEOUT_SECONDS"  # GitHub/webhook HTTP 타임아웃 초(기본 20)
    HTTP_TIMEOUT_SECONDS = int(env(HTTP_TIMEOUT_SECONDS_ENV, "20"))
    POLL_RETRY_DELAY_SECONDS_ENV = "POLL_RETRY_DELAY_SECONDS"  # 실패 재시도 기본 간격 초(기본 5)
    POLL_RETRY_DELAY_SECONDS = int(env(POLL_RETRY_DELAY_SECONDS_ENV, "5"))
    POLL_MAX_BACKOFF_SECONDS_ENV = (
        "POLL_MAX_BACKOFF_SECONDS"  # 연속 실패 지수 백오프 상한 초(기본 300)
    )
    POLL_MAX_BACKOFF_SECONDS = int(env(POLL_MAX_BACKOFF_SECONDS_ENV, "300"))
    POLL_BACKOFF_JITTER_SECONDS_ENV = (
        "POLL_BACKOFF_JITTER_SECONDS"  # thundering herd 완화용 지터 초(기본 3)
    )
    POLL_BACKOFF_JITTER_SECONDS = int(env(POLL_BACKOFF_JITTER_SECONDS_ENV, "3"))
    SOFT_SKIP_STATUS_CODES = {403, 429}
    # 인증/접근 오류 — CronJob 을 '실패'로 죽이지 않고 명확한 경고 후 스킵.
    # (private repo 무인증 404, 토큰 만료 401 등 설정 문제 → 로그로 드러내되 파이프라인은 계속)
    ACCESS_ERROR_STATUS_CODES = {401, 404}

    WEBHOOK_IMAGE_ENV = "GITOPS_WEBHOOK_IMAGE"
    # webhook 바디 기본값은 두지 않는다. 배포 이미지는 repo manifest 또는 명시 env 로만 들어온다.
    DEFAULT_IMAGE = ""
    DEFAULT_REPLICAS = 2
