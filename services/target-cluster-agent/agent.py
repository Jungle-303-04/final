from __future__ import annotations

import asyncio
from collections.abc import Iterable, Mapping

import httpx
from commands import (
    AgentCommandRegistry,
    CommandContext,
    KubernetesApiClient,
    KubernetesPatchPayload,
    KubernetesScalePayload,
    command_handler,
    kubernetes_command,
)
from control import AgentControlStore, AgentPolicySync, DesiredStateReconciler
from evidence import EvidenceCollector, EvidenceScheduler, EvidenceTaskStore
from providers import (
    LokiLogsProvider,
    PrometheusMetricsProvider,
    TelemetryProvider,
    TempoTracesProvider,
)
from queries import (
    TelemetryQueryCommandPayload,
    TelemetryQueryDefinition,
    TelemetryQueryImportPayload,
    TelemetryQueryRegistry,
    load_query_definitions,
)
from settings import (
    AGENT_CAPABILITIES,
    AGENT_CONTROL_DB_PATH_ENV,
    BOOTSTRAP_MODE_ENV,
    CLUSTER_ROLE_ENV,
    COMMAND_EXECUTION_DELAY_SECONDS,
    COMMAND_FAILED_STATUS,
    COMMAND_POLL_TIMEOUT_SECONDS,
    COMMAND_RESULT_MESSAGE,
    COMMAND_RETRY_DELAY_SECONDS,
    DEFAULT_AGENT_CONTROL_DB_PATH,
    DEFAULT_AGENT_ID,
    DEFAULT_BOOTSTRAP_MODE,
    DEFAULT_CLUSTER_ROLE,
    DEFAULT_EVIDENCE_FAILURE_POLICY,
    DEFAULT_EVIDENCE_PROVIDER_MAX_WORKERS,
    DEFAULT_EVIDENCE_PROVIDER_WORKERS,
    DEFAULT_EVIDENCE_QUEUE_DB_PATH,
    DEFAULT_MANAGEMENT_BASE_URL,
    DEFAULT_OTEL_SERVICE_NAME,
    DEFAULT_OTEL_TRACES_ENDPOINT,
    DEFAULT_POLICY_SYNC_INTERVAL_SECONDS,
    DEFAULT_RECONCILE_INTERVAL_SECONDS,
    DEFAULT_TELEMETRY_QUERY_PATH,
    DEFAULT_WORKLOAD_CONTROLLER_INTERVAL_SECONDS,
    DEFAULT_WORKLOAD_QUEUE_AGE_TARGET_SECONDS,
    EVIDENCE_FAILURE_POLICY_ENV,
    EVIDENCE_INTERVAL_ENV,
    EVIDENCE_PROVIDER_MAX_WORKERS_ENV,
    EVIDENCE_PROVIDER_WORKERS_ENV,
    EVIDENCE_QUEUE_DB_PATH_ENV,
    EVIDENCE_TASK_LEASE_SECONDS,
    HOSTNAME_ENV,
    HTTP_TIMEOUT_SECONDS,
    KUBERNETES_CONFIGMAP_PATCH_ACTION,
    KUBERNETES_DEPLOYMENT_PATCH_ACTION,
    KUBERNETES_DEPLOYMENT_SCALE_ACTION,
    MANAGEMENT_BASE_URL_ENV,
    OTEL_SERVICE_NAME_ENV,
    OTEL_TRACES_ENDPOINT_ENV,
    POLICY_SYNC_INTERVAL_ENV,
    QUERY_IMPORT_ACTION,
    QUERY_REGISTER_ACTION,
    QUERY_RUN_ACTION,
    RECONCILE_INTERVAL_ENV,
    REGISTER_RETRY_DELAY_SECONDS,
    TARGET_CLUSTER_ID_ENV,
    TELEMETRY_QUERY_PATH_ENV,
    WORKLOAD_CONTROLLER_INTERVAL_ENV,
    WORKLOAD_QUEUE_AGE_TARGET_ENV,
)
from span import configure_tracing, get_tracer
from workload import ClusterWorkloadController

from packages.config.constants import DEFAULT_EVIDENCE_INTERVAL_SECONDS, DEFAULT_TARGET_CLUSTER_ID
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway.requests import (
    AgentPolicy,
    BootstrapPolicy,
    DesiredStatePolicy,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
)
from packages.contracts.interfaces import CommandRecord, ManagementPlaneClient

