from __future__ import annotations

import asyncio
import time
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from fastapi import FastAPI
from node_collector_manager import (
    NodeCollectorManager,
    kubernetes_api_base_url,
    kubernetes_client,
    kubernetes_headers,
    service_account_token,
)
from uvicorn import Config, Server

from packages.config.constants import Command, CommandStatus, Target
from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway
from packages.contracts.gateway.requests import DEFAULT_EVIDENCE_SOURCE_LEASE_SECONDS
from packages.contracts.gateway.responses import FakeTelemetryResponse, HealthResponse
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.contracts.interfaces import CommandRecord, ManagementPlaneClient

LOGGER = get_logger(__name__)


@dataclass(frozen=True)
class KubernetesManifestResource:
    kind: str
    api_version: str
    namespace: str
    name: str
    plural: str
    api_prefix: str
    manifest: JsonObject

    def collection_url(self, base_url: str) -> str:
        return f"{base_url}{self.api_prefix}/namespaces/{self.namespace}/{self.plural}"

    def resource_url(self, base_url: str) -> str:
        return f"{self.collection_url(base_url)}/{self.name}"


class AgentConfig:
    TARGET_AGENT_SERVICE_NAME = "cluster-agent"
    FAKE_PROMETHEUS_SERVICE_NAME = "fake-prometheus"
    FAKE_LOKI_SERVICE_NAME = "fake-loki"
    FAKE_OTEL_SERVICE_NAME = "fake-otel"

    PROMETHEUS_TELEMETRY_KIND = "prometheus"
    LOKI_TELEMETRY_KIND = "loki"
    OTEL_TELEMETRY_KIND = "otel"

    DEFAULT_MANAGEMENT_BASE_URL = "http://localhost:18080"
    MANAGEMENT_BASE_URL_ENV = "MANAGEMENT_BASE_URL"
    TARGET_CLUSTER_ID_ENV = "TARGET_CLUSTER_ID"
    WORKSPACE_ID_ENV = "WORKSPACE_ID"
    EVIDENCE_INTERVAL_ENV = "EVIDENCE_INTERVAL_SECONDS"
    AGENT_TOKEN_ENV = "AGENT_TOKEN"
    AGENT_TOKEN_HEADER = "x-agent-token"
    HTTP_TIMEOUT_SECONDS = 20
    TELEMETRY_TIMEOUT_SECONDS = 10
    COMMAND_POLL_TIMEOUT_SECONDS = 15
    COMMAND_HEARTBEAT_INTERVAL_SECONDS = 20
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
    EVIDENCE_SOURCE_ID = "cluster-snapshot"
    EVIDENCE_SOURCE_LEASE_SECONDS = DEFAULT_EVIDENCE_SOURCE_LEASE_SECONDS
    NODE_COLLECTOR_RECONCILE_INTERVAL_SECONDS = 30

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
    PROMETHEUS_BASE_URL_ENV = "PROMETHEUS_BASE_URL"
    DEFAULT_PROMETHEUS_BASE_URL = "http://fake-prometheus:8000"
    PROMETHEUS_METRIC_NAMES_PATH = "/api/v1/label/__name__/values"
    PROMETHEUS_QUERY_PATH = "/api/v1/query"
    PROMETHEUS_MAX_METRICS = 25
    PROMETHEUS_FALLBACK_QUERIES = ("up",)
    LOKI_BASE_URL_ENV = "LOKI_BASE_URL"
    DEFAULT_LOKI_BASE_URL = "http://fake-loki:8000"
    LOKI_LABELS_PATH = "/loki/api/v1/labels"
    LOKI_QUERY_RANGE_PATH = "/loki/api/v1/query_range"
    LOKI_QUERY_ENV = "LOKI_QUERY"
    DEFAULT_LOKI_QUERY = '{pod=~".+"}'
    LOKI_QUERY_LIMIT = 100

    COMMAND_COMPLETED_STATUS = CommandStatus.COMPLETED
    APPLY_MANIFEST_ACTION = Command.APPLY_MANIFEST_ACTION
    ROLLOUT_RESTART_ACTION = Command.DEFAULT_ACTION
    COMMAND_RESULT_MESSAGE = "Kubernetes action processed in sandbox namespace"
    MANIFEST_CREATED_MESSAGE = "Kubernetes manifest created in sandbox namespace"
    MANIFEST_PATCHED_MESSAGE = "Kubernetes manifest patched in sandbox namespace"
    LOKI_ERROR_LINE = "ERROR readiness check failed: downstream timeout"
    LOKI_WARNING_LINE = "WARN rollback candidate detected"
    OTEL_SLOW_SPAN = "GET /checkout"


