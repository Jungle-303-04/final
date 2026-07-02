from __future__ import annotations

import asyncio
from collections.abc import Iterable

import httpx
from evidence import EvidenceCollector, EvidenceScheduler, EvidenceTaskStore
from providers import (
    LokiLogsProvider,
    PrometheusMetricsProvider,
    TelemetryProvider,
    TempoTracesProvider,
)
from settings import (
    AGENT_CAPABILITIES,
    COMMAND_COMPLETED_STATUS,
    COMMAND_EXECUTION_DELAY_SECONDS,
    COMMAND_FAILED_STATUS,
    COMMAND_POLL_TIMEOUT_SECONDS,
    COMMAND_RESULT_MESSAGE,
    COMMAND_RETRY_DELAY_SECONDS,
    DEFAULT_AGENT_ID,
    DEFAULT_EVIDENCE_FAILURE_POLICY,
    DEFAULT_EVIDENCE_PROVIDER_WORKERS,
    DEFAULT_EVIDENCE_QUEUE_DB_PATH,
    DEFAULT_MANAGEMENT_BASE_URL,
    DEFAULT_OTEL_SERVICE_NAME,
    DEFAULT_OTEL_TRACES_ENDPOINT,
    DEFAULT_TELEMETRY_QUERY_PATH,
    EVIDENCE_FAILURE_POLICY_ENV,
    EVIDENCE_INTERVAL_ENV,
    EVIDENCE_PROVIDER_WORKERS_ENV,
    EVIDENCE_QUEUE_DB_PATH_ENV,
    EVIDENCE_TASK_LEASE_SECONDS,
    HOSTNAME_ENV,
    HTTP_TIMEOUT_SECONDS,
    MANAGEMENT_BASE_URL_ENV,
    OTEL_SERVICE_NAME_ENV,
    OTEL_TRACES_ENDPOINT_ENV,
    QUERY_IMPORT_ACTION,
    QUERY_REGISTER_ACTION,
    QUERY_RUN_ACTION,
    REGISTER_RETRY_DELAY_SECONDS,
    TARGET_CLUSTER_ID_ENV,
    TELEMETRY_QUERY_PATH_ENV,
)
from span import configure_tracing, get_tracer
from telemetry_queries import (
    TelemetryQueryDefinition,
    TelemetryQueryRegistry,
    load_query_definitions,
)

from packages.config.constants import DEFAULT_EVIDENCE_INTERVAL_SECONDS, DEFAULT_TARGET_CLUSTER_ID
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.interfaces import CommandRecord, ManagementPlaneClient

TRACER = get_tracer("target-cluster-agent.agent")


def parse_provider_worker_counts(raw_counts: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for part in raw_counts.split(","):
        item = part.strip()
        if not item:
            continue
        provider_key, separator, raw_count = item.partition("=")
        if not separator:
            raise ValueError(f"invalid provider worker setting: {item}")
        counts[provider_key.strip()] = max(1, int(raw_count.strip()))
    return counts


class HttpManagementPlaneClient:
    # Configure one reusable async HTTP client for Management Plane requests.
    def __init__(self, base_url: str, timeout_seconds: int = HTTP_TIMEOUT_SECONDS) -> None:
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=timeout_seconds)

    # Allow this client to be used with "async with".
    async def __aenter__(self) -> HttpManagementPlaneClient:
        return self

    # Close the underlying HTTP client when the "async with" block exits.
    async def __aexit__(self, *_exc: object) -> None:
        await self.close()

    # Release network resources held by the async HTTP client.
    async def close(self) -> None:
        await self.client.aclose()

    # Tell the Management Plane that this target-cluster agent is online.
    async def register_agent(self, cluster_id: str, agent_id: str, capabilities: list[str]) -> None:
        with TRACER.start_as_current_span("management.register_agent") as span:
            span.attr("cluster.id", cluster_id)
            span.attr("agent.id", agent_id)
            response = await self.client.post(
                f"{self.base_url}/agent/connect",
                json={
                    "cluster_id": cluster_id,
                    "agent_id": agent_id,
                    "capabilities": capabilities,
                },
            )
            span.attr("http.status_code", response.status_code)

    # Send one evidence payload to the Management Plane.
    async def ship_evidence(self, evidence: JsonObject) -> int:
        with TRACER.start_as_current_span("management.ship_evidence") as span:
            response = await self.client.post(f"{self.base_url}/agent/evidence", json=evidence)
            span.attr("http.status_code", response.status_code)
            return response.status_code

    # Ask the Management Plane for one pending command.
    async def poll_command(self, cluster_id: str, timeout_seconds: int) -> CommandRecord | None:
        with TRACER.start_as_current_span("management.poll_command") as span:
            span.attr("cluster.id", cluster_id)
            response = await self.client.get(
                f"{self.base_url}/agent/commands/poll",
                params={"cluster_id": cluster_id, "timeout": timeout_seconds},
            )
            span.attr("http.status_code", response.status_code)
            response.raise_for_status()
            command = response.json().get("command")
            span.flag("command.found", command is not None)
            return command

    # Report one command execution result back to the Management Plane.
    async def complete_command(self, command_id: str, result: JsonObject) -> None:
        with TRACER.start_as_current_span("management.complete_command") as span:
            span.attr("command.id", command_id)
            response = await self.client.post(
                f"{self.base_url}/agent/commands/{command_id}/result",
                json=result,
            )
            span.attr("http.status_code", response.status_code)