TRACER = get_tracer("target-cluster-agent.agent")

HTTP_GET = "GET"
HTTP_POST = "POST"

MANAGEMENT_SPAN_PREFIX = "management"
MGMT_OP_REGISTER_AGENT = "register_agent"
MGMT_OP_SHIP_EVIDENCE = "ship_evidence"
MGMT_OP_POLL_COMMAND = "poll_command"
MGMT_OP_COMPLETE_COMMAND = "complete_command"
MGMT_OP_FETCH_POLICY = "fetch_policy"
MGMT_OP_REPORT_POLICY_STATUS = "report_policy_status"
MGMT_OP_REPORT_RECONCILE_STATUS = "report_reconcile_status"

MGMT_PATH_AGENT_CONNECT = "/agent/connect"
MGMT_PATH_AGENT_EVIDENCE = "/agent/evidence"
MGMT_PATH_COMMAND_POLL = "/agent/commands/poll"
MGMT_PATH_AGENT_POLICY = "/agent/policy"
MGMT_PATH_POLICY_STATUS = "/agent/policy/status"
MGMT_PATH_RECONCILE_STATUS = "/agent/reconcile/status"


def command_result_path(command_id: str) -> str:
    return f"/agent/commands/{command_id}/result"


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

    async def request(
        self,
        operation: str,
        method: str,
        path: str,
        *,
        attrs: Mapping[str, object] | None = None,
        body: JsonObject | None = None,
        params: JsonObject | None = None,
    ) -> httpx.Response:
        with TRACER.start_as_current_span(f"{MANAGEMENT_SPAN_PREFIX}.{operation}") as span:
            span.attr("http.method", method)
            span.attr("http.path", path)
            for key, value in (attrs or {}).items():
                span.attr(key, value)
            try:
                response = await self.client.request(
                    method,
                    f"{self.base_url}{path}",
                    json=body,
                    params=params,
                )
                span.http_status(response.status_code)
                return response
            except Exception as exc:
                span.error(exc)
                raise

    # Tell the Management Plane that this target-cluster agent is online.
    async def register_agent(self, cluster_id: str, agent_id: str, capabilities: list[str]) -> None:
        await self.request(
            MGMT_OP_REGISTER_AGENT,
            HTTP_POST,
            MGMT_PATH_AGENT_CONNECT,
            attrs={"cluster.id": cluster_id, "agent.id": agent_id},
            body={
                "cluster_id": cluster_id,
                "agent_id": agent_id,
                "capabilities": capabilities,
            },
        )

    # Send one evidence payload to the Management Plane.
    async def ship_evidence(self, evidence: JsonObject) -> int:
        response = await self.request(
            MGMT_OP_SHIP_EVIDENCE,
            HTTP_POST,
            MGMT_PATH_AGENT_EVIDENCE,
            body=evidence,
        )
        return response.status_code

    # Ask the Management Plane for one pending command.
    async def poll_command(self, cluster_id: str, timeout_seconds: int) -> CommandRecord | None:
        response = await self.request(
            MGMT_OP_POLL_COMMAND,
            HTTP_GET,
            MGMT_PATH_COMMAND_POLL,
            attrs={"cluster.id": cluster_id},
            params={"cluster_id": cluster_id, "timeout": timeout_seconds},
        )
        response.raise_for_status()
        command = response.json().get("command")
        return command

    # Report one command execution result back to the Management Plane.
    async def complete_command(self, command_id: str, result: JsonObject) -> None:
        await self.request(
            MGMT_OP_COMPLETE_COMMAND,
            HTTP_POST,
            command_result_path(command_id),
            attrs={"command.id": command_id},
            body=result,
        )

    async def fetch_policy(self, cluster_id: str, generation: int) -> JsonObject | None:
        response = await self.request(
            MGMT_OP_FETCH_POLICY,
            HTTP_GET,
            MGMT_PATH_AGENT_POLICY,
            attrs={"cluster.id": cluster_id, "policy.generation": generation},
            params={"cluster_id": cluster_id, "generation": generation},
        )
        response.raise_for_status()
        policy = response.json().get("policy")
        return policy if isinstance(policy, dict) else None

    async def report_policy_status(self, status: JsonObject) -> None:
        await self.request(
            MGMT_OP_REPORT_POLICY_STATUS,
            HTTP_POST,
            MGMT_PATH_POLICY_STATUS,
            body=status,
        )

    async def report_reconcile_status(self, status: JsonObject) -> None:
        await self.request(
            MGMT_OP_REPORT_RECONCILE_STATUS,
            HTTP_POST,
            MGMT_PATH_RECONCILE_STATUS,
            body=status,
        )


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
        self.cluster_role = env(CLUSTER_ROLE_ENV, DEFAULT_CLUSTER_ROLE)
        self.bootstrap_mode = env(BOOTSTRAP_MODE_ENV, DEFAULT_BOOTSTRAP_MODE)
        self.interval = int(env(EVIDENCE_INTERVAL_ENV, DEFAULT_EVIDENCE_INTERVAL_SECONDS))
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
        self.workload_controller_interval_seconds = int(
            env(
                WORKLOAD_CONTROLLER_INTERVAL_ENV,
                DEFAULT_WORKLOAD_CONTROLLER_INTERVAL_SECONDS,
            )
        )
        self.workload_queue_age_target_seconds = int(
            env(
                WORKLOAD_QUEUE_AGE_TARGET_ENV,
                DEFAULT_WORKLOAD_QUEUE_AGE_TARGET_SECONDS,
            )
        )
        self.evidence_queue_db_path = env(
            EVIDENCE_QUEUE_DB_PATH_ENV,
            DEFAULT_EVIDENCE_QUEUE_DB_PATH,
        )
        self.agent_control_db_path = env(
            AGENT_CONTROL_DB_PATH_ENV,
            DEFAULT_AGENT_CONTROL_DB_PATH,
        )
        self.policy_sync_interval_seconds = int(
            env(POLICY_SYNC_INTERVAL_ENV, DEFAULT_POLICY_SYNC_INTERVAL_SECONDS)
        )
        self.reconcile_interval_seconds = int(
            env(RECONCILE_INTERVAL_ENV, DEFAULT_RECONCILE_INTERVAL_SECONDS)
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
        self.evidence_store = EvidenceTaskStore(self.evidence_queue_db_path)
        self.control_store = AgentControlStore(self.agent_control_db_path)
        self._workload_control_authority = object()
        self.evidence_scheduler = EvidenceScheduler(
            cluster_id=self.cluster_id,
            collector=self.evidence_collector,
            store=self.evidence_store,
            provider_keys=tuple(self.evidence_collector.providers),
            provider_worker_counts=self.evidence_provider_worker_counts,
            failure_policy=self.evidence_failure_policy,
            interval_seconds=self.interval,
            lease_seconds=EVIDENCE_TASK_LEASE_SECONDS,
            worker_pool_authority=self._workload_control_authority,
        )
        self.workload_controller = ClusterWorkloadController(
            worker_pool=self.evidence_scheduler,
            store=self.evidence_store,
            authority=self._workload_control_authority,
            min_worker_counts=self.evidence_provider_worker_counts,
            max_worker_counts=self.evidence_provider_max_worker_counts,
            interval_seconds=self.workload_controller_interval_seconds,
            queue_age_target_seconds=self.workload_queue_age_target_seconds,
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

    def build_default_policy(self) -> AgentPolicy:
        providers = {
            provider_key: EvidenceProviderPolicy(
                enabled=True,
                interval_seconds=self.interval,
                min_workers=self.evidence_provider_worker_counts.get(provider_key, 1),
                max_workers=self.evidence_provider_max_worker_counts.get(provider_key, 3),
                queue_age_target_seconds=self.workload_queue_age_target_seconds,
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
        max_worker_counts: dict[str, int] = {}
        queue_age_targets: dict[str, int] = {}
        for provider_key in self.evidence_collector.providers:
            provider_policy = policy.evidence.providers.get(
                provider_key,
                base_policy.evidence.providers.get(
                    provider_key,
                    self.default_policy.evidence.providers[provider_key],
                ),
            )
            if provider_policy is None:
                continue
            provider_intervals[provider_key] = provider_policy.interval_seconds
            min_worker_counts[provider_key] = provider_policy.min_workers
            max_worker_counts[provider_key] = provider_policy.max_workers
            queue_age_targets[provider_key] = provider_policy.queue_age_target_seconds
            if provider_policy.enabled:
                enabled_provider_keys.add(provider_key)

        self.evidence_scheduler.configure_schedule(
            provider_intervals=provider_intervals,
            enabled_provider_keys=enabled_provider_keys,
        )
        self.evidence_scheduler.set_failure_policy(policy.evidence.failure_policy)
        self.workload_controller.configure_worker_policy(
            min_worker_counts=min_worker_counts,
            max_worker_counts=max_worker_counts,
            queue_age_targets=queue_age_targets,
        )
        return {
            "generation": policy.generation,
            "cluster_role": policy.cluster_role,
            "bootstrap_mode": policy.bootstrap.mode,
            "enabled_providers": sorted(enabled_provider_keys),
        }

    # Start the agent with either the injected client or a real HTTP client.
    async def run(self) -> None:
        if self.client is not None:
            await self.run_with_client(self.client)
            return
        async with HttpManagementPlaneClient(self.base_url) as client:
            await self.run_with_client(client)

    # Register once, then run evidence shipping and command polling together.
    async def run_with_client(self, client: ManagementPlaneClient) -> None:
        self.policy_sync.apply_stored_or_default()
        await self.register(client)
        await asyncio.gather(
            self.policy_sync.run(client),
            self.evidence_scheduler.run(client),
            self.workload_controller.run(),
            self.reconciler.run(client),
            self.poll_commands(client),
        )

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
            return await self.command_registry.execute(
                action,
                payload,
                metadata={"command.id": command.get("command_id", "")},
            )
        except Exception as exc:
            return {
                "status": COMMAND_FAILED_STATUS,
                "cluster_id": self.cluster_id,
                "applied": False,
                "message": str(exc),
            }

    @command_handler(QUERY_RUN_ACTION, payload_model=TelemetryQueryCommandPayload)
    async def run_query_command(
        self,
        ctx: CommandContext[TelemetryQueryCommandPayload],
    ) -> JsonObject:
        definition = self.query_definition_from_payload(ctx.payload.definition_payload())
        result = await self.evidence_collector.run_query(definition)
        if ctx.payload.should_register():
            self.evidence_collector.register_query(definition)
        return ctx.ok(
            "telemetry query executed",
            query=definition.__dict__,
            result=result,
        )

    @command_handler(QUERY_REGISTER_ACTION, payload_model=TelemetryQueryCommandPayload)
    async def register_query_command(
        self,
        ctx: CommandContext[TelemetryQueryCommandPayload],
    ) -> JsonObject:
        definition = self.query_definition_from_payload(ctx.payload.definition_payload())
        self.evidence_collector.register_query(definition)
        return ctx.ok(
            "telemetry query registered",
            applied=True,
            query=definition.__dict__,
        )

    @command_handler(QUERY_IMPORT_ACTION, payload_model=TelemetryQueryImportPayload)
    async def import_query_path_command(
        self,
        ctx: CommandContext[TelemetryQueryImportPayload],
    ) -> JsonObject:
        definitions = self.evidence_collector.import_queries(ctx.payload.resolved_path())
        return ctx.ok(
            "telemetry query file imported",
            applied=True,
            imported_count=len(definitions),
            queries=[definition.__dict__ for definition in definitions],
        )

    @kubernetes_command(
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

    @kubernetes_command(
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

    @kubernetes_command(
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
        await asyncio.sleep(COMMAND_EXECUTION_DELAY_SECONDS)
        return ctx.ok(COMMAND_RESULT_MESSAGE, applied=True)

    def command_payload(self, command: CommandRecord) -> JsonObject:
        payload = command.get("payload") or {}
        if not isinstance(payload, dict):
            return {}
        nested_payload = payload.get("payload")
        return nested_payload if isinstance(nested_payload, dict) else payload

    def query_definition_from_payload(self, payload: JsonObject) -> TelemetryQueryDefinition:
        query_value = payload.get("query")
        query = query_value if isinstance(query_value, dict) else payload
        if not isinstance(query, dict):
            raise ValueError("telemetry query command requires a query object")
        if "query" not in query:
            source = query.get("source")
            name = query.get("name")
            if isinstance(source, str) and isinstance(name, str):
                return self.query_registry.get(source, name)
        return TelemetryQueryDefinition.from_mapping(query)
