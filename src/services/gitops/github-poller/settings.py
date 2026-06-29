from __future__ import annotations


class Settings:
    SERVICE_NAME = "github-poller"

    # api-gateway 의 webhook 입구로 POST(폴링이 당겨온 변경을 webhook 과 동일 경로로 흘림).
    DEFAULT_MANAGEMENT_BASE_URL = "http://api-gateway:8000"
    MANAGEMENT_BASE_URL_ENV = "MANAGEMENT_BASE_URL"

    # 폴링 대상 repo(owner/name)와 주기. 데모 기본 30초(상주 워커 내부 루프).
    GITHUB_REPO_ENV = "GITHUB_REPO"
    DEFAULT_GITHUB_REPO = "octocat/Hello-World"
    POLL_INTERVAL_ENV = "POLL_INTERVAL_SECONDS"
    DEFAULT_POLL_INTERVAL_SECONDS = "30"

    # POLL_ONCE=1 → 한 번 당기고 종료(프로덕션 CronJob 모드). 미설정 → 무한 루프(데모 Deployment).
    POLL_ONCE_ENV = "POLL_ONCE"

    # 공개 repo 는 무인증도 되나 시간당 60회 제한 → 토큰 있으면 인증(5000회). 데모 30초=120회/시.
    GITHUB_TOKEN_ENV = "GITHUB_TOKEN"
    GITHUB_API_BASE = "https://api.github.com"

    HTTP_TIMEOUT_SECONDS = 20
    POLL_RETRY_DELAY_SECONDS = 5

    # webhook 바디 기본값(폴러는 commit_sha 만 실제로 채우고 image/replicas 는 데모 기본).
    DEFAULT_IMAGE = "ghcr.io/project/checkout-api:bad"
    DEFAULT_REPLICAS = 2
