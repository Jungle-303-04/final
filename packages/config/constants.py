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
    SESSION_COOKIE_NAME: Final[str] = "service_session"


class GitHub:
    PROVIDER: Final[str] = "github"
    REQUIRED_SCOPE: Final[str] = "repo"


class Sandbox:
    NAMESPACE: Final[str] = "sandbox"
