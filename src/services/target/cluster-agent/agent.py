from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx
from fastapi import FastAPI
from settings import Settings
from uvicorn import Config, Server

from packages.config.constants import Target
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway
from packages.contracts.interfaces import CommandRecord, ManagementPlaneClient


class HttpManagementPlaneClient:
    def __init__(self, base_url: str, timeout_seconds: int = Settings.HTTP_TIMEOUT_SECONDS) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=timeout_seconds)
        self.headers = {Settings.AGENT_TOKEN_HEADER: env(Settings.AGENT_TOKEN_ENV, "")}

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
        self, cluster_id: str, agent_id: str, timeout_seconds: int
    ) -> CommandRecord | None:
        response = await self.client.get(
            f"{self.base_url}{gateway_routes.AGENT_COMMAND_POLL_PATH}",
            params={
                Gateway.CLUSTER_ID: cluster_id,
                Gateway.AGENT_ID: agent_id,
                "timeout": timeout_seconds,
            },
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json().get(Gateway.COMMAND)

    async def start_command(
        self, command_id: str, cluster_id: str, lease_id: str, agent_id: str
    ) -> None:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.agent_command_start_path(command_id)}",
            json={
                Gateway.CLUSTER_ID: cluster_id,
                Gateway.AGENT_ID: agent_id,
                Gateway.LEASE_ID: lease_id,
            },
            headers=self.headers,
        )
        response.raise_for_status()

    async def complete_command(
        self, command_id: str, lease_id: str, agent_id: str, result: JsonObject
    ) -> None:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.agent_command_result_path(command_id)}",
            json={**result, Gateway.AGENT_ID: agent_id, Gateway.LEASE_ID: lease_id},
            headers=self.headers,
        )
        response.raise_for_status()


