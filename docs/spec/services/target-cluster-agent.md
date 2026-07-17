---
source_commit: 30465d0c4
status: synced
---

# cluster-agent — target 클러스터 상주 에이전트 (증거 수집 · 커맨드 실행 · 정책 동기화 · 실시간 요약)

> 소스: `src/services/target/cluster-agent/` · 테스트: `tests/test_target_agent_client.py`, `tests/test_target_agent_commands.py`, `tests/test_target_evidence_jobs.py`, `tests/test_target_policy_control.py`, `tests/test_target_reconciler.py`, `tests/test_live_summary.py`, `tests/test_telemetry_registry.py`, `tests/test_target_kubernetes_evidence.py`, `tests/test_target_metadata_evidence.py`, `tests/test_target_metric_evidence.py`, `tests/test_target_telemetry_evidence.py`

## 책임 (Responsibility)

- target 클러스터 내부에서 실행되는 단일 프로세스 에이전트. 관리 플레인(management plane, [api-gateway](gateway-api-gateway.md))과 **HTTP 롱폴/푸시**로만 통신한다 (NATS 이벤트 버스에 직접 붙지 않음).
- 하는 일:
  1. **에이전트 등록**: 기동 시 `/agent/connect`로 자신을 등록 (capabilities: `["collector", "command_receiver"]`).
  2. **증거(evidence) 수집**: Kubernetes API·Prometheus·Loki·Tempo 4개 provider로 텔레메트리를 수집해 evidence job 결과로 제출.
  3. **커맨드 실행**: 관리 플레인이 큐잉한 커맨드(`rollout_restart`, `apply_manifest`, `k8s.*` 패치/스케일, `telemetry.query.run`)를 롱폴로 받아 실행하고 결과를 SQLite outbox 경유로 전송.
  4. **정책 동기화(control)**: `AgentPolicy`를 주기적으로 fetch → merge → 적용 → SQLite 저장, desired state 리소스를 reconcile.
  5. **node-collector DaemonSet 관리**: [node-collector](target-node-collector.md) DaemonSet을 생성/패치로 유지(reconcile).
  6. **실시간 요약(live summary)**: pod 요약을 계산해 [realtime-gateway](realtime-realtime-gateway.md)로 outbound WebSocket 1개로 push.
