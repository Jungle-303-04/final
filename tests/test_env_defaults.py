"""env 오버라이드 기본값 가드 — env 미설정 시 기존 기본값과 동일해야 함(배포 호환).

test_database_unit.py::test_pool_options_env_defaults_remain_unchanged 와 같은 목적의
가드를 이번에 env 화한 핵심 튜닝값에도 적용함(전수 아님 — 동작 영향이 큰 값 위주).
"""

from __future__ import annotations

from conftest import ROOT, load_file

from domains.command import policy as command_policy
from domains.command import router as command_router
from domains.target import evidence_jobs
from packages.config import retry as config_retry
from packages.runtime import relay as runtime_relay
from packages.runtime import worker as runtime_worker


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
    assert config.OUTBOX_RELAY_INTERVAL_SECONDS == 1
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
    assert config.OUTBOX_RELAY_INTERVAL_SECONDS_ENV == "OUTBOX_RELAY_INTERVAL_SECONDS"


def test_command_long_poll_env_defaults_remain_unchanged() -> None:
    assert command_router.DEFAULT_POLL_SECONDS == 10
    assert command_router.MAX_POLL_SECONDS == 30
    assert command_router.POLL_SLEEP_SECONDS == 1
    assert command_policy.DEFAULT_COMMAND_LEASE_SECONDS == 60
    assert command_policy.DEFAULT_COMMAND_LEASE_SECONDS_ENV == "COMMAND_LEASE_SECONDS"


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
