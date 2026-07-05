from __future__ import annotations

import asyncio
import time
from contextlib import suppress
from dataclasses import dataclass

import httpx
from commands import (
    AgentCommandRegistry,
    CommandContext,
    CommandResultOutbox,
    KubernetesApiClient,
    KubernetesPatchPayload,
    KubernetesScalePayload,
    command,
)
from control import AgentControlStore, AgentPolicySync, DesiredStateReconciler
from evidence import EvidenceCollector, EvidenceJobScheduler
from kubernetes_api import (
    kubernetes_api_base_url,
    kubernetes_client,
    kubernetes_headers,
    service_account_token,
)
from live_summary import LiveSummaryPublisher
from node_collector_manager import NodeCollectorManager
from providers import (
    KubernetesSnapshotProvider,
    LokiLogsProvider,
    PrometheusMetricsProvider,
    TelemetryProvider,
    TempoTracesProvider,
)
from queries import (
    TelemetryQueryCommandPayload,
    TelemetryQueryDefinition,
    TelemetryQueryRegistry,
)
from span import configure_tracing
from telemetry_registry import telemetry

import config as agent_config
from config import (
    AGENT_CONTROL_DB_PATH_ENV,
    BOOTSTRAP_MODE_ENV,
    CLUSTER_ROLE_ENV,
    COMMAND_OUTBOX_DB_PATH_ENV,
    COMMAND_OUTBOX_FLUSH_INTERVAL_SECONDS,
    COMMAND_OUTBOX_MAX_ATTEMPTS,
    DEFAULT_AGENT_CONTROL_DB_PATH,
    DEFAULT_BOOTSTRAP_MODE,
    DEFAULT_CLUSTER_ROLE,
    DEFAULT_COMMAND_OUTBOX_DB_PATH,
    DEFAULT_EVIDENCE_FAILURE_POLICY,
    DEFAULT_EVIDENCE_PROVIDER_MAX_WORKERS,
    DEFAULT_EVIDENCE_PROVIDER_WORKERS,
    DEFAULT_OTEL_SERVICE_NAME,
    DEFAULT_OTEL_TRACES_ENDPOINT,
    DEFAULT_POLICY_SYNC_INTERVAL_SECONDS,
    DEFAULT_RECONCILE_INTERVAL_SECONDS,
    EVIDENCE_FAILURE_POLICY_ENV,
    EVIDENCE_PROVIDER_MAX_WORKERS_ENV,
    EVIDENCE_PROVIDER_WORKERS_ENV,
    KUBERNETES_CONFIGMAP_PATCH_ACTION,
    KUBERNETES_DEPLOYMENT_PATCH_ACTION,
    KUBERNETES_DEPLOYMENT_SCALE_ACTION,
    OTEL_SERVICE_NAME_ENV,
    OTEL_TRACES_ENDPOINT_ENV,
    POLICY_SYNC_INTERVAL_ENV,
    QUERY_RUN_ACTION,
    RECONCILE_INTERVAL_ENV,
)
from config import (
    KUBERNETES_ROLLOUT_POLL_INTERVAL_SECONDS as CONFIG_KUBERNETES_ROLLOUT_POLL_INTERVAL_SECONDS,
)
from config import (
    KUBERNETES_ROLLOUT_TIMEOUT_SECONDS as CONFIG_KUBERNETES_ROLLOUT_TIMEOUT_SECONDS,
)
from packages.config.constants import Command, CommandStatus, Sandbox, Target
from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway
from packages.contracts.gateway.requests import (
    DEFAULT_QUEUE_AGE_TARGET_SECONDS,
    AgentPolicy,
    BootstrapPolicy,
    DesiredStatePolicy,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
)
from packages.contracts.gitops import supported_kubernetes_resource
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.contracts.interfaces import CommandRecord, ManagementPlaneClient