class HttpManagementPlaneClient:
    def __init__(
        self, base_url: str, timeout_seconds: int = AgentConfig.HTTP_TIMEOUT_SECONDS
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=timeout_seconds)
        self.headers = {AgentConfig.AGENT_TOKEN_HEADER: env(AgentConfig.AGENT_TOKEN_ENV, "")}

    async def __aenter__(self) -> HttpManagementPlaneClient:
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.close()

    async def close(self) -> None:
        await self.client.aclose()

    async def register_agent(self, cluster_id: str, agent_id: str, capabilities: list[str]) -> None:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.AGENT_CONNECT_PATH}",
            json={
                Gateway.CLUSTER_ID: cluster_id,
                Gateway.AGENT_ID: agent_id,
                Gateway.CAPABILITIES: capabilities,
            },
            headers=self.headers,
        )
        response.raise_for_status()

    async def ship_evidence(self, evidence: JsonObject) -> int:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.AGENT_EVIDENCE_PATH}",
            json=evidence,
            headers=self.headers,
        )
        response.raise_for_status()
        return response.status_code

    async def poll_command(
        self, cluster_id: str, workspace_id: str, agent_id: str, timeout_seconds: int
    ) -> CommandRecord | None:
        response = await self.client.get(
            f"{self.base_url}{gateway_routes.AGENT_COMMAND_POLL_PATH}",
            params={
                Gateway.CLUSTER_ID: cluster_id,
                Gateway.WORKSPACE_ID: workspace_id,
                Gateway.AGENT_ID: agent_id,
                "timeout": timeout_seconds,
            },
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json().get(Gateway.COMMAND)

    async def start_command(
        self, command_id: str, cluster_id: str, workspace_id: str, lease_id: str, agent_id: str
    ) -> None:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.agent_command_start_path(command_id)}",
            json={
                Gateway.CLUSTER_ID: cluster_id,
                Gateway.WORKSPACE_ID: workspace_id,
                Gateway.AGENT_ID: agent_id,
                Gateway.LEASE_ID: lease_id,
            },
            headers=self.headers,
        )
        response.raise_for_status()

    async def heartbeat_command(
        self, command_id: str, cluster_id: str, workspace_id: str, lease_id: str, agent_id: str
    ) -> None:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.agent_command_heartbeat_path(command_id)}",
            json={
                Gateway.CLUSTER_ID: cluster_id,
                Gateway.WORKSPACE_ID: workspace_id,
                Gateway.AGENT_ID: agent_id,
                Gateway.LEASE_ID: lease_id,
            },
            headers=self.headers,
        )
        response.raise_for_status()

    async def complete_command(
        self,
        command_id: str,
        workspace_id: str,
        lease_id: str,
        agent_id: str,
        result: JsonObject,
    ) -> None:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.agent_command_result_path(command_id)}",
            json={
                **result,
                Gateway.WORKSPACE_ID: workspace_id,
                Gateway.AGENT_ID: agent_id,
                Gateway.LEASE_ID: lease_id,
            },
            headers=self.headers,
        )
        response.raise_for_status()

    async def acquire_evidence_source_lease(
        self,
        cluster_id: str,
        workspace_id: str,
        agent_id: str,
        source_id: str,
        window_start: str,
        lease_seconds: int,
    ) -> JsonObject:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.agent_evidence_source_lease_path(source_id)}",
            json={
                Gateway.CLUSTER_ID: cluster_id,
                Gateway.WORKSPACE_ID: workspace_id,
                Gateway.AGENT_ID: agent_id,
                Gateway.WINDOW_START: window_start,
                "lease_seconds": lease_seconds,
            },
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json()


