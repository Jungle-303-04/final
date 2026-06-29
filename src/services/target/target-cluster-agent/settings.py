from __future__ import annotations

from packages.config.constants import CommandStatus


class Settings:
    TARGET_AGENT_SERVICE_NAME = "target-cluster-agent"
    FAKE_PROMETHEUS_SERVICE_NAME = "fake-prometheus"
    FAKE_LOKI_SERVICE_NAME = "fake-loki"
    FAKE_OTEL_SERVICE_NAME = "fake-otel"

    PROMETHEUS_TELEMETRY_KIND = "prometheus"
    LOKI_TELEMETRY_KIND = "loki"
    OTEL_TELEMETRY_KIND = "otel"

    DEFAULT_MANAGEMENT_BASE_URL = "http://localhost:18080"
    MANAGEMENT_BASE_URL_ENV = "MANAGEMENT_BASE_URL"
    TARGET_CLUSTER_ID_ENV = "TARGET_CLUSTER_ID"
    EVIDENCE_INTERVAL_ENV = "EVIDENCE_INTERVAL_SECONDS"
    AGENT_TOKEN_ENV = "AGENT_TOKEN"
    DEFAULT_AGENT_TOKEN = "local-agent-token"
    AGENT_TOKEN_HEADER = "x-agent-token"
    HTTP_TIMEOUT_SECONDS = 20
    COMMAND_POLL_TIMEOUT_SECONDS = 15
    COMMAND_EXECUTION_DELAY_SECONDS = 2
    REGISTER_RETRY_DELAY_SECONDS = 3
    COMMAND_RETRY_DELAY_SECONDS = 3

    SERVICE_HOST = "0.0.0.0"
    SERVICE_PORT_ENV = "PORT"
    HOSTNAME_ENV = "HOSTNAME"
    LOG_LEVEL = "info"
    DEFAULT_SERVICE_PORT = "8000"
    DEFAULT_AGENT_ID = "target-agent"
    AGENT_CAPABILITIES = ["collector", "command_receiver"]

    CHECKOUT_APP_NAME = "checkout-api"
    CRASHING_POD_NAME = "checkout-api-7f8d"
    CRASHING_POD_STATUS = "CrashLoopBackOff"
    CRASHING_POD_RESTARTS = 4
    K8S_READINESS_FAILED_EVENT = "readiness probe failed"
    K8S_BACKOFF_EVENT = "back-off restarting failed container"

    FAKE_PROMETHEUS_SOURCE = "fake-prometheus"
    FAKE_LOKI_SOURCE = "fake-loki"
    FAKE_OTEL_SOURCE = "fake-otel"
    FAKE_NODE_CPU = 0.83
    FAKE_NODE_MEMORY_MB = 512
    FAKE_HTTP_5XX_RATE = 0.19
    PROMETHEUS_VECTOR_VALUE = "0.19"

    COMMAND_COMPLETED_STATUS = CommandStatus.COMPLETED
    COMMAND_RESULT_MESSAGE = "fake Kubernetes action applied in sandbox namespace"
    LOKI_ERROR_LINE = "ERROR readiness check failed: downstream timeout"
    LOKI_WARNING_LINE = "WARN rollback candidate detected"
    OTEL_SLOW_SPAN = "GET /checkout"