- 하지 않는 일: browser fan-out(realtime-gateway 책임), evidence job 큐 관리(api-gateway 책임), sandbox 밖 네임스페이스 쓰기(불변식으로 거부), NATS 이벤트 발행/구독.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `env`, `get_logger`/`CONTEXT_KEY`, 상수(`Command`, `CommandStatus`, `Sandbox`, `Target`), `control.control_namespace_allowed`/`CONTROL_NAMESPACE_DENIED_MESSAGE` — 제어(쓰기) 허용 네임스페이스 단일 기준(`src/packages/config/control.py`) |
| import | `packages.contracts.gateway` | [../../packages/contracts.md](../packages/contracts.md) | `routes`(에이전트 HTTP 경로), `Gateway` 필드 enum, `requests`(`AgentPolicy`, `EvidenceProviderPolicy`, `EvidenceRuntimePolicy`, `BootstrapPolicy`, `DesiredStatePolicy`, `DesiredResource`, `StrictModel`, `DEFAULT_QUEUE_AGE_TARGET_SECONDS`, 관측 스택 기본 URL), `policy_merge.merge_agent_policy` |
| import | `packages.contracts.gitops` | [../../packages/contracts.md](../packages/contracts.md) | `supported_kubernetes_resource` — manifest kind → API prefix와 Kubernetes resource collection 매핑 |
| import | `packages.contracts.identity` | [../../packages/contracts.md](../packages/contracts.md) | `DEFAULT_WORKSPACE_ID`(`"default"`) |
| import | `packages.contracts.interfaces` | [../../packages/contracts.md](../packages/contracts.md) | `ManagementPlaneClient` 프로토콜, `CommandRecord = dict[str, Any]` |
| import | `packages.contracts.event_bus.interfaces` | [../../packages/contracts.md](../packages/contracts.md) | `JsonObject` 타입 |
| import | `packages.contracts.realtime` | [../../packages/contracts.md](../packages/contracts.md) | `AGENT_LIVE_PATH`, `MAX_HOT_PODS`, `HotPod`, `LiveSummary`, `LiveSummaryMessage` |
| import | `packages.contracts.target` | [../../packages/contracts.md](../packages/contracts.md) | `TARGET_NAMESPACE`(`"target"`), `SANDBOX_NAMESPACE`(`"sandbox"`) |
| import | `packages.runtime.service` | [../../packages/runtime.md](../packages/runtime.md) | `AsyncService` 엔트리포인트 래퍼 |
| 외부 | Kubernetes API 서버 | — | in-cluster ServiceAccount 토큰 인증, 스냅샷·패치·DaemonSet reconcile |
| 외부 | Prometheus / Loki / Tempo | — | 텔레메트리 HTTP 조회 (엔드포인트는 [동작](#providers--외부-텔레메트리-호출) 참조) |
| 외부 | management api-gateway | [../gateway/api-gateway.md](gateway-api-gateway.md) | `/agent/*` HTTP 계약 전부 |
| 외부 | realtime-gateway | [../realtime/realtime-gateway.md](realtime-realtime-gateway.md) | `/live/agent` WebSocket으로 `LiveSummaryMessage` push |
| 외부 | OTLP collector | — | `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`로 span export (미설정 시 export 없음) |
| 관련 | node-collector | [./node-collector.md](target-node-collector.md) | 이 에이전트가 DaemonSet으로 rollout하는 노드 수집기 |
| 관련 | drift-worker / reconcile-worker | [./drift-worker.md](target-drift-worker.md), [./reconcile-worker.md](target-reconcile-worker.md) | 관리 플레인 측 target 도메인 워커(에이전트 결과의 소비자) |
| 관련 | 설치 manifest 렌더러 | — (`src/domains/target/install_manifest.py`) | 이 에이전트의 Deployment/ConfigMap을 렌더. 등록 응답의 `install_command`(`src/packages/contracts/gateway/responses.py :: TargetInstallResponse`)가 가리키는 원라인 인스톨러 `GET /install/{agent_token}`(`src/packages/contracts/gateway/routes.py :: INSTALL_MANIFEST_PATH`)은 토큰 해시 대조로 manifest를 재렌더하며, 등록 요청 `TargetRegisterRequest.control_namespaces` CSV를 ConfigMap의 `CONTROL_ALLOWED_NAMESPACES` env로 주입한다 |

아키텍처 규칙: 이 서비스는 `src/domains/*`를 import하지 않는다. 오직 `packages.*` 계약만 사용한다.

## 공개 인터페이스 (Public API)

### 루트 모듈

#### `app.py` — 엔트리포인트

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `run` | `async def run() -> None` — `await TargetClusterAgent().run()` | `src/services/target/cluster-agent/app.py :: run` |
| `main` | `def main() -> None` — `AsyncService(AgentConfig.TARGET_AGENT_SERVICE_NAME, run).run()` | `src/services/target/cluster-agent/app.py :: main` |

`if __name__ == "__main__": main()`. 서비스명은 `"cluster-agent"`.

#### `agent.py` — 에이전트 본체

모듈 상수: `LOGGER`, `COMMAND_OUTPUT_LIMIT = 2000`, `SENSITIVE_OUTPUT_MARKERS = ("authorization", "bearer ", "kubeconfig", "password", "secret", "token")`.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `parse_provider_worker_counts` | `def parse_provider_worker_counts(raw_counts: str) -> dict[str, int]` — `"k=1,m=2"` 형식 파싱, `=` 없으면 `ValueError("invalid provider worker setting: ...")`, 값은 `max(1, int(...))` | `src/services/target/cluster-agent/agent.py :: parse_provider_worker_counts` |
| `KubernetesManifestResource` | `@dataclass(frozen=True)` — 필드 `kind: str`, `api_version: str`, `namespace: str`, `name: str`, Kubernetes resource collection name, `api_prefix: str`, `manifest: JsonObject`. 메서드 `collection_url(self, base_url: str) -> str`는 API prefix, namespace, resource collection을 조합하고, `resource_url(self, base_url: str) -> str`는 collection URL 뒤에 리소스 name을 붙인다. | `src/services/target/cluster-agent/agent.py :: KubernetesManifestResource` |
| `AgentConfig` | 클래스 상수 모음(아래) | `src/services/target/cluster-agent/agent.py :: AgentConfig` |
| `HttpManagementPlaneClient` | `ManagementPlaneClient` 프로토콜의 httpx 구현(아래) | `src/services/target/cluster-agent/agent.py :: HttpManagementPlaneClient` |
| `TargetClusterAgent` | 에이전트 본체(아래) | `src/services/target/cluster-agent/agent.py :: TargetClusterAgent` |
| `deployment_name_from_resource` | `def deployment_name_from_resource(resource: str) -> str` — `"deployment/x"`/`"deployments/x"` → `"x"`, `"pod/name-hash-suffix"`/`"replicaset/name-hash"` → 소유 Deployment 추정 이름, `/` 없는 값은 그대로, 그 외 kind는 `""` | `src/services/target/cluster-agent/agent.py :: deployment_name_from_resource` |
| `build_apply_manifest_patch` | `def build_apply_manifest_patch(deployment: str, image: str) -> JsonObject` — pod template에 annotation `ops.service/apply-at=<epoch>` + `containers[{name: deployment, image}]` strategic-merge patch | `src/services/target/cluster-agent/agent.py :: build_apply_manifest_patch` |
| `build_rollout_restart_patch` | `def build_rollout_restart_patch() -> JsonObject` — annotation `ops.service/restarted-at=<epoch>`만 갱신 | `src/services/target/cluster-agent/agent.py :: build_rollout_restart_patch` |
| `rollout_progress` | `def rollout_progress(deployment: str, *, waited: bool) -> JsonObject` — 패치/생성 수락 직후 반환하는 진행 상태 `{resource:"deployment/<name>", ready: None, phase:"progressing", waited}` | `src/services/target/cluster-agent/agent.py :: rollout_progress` |
| `deployment_rollout_status` | `def deployment_rollout_status(body: JsonObject) -> JsonObject` — Deployment 본문 → `{resource, ready, desired_replicas, updated_replicas, ready_replicas, available_replicas, observed_generation, generation, conditions}` | `src/services/target/cluster-agent/agent.py :: deployment_rollout_status` |
| `deployment_condition` | `def deployment_condition(conditions: list[object], condition_type: str) -> JsonObject` | `src/services/target/cluster-agent/agent.py :: deployment_condition` |
| `condition_status` | `def condition_status(condition: JsonObject) -> str` | `src/services/target/cluster-agent/agent.py :: condition_status` |
| `kubernetes_failure_message` | `def kubernetes_failure_message(action: str, response: httpx.Response) -> str` — `"kubernetes {action} failed ({status_code}): {detail}"`, detail 200자 초과 시 `...` 절단 | `src/services/target/cluster-agent/agent.py :: kubernetes_failure_message` |
| `sanitize_command_output` | `def sanitize_command_output(value: object) -> str` — `SENSITIVE_OUTPUT_MARKERS` 포함 라인은 `[redacted]`로 치환, 전체 `COMMAND_OUTPUT_LIMIT`(2000자) 초과 시 `...` 절단 | `src/services/target/cluster-agent/agent.py :: sanitize_command_output` |
| `kubernetes_manifest_resource` | `def kubernetes_manifest_resource(manifest: JsonObject, fallback_namespace: str) -> KubernetesManifestResource` — `apiVersion`/`kind`/`metadata.name` 필수(`ValueError`), namespace는 metadata → fallback 순, manifest에 namespace를 주입해 정규화 | `src/services/target/cluster-agent/agent.py :: kubernetes_manifest_resource` |
| `kubernetes_resource_api` | `def kubernetes_resource_api(kind: str, api_version: str) -> tuple[str, str]` — `supported_kubernetes_resource(api_version, kind)`의 API prefix와 resource collection name을 반환. 지원: `apps/v1 Deployment`(`/apis/apps/v1`, `deployments`), `v1 Service`(`/api/v1`, `services`), `v1 ConfigMap`(`/api/v1`, `configmaps`). 그 외 `ValueError("unsupported manifest kind: ...")` | `src/services/target/cluster-agent/agent.py :: kubernetes_resource_api` |

`AgentConfig` 상수 (전부 클래스 속성):

| 상수 | 값 |
|---|---|
| `TARGET_AGENT_SERVICE_NAME` | `"cluster-agent"` |
| `DEFAULT_MANAGEMENT_BASE_URL` | `""` |
| `MANAGEMENT_BASE_URL_ENV` / `TARGET_CLUSTER_ID_ENV` / `WORKSPACE_ID_ENV` / `EVIDENCE_INTERVAL_ENV` / `AGENT_TOKEN_ENV` / `HOSTNAME_ENV` | `"MANAGEMENT_BASE_URL"` / `"TARGET_CLUSTER_ID"` / `"WORKSPACE_ID"` / `"EVIDENCE_INTERVAL_SECONDS"` / `"AGENT_TOKEN"` / `"HOSTNAME"` |
| `AGENT_TOKEN_HEADER` | `"x-agent-token"` |
| `HTTP_TIMEOUT_SECONDS` ~ `COMMAND_RETRY_DELAY_SECONDS`, `NODE_COLLECTOR_RECONCILE_INTERVAL_SECONDS`, `KUBERNETES_ROLLOUT_TIMEOUT_SECONDS`, `KUBERNETES_ROLLOUT_POLL_INTERVAL_SECONDS` | `config.py`의 동명 값 재노출(단일 원천 — 중복 리터럴 금지) |
| `DEFAULT_AGENT_ID` | `"target-agent"` |
| `AGENT_CAPABILITIES` | `["collector", "command_receiver"]` |
| `EVIDENCE_SOURCE_ID` | `"cluster-snapshot"` |
| `COMMAND_COMPLETED_STATUS` / `COMMAND_FAILED_STATUS` | `CommandStatus.COMPLETED`(`"completed"`) / `CommandStatus.FAILED`(`"failed"`) |
| `APPLY_MANIFEST_ACTION` / `ROLLOUT_RESTART_ACTION` | `Command.APPLY_MANIFEST_ACTION`(`"apply_manifest"`) / `Command.DEFAULT_ACTION`(`"rollout_restart"`) |
| `COMMAND_RESULT_MESSAGE` | `"Kubernetes action processed in sandbox namespace"` |
| `MANIFEST_CREATED_MESSAGE` / `MANIFEST_PATCHED_MESSAGE` | `"Kubernetes manifest created in sandbox namespace"` / `"Kubernetes manifest patched in sandbox namespace"` |
| `DEPLOYMENT_ROLLOUT_COMPLETED_MESSAGE` | `"Kubernetes deployment rollout completed"` |
| `WRITE_NAMESPACE_DENIED_MESSAGE` | `CONTROL_NAMESPACE_DENIED_MESSAGE`(`"namespace is not allowed by control policy"`, `src/packages/config/control.py :: CONTROL_NAMESPACE_DENIED_MESSAGE`) — 허용 네임스페이스는 `packages.config.control` 단일 기준 |
| `MISSING_APPROVAL_EVIDENCE_MESSAGE` | `"write command requires approval_ref and policy_decision_ref"` |

`HttpManagementPlaneClient` — `src/services/target/cluster-agent/agent.py :: HttpManagementPlaneClient`:

```python
def __init__(self, base_url: str, timeout_seconds: int = AgentConfig.HTTP_TIMEOUT_SECONDS) -> None
async def __aenter__(self) -> HttpManagementPlaneClient
async def __aexit__(self, *_exc: object) -> None
async def close(self) -> None
async def register_agent(self, cluster_id: str, agent_id: str, capabilities: list[str]) -> None
async def poll_command(self, cluster_id: str, workspace_id: str, agent_id: str, timeout_seconds: int) -> CommandRecord | None
async def start_command(self, command_id: str, cluster_id: str, workspace_id: str, lease_id: str, agent_id: str) -> None
async def heartbeat_command(self, command_id: str, cluster_id: str, workspace_id: str, lease_id: str, agent_id: str) -> None
async def complete_command(self, command_id: str, workspace_id: str, lease_id: str, agent_id: str, result: JsonObject) -> None
async def schedule_evidence_jobs(self, source_id: str, window_start: str, provider_keys: list[str]) -> JsonObject
async def poll_evidence_job(self, provider_key: str, agent_id: str, timeout_seconds: int) -> JsonObject | None
async def complete_evidence_job(self, job_id: str, agent_id: str, lease_id: str, status: str, result: JsonObject, error: str) -> JsonObject
async def record_inventory_snapshot(self, payload: JsonObject) -> JsonObject
async def fetch_policy(self, cluster_id: str, generation: int) -> JsonObject | None
async def report_policy_status(self, status: JsonObject) -> None
async def report_reconcile_status(self, status: JsonObject) -> None
```

모든 요청에 `{"x-agent-token": env("AGENT_TOKEN", "")}` 헤더를 붙이고 `response.raise_for_status()`로 실패를 예외화한다. 경로는 전부 `packages.contracts.gateway.routes` 상수 사용(아래 [이벤트](#이벤트-events)). `record_inventory_snapshot`은 프로토콜 구현으로 존재하지만 이 서비스 내부에서 호출하는 코드는 없다.

`TargetClusterAgent` — `src/services/target/cluster-agent/agent.py :: TargetClusterAgent`:

```python
def __init__(
    self,
    client: ManagementPlaneClient | None = None,
    providers: tuple[TelemetryProvider, ...] | None = None,
    telemetry_transport: httpx.AsyncBaseTransport | None = None,
    kubernetes_transport: httpx.AsyncBaseTransport | None = None,
) -> None
def close(self) -> None
def build_default_policy(self) -> AgentPolicy
def apply_policy(self, policy: AgentPolicy) -> JsonObject
def register_policy_queries(self, provider_key: str, queries: list[JsonObject]) -> list[str]
async def run(self) -> None
async def run_with_client(self, client: ManagementPlaneClient) -> None
async def register(self, client: ManagementPlaneClient) -> None
async def poll_commands(self, client: ManagementPlaneClient) -> None
async def flush_command_results_forever(self, client: ManagementPlaneClient) -> None
async def flush_command_results_once(self, client: ManagementPlaneClient) -> bool
async def execute_command_with_heartbeat(self, client, command, command_id, workspace_id, lease_id) -> JsonObject
async def heartbeat_command_until_done(self, client, command_id, workspace_id, lease_id) -> None
async def reconcile_node_collector_forever(self) -> None
async def reconcile_node_collector_once(self) -> None
async def execute_command(self, command: CommandRecord) -> JsonObject
def write_action_requires_approval(self, action: str) -> bool
def command_metadata_value(self, command: CommandRecord, field: str) -> str
def approval_exempt_for_environment(self, action: str, command: CommandRecord) -> bool
def has_approval_evidence(self, command: CommandRecord) -> bool
async def run_query_command(self, ctx: CommandContext[TelemetryQueryCommandPayload]) -> JsonObject      # @command.handler(QUERY_RUN_ACTION, payload_model=TelemetryQueryCommandPayload)
async def catalog_helm_install_command(self, ctx: CommandContext[CatalogHelmInstallPayload]) -> JsonObject  # @command.handler(Command.CATALOG_HELM_INSTALL_ACTION, ...)
async def patch_deployment_command(self, ctx: CommandContext[KubernetesPatchPayload]) -> JsonObject      # @command.k8s(KUBERNETES_DEPLOYMENT_PATCH_ACTION, api_group="apps", version="v1", resource="deployments", verb="patch", payload_model=KubernetesPatchPayload)
async def scale_deployment_command(self, ctx: CommandContext[KubernetesScalePayload]) -> JsonObject      # @command.k8s(KUBERNETES_DEPLOYMENT_SCALE_ACTION, ..., resource="deployments", verb="patch", payload_model=KubernetesScalePayload)
async def patch_configmap_command(self, ctx: CommandContext[KubernetesPatchPayload]) -> JsonObject       # @command.k8s(KUBERNETES_CONFIGMAP_PATCH_ACTION, api_group="core", version="v1", resource="configmaps", verb="patch", payload_model=KubernetesPatchPayload)
async def apply_default_command(self, ctx: CommandContext[JsonObject]) -> JsonObject
def command_payload(self, command: CommandRecord) -> JsonObject
def query_definition_from_payload(self, payload: JsonObject) -> TelemetryQueryDefinition
async def apply_manifest_command(self, ctx: CommandContext[JsonObject]) -> JsonObject                    # @command.handler(AgentConfig.APPLY_MANIFEST_ACTION)
async def rollout_restart_command(self, ctx: CommandContext[JsonObject]) -> JsonObject                   # @command.handler(AgentConfig.ROLLOUT_RESTART_ACTION)
async def apply_kubernetes_manifest(self, manifest: JsonObject, fallback_namespace: str) -> tuple[bool, str, JsonObject]
def command_result(self, applied: bool, message: str, *, resource: str = "", retryable: bool = False, stdout: str = "", stderr: str = "", rollout: JsonObject | None = None) -> JsonObject
async def patch_deployment(self, namespace: str, deployment: str, patch: JsonObject) -> tuple[bool, str, JsonObject]
async def wait_for_deployment_rollout(self, client: httpx.AsyncClient, base_url: str, token: str, namespace: str, deployment: str) -> tuple[bool, str, JsonObject]
```

#### `config.py` — 설정 단일 원천

모듈 레벨 상수만 존재(클래스·함수 없음). 전체 목록과 기본값은 [설정](#설정-settings) 표 참조. 앵커: `src/services/target/cluster-agent/config.py`. 정적 기본 URL은 Loki·Tempo·OTel에만 적용하고, Prometheus는 revision-bound integration이 제공한 주소와 header만 사용한다. 라이브 요약은 Kubernetes의 클러스터 범위 `/api/v1/pods`를 페이지 단위로 읽어 애플리케이션 네임스페이스를 누락하지 않으며, 페이지 500개·수집 5,000개 상한과 파드 수 기반 적응형 주기로 규모를 보호한다.

#### `kubernetes_api.py` — in-cluster k8s API 접근 헬퍼

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `KubernetesApiConfig` | 상수: `SERVICE_HOST_ENV="KUBERNETES_SERVICE_HOST"`, `SERVICE_PORT_ENV="KUBERNETES_SERVICE_PORT_HTTPS"`, `SERVICE_ACCOUNT_TOKEN_PATH="/var/run/secrets/kubernetes.io/serviceaccount/token"`, `SERVICE_ACCOUNT_CA_PATH="/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"`, `HTTP_TIMEOUT_SECONDS_ENV="KUBERNETES_HTTP_TIMEOUT_SECONDS"`, `HTTP_TIMEOUT_SECONDS=int(env(..., "20"))` | `src/services/target/cluster-agent/kubernetes_api.py :: KubernetesApiConfig` |
| `kubernetes_client` | `def kubernetes_client(transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient` — CA 파일 존재 시 `verify=CA경로`, 없으면 `verify=True` | `src/services/target/cluster-agent/kubernetes_api.py :: kubernetes_client` |
| `kubernetes_headers` | `def kubernetes_headers(token: str, content_type: str | None = None) -> dict[str, str]` — `{"authorization": f"Bearer {token}"}` (+선택 `content-type`) | `src/services/target/cluster-agent/kubernetes_api.py :: kubernetes_headers` |
| `kubernetes_api_base_url` | `def kubernetes_api_base_url() -> str | None` — `KUBERNETES_SERVICE_HOST` 미설정 시 `None`, 설정 시 `https://{host}:{port}` (port 기본 `"443"`) | `src/services/target/cluster-agent/kubernetes_api.py :: kubernetes_api_base_url` |
| `service_account_token` | `def service_account_token() -> str | None` — 토큰 파일 없으면 `None`, 있으면 내용 strip | `src/services/target/cluster-agent/kubernetes_api.py :: service_account_token` |

#### `live_summary.py` — 실시간 요약 생산자

모듈 상수/타입: `CRASH_LOOP_REASON = "CrashLoopBackOff"`, `SummaryCollector = Callable[[], Awaitable[LiveSummary | None]]`, `LiveStreamConnection`(Protocol, `async def send(self, message: str) -> None`), `LiveStreamConnector = Callable[[str, dict[str, str]], AbstractAsyncContextManager[Any]]`.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `derive_gateway_url` | `def derive_gateway_url(management_base_url: str) -> str` — hostname 없으면 `""`, `https`→`wss`/그 외 `ws`, 포트는 `DEFAULT_REALTIME_GATEWAY_NODEPORT`(30090) | `src/services/target/cluster-agent/live_summary.py :: derive_gateway_url` |
| `KubernetesPodSummaryCollector` | `def __init__(self, cluster_id: str, window_ms: int, transport: httpx.AsyncBaseTransport | None = None) -> None`; `async def __call__(self) -> LiveSummary | None`; `def summarize(self, pods: list[dict[str, Any]]) -> LiveSummary` | `src/services/target/cluster-agent/live_summary.py :: KubernetesPodSummaryCollector` |
| `LiveSummaryPublisher` | `def __init__(self, *, cluster_id: str, gateway_url: str, token: str, interval_seconds: float, collector: SummaryCollector, connect: LiveStreamConnector | None = None, retry_delay_seconds: float = agent_config.LIVE_SUMMARY_RETRY_DELAY_SECONDS, enabled: bool = True) -> None`; `@classmethod def from_env(cls, cluster_id: str, management_base_url: str, kubernetes_transport=None) -> LiveSummaryPublisher`; `@property endpoint -> str`; `async def run(self) -> None` | `src/services/target/cluster-agent/live_summary.py :: LiveSummaryPublisher` |

#### `node_collector_manager.py` — node-collector DaemonSet reconcile

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `NodeCollectorManagerConfig` | 상수: `NODE_COLLECTOR_ENABLED_ENV`, `NODE_COLLECTOR_IMAGE_ENV`, `NODE_COLLECTOR_NAMESPACE_ENV`, `NODE_COLLECTOR_NAME="optional-node-collector"`, `NODE_COLLECTOR_APP_LABEL="optional-node-collector"`, `NODE_COLLECTOR_CONTAINER_NAME="node-collector"`, `NODE_COLLECTOR_DEFAULT_IMAGE=""`, `NODE_COLLECTOR_DEFAULT_NAMESPACE="target"`, `NODE_COLLECTOR_PORT_ENV`, `NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS_ENV`, `NODE_COLLECTOR_PORT=int(env(..., "9100"))`, `NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS=int(env(..., "15"))`, 상태 메시지(created/patched/pending/identity-pending/dry-run/disabled/image-required), `NODE_COLLECTOR_MANAGED_BY_LABEL="ops.service/managed-by"`, `NODE_COLLECTOR_MANAGED_BY_VALUE="cluster-agent"` | `src/services/target/cluster-agent/node_collector_manager.py :: NodeCollectorManagerConfig` |
| `NodeCollectorManager` | `def __init__(self, *, enabled: bool, image: str, namespace: str, transport: httpx.AsyncBaseTransport | None = None) -> None`; `@classmethod def from_env(cls, transport=None) -> NodeCollectorManager`; `async def reconcile(self) -> tuple[bool, str]`; `def daemonset(self) -> JsonObject` | `src/services/target/cluster-agent/node_collector_manager.py :: NodeCollectorManager` |
| `truthy` | `def truthy(value: str) -> bool` — `{"1","true","yes","on"}`(대소문자 무시) | `src/services/target/cluster-agent/node_collector_manager.py :: truthy` |

#### `node_collector_spec.py` — DaemonSet manifest 빌더

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `node_collector_daemonset` | `def node_collector_daemonset(*, name: str, namespace: str, image: str, app_label: str, managed_by_label: str, managed_by_value: str, container_name: str, port: int, collect_interval_seconds: int) -> JsonObject` | `src/services/target/cluster-agent/node_collector_spec.py :: node_collector_daemonset` |
| `node_collector_container` | `def node_collector_container(*, image: str, container_name: str, port: int, collect_interval_seconds: int) -> JsonObject` | `src/services/target/cluster-agent/node_collector_spec.py :: node_collector_container` |

manifest 고정 내용: `apiVersion: apps/v1`, `kind: DaemonSet`, labels `{app: <app_label>, <managed_by_label>: <managed_by_value>}`, `updateStrategy: RollingUpdate`, pod template annotations `prometheus.io/path=/metrics`, `prometheus.io/port=<port>`, `prometheus.io/scrape=true`, `serviceAccountName=cluster-agent-node-collector`, tolerations `[{operator: Exists}]`. 전용 ServiceAccount는 `pods get/list` 전용 ClusterRole에만 바인딩되며 `cluster-agent` ServiceAccount를 재사용하지 않는다. 컨테이너: `imagePullPolicy: IfNotPresent`, `command: ["python", "src/services/target/node-collector/app.py"]`, env `PORT`, `COLLECT_INTERVAL_SECONDS`, `NODE_NAME`(fieldRef `spec.nodeName`), `POD_NAME`(`metadata.name`), `POD_NAMESPACE`(`metadata.namespace`), 포트 `{name: metrics, containerPort: <port>}`.

#### `telemetry_registry.py` — 텔레메트리 소스 레지스트리(의존 없는 leaf)

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `TelemetrySourceSpec` | `@dataclass(frozen=True)` — `source: str`, `evidence_key: str`, `query_type: type`, `empty_payload: Callable[[], object] = dict`, `range_query_type: type | None = None` | `src/services/target/cluster-agent/telemetry_registry.py :: TelemetrySourceSpec` |
| `TelemetryRegistry` | `def source(self, *, source, evidence_key, query_type, empty_payload=dict, range_query_type=None) -> Callable[[type], type]`(클래스 데코레이터, 등록 + `cls.__source_spec__`/`cls.source`/`cls.evidence_key` 부여); `def spec(self, source: str) -> TelemetrySourceSpec`(미등록 시 `ValueError("unsupported telemetry query source: ...; supported: ...")`); `def sources(self) -> tuple[TelemetrySourceSpec, ...]`; `def source_names(self) -> tuple[str, ...]`(정렬); `def evidence_keys(self) -> dict[str, str]`; `def source_for_provider(self, provider_key: str) -> str | None`; `def query_type_for(self, source: str) -> type`; `def range_query_type_for(self, source: str) -> type | None`; `def describe(self) -> str` | `src/services/target/cluster-agent/telemetry_registry.py :: TelemetryRegistry` |
| `telemetry` | 모듈 싱글턴 `telemetry = TelemetryRegistry()` | `src/services/target/cluster-agent/telemetry_registry.py :: telemetry` |
| `registered_telemetry_sources` | `def registered_telemetry_sources() -> tuple[TelemetrySourceSpec, ...]` | `src/services/target/cluster-agent/telemetry_registry.py :: registered_telemetry_sources` |
| `ensure_sources_loaded` | `def ensure_sources_loaded() -> None` — 레지스트리가 비어 있으면 `importlib.import_module("providers")`로 등록 보장 | `src/services/target/cluster-agent/telemetry_registry.py :: ensure_sources_loaded` |

중복 등록 규칙: 같은 `source`에 **다른 계약**으로 재등록하면 `ValueError("duplicate telemetry source: ...")`. 동일 계약(이름 기준 비교, `_same_contract`) 재선언은 멱등.

### `commands/` — 커맨드 디스패치·k8s 클라이언트·결과 outbox

`commands/__init__.py`가 재노출: `AgentCommandRegistry`, `CommandContext`, `CommandResult`, `CommandResultOutbox`, `CommandResultRecord`, `KubernetesApiClient`, `KubernetesGetPayload`, `KubernetesPatchPayload`, `KubernetesScalePayload`, `command`, `command_handler`, `kubernetes_command`.

`commands/helm.py`는 catalog 전용 leaf runner다. `run_catalog_helm_install`은 서버 동봉 item/version을 digest-qualified OCI ref로 다시 해석하고 sandbox 이름/values를 재검증한다. values는 dotted key를 중첩 YAML로 바꿔 `0600` 임시 파일에 기록한다. 실행은 `helm upgrade --install ... --wait --atomic --timeout 300s`, 명시 argv, `shell=False`, subprocess timeout 330초다. 자식 환경은 Kubernetes/CA/proxy allowlist와 임시 `HELM_*_HOME`만 전달하며 stdout/stderr는 결과에 보존하지 않는다. 결과는 `HelmRunResult(succeeded, error_code, returncode)`로만 반환한다.

Agent heartbeat capability는 `collector`, `command_receiver`, `catalog_helm_install`이다. gateway는 마지막 capability까지 확인하므로 runner가 없는 구버전 Agent에는 install command를 queue하지 않는다.

#### `commands/context.py`

모듈 상수/타입: `COMMAND_COMPLETED_STATUS = "completed"`, `COMMAND_FAILED_STATUS = "failed"`, `PayloadT = TypeVar("PayloadT")`, `PayloadModel = type[BaseModel]`, `KubernetesVerb = Literal["get", "patch", "apply", "delete"]`, `KubernetesScope = Literal["target-agent", "system", "user-workload"]`.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `KubernetesClient` | Protocol — `async def get_namespaced_resource(*, api_group, version, namespace, resource, name, subresource=None) -> JsonObject`, `async def patch_namespaced_resource(*, api_group, version, namespace, resource, name, body, subresource=None) -> JsonObject` | `src/services/target/cluster-agent/commands/context.py :: KubernetesClient` |
| `KubernetesCommandSpec` | `@dataclass(frozen=True)` — `api_group: str`, `version: str`, `resource: str`, `verb: KubernetesVerb`, `scope: KubernetesScope = "target-agent"` | `src/services/target/cluster-agent/commands/context.py :: KubernetesCommandSpec` |
| `CommandSpec` | `@dataclass(frozen=True)` — `action: str`, `payload_model: PayloadModel | None = None`, `kubernetes: KubernetesCommandSpec | None = None` | `src/services/target/cluster-agent/commands/context.py :: CommandSpec` |
| `CommandResult` | `@staticmethod completed(cluster_id, message, *, applied=False, retryable=False, resources=None, stdout="", stderr="", **fields) -> JsonObject`; `@staticmethod failed(...)` 동일 시그니처 — 결과 dict 생성(`status/cluster_id/applied/message/retryable/resources/stdout/stderr` + 추가 필드) | `src/services/target/cluster-agent/commands/context.py :: CommandResult` |
| `CommandContext` | `@dataclass(frozen=True) class CommandContext[PayloadT]` — 필드 `action: str`, `cluster_id: str`, `cluster_role: str`, `payload: PayloadT`, `raw_payload: JsonObject`, `kubernetes: KubernetesClient`, `spec: CommandSpec`, `metadata: Mapping[str, object] = field(default_factory=dict)`. `@property kubernetes_spec -> KubernetesCommandSpec`(k8s 커맨드 아니면 `RuntimeError`), `def ok(self, message, *, applied=False, **fields) -> JsonObject`, `def fail(...)` | `src/services/target/cluster-agent/commands/context.py :: CommandContext` |

#### `commands/kubernetes.py`

모듈 상수: `CORE_API_GROUP="core"`, `TARGET_CLUSTER_ROLE="target"`, `MANAGEMENT_CLUSTER_ROLE="management"`, `TARGET_AGENT_NAMESPACE="target"`, `MANAGEMENT_AGENT_NAMESPACE="management"`, `TARGET_AGENT_DEPLOYMENT_NAME="cluster-agent"`, `TARGET_AGENT_POLICY_CONFIGMAP_NAME="target-agent-policy"`, `MERGE_PATCH_CONTENT_TYPE="application/merge-patch+json"`, `TARGET_AGENT_ALLOWED_VERBS={"get", "patch", "apply"}`.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `KubernetesGetPayload` | `class KubernetesGetPayload(StrictModel)` — `namespace: str`, `name: str` | `src/services/target/cluster-agent/commands/kubernetes.py :: KubernetesGetPayload` |
| `KubernetesPatchPayload` | `class KubernetesPatchPayload(KubernetesGetPayload)` — `patch: dict[str, Any] = Field(default_factory=dict)`, `body: dict[str, Any] | None = None`; `def patch_body(self) -> JsonObject` — `body` 우선, 둘 다 비면 `ValueError("kubernetes patch command requires a patch body")` | `src/services/target/cluster-agent/commands/kubernetes.py :: KubernetesPatchPayload` |
| `KubernetesScalePayload` | `class KubernetesScalePayload(KubernetesGetPayload)` — `replicas: int = Field(ge=0)`; `def patch_body(self) -> JsonObject` = `{"spec": {"replicas": replicas}}` | `src/services/target/cluster-agent/commands/kubernetes.py :: KubernetesScalePayload` |
| `KubernetesCommandPolicy` | `def __init__(self, cluster_role: str) -> None`; `def ensure_allowed(self, spec: KubernetesCommandSpec, payload: object) -> None`; `def target_agent_namespace(self) -> str`; `def field(self, payload: object, name: str) -> object` | `src/services/target/cluster-agent/commands/kubernetes.py :: KubernetesCommandPolicy` |
| `KubernetesApiClient` | `def __init__(self, *, base_url: str | None = None, token_path: str = KUBERNETES_SERVICEACCOUNT_TOKEN_PATH, ca_cert_path: str = KUBERNETES_SERVICEACCOUNT_CA_CERT_PATH, timeout_seconds: int = KUBERNETES_API_TIMEOUT_SECONDS) -> None`; `async def get_namespaced_resource(...)`, `async def patch_namespaced_resource(...)`(`KubernetesClient` 프로토콜 구현, PATCH는 `application/merge-patch+json`); `async def request(self, method, path, *, body=None, content_type=None) -> httpx.Response`; `def namespaced_resource_path(*, api_group, version, namespace, resource, name, subresource=None) -> str`; `def base_url(self) -> str`; `def auth_headers(self) -> dict[str, str]`; `def response_body(self, response) -> JsonObject` | `src/services/target/cluster-agent/commands/kubernetes.py :: KubernetesApiClient` |

`KubernetesCommandPolicy.ensure_allowed` 규칙 (위반 시 전부 `PermissionError`):
1. `spec.scope != "target-agent"` → `"{scope} Kubernetes commands are not enabled"`.
2. `cluster_role == "management"` 이고 `spec.verb != "get"` → `"management agent cannot control management workloads"`로 거부. RBAC가 잘못 열려도 management agent는 자기 Deployment/ConfigMap을 patch/apply/scale 하지 못한다.
3. `spec.verb not in {"get", "patch", "apply"}` → 거부.
4. `spec.resource not in {"deployments", "configmaps"}` → 거부.
5. payload의 `namespace`/`name`은 비어 있지 않은 str 필수(`"kubernetes command payload requires {name}"`).
6. namespace는 role별 고정: `management` role → `"management"`, 그 외 → `"target"`.
7. deployments는 `name == "cluster-agent"`, configmaps는 `name == "target-agent-policy"`만 허용(name-scoped).

`namespaced_resource_path`: `api_group ∈ {"", "core"}` → `/api/{version}/...`, 그 외 → `/apis/{api_group}/{version}/...`; 최종 `/namespaces/{namespace}/{resource}/{name}[/{subresource}]`.

#### `commands/outbox.py`

모듈 상수: `COMMAND_RESULT_STATUS_ABANDONED = "abandoned"`, `COMMAND_RESULT_STATUS_PENDING = "pending"`.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `CommandResultRecord` | `@dataclass(frozen=True)` — `command_id: str`, `workspace_id: str`, `lease_id: str`, `agent_id: str`, `result: JsonObject`, `attempt_count: int` | `src/services/target/cluster-agent/commands/outbox.py :: CommandResultRecord` |
| `CommandResultOutbox` | `def __init__(self, db_path: str) -> None`(부모 디렉터리 생성, sqlite `timeout=5.0`, WAL, `busy_timeout=5000`); `__enter__/__exit__/__del__/close/connection`; `def init_schema(self) -> None`; `def ensure_columns(self) -> None`(구버전 테이블에 `status` 컬럼 추가 마이그레이션); `def enqueue_result(self, *, command_id, workspace_id, lease_id, agent_id, result, now=None) -> None`(UPSERT, status=pending, attempt 0 유지); `def next_result(self) -> CommandResultRecord | None`(pending 중 `created_at` 오름차순 1건, result_json이 dict 아니면 `{"raw_result": ...}`); `def mark_sent(self, command_id: str) -> None`(행 삭제); `def record_failure(self, command_id, error, max_attempts, now=None) -> bool`(attempt_count+1, `attempt_count >= max(1, max_attempts)`면 abandoned 전환 후 `True`); `def pending_count(self) -> int`; `def abandoned_count(self) -> int` | `src/services/target/cluster-agent/commands/outbox.py :: CommandResultOutbox` |

#### `commands/registry.py`

모듈 상수/타입: `COMMAND_SPEC_ATTRIBUTE = "__target_agent_command_spec__"`, `CommandHandler = Callable[[CommandContext[Any]], Awaitable[JsonObject]]`.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `RegisteredCommand` | `@dataclass(frozen=True)` — `spec: CommandSpec`, `handler: CommandHandler` | `src/services/target/cluster-agent/commands/registry.py :: RegisteredCommand` |
| `AgentCommandRegistry` | `def __init__(self, *, cluster_id, cluster_role, kubernetes: KubernetesClient, default_handler: CommandHandler, kubernetes_policy: KubernetesCommandPolicy | None = None) -> None`; `@classmethod def from_instance(cls, instance, *, cluster_id, cluster_role, kubernetes, default_handler) -> AgentCommandRegistry`(`dir(instance)` 스캔으로 데코레이트된 바운드 메서드 자동 등록); `def register(self, spec, handler) -> None`(중복 action이면 `ValueError("duplicate target-agent command handler: ...")`); `async def execute(self, action, payload, *, metadata=None) -> JsonObject`; `def validate_payload(self, spec, payload) -> object` | `src/services/target/cluster-agent/commands/registry.py :: AgentCommandRegistry` |
| `command_handler` | `def command_handler(action: str, *, payload_model: PayloadModel | None = None) -> Callable[[CommandHandler], CommandHandler]` — 핸들러에 `CommandSpec` attribute 부착 | `src/services/target/cluster-agent/commands/registry.py :: command_handler` |
| `kubernetes_command` | `def kubernetes_command(action: str, *, api_group: str, version: str, resource: str, verb: KubernetesVerb, scope: KubernetesScope = "target-agent", payload_model: PayloadModel | None = None) -> Callable[[CommandHandler], CommandHandler]` | `src/services/target/cluster-agent/commands/registry.py :: kubernetes_command` |
| `command_spec` | `def command_spec(handler: Any) -> CommandSpec | None` — attribute 직접 조회 후 `__func__`(바운드 메서드) fallback | `src/services/target/cluster-agent/commands/registry.py :: command_spec` |
| `CommandDecorators` / `command` | `class CommandDecorators: handler = staticmethod(command_handler); k8s = staticmethod(kubernetes_command)` — 싱글턴 `command = CommandDecorators()`. 사용 규칙: `@command.handler(action)`, `@command.k8s(action, api_group=..., verb=...)` | `src/services/target/cluster-agent/commands/registry.py :: CommandDecorators` |

### `control/` — 정책 동기화·desired state reconcile·로컬 저장소

`control/__init__.py` 재노출: `AgentControlStore`, `AgentPolicySync`, `ArgoObserver`, `DesiredStateReconciler`, `KubernetesArgoObserver`, `ReconcileResult`.

#### `control/argocd_observer.py`

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `ArgoObserver` | Protocol — `async def snapshot(self) -> JsonObject` | `src/services/target/cluster-agent/control/argocd_observer.py :: ArgoObserver` |
| `KubernetesArgoObserver` | `def __init__(self, *, base_url: str \| None = None, token: str \| None = None, transport: httpx.AsyncBaseTransport \| None = None, limit: int = 200) -> None`; `async def snapshot(self) -> JsonObject` | `src/services/target/cluster-agent/control/argocd_observer.py :: KubernetesArgoObserver` |
| `normalize_application` | Argo Application의 `metadata`, `spec.source`/`spec.sources[]`, `status.sync`, `status.health`, `status.operationState`를 repo/revision/path와 사후 검증 상태로 정규화 | `src/services/target/cluster-agent/control/argocd_observer.py :: normalize_application` |
| `normalize_rollout` | Argo Rollout의 phase, `stableRS`, `currentPodHash`, message, abort를 읽어 stable/current revision과 실패 여부로 정규화 | `src/services/target/cluster-agent/control/argocd_observer.py :: normalize_rollout` |

observer는 cluster-wide Application/Rollout collection에 각각 GET 1회만 수행한다. 응답의
`metadata.continue`가 있으면 `truncated=true`로 명시하며 추측성 후속 페이지 합성은 하지 않는다.
403/404는 해당 CRD collection을 `available=false, items=[]`로 반환하고 POST/PATCH 등 write
fallback은 없다. `stable_revision`은 Git revision이 아니라 Rollout `status.stableRS`의
stable ReplicaSet hash다. Application source의 `repoURL`은 URL userinfo를 제거한 뒤 보고해
내장 credential이 management plane 상태에 저장되지 않게 한다.

#### `control/policy.py`

모듈 상수: `TRACER = get_tracer("target-cluster-agent.policy")`, `LOGGER`, `PolicyApplier = Callable[[AgentPolicy], JsonObject]`.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `AgentPolicySync` | `def __init__(self, *, cluster_id: str, store: AgentControlStore, default_policy: AgentPolicy, apply_policy: PolicyApplier, interval_seconds: int) -> None`; `def apply_stored_or_default(self) -> JsonObject`; `async def run(self, client: ManagementPlaneClient) -> None`; `async def sync_once(self, client: ManagementPlaneClient) -> str`(반환: `"unchanged" | "applied" | "failed"`); `def payload_generation(self, payload: JsonObject, fallback: int) -> int` | `src/services/target/cluster-agent/control/policy.py :: AgentPolicySync` |

#### `control/reconciler.py`

모듈 상수: `TRACER = get_tracer("target-cluster-agent.reconciler")`, `LOGGER`, `RECONCILE_APPLIED = "applied"`, `RECONCILE_FAILED = "failed"`, `RECONCILE_UNCHANGED = "unchanged"`.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `ResourceApplier` | Protocol — `async def observe(self, resource: DesiredResource) -> None`, `async def apply(self, resource: DesiredResource) -> None` | `src/services/target/cluster-agent/control/reconciler.py :: ResourceApplier` |
| `KubernetesResourceClient` | `def base_url(self) -> str`; `def auth_headers(self) -> dict[str, str]`; `async def apply(self, resource: DesiredResource) -> None`(merge-patch → 404면 POST 생성); `async def observe(self, resource: DesiredResource) -> None`(GET); `def resource_path(self, resource) -> str`; `def collection_path(self, resource) -> str`; `def default_manifest(self, resource) -> dict[str, object]` | `src/services/target/cluster-agent/control/reconciler.py :: KubernetesResourceClient` |
| `DesiredStateReconciler` | `def __init__(self, *, cluster_id: str, cluster_role: str, store: AgentControlStore, interval_seconds: int, resource_applier: ResourceApplier | None = None, reconciler_mode: str = "builtin", argo_observer: ArgoObserver | None = None) -> None`; `async def run(self, client: ManagementPlaneClient) -> None`; `async def reconcile_once(self, policy: AgentPolicy | None = None) -> dict[str, object]`; `async def reconcile_resource(self, resource: DesiredResource) -> ReconcileResult`; `def ensure_allowed(self, resource: DesiredResource) -> None`; `def policy_resources(self, policy: AgentPolicy) -> Iterable[DesiredResource]`(`bootstrap.resources` + `desired_state.resources` 순서); `def result(self, resource, desired_hash, status, message) -> ReconcileResult` | `src/services/target/cluster-agent/control/reconciler.py :: DesiredStateReconciler` |

`KubernetesResourceClient` 경로 규칙: `ConfigMap` → `/api/v1/namespaces/{ns}/configmaps[/{name}]`, 그 외(`Deployment`) → `/apis/apps/v1/namespaces/{ns}/deployments[/{name}]`. `default_manifest`는 `resource.state`가 비었을 때 `{apiVersion, kind, metadata{name, namespace}}` 뼈대를 만든다(`ConfigMap`→`v1`, 그 외→`apps/v1`).

#### `control/store.py`

모듈 상수: `ACTIVE_POLICY_ID = "active"`, `RECONCILE_STATUS_APPLIED = "applied"`, `RECONCILE_STATUS_UNCHANGED = "unchanged"`, `SUCCESSFUL_RECONCILE_STATUSES = {"applied", "unchanged"}`.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `ReconcileResult` | `@dataclass(frozen=True)` — `resource_id: str`, `scope: str`, `kind: str`, `namespace: str`, `name: str`, `desired_hash: str`, `status: str`, `message: str` | `src/services/target/cluster-agent/control/store.py :: ReconcileResult` |
| `AgentControlStore` | `def __init__(self, db_path: str) -> None`(sqlite WAL, busy_timeout 5000); `__enter__/__exit__/__del__/close/connection`; `def init_schema(self) -> None`; `def save_policy(self, policy: AgentPolicy) -> None`(policy_id=`"active"` UPSERT, `model_dump_json()` 저장); `def load_policy(self) -> AgentPolicy | None`(`model_validate_json`); `def active_generation(self) -> int`(없으면 0); `def last_successful_resource_hash(self, resource_id: str) -> str | None`(status가 applied/unchanged일 때만); `def save_reconcile_result(self, result: ReconcileResult) -> None`(UPSERT) | `src/services/target/cluster-agent/control/store.py :: AgentControlStore` |
| `desired_resource_hash` | `def desired_resource_hash(resource: DesiredResource) -> str` — `model_dump()`를 `json.dumps(sort_keys=True, separators=(",", ":"))`로 정규화 후 SHA-256 hex | `src/services/target/cluster-agent/control/store.py :: desired_resource_hash` |

### `evidence/` — 수집 오케스트레이션·잡 스케줄러

`evidence/__init__.py` 재노출: `EvidenceCollector`, `EvidenceJobScheduler`, `KubernetesSnapshotProvider`, `LokiLogsProvider`, `MetadataProvider`, `PrometheusMetricsProvider`, `TelemetryProvider`, `TelemetryQueryDefinition`, `TelemetryQueryRegistry`, `TempoTracesProvider`.

#### `evidence/collector.py`

모듈 상수: `TRACER = get_tracer("target-cluster-agent.evidence")`, `LOGGER`. `__all__`에 provider 클래스 재노출 포함.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `EvidenceCollector` | `def __init__(self, providers: Iterable[TelemetryProvider], registry: TelemetryQueryRegistry | None = None) -> None`(`self.providers = {provider.evidence_key: provider}`); `def register_query(self, definition) -> TelemetryQueryDefinition`; `def replace_queries(self, source: TelemetrySource, definitions: tuple[TelemetryQueryDefinition, ...]) -> tuple[...]`; `def refresh_provider_queries(self) -> None`; `async def collect_evidence(self) -> JsonObject`(전체 provider); `async def collect(self, *evidence_keys: str) -> JsonObject`; `async def collect_query_policy(self, evidence_key: str, definitions: tuple[TelemetryQueryDefinition, ...]) -> JsonObject`; `async def run_query(self, definition: TelemetryQueryDefinition) -> ProviderResult` | `src/services/target/cluster-agent/evidence/collector.py :: EvidenceCollector` |

#### `evidence/jobs.py`

모듈 상수: `DEFAULT_JOB_POLL_SECONDS = 1.0`, `DEFAULT_JOB_POLL_TIMEOUT_SECONDS = 10`, `LOGGER`.

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `EvidenceSource` | Protocol — `async def collect(self, *evidence_keys: str) -> JsonObject` | `src/services/target/cluster-agent/evidence/jobs.py :: EvidenceSource` |
| `EvidenceJobScheduler` | `def __init__(self, *, cluster_id, workspace_id, agent_id, source_id, collector: EvidenceSource, provider_keys: tuple[str, ...], provider_worker_counts: Mapping[str, int], interval_seconds: int) -> None`; `async def run(self, client) -> None`; `async def schedule_forever(self, client) -> None`; `async def schedule_once(self, client, now=None) -> str | None`; `def due_provider_keys(self, now: float) -> tuple[str, ...]`; `async def work_forever(self, client, provider_key, worker_id) -> None`; `async def work_once(self, client, provider_key, worker_id) -> bool`; `async def collect_job(self, job: JsonObject, provider_key: str) -> JsonObject`; `def job_query_definitions(self, job, provider_key) -> tuple[TelemetryQueryDefinition, ...]`; `def configure_schedule(self, *, provider_intervals: Mapping[str, int], enabled_provider_keys: set[str]) -> None`; `def set_worker_counts(self, provider_worker_counts: Mapping[str, int]) -> None`; `def current_worker_counts(self) -> dict[str, int]`; `def reconcile_worker_pools(self, client) -> None`; `def reconcile_worker_pool(self, provider_key, client) -> None`; `def prune_finished_workers(self) -> None`; `async def stop_workers(self) -> None`; `def next_worker_id(self, provider_key: str) -> str`(`"{provider_key}-worker-{n}"`); `def new_window_start(self, now: float) -> str`(interval 경계로 내림한 UTC ISO) | `src/services/target/cluster-agent/evidence/jobs.py :: EvidenceJobScheduler` |

### `providers/` — 텔레메트리 소스별 수집기

`providers/__init__.py`는 `pkgutil.iter_modules`로 `*_providers` 모듈을 자동 import한다(import 시 `@telemetry.source` 데코레이터가 레지스트리에 등록됨 — 새 소스 추가는 파일 1개 추가). 재노출: `ConfigReader`, `KubernetesSnapshotProvider`, `LokiLogsProvider`, `MetadataProvider`, `PrometheusMetricsProvider`, `ProviderResult`, `TelemetryProvider`, `TempoTracesProvider`.

#### `providers/base.py`

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `TRACER` | `TRACER = get_tracer("target-cluster-agent.evidence")` | `src/services/target/cluster-agent/providers/base.py :: TRACER` |
| `ProviderResult` | `ProviderResult = JsonObject | list[JsonObject]` | `src/services/target/cluster-agent/providers/base.py :: ProviderResult` |
| `ConfigReader` | Protocol — `def __call__(self, name: str, default: str) -> str` | `src/services/target/cluster-agent/providers/base.py :: ConfigReader` |
| `TelemetryProvider` | Protocol — 속성 `evidence_key: str`, `source: str`, `span_name: str`, `query_count_attribute: str`, `result_count_attribute: str`, `timeout_seconds: int`, `failure_message: str`, `queries: tuple[Any, ...]`; `@classmethod def from_config(cls, read_config: ConfigReader) -> TelemetryProvider`; `async def query(self, client: httpx.AsyncClient, telemetry_query: Any) -> JsonObject`; `def empty_results(self) -> Any`; `def append_result(self, results, telemetry_query, payload) -> None`; `def build_response(self, results) -> ProviderResult` | `src/services/target/cluster-agent/providers/base.py :: TelemetryProvider` |

#### 등록된 소스 계약 (5종)

| source | evidence_key | query_type | range_query_type | empty_payload | 클래스 앵커 |
|---|---|---|---|---|---|
| `kubernetes` | `kubernetes` | `KubernetesSnapshotQuery` | — | `dict` | `src/services/target/cluster-agent/providers/kubernetes_providers.py :: KubernetesSnapshotProvider` |
| `prometheus` | `metrics` | `PrometheusInstantQuery` | `PrometheusRangeQuery` | `dict` | `src/services/target/cluster-agent/providers/prometheus_providers.py :: PrometheusMetricsProvider` |
| `loki` | `logs` | `LokiLogQuery` | — | `list` | `src/services/target/cluster-agent/providers/loki_providers.py :: LokiLogsProvider` |
| `tempo` | `traces` | `OpenTelemetrySpanQuery` | — | `dict` | `src/services/target/cluster-agent/providers/tempo_providers.py :: TempoTracesProvider` |
| `metadata` | `metadata` | `MetadataSnapshotQuery` | — | `dict` | `src/services/target/cluster-agent/providers/metadata_providers.py :: MetadataProvider` |

#### `providers/kubernetes_providers.py`

`KubernetesSnapshotProvider`: `span_name="kubernetes.collect"`, `query_count_attribute="kubernetes.query_count"`, `result_count_attribute="kubernetes.result_count"`, `timeout_seconds=KUBERNETES_API_TIMEOUT_SECONDS`, `failure_message="kubernetes snapshot collection failed"`.

```python
def __init__(self, *, cluster_id: str, transport: httpx.AsyncBaseTransport | None = None) -> None
@classmethod
def from_config(cls, read_config: ConfigReader) -> KubernetesSnapshotProvider   # cluster_id = read_config("TARGET_CLUSTER_ID", Target.DEFAULT_CLUSTER_ID)
async def query(self, _client: httpx.AsyncClient, telemetry_query: KubernetesSnapshotQuery) -> JsonObject
async def get_json(self, client, base_url, headers, path, *, allow_not_found: bool = False) -> JsonObject   # allow_not_found=True 면 403/404 를 {"items": []} 로 처리
def empty_results(self) -> JsonObject
def append_result(self, results: JsonObject, telemetry_query, payload: JsonObject) -> None
def build_response(self, results: JsonObject) -> JsonObject
def normalize_payload(self, payload: JsonObject, telemetry_query) -> JsonObject
```

#### `providers/kubernetes_utils.py`

공용 Kubernetes helper와 상수: `K8S_KIND_CONFIG_MAP`, `K8S_KIND_DEPLOYMENT`, `K8S_KIND_REPLICA_SET`, `K8S_KIND_SECRET`, `K8S_DEPLOYMENT_REVISION_ANNOTATION`, `K8S_ENDPOINT_SLICE_SERVICE_NAME_LABEL`, `K8S_RESOURCE_CONFIG_MAPS`, `K8S_RESOURCE_DEPLOYMENTS`, `K8S_RESOURCE_ENDPOINT_SLICES`, `K8S_RESOURCE_PODS`, `K8S_RESOURCE_REPLICASETS`, `K8S_RESOURCE_RESOURCE_QUOTAS`, `K8S_RESOURCE_SECRETS`, `K8S_RESOURCE_SERVICES`, `items(payload) -> list[JsonObject]`, `metadata(item)`, `status(item)`, `spec(item)`, `list_items(value)`, `object_or_empty(value)`, `compact_dict(value)`, `resource_identity_snapshot(resource)`, `resource_identity_key(identity)`, `resource_sort_key(resource)`. `kubernetes_providers.py`와 `metadata_*` 모듈이 같은 helper를 import해 Kubernetes list response와 object section을 같은 방식으로 다룬다.

`providers/collection_limits.py`는 provider payload가 `EvidenceJobResultRequest`의 1MiB JSON 제한을 넘길 위험을 줄이기 위해 큰 list를 자르고, 잘린 경우 `collection_limits{truncated,lists}`를 붙이는 공통 helper다. 먼저 list별 개수 상한을 적용하고, 그 뒤 JSON byte 크기가 여전히 크면 JSON byte 크기가 가장 큰 list부터 추가로 줄인다. 단일 항목만으로도 너무 크면 해당 list는 0개까지 줄어들 수 있다. `collection_limits.lists.<field>.original_count`는 제한 전 전체 개수, `returned_count`는 최종 payload에 담긴 개수다. 기존 list field 이름은 유지하고, `collection_limits`는 잘린 경우에만 추가한다.

`kubernetes_providers.py`의 provider 전용 함수: `empty_snapshot(cluster_id) -> JsonObject`, `merge_snapshot(target, source) -> None`, `merge_cluster_scoped_nodes(target, source) -> None`, `limit_kubernetes_snapshot(snapshot) -> JsonObject`, `active_replicasets(rows)`, `safe_labels(item, limit=12)`, `owner_ref(item) -> tuple[str | None, str | None]`, `as_text(value)`, `pod_summary(item)`, `container_summary(item)`, `event_summary(item)`, `event_reason_summary(item)`, `node_summary(item)`, `workload_summaries(kind, rows)`, `workload_summary(kind, item)`, `service_summary(item)`, `endpoint_slice_summary(item)`, `workload_key(namespace, kind, name) -> str | None`(`"{ns}/{kind}/{name}"`). `container_summary`는 Kubernetes `containerStatuses[]`에서 `containerID`, `image`, `imageID`, 현재 state 요약, 직전 lastState의 reason/message/exit code/time을 작은 필드로 남긴다. `event_summary`는 `reason_summary{category,signal,symptom,scheduling_causes}`를 추가해 `FailedScheduling`, `Unhealthy`, `BackOff` 같은 Event를 RCA가 바로 읽을 수 있게 한다. `limit_kubernetes_snapshot`은 `pods`, `events`, `nodes`, `workloads`, `services`, `endpoints` 같은 큰 list가 너무 길면 일부만 전송하고 `collection_limits`에 원래 개수와 최종 반환 개수를 남긴다. 앵커: `src/services/target/cluster-agent/providers/kubernetes_providers.py :: <함수명>`.

#### `providers/prometheus_providers.py`

`PrometheusMetricsProvider`: `span_name="prometheus.collect"`, `timeout_seconds=PROMETHEUS_TIMEOUT_SECONDS`, `failure_message="prometheus metrics collection failed"`.

```python
def __init__(self, base_url: str) -> None                     # rstrip("/")
async def query(self, client, telemetry_query: PrometheusInstantQuery | PrometheusRangeQuery) -> JsonObject
async def query_instant(self, client, telemetry_query: PrometheusInstantQuery) -> JsonObject
async def query_range(self, client, telemetry_query: PrometheusRangeQuery) -> JsonObject
def empty_results(self) -> JsonObject
def append_result(self, results, telemetry_query, payload) -> None     # results[metric_name] = {query, ...metadata, ...normalized, analysis}
def build_response(self, results) -> JsonObject                        # {"source": "prometheus", "results": results}
def normalize_payload(self, payload: JsonObject) -> JsonObject
def query_metadata(self, telemetry_query) -> JsonObject                # instant: {query_mode}, range: {query_mode, range_seconds, step_seconds}
```

`normalize_payload`: `resultType == "vector"` → `{result_type, samples: [{metric, timestamp, value(float)}]}`; `"matrix"` → `{result_type, series: [{metric, values: [{timestamp, value}]}], point_count}`; 그 외 → `{result_type, result}` 원본. `append_result`는 여기에 `providers/prometheus_analysis.py::build_metric_analysis()` 결과를 추가해 `analysis`를 담는다. `analysis`는 항상 `{metric_kind, unit, signals}`를 포함하고, 숫자 point가 있으면 `value_summary`, known metric이면 `threshold`, range query에서 비교 가능한 series가 있으면 `baseline_comparison`을 추가한다. 큰 vector/matrix 결과는 전송 전에 `samples`, `series`, `series[].values`, `result`를 제한하고, 잘린 경우 query 결과 object 안에 `collection_limits`를 추가한다. matrix의 `series.values` 제한 정보는 byte 제한으로 최종 `series` 목록이 다시 줄어든 뒤 재계산한다. `analysis`는 제한 전 normalized payload를 기준으로 계산해 sample/series/point count 해석이 줄어든 샘플 때문에 바뀌지 않게 한다.

`providers/prometheus_analysis.py`: Prometheus sample/series 숫자만 보고 RCA용 작은 해석 필드를 만든다. 새 query를 추가하거나 외부 baseline을 조회하지 않는다. ratio 계열은 0.8 warning/0.9 critical, `up < 1`은 critical, restart/not ready/scrape error/throttling 계열은 `> 0`이면 warning으로 표시한다. range query의 baseline은 같은 window의 첫 point다.

#### `providers/loki_providers.py`

`LokiLogsProvider`: `span_name="loki.collect"`, `timeout_seconds=LOKI_TIMEOUT_SECONDS`, `failure_message="loki log collection failed"`. `__init__(self, base_url: str)`, `from_config`은 `read_config("LOKI_BASE_URL", DEFAULT_LOKI_BASE_URL)`. `empty_results() -> list[JsonObject]` = `[]`. `append_result`는 `{"source": "loki", "query_name", "query": logql, result_type, streams, line_count, pattern_counts, severity_counts, trace_ids, matched_entries, collection_limit, redaction_summary}`를 리스트에 append. `normalize_payload`: `data.result[*]` → `streams: [{stream, values: [{timestamp, line, line_truncated?, original_line_length?}], line_count, pattern_counts, severity_counts, trace_ids}]`, `line_count = Σ len(values)`. `line` 값은 공용 `src/packages/security/log_lines.py`의 `redact_log_line`/`truncate_log_line`로 민감정보를 마스킹한 뒤 최대 4096자로 제한한 문자열이고, 브라우저 로그 경계도 같은 primitive를 defense-in-depth로 다시 적용한다. `pattern_counts`/`severity_counts`/`trace_ids`는 마스킹된 line 기준으로 query 전체와 stream별로 계산한다. `matched_entries[]`는 RCA가 바로 읽는 진단 요약이며 `{timestamp, namespace, pod, container, severity, message, matched_patterns, trace_id, line_truncated}`를 담는다. trace id가 없으면 `trace_id=null`이다.

#### `providers/tempo_providers.py`

`TempoTracesProvider`: `span_name="tempo.collect"`, `timeout_seconds=TEMPO_TIMEOUT_SECONDS`, `failure_message="tempo trace collection failed"`. `__init__(self, base_url: str)`, `from_config`은 `read_config("TEMPO_BASE_URL", DEFAULT_TEMPO_BASE_URL)`. `append_result`: `results[query_name] = {"query": traceql, "traces": [...], "trace_count": n, "analysis": {...}}`. `normalize_payload`는 trace 내부 긴 문자열을 최대 1024자로 제한하고, 중첩 list는 최대 20개로 제한한다. 그래도 한 trace가 크면 RCA용 trace summary와 `trace_truncated/original_trace_bytes`만 남기고, 전체 result가 크면 `collection_limits`로 `traces` list를 추가 제한한다. `analysis`는 `providers/tempo_analysis.py`가 Tempo search 결과에서 `trace_summaries`, `trace_ids`, `services`, `operations`, `status_counts`, `error_count`, `dependency_count`, `duration_ms`를 만든다. span summary가 있으면 `span_count`, `error_span_count`, `dependency_span_count`도 추가한다. trace summary는 최대 20개, trace당 span summary는 최대 8개만 만든다. `build_response`: `{"source": "tempo", "results": results}`.

#### `providers/metadata_providers.py`

`MetadataProvider`: `source="metadata"`, `evidence_key="metadata"`, `span_name="metadata.collect"`, `timeout_seconds=KUBERNETES_API_TIMEOUT_SECONDS`, `failure_message="metadata collection failed"`. `__init__(self, *, cluster_id: str, transport: httpx.AsyncBaseTransport | None = None)`, `from_config`은 `read_config("TARGET_CLUSTER_ID", Target.DEFAULT_CLUSTER_ID)`.

Metadata helper 모듈(module, 파이썬 코드 파일):

- `providers/metadata_workload_snapshots.py`: summary/detail Deployment snapshot, container image/probe/resources/PVC refs/auth 요약, 단건 detail scheduling constraints 요약, Deployment/Pod/ReplicaSet status 요약, 안전한 annotation 요약을 만든다. 큰 Deployment에서는 `pod_statuses`와 `replicaset_revisions`를 샘플로 제한하고 count/truncated flag를 남긴다.
- `providers/metadata_config_refs.py`: env/envFrom/volume의 ConfigMap/Secret reference 요약을 만든다. 같은 분석 결과를 단건 detail의 referenced ConfigMap/Secret 객체 조회에도 재사용한다. reference name/key/path만 남기고 secret 값은 읽지 않는다.
- `providers/metadata_config_objects.py`: 단건 detail에서 참조된 ConfigMap/Secret 객체의 안전한 metadata 요약과 명시 key 존재 여부를 만든다. 객체 값, raw object, annotations, 전체 key 목록은 남기지 않는다.
- `providers/metadata_endpoint_slices.py`: EndpointSlice ready endpoint 요약을 만든다. Service 이름, EndpointSlice 이름, ready/not ready count, ready target Pod namespace/name만 남기고 endpoint IP address는 남기지 않는다. EndpointSlice condition 기본값은 Kubernetes API 해석을 따른다. `ready`와 `serving` 생략/null은 true, `terminating` 생략/null은 false로 본다. ports와 ready target 목록은 샘플로 제한하고 truncated flag를 남긴다.
- `providers/metadata_service_selectors.py`: Service selector와 Pod labels를 비교하고, 단건 Deployment detail query에서는 관련 Service만 남긴다. matched Pod 목록은 샘플로 제한하고 `matched_pod_count`에는 전체 수를 남긴다.
- `providers/metadata_resource_quotas.py`: ResourceQuota status.hard/status.used 요약을 만든다. raw spec/status, annotations, managedFields는 남기지 않는다.
- `providers/metadata_ownership.py`: Deployment -> ReplicaSet -> Pod 소유 관계를 찾고 ReplicaSet을 revision 기준으로 정렬한다. 기준 Deployment/ReplicaSet UID를 알고 있으면 UID match만 인정하고, 기준 UID 자체를 알 수 없을 때만 이름을 fallback으로 쓴다.

이 helper 모듈들은 event를 발행하지 않고 telemetry source도 등록하지 않는다. `@telemetry.source`로 등록되는 metadata telemetry source는 `providers/metadata_providers.py`의 `MetadataProvider` 하나뿐이다.

현재 `query()`는 `MetadataSnapshotQuery.query` 값으로 scope를 고른다. `change_context`, `current_workload_snapshots`, `deployments`는 `TARGET_NAMESPACE`의 `/apis/apps/v1/namespaces/{namespace}/deployments`, `/apis/apps/v1/namespaces/{namespace}/replicasets`, `/api/v1/namespaces/{namespace}/pods`, `/api/v1/namespaces/{namespace}/services`, `/api/v1/namespaces/{namespace}/resourcequotas`, `/apis/discovery.k8s.io/v1/namespaces/{namespace}/endpointslices`를 조회하고 `change_context.current_workload_snapshots[]`에 Deployment별 요약을 담는다. `<namespace>`는 해당 namespace의 전체 summary query로 처리한다. RCA test run에서 `metadata` provider가 요청되고 target resource가 Deployment이면 release-flow-worker가 `deployment/<namespace>/<resource_name>` detail query를 넣어 같은 namespace 안의 다른 RCA test resource와 섞이지 않게 한다. Deployment name이 없으면 `<namespace>` summary query로 fallback한다. `deployment/<name>`, `deployment/<namespace>/<name>`, `<namespace>/<name>`은 `/apis/apps/v1/namespaces/{namespace}/deployments/{name}` 단건과 같은 namespace의 ReplicaSet/Pod/Service/ResourceQuota/EndpointSlice 목록을 조회하고, Deployment가 참조하는 ConfigMap/Secret 객체를 `/api/v1/namespaces/{namespace}/configmaps/{name}` 또는 `/api/v1/namespaces/{namespace}/secrets/{name}`로 개별 조회한다. 단건 결과는 `change_context.current_workload_snapshot`과 `change_context.referenced_config_objects[]`에 담는다.

전체 조회 summary snapshot 필드: `workload{kind,namespace,name}`, `deployment_labels`, `pod_template_labels`, `pod_template_auth{service_account_name,automount_service_account_token,image_pull_secret_refs[{name}]}`, `persistent_volume_claim_refs[{volume_name,claim_name}]`, `deployment_status{observed_generation,desired_replicas,replicas,updated_replicas,ready_replicas,available_replicas,unavailable_replicas,conditions}`, `pod_statuses[{name,phase,ready,reason,message,start_time,conditions}]`, `containers[{name,image,ports[{name,container_port,protocol}],readiness_probe,liveness_probe,startup_probe,resources}]`, `replicaset_revisions[{name,revision,desired_replicas,replicas,ready_replicas,available_replicas,fully_labeled_replicas}]`. `deployment_labels`와 `pod_template_labels`는 `app`, `app.kubernetes.io/name` 같은 식별 label을 먼저 남기고 최대 12개이며 key/value에 민감 단어가 없는 안전한 subset만 남긴다. `change_context.service_selector_matches[]`는 namespace Service selector와 Pod labels 비교 결과이며 `{service{namespace,name},selector,match_status,matched_pod_count,matched_pods[{namespace,name}]}`를 담는다. Service에 selector가 없으면 `selector`는 생략될 수 있고, matched Pod가 없으면 `matched_pods`는 생략될 수 있다. `match_status`는 `matched`, `no_matching_pods`, `selector_missing` 중 하나다. `change_context.endpoint_slice_ready_endpoints[]`는 Service에 연결된 EndpointSlice readiness 요약이며 `{service{namespace,name},endpoint_slice{namespace,name},address_type,ports,endpoint_count,ready_endpoint_count,not_ready_endpoint_count,unknown_ready_endpoint_count,serving_endpoint_count,terminating_endpoint_count,ready_targets[{kind,namespace,name}]}`를 담는다. EndpointSlice condition은 Kubernetes API 해석을 따라 `ready`/`serving` 생략 또는 null을 true로, `terminating` 생략 또는 null을 false로 본다. `change_context.resource_quotas[]`는 namespace ResourceQuota 요약이며 `{name,namespace,hard,used}`를 담는다. ResourceQuota 조회가 403 Forbidden 또는 404 Not Found이면 빈 목록으로 처리한다. 전체 summary query는 namespace의 모든 Service/EndpointSlice 비교 결과를 담고, 단건 detail query는 target Deployment와 관련 있는 Service 및 그 Service의 EndpointSlice만 담는다. ResourceQuota는 workload 하나의 속성이 아니라 namespace 제한 정보라 summary/detail 모두 `change_context.resource_quotas[]`에 둔다. 단건 detail의 `target_relation`은 `exact_selector_match`, `live_pod_match`, `selector_key_overlap` 중 하나다. 단건 detail snapshot은 summary 필드에 `deployment_annotations`, `pod_template_annotations`, `managed_fields_managers`, `scheduling_constraints{node_selector,tolerations,affinity_summary}`, `containers[{env_refs,env_from_refs,volume_mount_refs}]`, `replicaset_revisions[{created_at,conditions}]`를 추가한다. 단건 detail의 `change_context.referenced_config_objects[]`는 참조된 ConfigMap/Secret 객체의 `{kind,namespace,name,exists,access,created_at,labels,referenced_by,referenced_key_checks}` 요약을 담는다. 객체가 없으면 `exists=false, access=not_found`, 권한이 없으면 `exists=null, access=forbidden`을 담는다. `referenced_key_checks[]`는 조회 성공 시 env keyRef와 volume items에서 명시한 key 존재 여부만 담고, `envFrom`은 key를 명시하지 않으므로 제외한다. `scheduling_constraints`는 단건 detail에만 있으며 `nodeSelector`는 그대로, tolerations는 작은 필드만, affinity는 boolean summary만 남긴다. annotation 요약은 `ops.service/*`, `prometheus.io/*`, `deployment.kubernetes.io/*`, `kubectl.kubernetes.io/*` 중 안전한 key만 남기고 `last-applied-configuration`과 민감 key는 제외한다. resources 요약은 requests/limits를 Kubernetes quantity 문자열 그대로 남긴다. container port 요약은 `containerPort`를 `container_port`로 보내고 `name`, `protocol`만 함께 남기며 hostPort/hostIP는 보내지 않는다. PVC refs는 Pod template volume의 `persistentVolumeClaim.claimName`만 요약하고 PVC object 자체는 담지 않는다. Pod template auth 요약은 값이 있을 때 `serviceAccountName`, `automountServiceAccountToken`, `imagePullSecrets[].name`만 담고 Secret 값은 읽거나 보내지 않는다. env/envFrom/volume 요약은 ConfigMap/Secret reference name/key/path만 남기고 값 자체는 남기지 않는다. EndpointSlice 요약은 endpoint IP address를 남기지 않는다. ResourceQuota 요약은 raw spec/status, annotations, managedFields를 남기지 않는다. Referenced ConfigMap/Secret object 요약은 Secret `data`, `binaryData`, `stringData`, ConfigMap `data`, `binaryData`, raw object, annotations, 전체 key 목록을 남기지 않는다. Deployment/Pod status condition은 summary에도 있고 ReplicaSet condition은 단건 detail에만 있다. raw Service/Pod object와 containerStatuses는 남기지 않는다. probe 요약은 `path`, `port`, `timeout_seconds`, `period_seconds`, `failure_threshold` 중 존재하는 값만 남긴다. collect fallback 또는 k8s API 미구성 시 `{"change_context": {"current_workload_snapshots": []}}`를 반환한다.

metadata provider는 evidence job result의 1MiB JSON 제한을 넘길 위험을 줄이기 위해 큰 목록을 제한한다. 먼저 `current_workload_snapshots`, `service_selector_matches`, `endpoint_slice_ready_endpoints`, `referenced_config_objects`, `resource_quotas` 같은 top-level list의 개수를 제한하고, 그래도 JSON byte 크기가 크면 JSON byte 크기가 가장 큰 list부터 추가로 줄인다. 단일 항목이 너무 크면 해당 top-level list는 0개까지 줄어들 수 있다. top-level list가 잘리면 `change_context.collection_limits`에 원래 개수와 최종 반환 개수를 남긴다. RCA evidence bundle에서는 승격된 metadata item의 `value.collection_limit`에도 같은 제한 정보가 붙는다. 항목 내부의 `matched_pods`, `ready_targets`, `pod_statuses`, `replicaset_revisions`도 샘플로 제한하고 count와 `*_truncated` flag를 남긴다. 이 제한은 provider payload를 버리는 실패보다 작은 샘플과 truncation metadata를 RCA에 전달하는 쪽이 더 안전하기 때문에 둔다.

### `queries/` — 쿼리 정의·레지스트리·커맨드 페이로드

`queries/__init__.py` 재노출: `KubernetesSnapshotQuery`, `LokiLogQuery`, `MetadataSnapshotQuery`, `OpenTelemetrySpanQuery`, `PrometheusInstantQuery`, `PrometheusRangeQuery`, `TelemetryQueryCommandPayload`, `TelemetryQueryDefinition`, `TelemetryQueryRegistry`, `TelemetrySource`.

#### `queries/payloads.py`

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `TelemetryQueryCommandPayload` | `class TelemetryQueryCommandPayload(StrictModel)` — `query: dict[str, Any]`; `def definition_payload(self) -> JsonObject`(그대로 반환) | `src/services/target/cluster-agent/queries/payloads.py :: TelemetryQueryCommandPayload` |

#### `queries/registry.py`

`TelemetrySource = str` (소스 목록은 `@telemetry.source` 등록이 단일 출처).

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `TelemetryQueryDefinition` | `@dataclass(frozen=True)` — `source: TelemetrySource`, `name: str`, `description: str`, `query: str`, `range_seconds: int | None = None`, `step_seconds: int | None = None`; `@classmethod def from_mapping(cls, payload: dict[str, Any]) -> Self`; `def to_provider_query(self) -> Any` | `src/services/target/cluster-agent/queries/registry.py :: TelemetryQueryDefinition` |
| `TelemetryQueryRegistry` | `def __init__(self, definitions: tuple[TelemetryQueryDefinition, ...] = ()) -> None`(key = `(source, name)`); `def register(self, definition) -> TelemetryQueryDefinition`; `def register_many(self, definitions) -> tuple[...]`; `def replace_source(self, source, definitions) -> tuple[...]`(해당 source 정의 전부 교체); `def get(self, source, name) -> TelemetryQueryDefinition`(없으면 `ValueError("unknown telemetry query: {source}/{name}")`); `def for_source(self, source) -> tuple[...]` | `src/services/target/cluster-agent/queries/registry.py :: TelemetryQueryRegistry` |
| `PrometheusInstantQuery` | `@dataclass(frozen=True)` — `metric_name: str`, `description: str`, `promql: str` | `src/services/target/cluster-agent/queries/registry.py :: PrometheusInstantQuery` |
| `PrometheusRangeQuery` | `@dataclass(frozen=True)` — `metric_name: str`, `description: str`, `promql: str`, `range_seconds: int`, `step_seconds: int | None = None` | `src/services/target/cluster-agent/queries/registry.py :: PrometheusRangeQuery` |
| `LokiLogQuery` | `@dataclass(frozen=True)` — `query_name: str`, `description: str`, `logql: str` | `src/services/target/cluster-agent/queries/registry.py :: LokiLogQuery` |
| `OpenTelemetrySpanQuery` | `@dataclass(frozen=True)` — `query_name: str`, `description: str`, `traceql: str` | `src/services/target/cluster-agent/queries/registry.py :: OpenTelemetrySpanQuery` |
| `KubernetesSnapshotQuery` | `@dataclass(frozen=True)` — `query_name: str`, `description: str`, `namespace: str` | `src/services/target/cluster-agent/queries/registry.py :: KubernetesSnapshotQuery` |
| `MetadataSnapshotQuery` | `@dataclass(frozen=True)` — `query_name: str`, `description: str`, `query: str` | `src/services/target/cluster-agent/queries/registry.py :: MetadataSnapshotQuery` |

`from_mapping` 검증: `source`/`name`/`query`는 비어 있지 않은 str 필수(`ValueError("telemetry query field must be a non-empty string: {key}")`), `range_seconds`/`step_seconds`는 선택적 양의 정수(`ValueError("telemetry query field must be a positive integer: {key}")`), `source`는 `telemetry.spec(source)`로 등록 여부 즉시 검증. `to_provider_query`: `range_seconds`가 있으면 `telemetry.range_query_type_for(source)` 사용(미지원 소스면 `ValueError("telemetry source does not support range query: ...")` — 현재 prometheus만 지원), 없으면 `telemetry.query_type_for(source)(name, description, query)`.

### `span/` — 추적 추상화 + OpenTelemetry 구현

`span/__init__.py` 재노출: `TracePayload`, `TraceSpan`, `TraceTracer`, `configure_tracing`, `get_tracer`.

#### `span/base.py`

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `TracePayload` | `TracePayload = dict[str, Any]` | `src/services/target/cluster-agent/span/base.py :: TracePayload` |
| `TraceSpan` | Protocol — `def attr(self, key: str, value: Any) -> None`, `def count(self, key: str, values: Sized) -> None`, `def flag(self, key: str, value: bool) -> None`, `def http_status(self, status_code: int) -> None`, `def fields_present(self, namespace: str, payload: Mapping[str, Any], fields: Sequence[str]) -> None`, `def error(self, exc: Exception) -> None` | `src/services/target/cluster-agent/span/base.py :: TraceSpan` |
| `TraceTracer` | Protocol — `def start_as_current_span(self, name: str) -> AbstractContextManager[TraceSpan]`, `def start_payload_span(self, name: str, *, namespace: str, expected_fields: Sequence[str]) -> AbstractContextManager[TracePayload]` | `src/services/target/cluster-agent/span/base.py :: TraceTracer` |

#### `span/otel.py`

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `OtelSpan` | `def __init__(self, span: Span) -> None` — `attr`=`set_attribute`, `count`=`len()` attr, `flag`=bool attr, `http_status`=`http.status_code` attr, `fields_present`=필드별 `{namespace}.has_{field}` flag, `error`=`record_exception` + `Status(StatusCode.ERROR)` | `src/services/target/cluster-agent/span/otel.py :: OtelSpan` |
| `OtelTracer` | `def __init__(self, tracer: Tracer) -> None`; `@contextmanager def start_as_current_span(self, name: str) -> Iterator[TraceSpan]`; `@contextmanager def start_payload_span(self, name, *, namespace, expected_fields) -> Iterator[TracePayload]`(종료 시 payload에 대해 `fields_present` 기록) | `src/services/target/cluster-agent/span/otel.py :: OtelTracer` |
| `configure_tracing` | `def configure_tracing(service_name: str, traces_endpoint: str) -> TraceTracer` — 전역 `_CONFIGURED` 가드로 1회만: `Resource.create({SERVICE_NAME: service_name})` → `TracerProvider` → `traces_endpoint.strip()`이 비어 있지 않으면 `BatchSpanProcessor(OTLPSpanExporter(endpoint=traces_endpoint))` 추가 → `trace.set_tracer_provider` | `src/services/target/cluster-agent/span/otel.py :: configure_tracing` |
| `get_tracer` | `def get_tracer(name: str) -> TraceTracer` — `OtelTracer(trace.get_tracer(name))` | `src/services/target/cluster-agent/span/otel.py :: get_tracer` |

## 데이터 모델 (Data Model)

로컬 SQLite 파일 2개(둘 다 WAL 모드, `busy_timeout=5000`, 커넥션 `timeout=5.0`, 부모 디렉터리 자동 생성).

### `command-outbox.db` — 테이블 `command_results` (`src/services/target/cluster-agent/commands/outbox.py :: CommandResultOutbox.init_schema`)

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| command_id | text | primary key | 커맨드 ID (UPSERT 키) |
| workspace_id | text | not null | |
| lease_id | text | not null | |
| agent_id | text | not null | |
| status | text | not null default `'pending'` | `pending` \| `abandoned` (구버전 테이블은 `ensure_columns`가 ALTER로 추가) |
| result_json | text | not null | 커맨드 결과 JSON 직렬화 |
| attempt_count | integer | not null default 0 | 전송 실패 횟수 |
| last_error | text | nullable | 마지막 전송 실패 사유 |
| created_at / updated_at | real | not null | epoch 초 |

인덱스: `idx_command_results_created on command_results(status, created_at)`.

### `agent-control.db` (`src/services/target/cluster-agent/control/store.py :: AgentControlStore.init_schema`)

테이블 `agent_policy`:

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| policy_id | text | primary key | 항상 `"active"` 1행 |
| generation | integer | not null | 적용된 정책 세대 |
| payload_json | text | not null | `AgentPolicy.model_dump_json()` |
| updated_at | real | not null | |

테이블 `reconcile_resources`:

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| resource_id | text | primary key | `DesiredResource.resource_id` |
| scope / kind / namespace / name | text | not null | 리소스 좌표 |
| desired_hash | text | not null | `desired_resource_hash` SHA-256 |
| status | text | not null | `applied` \| `unchanged` \| `failed` |
| message | text | not null | |
| updated_at | real | not null | |

## 이벤트 (Events)

이 서비스는 NATS 이벤트를 직접 발행/구독하지 않는다. 모든 통신은 관리 플레인 HTTP 계약(경로 상수: `src/packages/contracts/gateway/routes.py`)과 realtime WebSocket 계약(`src/packages/contracts/realtime.py`)이다.

### 소비 (관리 플레인에서 pull)

| 계약 | HTTP | 요청 | 응답 |
|---|---|---|---|
| 커맨드 롱폴 | `GET /agent/commands/poll` | query: `cluster_id`, `workspace_id`, `agent_id`, `timeout`(초) | `{"command": CommandRecord \| null}` — `CommandRecord`는 최소 `command_id`, `lease_id`, `action` 포함, 선택 `workspace_id`, `payload`, `approval_ref`, `policy_decision_ref` |
| evidence job 롱폴 | `GET /agent/evidence/jobs/poll` | query: `provider_key`, `agent_id`, `timeout`(초, 10 고정) | `{"job": JsonObject \| null}` — job은 `job_id`, `lease_id`, 선택 `provider_policy`(그 안의 `queries: list[dict]`) 포함 |
| 정책 fetch | `GET /agent/policy` | query: `cluster_id`, `generation`(현재 적용 세대) | `{"policy": AgentPolicy \| null}` — dict 아니면 `None` 취급. `AgentPolicy` 스키마: `cluster_id`, `generation(ge=1)`, `cluster_role: "management"\|"target"`, `evidence: EvidenceRuntimePolicy{failure_policy, max_attempts, providers: {key: EvidenceProviderPolicy{enabled, interval_seconds, min_workers, max_workers, queue_age_target_seconds, queries: list[dict]}}}`, `bootstrap: BootstrapPolicy{mode, resources: [DesiredResource]}`, `desired_state: DesiredStatePolicy{resources}` |

### 발행 (관리 플레인/realtime-gateway로 push)

| 계약 | HTTP | body |
|---|---|---|
| 에이전트 등록 | `POST /agent/connect` | `{cluster_id, agent_id, capabilities: ["collector", "command_receiver"]}` |
| 커맨드 시작 | `POST /agent/commands/{command_id}/start` | `{cluster_id, workspace_id, agent_id, lease_id}` |
| 커맨드 하트비트 | `POST /agent/commands/{command_id}/heartbeat` | `{cluster_id, workspace_id, agent_id, lease_id}` — 실행 중 `COMMAND_HEARTBEAT_INTERVAL_SECONDS`(20s)마다 |
| 커맨드 결과 | `POST /agent/commands/{command_id}/result` | 커맨드 결과 dict + `{workspace_id, agent_id, lease_id}` 병합. 결과 스키마(`TargetClusterAgent.command_result` / `CommandResult.completed/failed`): `status: "completed"\|"failed"`, `cluster_id`, `applied: bool`, `message: str`, `retryable: bool`, `resources: [{resource, status, applied, message}]`, `stdout`(sanitize 적용), `stderr`(sanitize 적용), `rollout: JsonObject`(k8s 데코레이터 핸들러는 `rollout` 대신 `applied/result` 등 `**fields`) |
| evidence job 스케줄 | `POST /agent/evidence/jobs` | `{source_id: "cluster-snapshot", window_start: <UTC ISO>, provider_keys: [str]}` → 응답에서 `evidence_key` 읽음 |
| evidence job 결과 | `POST /agent/evidence/jobs/{job_id}/result` | `{agent_id, lease_id, status: "completed"\|"failed", result: JsonObject, error: str}` — result는 `{<evidence_key>: ProviderResult}` 형태 |
| 정책 적용 상태 | `POST /agent/policy/status` | `{cluster_id, generation, status: "applied"\|"failed"\|"unchanged", message, details}` — details는 `apply_policy` 반환값 `{generation, cluster_role, bootstrap_mode, enabled_providers, evidence_worker_counts, registered_queries}` |
| reconcile 상태 | `POST /agent/reconcile/status` | `{cluster_id, generation, status, message: "reconciled N resources", details: {resources: [ReconcileResult.__dict__]}}` |
| (미사용) 인벤토리 스냅샷 | `POST /agent/inventory/snapshots` | `HttpManagementPlaneClient.record_inventory_snapshot`으로 구현만 존재, 이 서비스에서 호출 없음 |
| live summary / resource delta | WS `{gateway_url}/live/agent?cluster_id={cluster_id}` (`AGENT_LIVE_PATH`), 헤더 `x-agent-token` | interval마다 `LiveSummaryMessage{type:"live.summary", seq:0(gateway가 부여), cluster_id, summary: LiveSummary{cluster_id, window_ms, pods_ready, pods_total, restart_delta, rollout_phase:"idle"\|"progressing"\|"degraded", hot_pods:[HotPod{namespace, pod, cpu_ratio, restart_count, ready}] (최대 MAX_HOT_PODS=20)}}` 전송 후, collector가 만든 `ResourceDelta{type:"resource.delta", op:"replace"\|"remove", key:"<cluster>/<namespace>/pod/<name>", value?}`를 이어 send |

### 커맨드 액션별 요청 payload 계약

`execute_command`는 `command["payload"]`에서 payload를 꺼내되, `payload["payload"]`가 dict이면 그 중첩 dict를 사용한다(`command_payload`).

| action | payload 모델/형식 | 핸들러 |
|---|---|---|
| `telemetry.query.run` | `TelemetryQueryCommandPayload{query: dict}` — query 안에 `{source, name, query, range_seconds?, step_seconds?}` 또는 등록된 쿼리 참조 `{source, name}`(query 문자열 없으면 registry lookup) | `run_query_command` |
| `k8s.apps.v1.deployments.patch` | `KubernetesPatchPayload{namespace, name, patch?, body?}` | `patch_deployment_command` |
| `k8s.apps.v1.deployments.scale` | `KubernetesScalePayload{namespace, name, replicas>=0}` | `scale_deployment_command` |
| `k8s.core.v1.configmaps.patch` | `KubernetesPatchPayload{namespace, name, patch?, body?}` | `patch_configmap_command` |
| `apply_manifest` | raw payload의 `diff: {namespace?, desired_manifest?: dict, resource?: "deployment/<name>" / "pod/<deployment-hash-suffix>" / "replicaset/<deployment-hash>" / bare name, desired_image?}`. Deployment 이름을 추정할 수 없는 kind는 대상 없음으로 실패한다. | `apply_manifest_command` |
| `rollout_restart` | raw payload의 `diff: {namespace?, resource: "deployment/<name>" / "pod/<deployment-hash-suffix>" / "replicaset/<deployment-hash>" / bare name}`. Deployment 이름을 추정할 수 없는 kind는 대상 없음으로 실패한다. | `rollout_restart_command` |
| 그 외 | — | `apply_default_command` → `fail("unsupported action: {action}")` |

## 동작 (Behavior)

### 기동 시퀀스 (`app.py` → `agent.py`)

1. `main()` → `AsyncService("cluster-agent", run).run()` — `SERVICE_NAME` env 기본 설정, 로깅 구성, `asyncio.run`.
2. `TargetClusterAgent.__init__`:
   - env 로드: `MANAGEMENT_BASE_URL`(빈 값이면 `RuntimeError("MANAGEMENT_BASE_URL is required")`), `TARGET_CLUSTER_ID`, `WORKSPACE_ID`, `HOSTNAME`(agent_id), `EVIDENCE_INTERVAL_SECONDS`, `CLUSTER_ROLE`, `BOOTSTRAP_MODE`, OTEL 2종, worker counts 2종(`parse_provider_worker_counts`), failure policy, DB 경로 2종, sync/reconcile interval, `RECONCILER_MODE`.
   - `configure_tracing(otel_service_name, otel_traces_endpoint)` → `self.tracer`.
   - `NodeCollectorManager.from_env`, `LiveSummaryPublisher.from_env` 생성.
   - `providers` 미주입 시 기본 4종: `KubernetesSnapshotProvider(cluster_id, transport)`, `LokiLogsProvider.from_config(env)`, `TempoTracesProvider.from_config(env)`, `MetadataProvider.from_config(env)`. Prometheus provider는 integration revision을 검증한 후 collector·scheduler에 동적 등록한다.
   - `TelemetryQueryRegistry`, `EvidenceCollector(providers, registry)`, `AgentControlStore`, `CommandResultOutbox`, `EvidenceJobScheduler`(source_id=`"cluster-snapshot"`, provider_keys=collector의 evidence_key들) 생성.
   - `build_default_policy()` — provider마다 `EvidenceProviderPolicy(interval_seconds=self.interval, min_workers=EVIDENCE_PROVIDER_WORKERS값 또는 fallback 1, max_workers=EVIDENCE_PROVIDER_MAX_WORKERS값 또는 fallback 3, queue_age_target_seconds=15)`, `EvidenceRuntimePolicy(failure_policy=...)`, `BootstrapPolicy(mode=...)`, 빈 `DesiredStatePolicy`. target role은 모든 provider를 기본 enabled로 시작하고, management role은 Kubernetes provider만 enabled로 시작한다.
   - `AgentPolicySync`, `DesiredStateReconciler`, `KubernetesApiClient`, `AgentCommandRegistry.from_instance(self, ..., default_handler=self.apply_default_command)` 생성 — 데코레이트된 6개 핸들러 자동 등록.
3. `run()`: 주입된 client가 있으면 그대로, 없으면 `HttpManagementPlaneClient(base_url)`를 async context로 열어 `run_with_client`. finally에서 `close()`(두 SQLite store를 `suppress(Exception)`으로 닫음).
4. `run_with_client(client)`:
   1. `policy_sync.apply_stored_or_default()` — 저장된 정책이 있으면 `merge_agent_policy(default, stored)` 적용, 없으면 default 적용, 결과를 store에 저장. (관리 플레인 접속 전에 로컬 정책으로 스케줄 구성.)
   2. `register(client)` — 성공할 때까지 무한 재시도(`REGISTER_RETRY_DELAY_SECONDS`=3s, `agent_waiting_for_management_gateway` 경고).
   3. `reconcile_node_collector_once()` 1회 즉시 실행.
   4. `asyncio.gather`로 7개 루프 병행: `policy_sync.run`, `reconcile_node_collector_forever`, `evidence_scheduler.run`, `reconciler.run`, `poll_commands`, `flush_command_results_forever`, `live_summary.run`.

### 커맨드 디스패치 흐름

1. `poll_commands`: `poll_command(cluster_id, workspace_id, agent_id, timeout=15)` 롱폴. 예외 시 `command_polling_failed` 경고 후 3초 백오프.
2. 커맨드 수신 시: `agent_executing_command` 로그 → `start_command` → `execute_command_with_heartbeat`:
   - 백그라운드 태스크로 `heartbeat_command_until_done`(20초마다 heartbeat, 실패해도 경고만) 실행, 완료 시 cancel.
   - `execute_command(command)`:
     a. `action`, `command_payload(command)` 추출.
     b. **승인 게이트**: `action ∈ {apply_manifest, k8s.apps.v1.deployments.scale}`(`write_action_requires_approval` — catalog install은 전용 `DEPLOY_RUN` route가 검증해 직접 queue, `rollout_restart`는 비파괴 조치라 제외)이고 승인 증적도 sandbox 면제도 없으면 즉시 실패한다.
     c. `command_registry.execute(action, payload, metadata={command_id, approval_ref, policy_decision_ref})`. 레지스트리는: 핸들러 조회(없으면 default) → `payload_model` 있으면 `model_validate`(pydantic `extra="forbid"`) → k8s spec 있으면 `KubernetesCommandPolicy.ensure_allowed` → `CommandContext` 구성 후 핸들러 호출.
     d. 예외는 전부 `command_result(False, str(exc))`로 흡수(폴링 루프는 죽지 않음).
3. 결과는 `command_outbox.enqueue_result(...)`로 SQLite에 먼저 기록 후 `flush_command_results_once` 즉시 시도.

### outbox 플러시

- `flush_command_results_forever`: 2초(`COMMAND_OUTBOX_FLUSH_INTERVAL_SECONDS`) 간격으로 `flush_command_results_once`.
- `flush_command_results_once`: pending 1건(oldest) → `complete_command` POST 성공 시 `mark_sent`(행 삭제, `True` 반환). 실패 시 `record_failure` — attempt_count 증가, `COMMAND_OUTBOX_MAX_ATTEMPTS`(5) 도달 시 status를 `abandoned`로 바꾸고 더 이상 재시도하지 않음. `command_result_flush_failed` 경고에 `attempt_count`/`abandoned` 포함.

### k8s 쓰기 커맨드 상세

- `apply_manifest_command`: `diff.desired_manifest`가 있으면 `apply_kubernetes_manifest(manifest, namespace)` — manifest 정규화(`kubernetes_manifest_resource`), **namespace가 제어 허용목록에 없으면 거부**(`control_namespace_allowed`, 기본 `sandbox`만). GET으로 존재 확인 → 404면 POST 생성(`application/json`), 존재하면 PATCH(`application/merge-patch+json`). kind가 `Deployment`면 Kubernetes create/patch 수락 직후 성공 결과와 `rollout_progress(waited=False)`를 반환한다. manifest가 없으면 `diff.resource`(deployment)와 `diff.desired_image`로 strategic-merge patch(`build_apply_manifest_patch`) — 이 경로도 허용목록 외 거부.
- `rollout_restart_command`: 허용 네임스페이스 검사(`control_namespace_allowed`) → `build_rollout_restart_patch`로 annotation만 갱신 → `patch_deployment`.
- `patch_deployment(namespace, deployment, patch)`: `PATCH {base}/apis/apps/v1/namespaces/{ns}/deployments/{name}` (`application/strategic-merge-patch+json`)이 성공하면 즉시 `(True, AgentConfig.COMMAND_RESULT_MESSAGE, rollout_progress(deployment, waited=False))`를 반환한다. command 결과는 API 수락을 기준으로 완료되고, 실제 ready 수렴은 `live.summary`/`resource.delta`와 후속 inventory 조회가 관측한다.
- `wait_for_deployment_rollout`: 현재 patch/create command 경로에서는 호출하지 않는 보조 함수다. timeout(기본 30s)이 0 이하이면 대기 없이 성공 취급(`waited: False`). 이후 2초 간격으로 Deployment GET → `deployment_rollout_status`로 ready 판정(`desired==0` 이거나 `observed>=generation && updated>=desired && ready>=desired && available>=desired && Progressing/Available condition != "False"`). ready → `(True, DEPLOYMENT_ROLLOUT_COMPLETED_MESSAGE, status)`, deadline 초과 → `(False, "deployment rollout not ready before timeout: {name}", last_status)`.
- k8s API 미구성(`kubernetes_api_base_url()` 또는 토큰 없음) 시 쓰기 경로는 전부 `(False, "kubernetes api not configured; dry-run only", {})`.
- 데코레이터 기반 `k8s.*` 커맨드 3종은 `KubernetesApiClient.patch_namespaced_resource`(merge-patch) 사용: deployments.patch/`configmaps.patch`는 본문 patch, deployments.scale은 `subresource="scale"`에 `{"spec": {"replicas": n}}`. target role에서는 `target` 네임스페이스의 `cluster-agent` Deployment / `target-agent-policy` ConfigMap으로 name-scoped다. management role에서는 같은 self-control write도 정책층에서 Kubernetes 호출 전 거부한다.

### control 루프

**정책 동기화 (`AgentPolicySync`)** — 15초(`POLICY_SYNC_INTERVAL_SECONDS`) 주기, span `policy.sync`:
1. `store.active_generation()` → `fetch_policy(cluster_id, generation)`.
2. 응답 `None`(변경 없음) → status `unchanged` 보고.
3. 정책 수신 → `AgentPolicy.model_validate` → `merge_agent_policy(stored_or_default, incoming)`(incoming의 `model_fields_set`만 덮어씀, generation은 항상 incoming) → `apply_policy` → `store.save_policy` → status `applied` + details 보고.
4. 어떤 단계든 실패 → span.error, status `failed`(generation은 payload의 `generation` int 또는 현재 세대) 보고. `run` 루프 자체 예외는 `policy_sync_failed` 경고.

**`TargetClusterAgent.apply_policy`**: cluster_id/cluster_role 불일치 시 `ValueError`. provider별 유효 정책 = incoming → stored → default 순 fallback. 결과로 (a) `evidence_scheduler.configure_schedule(provider_intervals, enabled_provider_keys)`, (b) `set_worker_counts(min_workers)`, (c) provider별 `register_policy_queries` — `telemetry.source_for_provider(provider_key)`로 source를 찾고 정책의 `queries` dict들을 `TelemetryQueryDefinition.from_mapping`(source 자동 주입) 후 `evidence_collector.replace_queries`. 반환 details: `{generation, cluster_role, bootstrap_mode, enabled_providers(정렬), evidence_worker_counts, registered_queries}`.

**Desired state reconcile (`DesiredStateReconciler`)** — 30초(`RECONCILE_INTERVAL_SECONDS`) 주기, span `desired_state.reconcile`:
1. `store.load_policy()` — 없으면 `{status: "unchanged", message: "no policy available"}` 보고.
2. `bootstrap.resources` + `desired_state.resources` 순회, 리소스마다 `reconcile_resource`:
   - `desired_resource_hash` 계산 → `ensure_allowed` 검사(아래 불변식).
   - `RECONCILER_MODE=argocd`이고 `action == "apply"`면 Kubernetes GET만 수행하고 `unchanged("observed (argocd single-writer mode)")`로 기록한다. 이 모드에서는 built-in apply 경로를 호출하지 않는다.
   - `action == "apply"`이고 마지막 성공 해시와 같으면 `unchanged("already applied")` (멱등 스킵).
   - `apply` → `resource_applier.apply`(merge-patch, 404시 POST) 후 `applied`; `observe` → GET 후 `unchanged("observed")`.
   - 예외 → `failed(str(exc))`. 어떤 경우든 `save_reconcile_result`로 SQLite 기록.
3. `RECONCILER_MODE=argocd`이고 observer가 주입됐으면 resource loop와 별도로 Argo collection을 1회 읽어 `details.argocd`에 합성한다. Application은 `Synced + Healthy`이고 operation phase가 비어 있거나 `Succeeded`일 때만 `post_verification_ready=true`다. `Running`/`Terminating` 등 진행 중 operation은 ready가 아니다. Rollout의 Degraded/abort는 `failed=true`다. 필수 Application 관측이 403/404·인증정보 부재 등으로 불가능하면 종합 status를 `failed`로 올리고, 선택적인 Rollout CRD 부재만으로는 실패시키지 않는다. observer 예외는 built-in apply fallback 없이 reconcile status를 `failed`로 만들고 오류를 details에 남긴다.
4. 종합 status: 하나라도 `failed`면 `failed`, 아니면 `applied`가 있으면 `applied`, 아니면 `unchanged`. `report_reconcile_status`로 보고. 루프 예외는 `desired_state_reconcile_failed` 경고.

`RECONCILER_MODE`의 기본값은 `builtin`이며 기존 동작처럼 built-in reconciler가 writer다. GitOps controller를 writer로 운영하는 배포만 `argocd`로 설정한다. 지원하지 않는 값은 에이전트 기동 시 `ValueError`로 거부한다. 무발화 계약은 `uv run python -m pytest -q tests/test_target_policy_control.py -k argocd`로 재현할 수 있으며, `StubApplier.applied == []`, desired resource GET 1건, Argo observer 1회 호출을 함께 검증한다. observer의 설치가 provider catalog의 External GitOps deploy adapter를 활성화하는 것은 아니며, provider의 apply capability는 계속 unavailable이다.

### evidence 수집 잡 흐름

**스케줄러(생산 측)** — `EvidenceJobScheduler.run`: worker 풀 기동 후 `schedule_forever`(1초 tick):
1. `due_provider_keys(now)` — enabled이고 `next_provider_runs` 도래한 provider들.
2. 있으면 `new_window_start(now)`(interval 경계로 내림한 UTC ISO)로 `POST /agent/evidence/jobs` 1회 호출(복수 provider_keys 일괄).
3. provider별 `next_provider_runs = now + provider_intervals[key]` 갱신. 예외는 `evidence_schedule_failed` 경고.

**워커(소비 측)** — provider당 `provider_worker_counts`개의 `work_forever` 태스크(이름 `evidence-{provider_key}-worker-{n}`):
1. `work_once`: `GET /agent/evidence/jobs/poll`(timeout 10s). job 없으면 `False` → 1초 대기.
2. job 수신: `collect_job` — job의 `provider_policy.queries`를 `TelemetryQueryDefinition`으로 변환(`job_query_definitions`, source 자동 주입)하고, collector에 `collect_query_policy`가 있으면(job별 쿼리로) 그것을, 없으면 `collect(provider_key)` 호출.
3. 성공 → `complete_evidence_job(job_id, ..., "completed", result, "")`; 수집 예외 → `"failed", {}, str(exc)`. 워커 자체 예외는 `evidence_worker_failed` 경고 후 계속.

**worker pool 조절**: `set_worker_counts`(정책 적용 시 호출) → `reconcile_worker_pool` — 완료 태스크 정리 후 desired count까지 태스크 생성/초과분 cancel. `run` 종료 시 `stop_workers`로 전부 cancel + gather.

**`EvidenceCollector` 수집 파이프라인** (`_collect_with_queries`): provider의 span(`{source}.collect`)을 열고 `span.count(query_count_attribute)` → `httpx.AsyncClient(timeout=provider.timeout_seconds)`로 각 쿼리를 `provider.query` 실행, `provider.append_result`로 누적 → `build_response`. `allow_partial`에서는 쿼리 하나가 실패해도 이미 성공한 쿼리 결과를 유지하고, 실패한 쿼리만 `span.error` + `{source}.fallback_used=true` flag + `failure_message` 경고(`query_name` 포함)로 기록한다. 모든 쿼리가 실패하거나 provider 수집 자체가 예외로 끝나면 해당 provider의 `empty_results()` 모양으로 완료된다. `strict`에서는 쿼리 실패를 전파해 job을 `failed`로 보고한다. 전체 수집(`collect`)은 `start_payload_span("evidence.collect", namespace="evidence", expected_fields=선택 키들)`로 감싼다.

### providers — 외부 텔레메트리 호출

| provider | HTTP 호출 | 파라미터 |
|---|---|---|
| `KubernetesSnapshotProvider.query` | k8s API GET 9개: `/api/v1/namespaces/{ns}/pods`, `/api/v1/namespaces/{ns}/events`, `/api/v1/nodes`, `/apis/apps/v1/namespaces/{ns}/deployments`, `.../statefulsets`, `.../daemonsets`, `.../replicasets`, `/api/v1/namespaces/{ns}/services`, `/apis/discovery.k8s.io/v1/namespaces/{ns}/endpointslices`(403/404 허용→`{"items": []}`) | ns = `telemetry_query.namespace or "target"`. Bearer SA 토큰. API 미구성 시 `{"status": "unavailable", "reason": "kubernetes api is not configured", ...}` 반환(HTTP 호출 없음) |
| `PrometheusMetricsProvider.query_instant` | `GET {integration address}/api/v1/query` | `query=<promql>` (span `prometheus.query`) |
| `PrometheusMetricsProvider.query_range` | `GET {integration address}/api/v1/query_range` | `query=<promql>`, `start=now-range_seconds`(소수 3자리), `end=now`, `step=step_seconds or max(1, range_seconds//30)` (span `prometheus.query_range`) |
| `LokiLogsProvider.query` | `GET {LOKI_BASE_URL}/loki/api/v1/query_range` | `query=<logql>`, `limit=LOKI_QUERY_LIMIT(20)` (span `loki.query_range`) |
| `TempoTracesProvider.query` | `GET {TEMPO_BASE_URL}/api/search` | `q=<traceql>`, `limit=TEMPO_QUERY_LIMIT(20)` (span `tempo.search`) |

Kubernetes 스냅샷 정규화(`normalize_payload`): raw 응답을 `{cluster{cluster_id, namespace, collected_at}, pods[], events[], nodes[], workloads[](Deployment/StatefulSet/DaemonSet/ReplicaSet 요약 통합), services[], endpoints[], provider_status{query_name: {status, namespace, reason, counts}}}` 요약으로 변환. 일반 RCA snapshot의 ReplicaSet은 desired/status replica가 하나라도 남은 현재·종료 중 리소스만 포함하고, 0 replica 롤아웃 이력은 metadata evidence의 `replicaset_revisions`에서 조회한다. pod 요약에는 `workload_key`(`"{ns}/{kind}/{name}"`), 컨테이너별 상태/restart(+ `container_id`, `image_id`, `last_state`/`last_state_reason`/`last_state_message`/`last_exit_code`/`last_started_at`/`last_finished_at` — crashloop 중 waiting 이어도 직전 크래시의 종료 사유/시간 보존), `waiting_reasons`/`terminated_reasons`(현재 terminated 와 lastState terminated 사유를 함께 승격 — OOMKilled/exit 137 판별 근거) 포함. event 요약에는 알려진 reason일 때 `reason_summary`가 포함되며 `FailedScheduling`은 `scheduling_causes`로 `insufficient_cpu`, `insufficient_memory`, `node_selector_mismatch`, `taint_toleration_mismatch`, `pod_count_limit`, `volume_node_affinity_conflict` 같은 작은 label을 제공한다. 복수 쿼리 결과는 `merge_snapshot`으로 목록 concat + provider_status 병합. `build_response`는 전송 직전에 큰 list를 제한하고 `collection_limits`를 붙인다. namespace가 있는 list는 한 namespace가 다른 namespace를 전부 가리지 않도록 namespace별 round-robin 방식으로 샘플을 고른다.

Prometheus 메트릭 정규화(`normalize_payload` + `build_metric_analysis`): query별 결과를 `metrics.results.<metric_name>` object로 만들고, 기존 `samples`/`series`/`result`에 `analysis`를 추가한다. `analysis`는 `metric_kind`, `unit`, `signals`를 기본으로 담고, 가능한 경우 `value_summary`, `threshold`, range query의 `baseline_comparison`을 담는다. 새 PromQL query를 자동 추가하지 않고, 이미 policy가 요청한 결과만 해석한다. high cardinality metric처럼 `samples`/`series`가 커질 수 있는 결과는 제한 후 전송하고, 잘린 경우 `metrics.results.<metric_name>.collection_limits`에 원래 개수와 최종 반환 개수를 남긴다. matrix의 `series.values` 제한 정보는 최종 `series` 목록 기준으로 다시 계산한다.

Loki 로그 정규화(`normalize_payload`): query별 결과를 `logs[]` object로 만들고, 각 object에 `result_type`, `streams`, `line_count`, `pattern_counts`, `severity_counts`, `trace_ids`, `matched_entries`, `collection_limit`, `redaction_summary`를 담는다. `streams[].values[].line` 필드는 유지하지만 Loki 원문 그대로가 아니라 provider가 `password`/`token`/`secret`/`api_key`/`api-key`/`client_secret`/`client-secret`/`private_key`/`private-key`/`Authorization`/`Cookie`/JWT/URL 계정정보/email 같은 민감값을 `[REDACTED]` 계열 값으로 바꾼 뒤 최대 4096자로 제한한 문자열이다. 잘린 line에는 `line_truncated=true`, `original_line_length`가 붙고, `redaction_summary.truncated_line_count`가 증가한다. query policy에 `range_seconds`가 있으면 Loki query_range에 `start`, `end`, `direction=backward`를 붙이고 result에도 `range_seconds`를 남긴다. pattern count는 app port bind 실패, startup permission denied, missing env, probe 실패, health endpoint 오류, dependency timeout/error, image pull 오류, OOM/memory, config/env/volume 오류를 line 단위로 세며 query 전체와 stream별 summary를 모두 남긴다. `matched_entries[]`는 매칭된 line만 최대 20개까지 `{timestamp, namespace, pod, container, severity, message, matched_patterns, trace_id, line_truncated}` 형태로 담고, trace id가 없으면 `trace_id=null`을 남긴다. `collection_limit.matched_entries`에 원래 매칭 수와 반환 수 및 잘림 여부를 남긴다. trace id는 32자리 hex 값만 최대 20개까지 유지한다.

RCA EvidenceBundle의 `logs:related_logs`는 provider result를 그대로 쓰지 않고 incident scope에 맞춰 다시 줄인다. 일반 incident는 namespace가 맞는 stream과 matched entry를 남기고, RCA test run은 현재 test Pod 이름까지 맞는 stream과 matched entry만 남긴다. `pattern_counts`, `severity_counts`, `trace_ids`는 선택된 stream summary를 기준으로 다시 합산한다. `collection_limit.matched_entries`는 provider result 기준 제한 정보이므로, bundle scope 필터링 후의 최종 `matched_entries` 개수와 항상 같지는 않다.

Tempo 트레이스 정규화(`normalize_payload`): query별 결과를 `traces.results.<query_name>` object로 만들고 `traces`, `trace_count`, `analysis`를 담는다. `trace_count`는 Tempo가 반환한 trace 수이고, 실제 `traces` list는 전송 크기 보호 때문에 줄어들 수 있다. 각 trace object의 긴 문자열은 최대 1024자로 제한하고, 중첩 list는 최대 20개로 제한한다. 한 trace가 계속 너무 크면 trace_id/service/operation/status/duration/error/dependency 같은 RCA용 summary와 `trace_truncated/original_trace_bytes`만 남긴다. `analysis`는 `traces` list를 최종 제한하기 전 compact trace 기준으로 만든다. 따라서 `traces`가 잘려도 RCA용 trace id/service/status 요약은 남을 수 있다. 전체 query result가 크면 `collection_limits.lists.traces`에 원래 trace 수와 최종 반환 trace 수를 남긴다.

### span / otel

- 프로세스 전역 TracerProvider는 `configure_tracing`이 1회만 설정(`_CONFIGURED` 가드). `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`가 공백이면 exporter를 붙이지 않아 span은 no-op export.
- 서비스 코드는 `TraceSpan`/`TraceTracer` 프로토콜만 사용 — OTel API 직접 호출 금지. 사용 중인 tracer 이름: `target-cluster-agent.policy`, `target-cluster-agent.reconciler`, `target-cluster-agent.evidence`.

### node-collector DaemonSet 관리

- 주기: 기동 직후 1회 + `NODE_COLLECTOR_RECONCILE_INTERVAL_SECONDS`(30s)마다. 성공 시 `node_collector_reconciled` info(applied, message), 실패 시 `node_collector_reconcile_failed` 경고(루프 유지).
- `NodeCollectorManager.reconcile()` 판정 순서: (1) `enabled=false` → `(False, "node collector reconcile disabled")`; (2) `image` 빈 값 → `(False, "node collector image is required")`; (3) k8s API 미구성 → `(False, "kubernetes api not configured; node collector dry-run only")`; (4) 전용 ServiceAccount·ClusterRole·ClusterRoleBinding 중 하나라도 GET 404면 DaemonSet을 변경하지 않고 `(False, "node collector identity requires administrator apply")`; (5) `GET /apis/apps/v1/namespaces/{ns}/daemonsets/optional-node-collector` — 404면 POST 생성 → `(True, "node collector daemonset created")`, 존재하면 `{metadata, spec}`만 strategic-merge PATCH → `(True, "node collector daemonset reconciled")`.
- 인계 기준: target registration은 cluster-agent 설치까지만 담당하고, 이후 collector rollout·drift correction은 이 에이전트 경계에서 처리한다.
- 등록/install manifest와 관리자 RBAC 업그레이드 artifact는 전용 ServiceAccount,
  `cluster-agent-node-collector-read` ClusterRole/Binding을 함께 제공한다. RBAC 버전 drift가
  있으면 기존 agent 정책 업그레이드는 관리자 apply 경로를 요구하므로 기존 클러스터에도
  동일 권한 경계를 적용할 수 있다.

### live summary

- `LiveSummaryPublisher.run`: `enabled=false`거나 gateway_url이 비면 `live_summary_disabled` info 후 즉시 반환(no-op). gateway_url은 설치 ConfigMap의 `REALTIME_GATEWAY_URL`이 우선이다. management role은 내부 `realtime-gateway` Service를 사용하고, target role은 공개 관리 주소에서 계산한다. fallback은 HTTPS면 같은 호스트의 표준 WSS 포트(443), HTTP 로컬 환경이면 NodePort 30090을 사용한다.
- 연결: `websockets.connect(endpoint, additional_headers={"x-agent-token": token})` (지연 import). endpoint = `{gateway_url}/live/agent?cluster_id={cluster_id}`.
- 공개 agent endpoint는 nginx에서 `/live/agent`만 realtime-gateway로 WebSocket proxy한다. `/live/browser`와 일반 관리 API는 이 endpoint에서 404로 닫혀 있다.
- `_stream`: interval(기본 1.0s, 0.25~60 clamp)마다 `collector()` 호출 → `LiveSummary`가 나오면 `LiveSummaryMessage` JSON send. collector가 `drain_deltas()`를 제공하면 직전 호출 대비 pod `ResourceDelta`를 이어 보낸다. 연결/전송 예외 시 `live_summary_stream_retry` 경고 후 `LIVE_SUMMARY_RETRY_DELAY_SECONDS`(3s) 백오프 재접속. `CancelledError`는 그대로 전파.
- `KubernetesPodSummaryCollector.__call__`: k8s API 미구성이면 `None`. `target`·`sandbox` 두 네임스페이스에서 `GET /api/v1/namespaces/{ns}/pods?limit=200`(`LIVE_SUMMARY_POD_LIST_LIMIT`) 후 `summarize`:
  - pod마다 containerStatuses로 ready(전 컨테이너 ready)·restart 합·CrashLoopBackOff 여부 계산.
  - not-ready이거나 restart>0인 pod를 최대 `MAX_HOT_PODS`(20)개 `hot_pods`에 수집.
  - pod별 bounded resource 값(`resource_type`, `kind`, `name`, `namespace`, `phase`, `ready`, `restarts`, `node`, `owner_kind`, `owner_name`, `health`)을 직전 호출과 비교해 `resource.delta` replace/remove를 만든다.
  - `restart_delta` = 직전 호출 대비 restart 총합 증가분(첫 호출은 0, 음수는 0으로 clamp).
  - `rollout_phase`: CrashLoop 존재 → `degraded`, `ready_count < len(pods)` → `progressing`, 그 외 → `idle`.

## 불변식·오류 (Invariants & Errors)

1. **제어 네임스페이스 허용목록**: `apply_manifest`/`rollout_restart` 계열의 워크로드 쓰기는 namespace가 허용목록(`control_namespace_allowed`, `CONTROL_ALLOWED_NAMESPACES` env — 기본 `sandbox`만)에 없으면 `"namespace is not allowed by control policy"`로 거부한다. 이 기준은 게이트웨이 검증·command-worker 정책과 공유되는 단일 원천(`src/packages/config/control.py :: control_allowed_namespaces`)이며, 대상 클러스터에서는 설치 manifest의 agent ConfigMap(`src/domains/target/install_manifest.py`)이 등록 요청의 `control_namespaces` CSV(`src/packages/contracts/gateway/requests.py :: TargetRegisterRequest`)를 `CONTROL_ALLOWED_NAMESPACES` env로 주입한다 — 클러스터별로 다르게 줄 수 있다.
2. **승인 증적 필수**: `apply_manifest`, `k8s.apps.v1.deployments.scale`은 `approval_ref`와 `policy_decision_ref`가 모두 있어야 실행된다(`write_action_requires_approval` + `has_approval_evidence`). `rollout_restart` 는 spec 변경이 없는 비파괴 조치라 승인 증적 없이 허용되며, namespace 정책 가드는 동일하게 적용된다. `deployment scale` 은 plan 메타데이터 environment 가 sandbox 면 승인 증적을 면제한다(`approval_exempt_for_environment` — `AGENT_AUTO_APPROVE_ACTIONS`/`AGENT_AUTO_APPROVE_ENVIRONMENTS`, 기본 scale×sandbox) — command-worker 의 `COMMAND_AUTO_APPROVE_*` rule 과 대칭. `k8s.*.patch` 2종은 이 승인 게이트 집합에 포함되지 않는 대신 아래 3의 name-scoped 정책으로 제한된다.
3. **k8s 커맨드 정책(name-scoped 자기 제어)**: target role만 자기 agent 리소스(`target` namespace의 `cluster-agent` Deployment / `target-agent-policy` ConfigMap)를 patch/apply 할 수 있다. management role은 read-only라 `get` 외 `target-agent` scope write도 `"management agent cannot control management workloads"`로 거부한다. 공통으로 scope는 `target-agent`, verb는 `get/patch/apply`, 리소스는 `deployments`/`configmaps`, namespace/name은 role별 고정값만 허용한다.
4. **reconcile 정책**: `user-workload` scope 금지, `system` scope의 Deployment 금지, namespace는 role 고정, ConfigMap은 `target-agent-policy`·target-agent Deployment는 `cluster-agent`만 (`DesiredStateReconciler.ensure_allowed`, `PermissionError`).
5. **정책 정합성**: `apply_policy`는 정책의 `cluster_id`/`cluster_role`이 에이전트와 다르면 `ValueError`. `AgentPolicy` 등 요청 모델은 전부 `StrictModel(extra="forbid")` — 계약 밖 필드는 검증 실패.
6. **커맨드 결과는 반드시 outbox 경유**: 실행 결과는 SQLite에 먼저 기록되고 전송 성공 시에만 삭제된다(재시작에도 결과 보존). 전송 5회 실패 시 `abandoned`로 봉인되어 무한 재시도를 막는다. `enqueue_result`는 `command_id` UPSERT라 중복 실행에 멱등.
7. **루프는 죽지 않는다**: 등록/폴링/정책/스케줄/워커/reconcile/live summary 루프는 예외를 잡아 경고 로그 + 백오프로 계속 돈다. 커맨드 실행 예외는 실패 결과로 변환된다.
8. **evidence 수집은 부분 실패 허용**: `allow_partial`에서는 같은 provider 안의 일부 쿼리가 실패해도 성공한 쿼리 결과를 버리지 않는다. 실패한 쿼리는 `{source}.fallback_used=true`와 `query_name`이 포함된 경고로 남고, 성공 결과가 없을 때만 해당 provider의 `empty_results()` 응답이 전송된다. `strict`에서는 쿼리 실패를 전파해 job을 `failed`로 보고한다.
9. **레지스트리 fail-fast**: 커맨드 action 중복 등록·텔레메트리 소스 상이 계약 재등록·미등록 소스/쿼리 참조는 즉시 `ValueError`.
10. **출력 위생**: 커맨드 결과 stdout/stderr는 `sanitize_command_output`으로 민감어 라인 마스킹(`[redacted]`) + 2000자 절단 후 전송된다.
11. **catalog Helm fail-closed**: management role은 top guard와 handler에서 이중 차단한다. target도 sandbox 및 서버 recipe/value 재검증을 통과해야 하며 binary 부재/timeout/non-zero exit는 `failed` command result로 남는다. 사용자 chart URL/shell/manifest는 payload 모델에 없다.
12. **k8s API 미구성 시 dry-run**: 쓰기 경로들은 실패 메시지(`"... dry-run only"`)를 반환할 뿐 예외를 던지지 않는다.
13. **live summary는 bounded**: hot_pods ≤ 20, pod 조회 limit 200/네임스페이스, `LiveSummary`는 raw metric·전체 목록을 싣지 않는다(계약이 강제). 끄면(no-op) 기존 evidence/command 경로에 영향 없음.
14. **SQLite store 사용 규칙**: `close()` 이후 접근은 `RuntimeError("... is closed")`. WAL + busy_timeout으로 단일 프로세스 내 동시 접근을 견딘다. `TargetClusterAgent.run()`은 `finally`에서 두 store를 닫으며, 직접 생성한 호출자는 생성 thread에서 `close()`를 명시적으로 호출해야 한다. 테스트 factory는 모든 full-agent 인스턴스를 같은 thread에서 정리한 뒤 worker-thread cyclic GC를 실행해 thread-affine SQLite destructor 오류가 없음을 강제한다.

## 설정 (Settings)

값 읽기는 전부 `packages.config.settings.env(name, default)` (문자열 반환, 코드에서 int/float 캐스팅).

| 환경변수 | 타입 | 기본값 | 의미 | 정의 위치 |
|---|---|---|---|---|
| `MANAGEMENT_BASE_URL` | str | `""` (**필수** — 빈 값이면 기동 실패) | 관리 플레인 api-gateway base URL | `config.py` / `agent.py :: AgentConfig` |
| `TARGET_CLUSTER_ID` | str | `default-target-cluster` | 클러스터 ID | `config.py` |
| `WORKSPACE_ID` | str | `default` | 워크스페이스 ID | `config.py` |
| `HOSTNAME` | str | `target-agent` | agent_id (pod hostname) | `config.py` |
| `AGENT_TOKEN` | str | `""` | `x-agent-token` 헤더 값 (HTTP·WS 공용) | `config.py` |
| `CLUSTER_ROLE` | str | `target` | `target` \| `management` — 정책/커맨드 네임스페이스 결정 | `config.py` |
| `CONTROL_ALLOWED_NAMESPACES` | str(콤마 구분) | `sandbox` | 워크로드 쓰기(`apply_manifest`/`rollout_restart`) 허용 네임스페이스 목록. 매 호출 시 env 를 읽음. 설치 manifest ConfigMap이 등록 요청의 `control_namespaces`로 주입 | `src/packages/config/control.py` |
| `AGENT_AUTO_APPROVE_ACTIONS` | str(콤마 구분) | `k8s.apps.v1.deployments.scale` | 승인 증적 면제 대상 액션 목록(`approval_exempt_for_environment`) | `agent.py` |
| `AGENT_AUTO_APPROVE_ENVIRONMENTS` | str(콤마 구분) | `sandbox` | 면제가 적용되는 plan 메타데이터 environment 목록(소문자 비교) | `agent.py` |
| `BOOTSTRAP_MODE` | str | `target` | 기본 정책의 `bootstrap.mode` | `config.py` |
| `EVIDENCE_INTERVAL_SECONDS` | int | `30` | provider 기본 수집 주기·윈도 크기 | `config.py` |
| `AGENT_CONTROL_DB_PATH` | str | `/tmp/target-agent/agent-control.db` | 정책/reconcile SQLite 경로 | `config.py` |
| `COMMAND_OUTBOX_DB_PATH` | str | `/tmp/target-agent/command-outbox.db` | 커맨드 결과 outbox SQLite 경로 | `config.py` |
| `EVIDENCE_PROVIDER_WORKERS` | str | `kubernetes=1,metrics=1,logs=1,traces=1` | provider별 최소 워커 수 (`k=v,` 목록). `metadata`가 없으면 scheduler fallback 1을 쓴다. | `config.py` / `evidence/jobs.py` |
| `EVIDENCE_PROVIDER_MAX_WORKERS` | str | `kubernetes=2,metrics=2,logs=2,traces=2` | provider별 최대 워커 수(기본 정책의 max_workers). `metadata`가 없으면 `build_default_policy()` fallback 3을 쓴다. | `config.py` / `agent.py` |
| `EVIDENCE_FAILURE_POLICY` | str | `allow_partial` | 기본 정책의 `evidence.failure_policy` (`allow_partial`\|`strict`) | `config.py` |
| `POLICY_SYNC_INTERVAL_SECONDS` | int | `15` | 정책 fetch 주기 | `config.py` |
| `RECONCILE_INTERVAL_SECONDS` | int | `30` | desired state reconcile 주기 | `config.py` |
| `RECONCILER_MODE` | str | `builtin` | desired state writer 선택. `builtin`은 기존 apply 경로, `argocd`는 built-in apply 0건 + Argo Application/Rollout GET 관측 | `config.py` / `control/reconciler.py` / `control/argocd_observer.py` |
| `AGENT_DIRECT_COMMANDS_ENABLED` | str(bool) | `true` | `false`면 telemetry query 외 command를 Kubernetes 호출 전에 실패 처리. OSS profile은 `false` | `config.py` / `agent.py` |
| `LOKI_BASE_URL` | str | `http://loki-gateway.target.svc` | Loki 주소 | `config.py` |
| `TEMPO_BASE_URL` | str | `http://tempo.target.svc:3200` | Tempo 주소 | `config.py` |
| `OTEL_SERVICE_NAME` | str | `target-cluster-agent` | 트레이싱 서비스명 | `config.py` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | str | `""` | OTLP HTTP trace endpoint (빈 값이면 export 안 함) | `config.py` |
| `HTTP_TIMEOUT_SECONDS` | int | `20` | 관리 플레인 HTTP 타임아웃 | `config.py` |
| `PROMETHEUS_TIMEOUT_SECONDS` | int | `5` | Prometheus 조회 타임아웃 | `config.py` |
| `LOKI_TIMEOUT_SECONDS` / `LOKI_QUERY_LIMIT` | int | `5` / `20` | Loki 타임아웃 / 로그 최대 건수 | `config.py` |
| `TEMPO_TIMEOUT_SECONDS` / `TEMPO_QUERY_LIMIT` | int | `5` / `20` | Tempo 타임아웃 / 트레이스 최대 건수 | `config.py` |
| `COMMAND_POLL_TIMEOUT_SECONDS` | int | `15` | 커맨드 롱폴 대기 | `config.py` |
| `COMMAND_HEARTBEAT_INTERVAL_SECONDS` | int | `20` | 실행 중 하트비트 간격 | `config.py` |
| `COMMAND_EXECUTION_DELAY_SECONDS` | int | `2` | 실행 지연(상수 정의·`AgentConfig` 재노출만 존재, 현재 흐름에서 참조 없음) | `config.py` |
| `REGISTER_RETRY_DELAY_SECONDS` | int | `3` | 등록 재시도 간격 | `config.py` |
| `COMMAND_RETRY_DELAY_SECONDS` | int | `3` | 커맨드 폴링 실패 백오프 | `config.py` |
| `COMMAND_OUTBOX_FLUSH_INTERVAL_SECONDS` | int | `2` | outbox 플러시 주기 | `config.py` |
| `COMMAND_OUTBOX_MAX_ATTEMPTS` | int | `5` | 결과 전송 최대 시도(초과 시 abandoned) | `config.py` |
| `NODE_COLLECTOR_RECONCILE_INTERVAL_SECONDS` | int | `30` | node-collector reconcile 주기 | `config.py` |
| `KUBERNETES_SERVICE_HOST` | str | `kubernetes.default.svc`* | k8s API host. *`kubernetes_api.py`(evidence/manifest 경로)는 기본값 없이 미설정 시 API 미구성(dry-run) 취급; `commands/kubernetes.py`·`control/reconciler.py`는 이 기본값 사용 | `config.py` / `kubernetes_api.py` |
| `KUBERNETES_SERVICE_PORT_HTTPS` | str | `443` | k8s API port | `config.py` / `kubernetes_api.py` |
| `KUBERNETES_API_TIMEOUT_SECONDS` | int | `5` | `KubernetesApiClient`/reconciler/스냅샷 provider 타임아웃 | `config.py` |
| `KUBERNETES_HTTP_TIMEOUT_SECONDS` | int | `20` | `kubernetes_api.kubernetes_client` 타임아웃 | `kubernetes_api.py` |
| `KUBERNETES_ROLLOUT_TIMEOUT_SECONDS` | int | `30` | Deployment rollout 대기 한도(≤0이면 대기 생략) | `config.py` |
| `KUBERNETES_ROLLOUT_POLL_INTERVAL_SECONDS` | float | `2` | rollout 상태 재조회 간격 | `config.py` |
| `LIVE_SUMMARY_ENABLED` | str(bool) | `true` | live summary on/off (`"true"` 비교, 소문자화) | `config.py` |
| `LIVE_SUMMARY_INTERVAL_SECONDS` | float | `1.0` (clamp 0.25~60) | 요약 송신 주기 | `config.py` |
| `LIVE_SUMMARY_RETRY_DELAY_SECONDS` | float | `3` | WS 재접속 백오프 | `config.py` |
| `REALTIME_GATEWAY_URL` | str | 설치 manifest가 role/관리 주소에 맞게 주입. 미설정 fallback: HTTPS 동일 호스트 443, HTTP NodePort 30090 | realtime-gateway WS base URL | `config.py`, `packages.config.realtime` |
| `NODE_COLLECTOR_ENABLED` | str(bool) | `true` | node-collector reconcile on/off (`truthy`) | `node_collector_manager.py` |
| `NODE_COLLECTOR_IMAGE` | str | `""` (비면 reconcile 스킵) | node-collector 이미지 | `node_collector_manager.py` |
| `NODE_COLLECTOR_NAMESPACE` | str | `target` | DaemonSet 네임스페이스 | `node_collector_manager.py` |
| `NODE_COLLECTOR_PORT` | int | `9100` | metrics 포트 (Prometheus scrape annotation과 연동) | `node_collector_manager.py` |
| `NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS` | int | `15` | node-collector 컨테이너 수집 주기 env | `node_collector_manager.py` |

env가 아닌 주요 상수: `DEFAULT_REALTIME_GATEWAY_NODEPORT = 30090`, `LIVE_SUMMARY_POD_LIST_LIMIT = 500`, `LIVE_SUMMARY_POD_TOTAL_LIMIT = 5000`, `MIN/MAX_LIVE_SUMMARY_INTERVAL_SECONDS = 0.25 / 60.0`, `KUBERNETES_SERVICEACCOUNT_TOKEN_PATH = /var/run/secrets/kubernetes.io/serviceaccount/token`, `KUBERNETES_SERVICEACCOUNT_CA_CERT_PATH = .../ca.crt`, `KUBERNETES_DEPLOYMENT_PATCH_ACTION = "k8s.apps.v1.deployments.patch"`, `KUBERNETES_CONFIGMAP_PATCH_ACTION = "k8s.core.v1.configmaps.patch"`, `KUBERNETES_DEPLOYMENT_SCALE_ACTION = "k8s.apps.v1.deployments.scale"`, `QUERY_RUN_ACTION = "telemetry.query.run"`.
