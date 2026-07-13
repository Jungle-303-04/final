"""env 오버라이드 기본값 가드 — env 미설정 시 기존 기본값과 동일해야 함(배포 호환).

test_database_unit.py::test_pool_options_env_defaults_remain_unchanged 와 같은 목적의
가드를 이번에 env 화한 핵심 튜닝값에도 적용함(전수 아님 — 동작 영향이 큰 값 위주).
"""

from __future__ import annotations

from conftest import ROOT, load_file

from domains.command import policy as command_policy
from domains.command import router as command_router
from domains.target import evidence_jobs
from packages.config import control as config_control
from packages.config import retry as config_retry
from packages.runtime import relay as runtime_relay
from packages.runtime import worker as runtime_worker
from packages.security import trusted_proxy


def test_cluster_agent_config_env_defaults_remain_unchanged() -> None:
    config = load_file(
        ROOT / "src" / "services" / "target" / "cluster-agent" / "config.py",
        "guard_cluster_agent_config",
    )
    assert config.HTTP_TIMEOUT_SECONDS == 20
    assert config.COMMAND_POLL_TIMEOUT_SECONDS == 15
    assert config.COMMAND_HEARTBEAT_INTERVAL_SECONDS == 20
    assert config.COMMAND_OUTBOX_FLUSH_INTERVAL_SECONDS == 2
    assert config.COMMAND_OUTBOX_MAX_ATTEMPTS == 5
    assert config.NODE_COLLECTOR_RECONCILE_INTERVAL_SECONDS == 30
    assert config.COMMAND_POLL_TIMEOUT_SECONDS_ENV == "COMMAND_POLL_TIMEOUT_SECONDS"
    assert config.COMMAND_OUTBOX_MAX_ATTEMPTS_ENV == "COMMAND_OUTBOX_MAX_ATTEMPTS"


def test_gateway_settings_env_defaults_remain_unchanged() -> None:
    settings = load_file(
        ROOT / "src" / "services" / "gateway" / "api-gateway" / "settings.py",
        "guard_gateway_settings",
    )
    config = settings.Settings
    assert config.DEFAULT_RATE_LIMIT == 120
    assert config.RATE_LIMIT_WINDOW_SECONDS == 60
    assert config.SIGNUP_EMAIL_RATE_LIMIT == 3
    assert config.SIGNUP_IP_RATE_LIMIT == 20
    assert config.EMAIL_VERIFICATION_TTL_SECONDS == 60 * 60
    assert config.AUTH_ABUSE_RATE_WINDOW_SECONDS == 15 * 60
    assert config.AUTH_ABUSE_FIRST_LOCK_SECONDS == 15 * 60
    assert config.AUTH_ABUSE_SECOND_LOCK_SECONDS == 60 * 60
    assert config.AUTH_ABUSE_THIRD_LOCK_SECONDS == 24 * 60 * 60
    assert config.AUTH_ABUSE_STRIKE_TTL_SECONDS == 24 * 60 * 60
    assert trusted_proxy.TRUSTED_PROXY_AUTH_SECRET_ENV == "TRUSTED_PROXY_AUTH_SECRET"
    assert trusted_proxy.TRUSTED_PROXY_AUTH_USER_ID_ENV == "TRUSTED_PROXY_AUTH_USER_ID"
    assert trusted_proxy.TRUSTED_PROXY_AUTH_WORKSPACE_ID_ENV == "TRUSTED_PROXY_AUTH_WORKSPACE_ID"
    assert trusted_proxy.TRUSTED_PROXY_SESSION_TOKEN == "mtls-dev-console"


def test_outbox_relay_env_defaults_remain_unchanged() -> None:
    config = load_file(
        ROOT / "src" / "services" / "gateway" / "outbox-relay" / "app.py",
        "guard_outbox_relay_app",
    )
    assert config.OUTBOX_RELAY == "outbox-relay"
    assert config.OUTBOX_RELAY_SOURCE_ENV == "OUTBOX_RELAY_SOURCE"
    assert config.OUTBOX_RELAY_ALL_SOURCES == "*"
    assert config.OUTBOX_RELAY_SOURCE == "*"
    assert config.relay_source_filter("*") is None
    assert config.relay_source_filter("api-gateway") == "api-gateway"
    assert config.DEFAULT_OUTBOX_RELAY_INTERVAL_SECONDS == 1.0
    assert config.OUTBOX_RELAY_INTERVAL_SECONDS_ENV == "OUTBOX_RELAY_INTERVAL_SECONDS"


def test_command_long_poll_env_defaults_remain_unchanged() -> None:
    assert command_router.DEFAULT_POLL_SECONDS == 10
    assert command_router.MAX_POLL_SECONDS == 30
    assert command_router.POLL_SLEEP_SECONDS == 1
    assert command_policy.DEFAULT_COMMAND_LEASE_SECONDS == 60
    assert command_policy.DEFAULT_COMMAND_LEASE_SECONDS_ENV == "COMMAND_LEASE_SECONDS"


def test_management_namespace_is_never_control_allowed(monkeypatch) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,management,prod-web")

    assert config_control.control_allowed_namespaces() == ("sandbox", "prod-web")
    assert config_control.control_namespace_allowed("sandbox") is True
    assert config_control.control_namespace_allowed("management") is False


def test_control_allowlist_all_protected_namespaces_becomes_empty(monkeypatch) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "management")

    assert config_control.control_allowed_namespaces() == ()
    assert config_control.control_namespace_allowed("management") is False
    assert config_control.control_namespace_allowed("sandbox") is False


def test_evidence_job_env_defaults_remain_unchanged() -> None:
    assert evidence_jobs.DEFAULT_EVIDENCE_JOB_LEASE_SECONDS == 60
    assert evidence_jobs.DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS == 120


def test_runtime_env_defaults_remain_unchanged() -> None:
    assert runtime_relay.DEFAULT_BATCH == 10
    assert runtime_relay.DEFAULT_PUBLISH_TIMEOUT_SECONDS == 10
    assert runtime_worker.DEFAULT_RETRY_DELAY_SECONDS == 2
    assert runtime_worker.DEFAULT_FETCH_TIMEOUT_SECONDS == 1
    assert runtime_worker.DEFAULT_DEAD_LETTER_TIMEOUT_SECONDS == 10
    assert runtime_worker.HEARTBEAT_PATH == "/tmp/heartbeat"
    assert config_retry.DEPENDENCY_RETRY_LIMIT == 60
    assert config_retry.DEPENDENCY_RETRY_DELAY_SECONDS == 2