class TargetClusterAgent:
    def __init__(
        self,
        client: ManagementPlaneClient | None = None,
        telemetry_transport: httpx.AsyncBaseTransport | None = None,
        kubernetes_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = env(
            AgentConfig.MANAGEMENT_BASE_URL_ENV, AgentConfig.DEFAULT_MANAGEMENT_BASE_URL
        ).rstrip("/")
        self.cluster_id = env(AgentConfig.TARGET_CLUSTER_ID_ENV, Target.DEFAULT_CLUSTER_ID)
        self.workspace_id = env(AgentConfig.WORKSPACE_ID_ENV, DEFAULT_WORKSPACE_ID)
        self.agent_id = env(AgentConfig.HOSTNAME_ENV, AgentConfig.DEFAULT_AGENT_ID)
        self.interval = int(
            env(AgentConfig.EVIDENCE_INTERVAL_ENV, Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS)
        )
        self.client = client
        self.telemetry_transport = telemetry_transport
        self.kubernetes_transport = kubernetes_transport
        self.node_collector = NodeCollectorManager.from_env(kubernetes_transport)

    async def run(self) -> None:
        if self.client is not None:
            await self.run_with_client(self.client)
            return
        async with HttpManagementPlaneClient(self.base_url) as client:
            await self.run_with_client(client)

    async def run_with_client(self, client: ManagementPlaneClient) -> None:
        await self.register(client)
        await self.reconcile_node_collector_once()
        await asyncio.gather(
            self.reconcile_node_collector_forever(),
            self.ship_evidence(client),
            self.poll_commands(client),
        )

    async def register(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                await client.register_agent(
                    self.cluster_id,
                    self.agent_id,
                    AgentConfig.AGENT_CAPABILITIES,
                )
                return
            except Exception as exc:
                LOGGER.warning(
                    "agent_waiting_for_management_gateway",
                    extra={
                        CONTEXT_KEY: {
                            Gateway.CLUSTER_ID: self.cluster_id,
                            Gateway.AGENT_ID: self.agent_id,
                            "exception_type": type(exc).__name__,
                        }
                    },
                )
                await asyncio.sleep(AgentConfig.REGISTER_RETRY_DELAY_SECONDS)

    async def ship_evidence(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                await self.ship_evidence_once(client)
            except Exception as exc:
                LOGGER.warning(
                    "evidence_ship_failed",
                    extra={
                        CONTEXT_KEY: {
                            Gateway.CLUSTER_ID: self.cluster_id,
                            Gateway.AGENT_ID: self.agent_id,
                            "exception_type": type(exc).__name__,
                        }
                    },
                )
            await asyncio.sleep(self.interval)

    async def ship_evidence_once(self, client: ManagementPlaneClient) -> bool:
        window_start = self.current_evidence_window_start()
        lease = await client.acquire_evidence_source_lease(
            self.cluster_id,
            self.workspace_id,
            self.agent_id,
            AgentConfig.EVIDENCE_SOURCE_ID,
            window_start,
            AgentConfig.EVIDENCE_SOURCE_LEASE_SECONDS,
        )
        if not lease.get(Gateway.LEASED):
            LOGGER.info(
                "evidence_source_lease_skipped",
                extra={
                    CONTEXT_KEY: {
                        Gateway.CLUSTER_ID: self.cluster_id,
                        Gateway.AGENT_ID: self.agent_id,
                        Gateway.SOURCE_ID: AgentConfig.EVIDENCE_SOURCE_ID,
                        Gateway.LEASED_UNTIL: lease.get(Gateway.LEASED_UNTIL),
                    }
                },
            )
            return False
        payload = await self.build_evidence_payload()
        payload.update(
            {
                Gateway.AGENT_ID: self.agent_id,
                Gateway.SOURCE_ID: AgentConfig.EVIDENCE_SOURCE_ID,
                Gateway.WINDOW_START: window_start,
                Gateway.EVIDENCE_KEY: self.evidence_key(window_start),
            }
        )
        status_code = await client.ship_evidence(payload)
        LOGGER.info(
            "evidence_shipped",
            extra={
                CONTEXT_KEY: {
                    Gateway.CLUSTER_ID: self.cluster_id,
                    Gateway.AGENT_ID: self.agent_id,
                    Gateway.SOURCE_ID: AgentConfig.EVIDENCE_SOURCE_ID,
                    "status_code": status_code,
                }
            },
        )
        return True

    def current_evidence_window_start(self) -> str:
        interval = max(1, self.interval)
        current = int(time.time())
        window_start = current - (current % interval)
        return datetime.fromtimestamp(window_start, UTC).isoformat()

    def evidence_key(self, window_start: str) -> str:
        return ":".join(
            [self.workspace_id, self.cluster_id, AgentConfig.EVIDENCE_SOURCE_ID, window_start]
        )

    async def poll_commands(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                command = await client.poll_command(
                    self.cluster_id,
                    self.workspace_id,
                    self.agent_id,
                    AgentConfig.COMMAND_POLL_TIMEOUT_SECONDS,
                )
                if command:
                    command_id = command[Gateway.COMMAND_ID]
                    workspace_id = command.get(Gateway.WORKSPACE_ID, self.workspace_id)
                    lease_id = command[Gateway.LEASE_ID]
                    action = command[Gateway.ACTION]
                    LOGGER.info(
                        "agent_executing_command",
                        extra={
                            CONTEXT_KEY: {
                                Gateway.CLUSTER_ID: self.cluster_id,
                                Gateway.AGENT_ID: self.agent_id,
                                Gateway.COMMAND_ID: command_id,
                                Gateway.ACTION: action,
                            }
                        },
                    )
                    await client.start_command(
                        command_id,
                        self.cluster_id,
                        str(workspace_id),
                        lease_id,
                        self.agent_id,
                    )
                    result = await self.execute_command_with_heartbeat(
                        client,
                        command,
                        command_id,
                        str(workspace_id),
                        lease_id,
                    )
                    await client.complete_command(
                        command_id,
                        str(workspace_id),
                        lease_id,
                        self.agent_id,
                        result,
                    )
            except Exception as exc:
                LOGGER.warning(
                    "command_polling_failed",
                    extra={
                        CONTEXT_KEY: {
                            Gateway.CLUSTER_ID: self.cluster_id,
                            Gateway.AGENT_ID: self.agent_id,
                            "exception_type": type(exc).__name__,
                        }
                    },
                )
                await asyncio.sleep(AgentConfig.COMMAND_RETRY_DELAY_SECONDS)

    async def execute_command_with_heartbeat(
        self,
        client: ManagementPlaneClient,
        command: CommandRecord,
        command_id: str,
        workspace_id: str,
        lease_id: str,
    ) -> JsonObject:
        heartbeat = asyncio.create_task(
            self.heartbeat_command_until_done(client, command_id, workspace_id, lease_id)
        )
        try:
            return await self.execute_command(command)
        finally:
            heartbeat.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat

    async def heartbeat_command_until_done(
        self,
        client: ManagementPlaneClient,
        command_id: str,
        workspace_id: str,
        lease_id: str,
    ) -> None:
        while True:
            await asyncio.sleep(AgentConfig.COMMAND_HEARTBEAT_INTERVAL_SECONDS)
            try:
                await client.heartbeat_command(
                    command_id, self.cluster_id, workspace_id, lease_id, self.agent_id
                )
            except Exception as exc:
                LOGGER.warning(
                    "command_heartbeat_failed",
                    extra={
                        CONTEXT_KEY: {
                            Gateway.CLUSTER_ID: self.cluster_id,
                            Gateway.AGENT_ID: self.agent_id,
                            Gateway.COMMAND_ID: command_id,
                            "exception_type": type(exc).__name__,
                        }
                    },
                )

    async def reconcile_node_collector_forever(self) -> None:
        while True:
            await self.reconcile_node_collector_once()
            await asyncio.sleep(AgentConfig.NODE_COLLECTOR_RECONCILE_INTERVAL_SECONDS)

    async def reconcile_node_collector_once(self) -> None:
        try:
            applied, message = await self.node_collector.reconcile()
            LOGGER.info(
                "node_collector_reconciled",
                extra={
                    CONTEXT_KEY: {
                        Gateway.CLUSTER_ID: self.cluster_id,
                        Gateway.AGENT_ID: self.agent_id,
                        Gateway.APPLIED: applied,
                        Gateway.MESSAGE: message,
                    }
                },
            )
        except Exception as exc:
            LOGGER.warning(
                "node_collector_reconcile_failed",
                extra={
                    CONTEXT_KEY: {
                        Gateway.CLUSTER_ID: self.cluster_id,
                        Gateway.AGENT_ID: self.agent_id,
                        "exception_type": type(exc).__name__,
                    }
                },
            )

    async def execute_command(self, command: CommandRecord) -> JsonObject:
        # TODO(target): action 허용 목록을 workspace/repo/cluster 정책과 승인 증거로 확장
        # TODO(target): stdout/stderr/status 수집과 원본 secret 없는 부분 실패 보고
        if command.get(Gateway.ACTION) == AgentConfig.APPLY_MANIFEST_ACTION:
            return await self.apply_manifest_command(command)
        if command.get(Gateway.ACTION) == AgentConfig.ROLLOUT_RESTART_ACTION:
            return await self.rollout_restart_command(command)
        return {
            Gateway.STATUS: "failed",
            Gateway.CLUSTER_ID: self.cluster_id,
            Gateway.APPLIED: False,
            Gateway.MESSAGE: f"unsupported action: {command.get(Gateway.ACTION)}",
        }

    async def apply_manifest_command(self, command: CommandRecord) -> JsonObject:
        plan = command.get("payload", {})
        diff = plan.get("diff", {}) if isinstance(plan, dict) else {}
        namespace = str(diff.get("namespace") or "sandbox")
        desired_manifest = diff.get("desired_manifest")
        if isinstance(desired_manifest, dict) and desired_manifest:
            applied, message = await self.apply_kubernetes_manifest(
                desired_manifest,
                namespace,
            )
            return self.command_result(applied, message)

        deployment = deployment_name_from_resource(str(diff.get("resource", "")))
        image = str(diff.get("desired_image", ""))
        if not deployment or not image:
            return self.command_result(
                False, "apply_manifest requires deployment resource and image"
            )
        patch = build_apply_manifest_patch(deployment, image)
        applied, message = await self.patch_deployment(namespace, deployment, patch)
        return self.command_result(applied, message)

    async def rollout_restart_command(self, command: CommandRecord) -> JsonObject:
        plan = command.get("payload", {})
        diff = plan.get("diff", {}) if isinstance(plan, dict) else {}
        namespace = str(diff.get("namespace") or "sandbox")
        deployment = deployment_name_from_resource(str(diff.get("resource", "")))
        if not deployment:
            return self.command_result(False, "rollout_restart requires deployment resource")
        patch = build_rollout_restart_patch()
        applied, message = await self.patch_deployment(namespace, deployment, patch)
        return self.command_result(applied, message)

    async def apply_kubernetes_manifest(
        self, manifest: JsonObject, fallback_namespace: str
    ) -> tuple[bool, str]:
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        if not base_url or not token:
            return False, "kubernetes api not configured; dry-run only"

        try:
            resource = kubernetes_manifest_resource(manifest, fallback_namespace)
        except ValueError as exc:
            return False, str(exc)

        async with kubernetes_client(self.kubernetes_transport) as client:
            current = await client.get(
                resource.resource_url(base_url), headers=kubernetes_headers(token)
            )
            if current.status_code == 404:
                created = await client.post(
                    resource.collection_url(base_url),
                    json=resource.manifest,
                    headers=kubernetes_headers(token, "application/json"),
                )
                created.raise_for_status()
                return True, AgentConfig.MANIFEST_CREATED_MESSAGE

            current.raise_for_status()
            patched = await client.patch(
                resource.resource_url(base_url),
                json=resource.manifest,
                headers=kubernetes_headers(token, "application/merge-patch+json"),
            )
            patched.raise_for_status()
        return True, AgentConfig.MANIFEST_PATCHED_MESSAGE

    def command_result(self, applied: bool, message: str) -> JsonObject:
        return {
            Gateway.STATUS: AgentConfig.COMMAND_COMPLETED_STATUS,
            Gateway.CLUSTER_ID: self.cluster_id,
            Gateway.APPLIED: applied,
            Gateway.MESSAGE: message,
        }

    async def patch_deployment(
        self, namespace: str, deployment: str, patch: JsonObject
    ) -> tuple[bool, str]:
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        if not base_url or not token:
            return False, "kubernetes api not configured; dry-run only"
        url = f"{base_url}/apis/apps/v1/namespaces/{namespace}/deployments/{deployment}"
        headers = kubernetes_headers(token, "application/strategic-merge-patch+json")
        async with kubernetes_client(self.kubernetes_transport) as client:
            response = await client.patch(url, json=patch, headers=headers)
            response.raise_for_status()
        return True, AgentConfig.COMMAND_RESULT_MESSAGE

    async def build_evidence_payload(self) -> JsonObject:
        # TODO(telemetry): 제한·마스킹된 스냅샷용 OTel/Kubernetes API 어댑터 추가
        async with httpx.AsyncClient(
            transport=self.telemetry_transport,
            timeout=AgentConfig.TELEMETRY_TIMEOUT_SECONDS,
        ) as telemetry_client:
            metrics, logs = await asyncio.gather(
                self.collect_metric_evidence(telemetry_client),
                self.collect_log_evidence(telemetry_client),
            )
        return {
            Gateway.CLUSTER_ID: self.cluster_id,
            Gateway.WORKSPACE_ID: self.workspace_id,
            "kubernetes": self.collect_kubernetes_evidence(),
            "metrics": metrics,
            "logs": logs,
            "traces": self.collect_trace_evidence(),
        }

    def collect_kubernetes_evidence(self) -> JsonObject:
        # TODO(target): 최소 권한 RBAC으로 pods/events/nodes 조회와 object metadata 마스킹
        return {
            "pods": [
                {
                    "name": AgentConfig.CRASHING_POD_NAME,
                    "status": AgentConfig.CRASHING_POD_STATUS,
                    "restarts": AgentConfig.CRASHING_POD_RESTARTS,
                }
            ],
            "events": [AgentConfig.K8S_READINESS_FAILED_EVENT, AgentConfig.K8S_BACKOFF_EVENT],
        }

    async def collect_metric_evidence(self, client: httpx.AsyncClient) -> JsonObject:
        # TODO(telemetry): 전체 metric 조회를 workspace/cluster 범위 허용 목록과 window로 교체
        base_url = env(
            AgentConfig.PROMETHEUS_BASE_URL_ENV, AgentConfig.DEFAULT_PROMETHEUS_BASE_URL
        ).rstrip("/")
        try:
            metric_names = await prometheus_metric_names(client, base_url)
            queries = metric_names[: AgentConfig.PROMETHEUS_MAX_METRICS] or list(
                AgentConfig.PROMETHEUS_FALLBACK_QUERIES
            )
            snapshots = [
                await prometheus_query(client, base_url, metric_name) for metric_name in queries
            ]
            return {
                "source": base_url,
                "mode": "direct_prometheus_api",
                "available_metric_count": len(metric_names),
                "queried_metric_count": len(snapshots),
                "truncated": len(metric_names) > len(queries),
                "queries": snapshots,
            }
        except Exception as exc:
            return self.fallback_metric_evidence(exc)

    def fallback_metric_evidence(self, exc: Exception) -> JsonObject:
        return {
            "source": AgentConfig.FAKE_PROMETHEUS_SOURCE,
            "mode": "fallback_sample",
            "error": type(exc).__name__,
            "cpu": AgentConfig.FAKE_NODE_CPU,
            "memory_mb": AgentConfig.FAKE_NODE_MEMORY_MB,
            "http_5xx_rate": AgentConfig.FAKE_HTTP_5XX_RATE,
        }

    async def collect_log_evidence(self, client: httpx.AsyncClient) -> list[JsonObject]:
        # TODO(telemetry): Loki 조회를 workspace/repo/cluster label selector별 분리와 secret 마스킹
        base_url = env(AgentConfig.LOKI_BASE_URL_ENV, AgentConfig.DEFAULT_LOKI_BASE_URL).rstrip("/")
        try:
            labels = await loki_labels(client, base_url)
            query = env(AgentConfig.LOKI_QUERY_ENV, AgentConfig.DEFAULT_LOKI_QUERY)
            payload = await loki_query_range(client, base_url, query)
            return [
                {
                    "source": base_url,
                    "mode": "direct_loki_api",
                    "labels": labels,
                    "query": query,
                    "response": payload,
                }
            ]
        except Exception as exc:
            return self.fallback_log_evidence(exc)

    def fallback_log_evidence(self, exc: Exception) -> list[JsonObject]:
        return [
            {
                "source": AgentConfig.FAKE_LOKI_SOURCE,
                "mode": "fallback_sample",
                "error": type(exc).__name__,
                "line": AgentConfig.LOKI_ERROR_LINE,
            },
            {
                "source": AgentConfig.FAKE_LOKI_SOURCE,
                "mode": "fallback_sample",
                "error": type(exc).__name__,
                "line": AgentConfig.LOKI_WARNING_LINE,
            },
        ]

    def collect_trace_evidence(self) -> JsonObject:
        # TODO(telemetry): OpenTelemetry 백엔드 조회와 service/operation별 span 요약
        return {"source": AgentConfig.FAKE_OTEL_SOURCE, "slow_span": AgentConfig.OTEL_SLOW_SPAN}


def create_fake_telemetry_app(kind: str) -> FastAPI:
    app = FastAPI(title=f"fake-{kind}")

    @app.get(gateway_routes.HEALTHZ_PATH, response_model=HealthResponse)
    async def healthz() -> HealthResponse:
        return HealthResponse(status=Gateway.STATUS_OK, service=f"fake-{kind}")

    @app.get(
        gateway_routes.FAKE_TELEMETRY_CATCH_ALL_PATH,
        response_model=FakeTelemetryResponse,
        response_model_exclude_none=True,
    )
    async def catch_all(path: str) -> FakeTelemetryResponse:
        if kind == "prometheus":
            if path == "api/v1/label/__name__/values":
                return FakeTelemetryResponse(status="success", data=["up", "http_5xx_rate"])
            return FakeTelemetryResponse(
                status="success",
                data={
                    "resultType": "vector",
                    "result": [
                        {
                            "metric": {"pod": AgentConfig.CHECKOUT_APP_NAME},
                            "value": [time.time(), AgentConfig.PROMETHEUS_VECTOR_VALUE],
                        }
                    ],
                },
            )
        if kind == "loki":
            if path == "loki/api/v1/labels":
                return FakeTelemetryResponse(status="success", data=["pod", "namespace"])
            return FakeTelemetryResponse(
                status="success",
                data={
                    "result": [
                        {
                            "stream": {"pod": AgentConfig.CHECKOUT_APP_NAME},
                            "values": [
                                [
                                    str(int(time.time() * 1e9)),
                                    AgentConfig.K8S_READINESS_FAILED_EVENT,
                                ]
                            ],
                        }
                    ]
                },
            )
        return FakeTelemetryResponse(status="ok", telemetry="fake-otel", path=path)

    return app


async def run_fake_telemetry(kind: str) -> None:
    await Server(
        Config(
            create_fake_telemetry_app(kind),
            host=AgentConfig.SERVICE_HOST,
            port=int(env(AgentConfig.SERVICE_PORT_ENV, AgentConfig.DEFAULT_SERVICE_PORT)),
            log_level=AgentConfig.LOG_LEVEL,
        )
    ).serve()


def deployment_name_from_resource(resource: str) -> str:
    if resource.startswith("deployment/"):
        return resource.split("/", 1)[1]
    return resource


def build_apply_manifest_patch(deployment: str, image: str) -> JsonObject:
    return {
        "spec": {
            "template": {
                "metadata": {"annotations": {"ops.service/apply-at": str(int(time.time()))}},
                "spec": {"containers": [{"name": deployment, "image": image}]},
            }
        }
    }


def build_rollout_restart_patch() -> JsonObject:
    return {
        "spec": {
            "template": {
                "metadata": {"annotations": {"ops.service/restarted-at": str(int(time.time()))}}
            }
        }
    }


def kubernetes_manifest_resource(
    manifest: JsonObject,
    fallback_namespace: str,
) -> KubernetesManifestResource:
    kind = str(manifest.get("kind", ""))
    api_version = str(manifest.get("apiVersion", ""))
    metadata = manifest.get("metadata", {})
    if not isinstance(metadata, dict):
        raise ValueError("manifest metadata must be an object")
    name = str(metadata.get("name", ""))
    namespace = str(metadata.get("namespace") or fallback_namespace)
    if not kind or not api_version or not name:
        raise ValueError("manifest requires apiVersion, kind, and metadata.name")

    api_prefix, plural = kubernetes_resource_api(kind, api_version)
    normalized = {
        **manifest,
        "metadata": {
            **metadata,
            "namespace": namespace,
        },
    }
    return KubernetesManifestResource(
        kind=kind,
        api_version=api_version,
        namespace=namespace,
        name=name,
        plural=plural,
        api_prefix=api_prefix,
        manifest=normalized,
    )


def kubernetes_resource_api(kind: str, api_version: str) -> tuple[str, str]:
    if kind == "Deployment" and api_version == "apps/v1":
        return "/apis/apps/v1", "deployments"
    if kind == "Service" and api_version == "v1":
        return "/api/v1", "services"
    if kind == "ConfigMap" and api_version == "v1":
        return "/api/v1", "configmaps"
    raise ValueError(f"unsupported manifest kind: {api_version}/{kind}")


async def prometheus_metric_names(client: httpx.AsyncClient, base_url: str) -> list[str]:
    response = await client.get(f"{base_url}{AgentConfig.PROMETHEUS_METRIC_NAMES_PATH}")
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data", [])
    if not isinstance(data, list):
        return []
    return sorted(str(item) for item in data)


async def prometheus_query(
    client: httpx.AsyncClient, base_url: str, metric_name: str
) -> JsonObject:
    response = await client.get(
        f"{base_url}{AgentConfig.PROMETHEUS_QUERY_PATH}", params={"query": metric_name}
    )
    response.raise_for_status()
    return {"query": metric_name, "response": response.json()}


async def loki_labels(client: httpx.AsyncClient, base_url: str) -> list[str]:
    response = await client.get(f"{base_url}{AgentConfig.LOKI_LABELS_PATH}")
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data", [])
    if not isinstance(data, list):
        return []
    return sorted(str(item) for item in data)


async def loki_query_range(client: httpx.AsyncClient, base_url: str, query: str) -> JsonObject:
    response = await client.get(
        f"{base_url}{AgentConfig.LOKI_QUERY_RANGE_PATH}",
        params={"query": query, "limit": AgentConfig.LOKI_QUERY_LIMIT},
    )
    response.raise_for_status()
    return response.json()