LOGGER = get_logger(__name__)
COMMAND_OUTPUT_LIMIT = 2000
SENSITIVE_OUTPUT_MARKERS = (
    "authorization",
    "bearer ",
    "kubeconfig",
    "password",
    "secret",
    "token",
)


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

    DEFAULT_MANAGEMENT_BASE_URL = ""
    MANAGEMENT_BASE_URL_ENV = "MANAGEMENT_BASE_URL"
    TARGET_CLUSTER_ID_ENV = "TARGET_CLUSTER_ID"
    WORKSPACE_ID_ENV = "WORKSPACE_ID"
    EVIDENCE_INTERVAL_ENV = "EVIDENCE_INTERVAL_SECONDS"
    AGENT_TOKEN_ENV = "AGENT_TOKEN"
    AGENT_TOKEN_HEADER = "x-agent-token"
    # 타이밍 튜닝값은 config 모듈이 단일 원천(env 오버라이드 가능) — 중복 리터럴 금지
    HTTP_TIMEOUT_SECONDS = agent_config.HTTP_TIMEOUT_SECONDS
    COMMAND_POLL_TIMEOUT_SECONDS = agent_config.COMMAND_POLL_TIMEOUT_SECONDS
    COMMAND_HEARTBEAT_INTERVAL_SECONDS = agent_config.COMMAND_HEARTBEAT_INTERVAL_SECONDS
    COMMAND_EXECUTION_DELAY_SECONDS = agent_config.COMMAND_EXECUTION_DELAY_SECONDS
    REGISTER_RETRY_DELAY_SECONDS = agent_config.REGISTER_RETRY_DELAY_SECONDS
    COMMAND_RETRY_DELAY_SECONDS = agent_config.COMMAND_RETRY_DELAY_SECONDS

    HOSTNAME_ENV = "HOSTNAME"
    DEFAULT_AGENT_ID = "target-agent"
    AGENT_CAPABILITIES = ["collector", "command_receiver"]
    EVIDENCE_SOURCE_ID = "cluster-snapshot"
    NODE_COLLECTOR_RECONCILE_INTERVAL_SECONDS = (
        agent_config.NODE_COLLECTOR_RECONCILE_INTERVAL_SECONDS
    )

    COMMAND_COMPLETED_STATUS = CommandStatus.COMPLETED
    COMMAND_FAILED_STATUS = CommandStatus.FAILED
    APPLY_MANIFEST_ACTION = Command.APPLY_MANIFEST_ACTION
    ROLLOUT_RESTART_ACTION = Command.DEFAULT_ACTION
    COMMAND_RESULT_MESSAGE = "Kubernetes action processed in sandbox namespace"
    MANIFEST_CREATED_MESSAGE = "Kubernetes manifest created in sandbox namespace"
    MANIFEST_PATCHED_MESSAGE = "Kubernetes manifest patched in sandbox namespace"
    DEPLOYMENT_ROLLOUT_COMPLETED_MESSAGE = "Kubernetes deployment rollout completed"
    WRITE_NAMESPACE_DENIED_MESSAGE = "only sandbox namespace writes are allowed"
    MISSING_APPROVAL_EVIDENCE_MESSAGE = (
        "write command requires approval_ref and policy_decision_ref"
    )
    KUBERNETES_ROLLOUT_TIMEOUT_SECONDS = CONFIG_KUBERNETES_ROLLOUT_TIMEOUT_SECONDS
    KUBERNETES_ROLLOUT_POLL_INTERVAL_SECONDS = CONFIG_KUBERNETES_ROLLOUT_POLL_INTERVAL_SECONDS


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

    async def schedule_evidence_jobs(
        self,
        source_id: str,
        window_start: str,
        provider_keys: list[str],
    ) -> JsonObject:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.AGENT_EVIDENCE_JOB_SCHEDULE_PATH}",
            json={
                Gateway.SOURCE_ID: source_id,
                Gateway.WINDOW_START: window_start,
                Gateway.PROVIDER_KEYS: provider_keys,
            },
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json()

    async def poll_evidence_job(
        self,
        provider_key: str,
        agent_id: str,
        timeout_seconds: int,
    ) -> JsonObject | None:
        response = await self.client.get(
            f"{self.base_url}{gateway_routes.AGENT_EVIDENCE_JOB_POLL_PATH}",
            params={
                Gateway.PROVIDER_KEY: provider_key,
                Gateway.AGENT_ID: agent_id,
                "timeout": timeout_seconds,
            },
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json().get(Gateway.JOB)

    async def complete_evidence_job(
        self,
        job_id: str,
        agent_id: str,
        lease_id: str,
        status: str,
        result: JsonObject,
        error: str,
    ) -> JsonObject:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.agent_evidence_job_result_path(job_id)}",
            json={
                Gateway.AGENT_ID: agent_id,
                Gateway.LEASE_ID: lease_id,
                Gateway.STATUS: status,
                Gateway.RESULT: result,
                Gateway.ERROR: error,
            },
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json()

    async def record_inventory_snapshot(self, payload: JsonObject) -> JsonObject:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.AGENT_INVENTORY_SNAPSHOTS_PATH}",
            json=payload,
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json()

    async def fetch_policy(self, cluster_id: str, generation: int) -> JsonObject | None:
        response = await self.client.get(
            f"{self.base_url}{gateway_routes.AGENT_POLICY_PATH}",
            params={Gateway.CLUSTER_ID: cluster_id, "generation": generation},
            headers=self.headers,
        )
        response.raise_for_status()
        policy = response.json().get("policy")
        return policy if isinstance(policy, dict) else None

    async def report_policy_status(self, status: JsonObject) -> None:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.AGENT_POLICY_STATUS_PATH}",
            json=status,
            headers=self.headers,
        )
        response.raise_for_status()

    async def report_reconcile_status(self, status: JsonObject) -> None:
        response = await self.client.post(
            f"{self.base_url}{gateway_routes.AGENT_RECONCILE_STATUS_PATH}",
            json=status,
            headers=self.headers,
        )
        response.raise_for_status()