class TargetClusterAgent:
    # Read runtime settings and optionally accept a test/mock Management Plane client.
    def __init__(
        self,
        client: ManagementPlaneClient | None = None,
        providers: Iterable[TelemetryProvider] | None = None,
    ) -> None:
        self.base_url = env(MANAGEMENT_BASE_URL_ENV, DEFAULT_MANAGEMENT_BASE_URL).rstrip("/")
        self.otel_service_name = env(OTEL_SERVICE_NAME_ENV, DEFAULT_OTEL_SERVICE_NAME)
        self.otel_traces_endpoint = env(
            OTEL_TRACES_ENDPOINT_ENV,
            DEFAULT_OTEL_TRACES_ENDPOINT,
        )
        self.tracer = configure_tracing(self.otel_service_name, self.otel_traces_endpoint)
        self.cluster_id = env(TARGET_CLUSTER_ID_ENV, DEFAULT_TARGET_CLUSTER_ID)
        self.interval = int(env(EVIDENCE_INTERVAL_ENV, DEFAULT_EVIDENCE_INTERVAL_SECONDS))
        self.evidence_provider_worker_counts = parse_provider_worker_counts(
            env(EVIDENCE_PROVIDER_WORKERS_ENV, DEFAULT_EVIDENCE_PROVIDER_WORKERS)
        )
        self.evidence_failure_policy = env(
            EVIDENCE_FAILURE_POLICY_ENV,
            DEFAULT_EVIDENCE_FAILURE_POLICY,
        )
        self.evidence_queue_db_path = env(
            EVIDENCE_QUEUE_DB_PATH_ENV,
            DEFAULT_EVIDENCE_QUEUE_DB_PATH,
        )
        self.telemetry_query_path = env(
            TELEMETRY_QUERY_PATH_ENV,
            DEFAULT_TELEMETRY_QUERY_PATH,
        )
        self.client = client
        if providers is None:
            providers = (
                PrometheusMetricsProvider.from_config(env),
                LokiLogsProvider.from_config(env),
                TempoTracesProvider.from_config(env),
            )
        self.query_registry = TelemetryQueryRegistry(
            load_query_definitions(self.telemetry_query_path)
        )
        self.evidence_collector = EvidenceCollector(providers, self.query_registry)
        self.evidence_scheduler = EvidenceScheduler(
            cluster_id=self.cluster_id,
            collector=self.evidence_collector,
            store=EvidenceTaskStore(self.evidence_queue_db_path),
            provider_keys=tuple(self.evidence_collector.providers),
            provider_worker_counts=self.evidence_provider_worker_counts,
            failure_policy=self.evidence_failure_policy,
            interval_seconds=self.interval,
            lease_seconds=EVIDENCE_TASK_LEASE_SECONDS,
        )

    # Start the agent with either the injected client or a real HTTP client.
    async def run(self) -> None:
        if self.client is not None:
            await self.run_with_client(self.client)
            return
        async with HttpManagementPlaneClient(self.base_url) as client:
            await self.run_with_client(client)

    # Register once, then run evidence shipping and command polling together.
    async def run_with_client(self, client: ManagementPlaneClient) -> None:
        await self.register(client)
        await asyncio.gather(self.evidence_scheduler.run(client), self.poll_commands(client))

    # Retry registration until the Management Plane accepts this agent.
    async def register(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                await client.register_agent(
                    self.cluster_id,
                    env(HOSTNAME_ENV, DEFAULT_AGENT_ID),
                    AGENT_CAPABILITIES,
                )
                return
            except Exception as exc:
                print(f"agent waiting for management gateway: {exc}", flush=True)
                await asyncio.sleep(REGISTER_RETRY_DELAY_SECONDS)

    # Keep checking for commands and report completed command results.
    async def poll_commands(self, client: ManagementPlaneClient) -> None:
        while True:
            try:
                with self.tracer.start_as_current_span("target_agent.poll_commands") as span:
                    span.attr("cluster.id", self.cluster_id)
                    command = await client.poll_command(
                        self.cluster_id,
                        COMMAND_POLL_TIMEOUT_SECONDS,
                    )
                    span.flag("command.found", command is not None)
                    if command:
                        command_id = command["command_id"]
                        action = command["action"]
                        span.attr("command.id", command_id)
                        span.attr("command.action", action)
                        print(
                            f"agent executing command {command_id} action={action}",
                            flush=True,
                        )
                        result = await self.execute_command(command)
                        await client.complete_command(command_id, result)
            except Exception as exc:
                print(f"command polling failed: {exc}", flush=True)
                await asyncio.sleep(COMMAND_RETRY_DELAY_SECONDS)

    async def execute_command(self, command: CommandRecord) -> JsonObject:
        action = command["action"]
        payload = self.command_payload(command)
        try:
            if action == QUERY_RUN_ACTION:
                return await self.run_query_command(payload)
            if action == QUERY_REGISTER_ACTION:
                return await self.register_query_command(payload)
            if action == QUERY_IMPORT_ACTION:
                return await self.import_query_path_command(payload)
            return await self.apply_default_command()
        except Exception as exc:
            return {
                "status": COMMAND_FAILED_STATUS,
                "cluster_id": self.cluster_id,
                "applied": False,
                "message": str(exc),
            }

    async def run_query_command(self, payload: JsonObject) -> JsonObject:
        definition = self.query_definition_from_payload(payload)
        result = await self.evidence_collector.run_query(definition)
        if payload.get("register") is True:
            self.evidence_collector.register_query(definition)
        return {
            "status": COMMAND_COMPLETED_STATUS,
            "cluster_id": self.cluster_id,
            "applied": False,
            "message": "telemetry query executed",
            "query": definition.__dict__,
            "result": result,
        }

    async def register_query_command(self, payload: JsonObject) -> JsonObject:
        definition = self.query_definition_from_payload(payload)
        self.evidence_collector.register_query(definition)
        return {
            "status": COMMAND_COMPLETED_STATUS,
            "cluster_id": self.cluster_id,
            "applied": True,
            "message": "telemetry query registered",
            "query": definition.__dict__,
        }

    async def import_query_path_command(self, payload: JsonObject) -> JsonObject:
        query_path = payload.get("path") or payload.get("query_path") or payload.get("query_file")
        if not isinstance(query_path, str) or not query_path.strip():
            raise ValueError("telemetry query import requires a query path")
        definitions = self.evidence_collector.import_queries(query_path)
        return {
            "status": COMMAND_COMPLETED_STATUS,
            "cluster_id": self.cluster_id,
            "applied": True,
            "message": "telemetry query file imported",
            "imported_count": len(definitions),
            "queries": [definition.__dict__ for definition in definitions],
        }

    async def apply_default_command(self) -> JsonObject:
        await asyncio.sleep(COMMAND_EXECUTION_DELAY_SECONDS)
        return {
            "status": COMMAND_COMPLETED_STATUS,
            "cluster_id": self.cluster_id,
            "applied": True,
            "message": COMMAND_RESULT_MESSAGE,
        }

    def command_payload(self, command: CommandRecord) -> JsonObject:
        payload = command.get("payload") or {}
        if not isinstance(payload, dict):
            return {}
        nested_payload = payload.get("payload")
        return nested_payload if isinstance(nested_payload, dict) else payload

    def query_definition_from_payload(self, payload: JsonObject) -> TelemetryQueryDefinition:
        query = payload.get("query", payload)
        if not isinstance(query, dict):
            raise ValueError("telemetry query command requires a query object")
        if "query" not in query:
            source = query.get("source")
            name = query.get("name")
            if isinstance(source, str) and isinstance(name, str):
                return self.query_registry.get(source, name)
        return TelemetryQueryDefinition.from_mapping(query)