class TargetClusterAgent:
    def __init__(
        self,
        client: ManagementPlaneClient | None = None,
        telemetry_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = env(
            Settings.MANAGEMENT_BASE_URL_ENV, Settings.DEFAULT_MANAGEMENT_BASE_URL
        ).rstrip("/")
        self.cluster_id = env(Settings.TARGET_CLUSTER_ID_ENV, Target.DEFAULT_CLUSTER_ID)
        self.agent_id = env(Settings.HOSTNAME_ENV, Settings.DEFAULT_AGENT_ID)
        self.interval = int(
            env(Settings.EVIDENCE_INTERVAL_ENV, Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS)
        )
        self.client = client
        self.telemetry_transport = telemetry_transport

    async def run(self) -> None:
        if self.client is not None:
            await self.run_with_client(self.client)
            return
        async with HttpManagementPlaneClient(self.base_url) as client:
            await self.run_with_client(client)

    async def run_with_client(self, client: ManagementPlaneClient) -> None:
        await self.register(client)
        await asyncio.gather(self.ship_evidence(client), self.poll_commands(client))

    async def register(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                await client.register_agent(
                    self.cluster_id,
                    self.agent_id,
                    Settings.AGENT_CAPABILITIES,
                )
                return
            except Exception as exc:
                print(f"agent waiting for management gateway: {exc}", flush=True)
                await asyncio.sleep(Settings.REGISTER_RETRY_DELAY_SECONDS)

    async def ship_evidence(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                status_code = await client.ship_evidence(await self.build_evidence_payload())
                print(f"evidence shipped status={status_code}", flush=True)
            except Exception as exc:
                print(f"evidence ship failed: {exc}", flush=True)
            await asyncio.sleep(self.interval)

    async def poll_commands(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                command = await client.poll_command(
                    self.cluster_id, self.agent_id, Settings.COMMAND_POLL_TIMEOUT_SECONDS
                )
                if command:
                    command_id = command[Gateway.COMMAND_ID]
                    lease_id = command[Gateway.LEASE_ID]
                    action = command[Gateway.ACTION]
                    print(f"agent executing command {command_id} action={action}", flush=True)
                    await client.start_command(command_id, self.cluster_id, lease_id, self.agent_id)
                    result = await self.execute_command(command)
                    await client.complete_command(
                        command_id,
                        lease_id,
                        self.agent_id,
                        result,
                    )
            except Exception as exc:
                print(f"command polling failed: {exc}", flush=True)
                await asyncio.sleep(Settings.COMMAND_RETRY_DELAY_SECONDS)

    async def execute_command(self, command: CommandRecord) -> JsonObject:
        # TODO(target): expand action allowlist with workspace/repo/cluster policy and approval proof.
        # TODO(target): capture stdout/stderr/status and report partial failure without raw secrets.
        if command.get(Gateway.ACTION) == Settings.APPLY_MANIFEST_ACTION:
            return await self.apply_manifest_command(command)
        if command.get(Gateway.ACTION) == Settings.ROLLOUT_RESTART_ACTION:
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

    def command_result(self, applied: bool, message: str) -> JsonObject:
        return {
            Gateway.STATUS: Settings.COMMAND_COMPLETED_STATUS,
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
        headers = {
            "authorization": f"Bearer {token}",
            "content-type": "application/strategic-merge-patch+json",
        }
        verify: str | bool = (
            Settings.SERVICE_ACCOUNT_CA_PATH
            if os.path.exists(Settings.SERVICE_ACCOUNT_CA_PATH)
            else True
        )
        async with httpx.AsyncClient(
            verify=verify, timeout=Settings.HTTP_TIMEOUT_SECONDS
        ) as client:
            response = await client.patch(url, json=patch, headers=headers)
            response.raise_for_status()
        return True, Settings.COMMAND_RESULT_MESSAGE

    async def build_evidence_payload(self) -> JsonObject:
        # TODO(telemetry): add OTel and Kubernetes API adapters with bounded, redacted snapshots.
        async with httpx.AsyncClient(
            transport=self.telemetry_transport,
            timeout=Settings.TELEMETRY_TIMEOUT_SECONDS,
        ) as telemetry_client:
            metrics, logs = await asyncio.gather(
                self.collect_metric_evidence(telemetry_client),
                self.collect_log_evidence(telemetry_client),
            )
        return {
            Gateway.CLUSTER_ID: self.cluster_id,
            "kubernetes": self.collect_kubernetes_evidence(),
            "metrics": metrics,
            "logs": logs,
            "traces": self.collect_trace_evidence(),
        }

    def collect_kubernetes_evidence(self) -> JsonObject:
        # TODO(target): read pods/events/nodes with least-privilege RBAC and redact object metadata.
        return {
            "pods": [
                {
                    "name": Settings.CRASHING_POD_NAME,
                    "status": Settings.CRASHING_POD_STATUS,
                    "restarts": Settings.CRASHING_POD_RESTARTS,
                }
            ],
            "events": [Settings.K8S_READINESS_FAILED_EVENT, Settings.K8S_BACKOFF_EVENT],
        }

    async def collect_metric_evidence(self, client: httpx.AsyncClient) -> JsonObject:
        # TODO(telemetry): replace all-metric sweep with workspace/cluster-scoped allowlists and windows.
        base_url = env(
            Settings.PROMETHEUS_BASE_URL_ENV, Settings.DEFAULT_PROMETHEUS_BASE_URL
        ).rstrip("/")
        try:
            metric_names = await prometheus_metric_names(client, base_url)
            queries = metric_names[: Settings.PROMETHEUS_MAX_METRICS] or list(
                Settings.PROMETHEUS_FALLBACK_QUERIES
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
            "source": Settings.FAKE_PROMETHEUS_SOURCE,
            "mode": "fallback_sample",
            "error": type(exc).__name__,
            "cpu": Settings.FAKE_NODE_CPU,
            "memory_mb": Settings.FAKE_NODE_MEMORY_MB,
            "http_5xx_rate": Settings.FAKE_HTTP_5XX_RATE,
        }

    async def collect_log_evidence(self, client: httpx.AsyncClient) -> list[JsonObject]:
        # TODO(telemetry): split Loki pulls by workspace/repo/cluster label selectors and redact secrets.
        base_url = env(Settings.LOKI_BASE_URL_ENV, Settings.DEFAULT_LOKI_BASE_URL).rstrip("/")
        try:
            labels = await loki_labels(client, base_url)
            query = env(Settings.LOKI_QUERY_ENV, Settings.DEFAULT_LOKI_QUERY)
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
                "source": Settings.FAKE_LOKI_SOURCE,
                "mode": "fallback_sample",
                "error": type(exc).__name__,
                "line": Settings.LOKI_ERROR_LINE,
            },
            {
                "source": Settings.FAKE_LOKI_SOURCE,
                "mode": "fallback_sample",
                "error": type(exc).__name__,
                "line": Settings.LOKI_WARNING_LINE,
            },
        ]

    def collect_trace_evidence(self) -> JsonObject:
        # TODO(telemetry): query OpenTelemetry backend and summarize spans by service/operation.
        return {"source": Settings.FAKE_OTEL_SOURCE, "slow_span": Settings.OTEL_SLOW_SPAN}


def create_fake_telemetry_app(kind: str) -> FastAPI:
    app = FastAPI(title=f"fake-{kind}")

    @app.get(gateway_routes.HEALTHZ_PATH)
    async def healthz() -> dict[str, str]:
        return {Gateway.STATUS: Gateway.STATUS_OK, Gateway.SERVICE: f"fake-{kind}"}

    @app.get(gateway_routes.FAKE_TELEMETRY_CATCH_ALL_PATH)
    async def catch_all(path: str) -> dict[str, Any]:
        if kind == "prometheus":
            if path == "api/v1/label/__name__/values":
                return {"status": "success", "data": ["up", "http_5xx_rate"]}
            return {
                "status": "success",
                "data": {
                    "resultType": "vector",
                    "result": [
                        {
                            "metric": {"pod": Settings.CHECKOUT_APP_NAME},
                            "value": [time.time(), Settings.PROMETHEUS_VECTOR_VALUE],
                        }
                    ],
                },
            }
        if kind == "loki":
            if path == "loki/api/v1/labels":
                return {"status": "success", "data": ["pod", "namespace"]}
            return {
                "status": "success",
                "data": {
                    "result": [
                        {
                            "stream": {"pod": Settings.CHECKOUT_APP_NAME},
                            "values": [
                                [str(int(time.time() * 1e9)), Settings.K8S_READINESS_FAILED_EVENT]
                            ],
                        }
                    ]
                },
            }
        return {"status": "ok", "telemetry": "fake-otel", "path": path}

    return app


async def run_fake_telemetry(kind: str) -> None:
    await Server(
        Config(
            create_fake_telemetry_app(kind),
            host=Settings.SERVICE_HOST,
            port=int(env(Settings.SERVICE_PORT_ENV, Settings.DEFAULT_SERVICE_PORT)),
            log_level=Settings.LOG_LEVEL,
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


def kubernetes_api_base_url() -> str | None:
    host = env(Settings.KUBERNETES_SERVICE_HOST_ENV, "")
    port = env(Settings.KUBERNETES_SERVICE_PORT_ENV, "443")
    return f"https://{host}:{port}" if host else None


def service_account_token() -> str | None:
    if not os.path.exists(Settings.SERVICE_ACCOUNT_TOKEN_PATH):
        return None
    with open(Settings.SERVICE_ACCOUNT_TOKEN_PATH, encoding="utf-8") as token_file:
        return token_file.read().strip()


async def prometheus_metric_names(client: httpx.AsyncClient, base_url: str) -> list[str]:
    response = await client.get(f"{base_url}{Settings.PROMETHEUS_METRIC_NAMES_PATH}")
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
        f"{base_url}{Settings.PROMETHEUS_QUERY_PATH}", params={"query": metric_name}
    )
    response.raise_for_status()
    return {"query": metric_name, "response": response.json()}


async def loki_labels(client: httpx.AsyncClient, base_url: str) -> list[str]:
    response = await client.get(f"{base_url}{Settings.LOKI_LABELS_PATH}")
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data", [])
    if not isinstance(data, list):
        return []
    return sorted(str(item) for item in data)


async def loki_query_range(client: httpx.AsyncClient, base_url: str, query: str) -> JsonObject:
    response = await client.get(
        f"{base_url}{Settings.LOKI_QUERY_RANGE_PATH}",
        params={"query": query, "limit": Settings.LOKI_QUERY_LIMIT},
    )
    response.raise_for_status()
    return response.json()