class TargetClusterAgent:
    def __init__(
        self,
        client: ManagementPlaneClient | None = None,
        providers: tuple[TelemetryProvider, ...] | None = None,
        telemetry_transport: httpx.AsyncBaseTransport | None = None,
        kubernetes_transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = env(
            AgentConfig.MANAGEMENT_BASE_URL_ENV, AgentConfig.DEFAULT_MANAGEMENT_BASE_URL
        ).rstrip("/")
        if not self.base_url:
            raise RuntimeError(f"{AgentConfig.MANAGEMENT_BASE_URL_ENV} is required")
        self.cluster_id = env(AgentConfig.TARGET_CLUSTER_ID_ENV, Target.DEFAULT_CLUSTER_ID)
        self.workspace_id = env(AgentConfig.WORKSPACE_ID_ENV, DEFAULT_WORKSPACE_ID)
        self.agent_id = env(AgentConfig.HOSTNAME_ENV, AgentConfig.DEFAULT_AGENT_ID)
        self.interval = int(
            env(AgentConfig.EVIDENCE_INTERVAL_ENV, Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS)
        )
        self.cluster_role = env(CLUSTER_ROLE_ENV, DEFAULT_CLUSTER_ROLE)
        self.bootstrap_mode = env(BOOTSTRAP_MODE_ENV, DEFAULT_BOOTSTRAP_MODE)
        self.otel_service_name = env(OTEL_SERVICE_NAME_ENV, DEFAULT_OTEL_SERVICE_NAME)
        self.otel_traces_endpoint = env(OTEL_TRACES_ENDPOINT_ENV, DEFAULT_OTEL_TRACES_ENDPOINT)
        self.tracer = configure_tracing(self.otel_service_name, self.otel_traces_endpoint)
        self.evidence_provider_worker_counts = parse_provider_worker_counts(
            env(EVIDENCE_PROVIDER_WORKERS_ENV, DEFAULT_EVIDENCE_PROVIDER_WORKERS)
        )
        self.evidence_provider_max_worker_counts = parse_provider_worker_counts(
            env(EVIDENCE_PROVIDER_MAX_WORKERS_ENV, DEFAULT_EVIDENCE_PROVIDER_MAX_WORKERS)
        )
        self.evidence_failure_policy = env(
            EVIDENCE_FAILURE_POLICY_ENV,
            DEFAULT_EVIDENCE_FAILURE_POLICY,
        )
        self.agent_control_db_path = env(
            AGENT_CONTROL_DB_PATH_ENV,
            DEFAULT_AGENT_CONTROL_DB_PATH,
        )
        self.command_outbox_db_path = env(
            COMMAND_OUTBOX_DB_PATH_ENV,
            DEFAULT_COMMAND_OUTBOX_DB_PATH,
        )
        self.policy_sync_interval_seconds = int(
            env(POLICY_SYNC_INTERVAL_ENV, DEFAULT_POLICY_SYNC_INTERVAL_SECONDS)
        )
        self.reconcile_interval_seconds = int(
            env(RECONCILE_INTERVAL_ENV, DEFAULT_RECONCILE_INTERVAL_SECONDS)
        )
        self.client = client
        self.telemetry_transport = telemetry_transport
        self.kubernetes_transport = kubernetes_transport
        self.node_collector = NodeCollectorManager.from_env(kubernetes_transport)
        # realtime live summary — outbound WS 1개(browser fan-out 은 realtime-gateway 책임)
        self.live_summary = LiveSummaryPublisher.from_env(
            cluster_id=self.cluster_id,
            management_base_url=self.base_url,
            kubernetes_transport=kubernetes_transport,
        )
        if providers is None:
            providers = (
                KubernetesSnapshotProvider(
                    cluster_id=self.cluster_id,
                    transport=kubernetes_transport,
                ),
                PrometheusMetricsProvider.from_config(env),
                LokiLogsProvider.from_config(env),
                TempoTracesProvider.from_config(env),
            )
        self.query_registry = TelemetryQueryRegistry()
        self.evidence_collector = EvidenceCollector(providers, self.query_registry)
        self.control_store = AgentControlStore(self.agent_control_db_path)
        self.command_outbox = CommandResultOutbox(self.command_outbox_db_path)
        self.evidence_scheduler = EvidenceJobScheduler(
            cluster_id=self.cluster_id,
            workspace_id=self.workspace_id,
            agent_id=self.agent_id,
            source_id=AgentConfig.EVIDENCE_SOURCE_ID,
            collector=self.evidence_collector,
            provider_keys=tuple(self.evidence_collector.providers),
            provider_worker_counts=self.evidence_provider_worker_counts,
            interval_seconds=self.interval,
        )
        self.default_policy = self.build_default_policy()
        self.policy_sync = AgentPolicySync(
            cluster_id=self.cluster_id,
            store=self.control_store,
            default_policy=self.default_policy,
            apply_policy=self.apply_policy,
            interval_seconds=self.policy_sync_interval_seconds,
        )
        self.reconciler = DesiredStateReconciler(
            cluster_id=self.cluster_id,
            cluster_role=self.cluster_role,
            store=self.control_store,
            interval_seconds=self.reconcile_interval_seconds,
        )
        self.kubernetes = KubernetesApiClient()
        self.command_registry = AgentCommandRegistry.from_instance(
            self,
            cluster_id=self.cluster_id,
            cluster_role=self.cluster_role,
            kubernetes=self.kubernetes,
            default_handler=self.apply_default_command,
        )

    def close(self) -> None:
        for store in (self.control_store, self.command_outbox):
            with suppress(Exception):
                store.close()

    def build_default_policy(self) -> AgentPolicy:
        providers = {
            provider_key: EvidenceProviderPolicy(
                enabled=True,
                interval_seconds=self.interval,
                min_workers=self.evidence_provider_worker_counts.get(provider_key, 1),
                max_workers=self.evidence_provider_max_worker_counts.get(provider_key, 3),
                queue_age_target_seconds=DEFAULT_QUEUE_AGE_TARGET_SECONDS,
            )
            for provider_key in self.evidence_collector.providers
        }
        return AgentPolicy(
            cluster_id=self.cluster_id,
            cluster_role=self.cluster_role,
            evidence=EvidenceRuntimePolicy(
                failure_policy=self.evidence_failure_policy,
                providers=providers,
            ),
            bootstrap=BootstrapPolicy(mode=self.bootstrap_mode),
            desired_state=DesiredStatePolicy(),
        )

    def apply_policy(self, policy: AgentPolicy) -> JsonObject:
        if policy.cluster_id != self.cluster_id:
            raise ValueError(f"policy cluster_id does not match agent: {policy.cluster_id}")
        if policy.cluster_role != self.cluster_role:
            raise ValueError(f"policy cluster_role does not match agent: {policy.cluster_role}")

        base_policy = self.control_store.load_policy() or self.default_policy
        enabled_provider_keys: set[str] = set()
        provider_intervals: dict[str, int] = {}
        min_worker_counts: dict[str, int] = {}
        registered_queries: dict[str, list[str]] = {}
        for provider_key in self.evidence_collector.providers:
            provider_policy = policy.evidence.providers.get(
                provider_key,
                base_policy.evidence.providers.get(
                    provider_key,
                    self.default_policy.evidence.providers[provider_key],
                ),
            )
            provider_intervals[provider_key] = provider_policy.interval_seconds
            min_worker_counts[provider_key] = provider_policy.min_workers
            registered_queries[provider_key] = self.register_policy_queries(
                provider_key,
                provider_policy.queries,
            )
            if provider_policy.enabled:
                enabled_provider_keys.add(provider_key)

        self.evidence_scheduler.configure_schedule(
            provider_intervals=provider_intervals,
            enabled_provider_keys=enabled_provider_keys,
        )
        self.evidence_scheduler.set_worker_counts(min_worker_counts)
        return {
            "generation": policy.generation,
            "cluster_role": policy.cluster_role,
            "bootstrap_mode": policy.bootstrap.mode,
            "enabled_providers": sorted(enabled_provider_keys),
            "evidence_worker_counts": min_worker_counts,
            "registered_queries": registered_queries,
        }

    def register_policy_queries(
        self,
        provider_key: str,
        queries: list[JsonObject],
    ) -> list[str]:
        source = telemetry.source_for_provider(provider_key)
        if source is None:
            return []
        definitions: list[TelemetryQueryDefinition] = []
        for query in queries:
            payload = dict(query)
            payload.setdefault("source", source)
            definition = TelemetryQueryDefinition.from_mapping(payload)
            definitions.append(definition)
        self.evidence_collector.replace_queries(source, tuple(definitions))
        return [definition.name for definition in definitions]

    async def run(self) -> None:
        try:
            if self.client is not None:
                await self.run_with_client(self.client)
                return
            async with HttpManagementPlaneClient(self.base_url) as client:
                await self.run_with_client(client)
        finally:
            self.close()

    async def run_with_client(self, client: ManagementPlaneClient) -> None:
        self.policy_sync.apply_stored_or_default()
        await self.register(client)
        await self.reconcile_node_collector_once()
        await asyncio.gather(
            self.policy_sync.run(client),
            self.reconcile_node_collector_forever(),
            self.evidence_scheduler.run(client),
            self.reconciler.run(client),
            self.poll_commands(client),
            self.flush_command_results_forever(client),
            self.live_summary.run(),
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
                    self.command_outbox.enqueue_result(
                        command_id=command_id,
                        workspace_id=str(workspace_id),
                        lease_id=lease_id,
                        agent_id=self.agent_id,
                        result=result,
                    )
                    await self.flush_command_results_once(client)
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

    async def flush_command_results_forever(self, client: ManagementPlaneClient) -> None:
        while True:
            await self.flush_command_results_once(client)
            await asyncio.sleep(COMMAND_OUTBOX_FLUSH_INTERVAL_SECONDS)

    async def flush_command_results_once(self, client: ManagementPlaneClient) -> bool:
        record = self.command_outbox.next_result()
        if record is None:
            return False
        try:
            await client.complete_command(
                record.command_id,
                record.workspace_id,
                record.lease_id,
                record.agent_id,
                record.result,
            )
            self.command_outbox.mark_sent(record.command_id)
            return True
        except Exception as exc:
            abandoned = self.command_outbox.record_failure(
                record.command_id,
                str(exc),
                COMMAND_OUTBOX_MAX_ATTEMPTS,
            )
            LOGGER.warning(
                "command_result_flush_failed",
                extra={
                    CONTEXT_KEY: {
                        Gateway.CLUSTER_ID: self.cluster_id,
                        Gateway.AGENT_ID: self.agent_id,
                        Gateway.COMMAND_ID: record.command_id,
                        "attempt_count": record.attempt_count + 1,
                        "abandoned": abandoned,
                        "exception_type": type(exc).__name__,
                    }
                },
            )
            return False

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
        action = str(command.get(Gateway.ACTION, ""))
        payload = self.command_payload(command)
        if self.write_action_requires_approval(action) and not self.has_approval_evidence(command):
            return self.command_result(False, AgentConfig.MISSING_APPROVAL_EVIDENCE_MESSAGE)
        try:
            return await self.command_registry.execute(
                action,
                payload,
                metadata={
                    Gateway.COMMAND_ID: command.get(Gateway.COMMAND_ID, ""),
                    Gateway.APPROVAL_REF: self.command_metadata_value(
                        command, Gateway.APPROVAL_REF
                    ),
                    Gateway.POLICY_DECISION_REF: self.command_metadata_value(
                        command, Gateway.POLICY_DECISION_REF
                    ),
                },
            )
        except Exception as exc:
            return self.command_result(False, str(exc))

    def write_action_requires_approval(self, action: str) -> bool:
        return action in {
            AgentConfig.APPLY_MANIFEST_ACTION,
            AgentConfig.ROLLOUT_RESTART_ACTION,
            KUBERNETES_DEPLOYMENT_SCALE_ACTION,
        }

    def command_metadata_value(self, command: CommandRecord, field: str) -> str:
        value = command.get(field)
        if isinstance(value, str) and value:
            return value
        payload = command.get(Gateway.PAYLOAD)
        if isinstance(payload, dict):
            nested = payload.get(field)
            if isinstance(nested, str) and nested:
                return nested
        return ""

    def has_approval_evidence(self, command: CommandRecord) -> bool:
        return bool(
            self.command_metadata_value(command, Gateway.APPROVAL_REF)
            and self.command_metadata_value(command, Gateway.POLICY_DECISION_REF)
        )

    @command.handler(QUERY_RUN_ACTION, payload_model=TelemetryQueryCommandPayload)
    async def run_query_command(
        self,
        ctx: CommandContext[TelemetryQueryCommandPayload],
    ) -> JsonObject:
        definition = self.query_definition_from_payload(ctx.payload.definition_payload())
        result = await self.evidence_collector.run_query(definition)
        return ctx.ok(
            "telemetry query executed",
            query=definition.__dict__,
            result=result,
        )

    @command.k8s(
        KUBERNETES_DEPLOYMENT_PATCH_ACTION,
        api_group="apps",
        version="v1",
        resource="deployments",
        verb="patch",
        payload_model=KubernetesPatchPayload,
    )
    async def patch_deployment_command(
        self,
        ctx: CommandContext[KubernetesPatchPayload],
    ) -> JsonObject:
        spec = ctx.kubernetes_spec
        result = await ctx.kubernetes.patch_namespaced_resource(
            api_group=spec.api_group,
            version=spec.version,
            namespace=ctx.payload.namespace,
            resource=spec.resource,
            name=ctx.payload.name,
            body=ctx.payload.patch_body(),
        )
        return ctx.ok("kubernetes deployment patched", applied=True, result=result)

    @command.k8s(
        KUBERNETES_DEPLOYMENT_SCALE_ACTION,
        api_group="apps",
        version="v1",
        resource="deployments",
        verb="patch",
        payload_model=KubernetesScalePayload,
    )
    async def scale_deployment_command(
        self,
        ctx: CommandContext[KubernetesScalePayload],
    ) -> JsonObject:
        spec = ctx.kubernetes_spec
        result = await ctx.kubernetes.patch_namespaced_resource(
            api_group=spec.api_group,
            version=spec.version,
            namespace=ctx.payload.namespace,
            resource=spec.resource,
            name=ctx.payload.name,
            body=ctx.payload.patch_body(),
            subresource="scale",
        )
        return ctx.ok(
            "kubernetes deployment scaled",
            applied=True,
            replicas=ctx.payload.replicas,
            result=result,
        )

    @command.k8s(
        KUBERNETES_CONFIGMAP_PATCH_ACTION,
        api_group="core",
        version="v1",
        resource="configmaps",
        verb="patch",
        payload_model=KubernetesPatchPayload,
    )
    async def patch_configmap_command(
        self,
        ctx: CommandContext[KubernetesPatchPayload],
    ) -> JsonObject:
        spec = ctx.kubernetes_spec
        result = await ctx.kubernetes.patch_namespaced_resource(
            api_group=spec.api_group,
            version=spec.version,
            namespace=ctx.payload.namespace,
            resource=spec.resource,
            name=ctx.payload.name,
            body=ctx.payload.patch_body(),
        )
        return ctx.ok("kubernetes configmap patched", applied=True, result=result)

    async def apply_default_command(self, ctx: CommandContext[JsonObject]) -> JsonObject:
        return ctx.fail(f"unsupported action: {ctx.action}")

    def command_payload(self, command: CommandRecord) -> JsonObject:
        payload = command.get(Gateway.PAYLOAD) or {}
        if not isinstance(payload, dict):
            return {}
        nested_payload = payload.get(Gateway.PAYLOAD)
        return nested_payload if isinstance(nested_payload, dict) else payload

    def query_definition_from_payload(self, payload: JsonObject) -> TelemetryQueryDefinition:
        query_value = payload.get("query")
        query = query_value if isinstance(query_value, dict) else payload
        if not isinstance(query, dict):
            raise ValueError("telemetry query command requires a query object")
        if not isinstance(query.get("query"), str):
            source = query.get("source")
            name = query.get("name")
            if isinstance(source, str) and isinstance(name, str):
                return self.query_registry.get(source, name)
        return TelemetryQueryDefinition.from_mapping(query)

    @command.handler(AgentConfig.APPLY_MANIFEST_ACTION)
    async def apply_manifest_command(self, ctx: CommandContext[JsonObject]) -> JsonObject:
        diff = ctx.raw_payload.get("diff", {}) if isinstance(ctx.raw_payload, dict) else {}
        namespace = str(diff.get("namespace") or Sandbox.NAMESPACE)
        desired_manifest = diff.get("desired_manifest")
        if isinstance(desired_manifest, dict) and desired_manifest:
            applied, message, rollout = await self.apply_kubernetes_manifest(
                desired_manifest,
                namespace,
            )
            return self.command_result(
                applied,
                message,
                resource=str(diff.get("resource", "")),
                rollout=rollout,
            )

        deployment = deployment_name_from_resource(str(diff.get("resource", "")))
        image = str(diff.get("desired_image", ""))
        if not deployment or not image:
            return self.command_result(
                False,
                "apply_manifest requires deployment resource and image",
                resource=str(diff.get("resource", "")),
            )
        if namespace != Sandbox.NAMESPACE:
            return self.command_result(
                False,
                AgentConfig.WRITE_NAMESPACE_DENIED_MESSAGE,
                resource=str(diff.get("resource", "")),
            )
        patch = build_apply_manifest_patch(deployment, image)
        applied, message, rollout = await self.patch_deployment(namespace, deployment, patch)
        return self.command_result(
            applied,
            message,
            resource=str(diff.get("resource", "")),
            rollout=rollout,
        )

    @command.handler(AgentConfig.ROLLOUT_RESTART_ACTION)
    async def rollout_restart_command(self, ctx: CommandContext[JsonObject]) -> JsonObject:
        diff = ctx.raw_payload.get("diff", {}) if isinstance(ctx.raw_payload, dict) else {}
        namespace = str(diff.get("namespace") or Sandbox.NAMESPACE)
        if namespace != Sandbox.NAMESPACE:
            return self.command_result(
                False,
                AgentConfig.WRITE_NAMESPACE_DENIED_MESSAGE,
                resource=str(diff.get("resource", "")),
            )
        deployment = deployment_name_from_resource(str(diff.get("resource", "")))
        if not deployment:
            return self.command_result(
                False,
                "rollout_restart requires deployment resource",
                resource=str(diff.get("resource", "")),
            )
        patch = build_rollout_restart_patch()
        applied, message, rollout = await self.patch_deployment(namespace, deployment, patch)
        return self.command_result(
            applied,
            message,
            resource=str(diff.get("resource", "")),
            rollout=rollout,
        )

    async def apply_kubernetes_manifest(
        self, manifest: JsonObject, fallback_namespace: str
    ) -> tuple[bool, str, JsonObject]:
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        if not base_url or not token:
            return False, "kubernetes api not configured; dry-run only", {}

        try:
            resource = kubernetes_manifest_resource(manifest, fallback_namespace)
        except ValueError as exc:
            return False, str(exc), {}
        if resource.namespace != Sandbox.NAMESPACE:
            return False, AgentConfig.WRITE_NAMESPACE_DENIED_MESSAGE, {}

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
                if created.is_error:
                    return False, kubernetes_failure_message("create", created), {}
                if resource.kind == "Deployment":
                    return await self.wait_for_deployment_rollout(
                        client,
                        base_url,
                        token,
                        resource.namespace,
                        resource.name,
                    )
                return True, AgentConfig.MANIFEST_CREATED_MESSAGE, {}

            if current.is_error:
                return False, kubernetes_failure_message("get", current), {}
            patched = await client.patch(
                resource.resource_url(base_url),
                json=resource.manifest,
                headers=kubernetes_headers(token, "application/merge-patch+json"),
            )
            if patched.is_error:
                return False, kubernetes_failure_message("patch", patched), {}
            if resource.kind == "Deployment":
                return await self.wait_for_deployment_rollout(
                    client,
                    base_url,
                    token,
                    resource.namespace,
                    resource.name,
                )
        return True, AgentConfig.MANIFEST_PATCHED_MESSAGE, {}

    def command_result(
        self,
        applied: bool,
        message: str,
        *,
        resource: str = "",
        retryable: bool = False,
        stdout: str = "",
        stderr: str = "",
        rollout: JsonObject | None = None,
    ) -> JsonObject:
        status = (
            AgentConfig.COMMAND_COMPLETED_STATUS if applied else AgentConfig.COMMAND_FAILED_STATUS
        )
        resource_status = []
        if resource:
            resource_status.append(
                {
                    "resource": resource,
                    "status": status,
                    "applied": applied,
                    "message": message,
                }
            )
        return {
            Gateway.STATUS: status,
            Gateway.CLUSTER_ID: self.cluster_id,
            Gateway.APPLIED: applied,
            Gateway.MESSAGE: message,
            Gateway.RETRYABLE: retryable,
            Gateway.RESOURCES: resource_status,
            Gateway.STDOUT: sanitize_command_output(stdout or (message if applied else "")),
            Gateway.STDERR: sanitize_command_output(stderr or ("" if applied else message)),
            "rollout": rollout or {},
        }

    async def patch_deployment(
        self, namespace: str, deployment: str, patch: JsonObject
    ) -> tuple[bool, str, JsonObject]:
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        if not base_url or not token:
            return False, "kubernetes api not configured; dry-run only", {}
        url = f"{base_url}/apis/apps/v1/namespaces/{namespace}/deployments/{deployment}"
        headers = kubernetes_headers(token, "application/strategic-merge-patch+json")
        async with kubernetes_client(self.kubernetes_transport) as client:
            response = await client.patch(url, json=patch, headers=headers)
            if response.is_error:
                return False, kubernetes_failure_message("patch", response), {}
            return await self.wait_for_deployment_rollout(
                client,
                base_url,
                token,
                namespace,
                deployment,
            )

    async def wait_for_deployment_rollout(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        token: str,
        namespace: str,
        deployment: str,
    ) -> tuple[bool, str, JsonObject]:
        timeout = AgentConfig.KUBERNETES_ROLLOUT_TIMEOUT_SECONDS
        url = f"{base_url}/apis/apps/v1/namespaces/{namespace}/deployments/{deployment}"
        if timeout <= 0:
            return (
                True,
                AgentConfig.COMMAND_RESULT_MESSAGE,
                {"resource": f"deployment/{deployment}", "ready": None, "waited": False},
            )
        deadline = time.monotonic() + timeout
        last_status: JsonObject = {}
        while True:
            response = await client.get(url, headers=kubernetes_headers(token))
            if not response.is_error:
                body = response.json()
                if isinstance(body, dict):
                    last_status = deployment_rollout_status(body)
                    if last_status.get("ready") is True:
                        return (
                            True,
                            AgentConfig.DEPLOYMENT_ROLLOUT_COMPLETED_MESSAGE,
                            last_status,
                        )
            else:
                last_status = {
                    "resource": f"deployment/{deployment}",
                    "ready": False,
                    "error": kubernetes_failure_message("rollout status", response),
                }
            if time.monotonic() >= deadline:
                return (
                    False,
                    f"deployment rollout not ready before timeout: {deployment}",
                    last_status,
                )
            await asyncio.sleep(AgentConfig.KUBERNETES_ROLLOUT_POLL_INTERVAL_SECONDS)


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


def deployment_rollout_status(body: JsonObject) -> JsonObject:
    metadata = body.get("metadata")
    spec = body.get("spec")
    status = body.get("status")
    metadata_obj = metadata if isinstance(metadata, dict) else {}
    spec_obj = spec if isinstance(spec, dict) else {}
    status_obj = status if isinstance(status, dict) else {}
    name = str(metadata_obj.get("name") or "")
    replicas_value = spec_obj.get("replicas", 1)
    desired = int(1 if replicas_value is None else replicas_value)
    generation = int(metadata_obj.get("generation") or 0)
    observed = int(status_obj.get("observedGeneration") or 0)
    updated = int(status_obj.get("updatedReplicas") or 0)
    ready_replicas = int(status_obj.get("readyReplicas") or 0)
    available = int(status_obj.get("availableReplicas") or 0)
    conditions = status_obj.get("conditions")
    condition_list = conditions if isinstance(conditions, list) else []
    progressing = deployment_condition(condition_list, "Progressing")
    available_condition = deployment_condition(condition_list, "Available")
    ready = desired == 0 or (
        observed >= generation
        and updated >= desired
        and ready_replicas >= desired
        and available >= desired
        and condition_status(progressing) != "False"
        and condition_status(available_condition) != "False"
    )
    return {
        "resource": f"deployment/{name}" if name else "deployment",
        "ready": ready,
        "desired_replicas": desired,
        "updated_replicas": updated,
        "ready_replicas": ready_replicas,
        "available_replicas": available,
        "observed_generation": observed,
        "generation": generation,
        "conditions": condition_list,
    }


def deployment_condition(conditions: list[object], condition_type: str) -> JsonObject:
    for condition in conditions:
        if isinstance(condition, dict) and condition.get("type") == condition_type:
            return dict(condition)
    return {}


def condition_status(condition: JsonObject) -> str:
    return str(condition.get("status") or "")


def kubernetes_failure_message(action: str, response: httpx.Response) -> str:
    detail = response.text.strip()
    if len(detail) > 200:
        detail = f"{detail[:197]}..."
    suffix = f": {detail}" if detail else ""
    return f"kubernetes {action} failed ({response.status_code}){suffix}"


def sanitize_command_output(value: object) -> str:
    text = str(value or "")
    if not text:
        return ""
    lines = []
    for line in text.splitlines():
        lowered = line.lower()
        if any(marker in lowered for marker in SENSITIVE_OUTPUT_MARKERS):
            lines.append("[redacted]")
            continue
        lines.append(line)
    sanitized = "\n".join(lines)
    if len(sanitized) <= COMMAND_OUTPUT_LIMIT:
        return sanitized
    return f"{sanitized[: COMMAND_OUTPUT_LIMIT - 3]}..."


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
    contract = supported_kubernetes_resource(api_version, kind)
    return contract.api_prefix, contract.plural
