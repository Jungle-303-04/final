from __future__ import annotations

from typing import Final


class Postgres:
    DEFAULT_URL: Final[str] = "postgresql://service:service@postgresql:5432/service"


class Nats:
    DEFAULT_URL: Final[str] = "nats://nats:4222"


class Redis:
    DEFAULT_URL: Final[str] = "redis://redis:6379/0"


class Runtime:
    DEFAULT_SERVICE_NAME: Final[str] = "service"
    DEFAULT_HTTP_PORT: Final[str] = "8000"
    SERVICE_NAME_ENV: Final[str] = "SERVICE_NAME"


class Target:
    DEFAULT_CLUSTER_ID: Final[str] = "target-cluster-01"
    DEFAULT_EVIDENCE_INTERVAL_SECONDS: Final[str] = "10"


class Auth:
    LOCAL_USER_ID: Final[str] = "local-user"
    DEFAULT_SESSION_TTL_SECONDS: Final[str] = "86400"
    SESSION_TTL_ENV: Final[str] = "SESSION_TTL_SECONDS"
    SESSION_COOKIE_NAME: Final[str] = "service_session"
    # 세션 쿠키를 httpOnly 로 심어 JS 가 토큰을 못 읽게(XSS 탈취 차단). Secure 는 운영 기본 on,
    # 로컬 http 개발에선 COOKIE_SECURE=0 로 끈다. SameSite=lax 로 CSRF 완화.
    COOKIE_SECURE_ENV: Final[str] = "COOKIE_SECURE"
    COOKIE_SAMESITE: Final[str] = "lax"


class GitHub:
    PROVIDER: Final[str] = "github"
    REQUIRED_SCOPE: Final[str] = "repo"


class OAuth:
    DEFAULT_SCOPES: Final[tuple[str, ...]] = ("profile", "email")


class Command:
    DEFAULT_ACTION: Final[str] = "rollout_restart"


class CommandStatus:
    # Final(타입 미지정) → mypy 가 Literal 로 추론 → Literal 필드(status)에 그대로 대입 가능.
    QUEUED: Final = "queued"
    LEASED: Final = "leased"
    RUNNING: Final = "running"
    COMPLETED: Final = "completed"
    FAILED: Final = "failed"


class Sandbox:
    NAMESPACE: Final[str] = "sandbox"
    RISK_TAG: Final[str] = (
        "sandbox-only"  # diff 가 sandbox 한정 → 안전 판정 표식(생산자·소비자 공유)
    )
