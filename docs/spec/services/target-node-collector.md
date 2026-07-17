---
source_commit: 664925a6
status: synced
---

# node-collector — target 노드의 런타임 샘플·Pod 메트릭을 Prometheus 형식으로 노출하는 HTTP 서비스

> 소스: `src/services/target/node-collector/` (app.py, node_collector.py, kubernetes_api.py, metric_collectors.py, prometheus_metrics.py) · 테스트: `tests/test_node_collector.py`

## 책임 (Responsibility)

- 노드별 DaemonSet 형태로 배치되어(환경변수 `NODE_NAME` 으로 담당 노드 식별):
  - **실측** 노드 런타임 스냅샷(`NodeRuntimeSample`)을 `/snapshot` 으로 제공하고,
  - Kubernetes API 에서 읽은 Pod 상태를 포함한 메트릭을 `/metrics` 로 Prometheus text exposition 형식으로 노출하고,
  - `COLLECT_INTERVAL_SECONDS` 주기로 스냅샷을 구조화 로그(`node_runtime_sample_collected`)로 남긴다.
- **이벤트 버스(NATS)를 사용하지 않는다** — 순수 HTTP(FastAPI + uvicorn) 서비스.
- DB 접근 없음.
- CPU/메모리/파일시스템 값은 `NodeRuntimeSampler` 가 실측한다 — CPU 는 `/proc/stat` 의 (idle+iowait)/total **델타**, 메모리는 `/proc/meminfo` 의 `MemTotal - MemAvailable`, 파일시스템은 `os.statvfs("/")`. `/proc/stat`·`/proc/meminfo` 는 컨테이너 네임스페이스와 무관하게 호스트(노드) 값을 보여주므로 DaemonSet 컨테이너에서 그대로 실측이 된다. 읽기 실패는 측정 불가 값 대신 `0` 으로 보고하고 경고 로그를 남긴다(기존의 고정 샘플 상수 `SAMPLE_*` 는 제거됨).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config.logs` | [config 패키지](../packages/config.md) | `CONTEXT_KEY`(=`"context"`), `get_logger` |
| import | `packages.config.settings` | [config 패키지](../packages/config.md) | `env(name, default)` |
| import | `packages.contracts.gateway.routes` | [contracts 패키지](../packages/contracts.md) | `HEALTHZ_PATH`(=`"/healthz"`) |
| import | `packages.contracts.gateway.fields` | [contracts 패키지](../packages/contracts.md) | `Gateway.STATUS`/`STATUS_OK`/`SERVICE` |
| import | `packages.runtime.service` | [runtime 패키지](../packages/runtime.md) | `AsyncService` (로깅 구성 + asyncio 실행) |
| 외부 | Kubernetes API (in-cluster) | — | `GET /api/v1/pods` (ServiceAccount 토큰 인증) |
| 외부 | FastAPI / uvicorn / httpx | — | HTTP 서버·클라이언트 |

같은 target 그룹: [cluster-agent](target-cluster-agent.md), [drift-worker](target-drift-worker.md), [reconcile-worker](target-reconcile-worker.md).

## 공개 인터페이스 (Public API)

### app.py

```python
def main() -> None
```

- 앵커: `src/services/target/node-collector/app.py :: main`
- `AsyncService(NodeCollectorConfig.SERVICE_NAME, run).run()` — 서비스명 `"node-collector"` 로 로깅 구성 후 `run` 코루틴 실행. `__all__ = ["run"]`.

### node_collector.py

```python
class Field(StrEnum):
    KIND = "kind"
    NODE = "node"
    SAMPLE = "sample"
```

- 앵커: `src/services/target/node-collector/node_collector.py :: Field` — 로그/응답의 필드 키.

```python
NODE_RUNTIME_SAMPLE_KIND = "node_runtime_sample"
SNAPSHOT_PATH = "/snapshot"
METRICS_PATH = "/metrics"
```

- 앵커: `src/services/target/node-collector/node_collector.py :: NODE_RUNTIME_SAMPLE_KIND`, `:: SNAPSHOT_PATH`, `:: METRICS_PATH`

```python
class NodeCollectorConfig:
    SERVICE_NAME = "node-collector"
    SERVICE_HOST = "0.0.0.0"
    SERVICE_PORT_ENV = "PORT"
    DEFAULT_SERVICE_PORT = "9100"
    LOG_LEVEL = "info"

    NODE_NAME_ENV = "NODE_NAME"
    POD_NAME_ENV = "POD_NAME"
    POD_NAMESPACE_ENV = "POD_NAMESPACE"
    COLLECT_INTERVAL_ENV = "COLLECT_INTERVAL_SECONDS"

    DEFAULT_NODE_NAME = "unknown-node"
    DEFAULT_POD_NAME = "node-collector"
    DEFAULT_POD_NAMESPACE = "target"
    DEFAULT_COLLECT_INTERVAL_SECONDS = "15"

    PROC_STAT_PATH = "/proc/stat"
    PROC_MEMINFO_PATH = "/proc/meminfo"
    FILESYSTEM_SAMPLE_PATH = "/"
    RUNTIME_NAME = "containerd"
    METRIC_CONTENT_TYPE = "text/plain; version=0.0.4"
```

- 앵커: `src/services/target/node-collector/node_collector.py :: NodeCollectorConfig`

```python
class NodeRuntimeSampler:
    def __init__(
        self,
        proc_stat_path: str = NodeCollectorConfig.PROC_STAT_PATH,
        proc_meminfo_path: str = NodeCollectorConfig.PROC_MEMINFO_PATH,
        filesystem_path: str = NodeCollectorConfig.FILESYSTEM_SAMPLE_PATH,
    ) -> None
    def cpu_usage_ratio(self) -> float
    def memory_working_set_bytes(self) -> int
    def filesystem_usage_ratio(self) -> float
```

- 앵커: `src/services/target/node-collector/node_collector.py :: NodeRuntimeSampler` — 노드 지표 실측기(고정 샘플값 금지).
- `cpu_usage_ratio`: `/proc/stat` 첫 줄(cpu 합계)에서 `idle = values[3] + iowait(values[4])`, `busy = total - idle`. 직전 호출값 `_last_cpu: (busy, total)` 이 있으면 구간 델타 `Δbusy/Δtotal`, 첫 호출은 부팅 이후 평균 `busy/total`. 결과는 0.0~1.0 clamp. `OSError/ValueError/IndexError` 시 `node_collector_cpu_read_failed` 경고 후 `0.0`.
- `memory_working_set_bytes`: `/proc/meminfo` 를 파싱(kB→bytes ×1024)해 `max(0, MemTotal - MemAvailable)`. 실패 시 `node_collector_memory_read_failed` 경고 후 `0`.
- `filesystem_usage_ratio`: `os.statvfs(filesystem_path)` 로 `1 - f_bavail/f_blocks` (0.0~1.0 clamp, `f_blocks == 0` 이면 `0.0`). `OSError` 시 `node_collector_filesystem_read_failed` 경고 후 `0.0`.

```python
@dataclass(frozen=True)
class NodeRuntimeSample:
    node_name: str
    pod_name: str
    namespace: str
    timestamp: str
    cpu_usage_ratio: float
    memory_working_set_bytes: int
    filesystem_usage_ratio: float
    runtime: str

    def to_body(self) -> dict[str, object]
```

- 앵커: `src/services/target/node-collector/node_collector.py :: NodeRuntimeSample` — `to_body()` 는 `dataclasses.asdict` 결과.

```python
class NodeCollector:
    def __init__(
        self,
        node_name: str,
        pod_name: str,
        namespace: str,
        interval_seconds: int,
        kubernetes: KubernetesApiClient | None = None,
        sampler: NodeRuntimeSampler | None = None,
    ) -> None
    @classmethod
    def from_env(cls) -> NodeCollector
    def snapshot(self) -> NodeRuntimeSample
    async def prometheus_metrics(self) -> str
    async def log_forever(self) -> None
```

- 앵커: `src/services/target/node-collector/node_collector.py :: NodeCollector`
- `kubernetes` 미지정 시 `KubernetesApiClient()` 생성, `sampler` 미지정 시 `NodeRuntimeSampler()` 생성. `self.collectors` 는 `(PodMetricCollector(self.kubernetes, self.node_name),)` 튜플로 고정.

```python
def create_app(collector: NodeCollector | None = None) -> FastAPI
async def run() -> None
```

- 앵커: `src/services/target/node-collector/node_collector.py :: create_app`, `:: run`
- 모듈 상수 `LOGGER = get_logger(__name__)` (앵커: `src/services/target/node-collector/node_collector.py :: LOGGER`).

### kubernetes_api.py

```python
DEFAULT_KUBERNETES_SERVICE_HOST = "kubernetes.default.svc"
DEFAULT_KUBERNETES_SERVICE_PORT = "443"
KUBERNETES_SERVICE_HOST_ENV = "KUBERNETES_SERVICE_HOST"
KUBERNETES_SERVICE_PORT_ENV = "KUBERNETES_SERVICE_PORT_HTTPS"
KUBERNETES_SERVICEACCOUNT_DIR = "/var/run/secrets/kubernetes.io/serviceaccount"
KUBERNETES_SERVICEACCOUNT_TOKEN_PATH = f"{KUBERNETES_SERVICEACCOUNT_DIR}/token"
KUBERNETES_SERVICEACCOUNT_CA_CERT_PATH = f"{KUBERNETES_SERVICEACCOUNT_DIR}/ca.crt"
KUBERNETES_API_TIMEOUT_SECONDS_ENV = "KUBERNETES_API_TIMEOUT_SECONDS"
KUBERNETES_API_TIMEOUT_SECONDS = int(env(KUBERNETES_API_TIMEOUT_SECONDS_ENV, "5"))

JsonObject = dict[str, object]
```

- 앵커: `src/services/target/node-collector/kubernetes_api.py` 모듈 상수 (예: `src/services/target/node-collector/kubernetes_api.py :: KUBERNETES_API_TIMEOUT_SECONDS`)
- `KUBERNETES_API_TIMEOUT_SECONDS` 는 **모듈 import 시점**에 환경변수를 읽어 확정된다.
- `JsonObject` 는 collector 전용 payload 모델이 굳기 전까지의 로컬 alias.

```python
class KubernetesApiClient:
    def base_url(self) -> str
    def auth_headers(self) -> dict[str, str]
    async def list_pods_on_node(self, node_name: str) -> JsonObject
```

- 앵커: `src/services/target/node-collector/kubernetes_api.py :: KubernetesApiClient`
- `list_pods_on_node`는 빈 node scope를 거부하고 Kubernetes API 요청에
  `fieldSelector=spec.nodeName=<node>`를 반드시 전달한다. cluster-wide PodList를 받은 뒤
  로컬에서만 필터링하는 경로는 제공하지 않는다.
- 프로세스는 cluster-agent가 관리하는 bounded subworker이며
  `cluster-agent-node-collector` 전용 ServiceAccount를 사용한다. 연결된
  `cluster-agent-node-collector-read` ClusterRole은 core `pods`의 `get/list`만 허용하고
  cluster-agent의 제어·exec·GitOps 쓰기 권한을 상속하지 않는다.

```python
def pods_on_node(pods_payload: JsonObject, node_name: str) -> list[JsonObject]
def is_pod_ready(pod: JsonObject) -> bool
def count_not_ready_pods(pods: list[JsonObject]) -> int
```

- 앵커: `src/services/target/node-collector/kubernetes_api.py :: pods_on_node`, `:: is_pod_ready`, `:: count_not_ready_pods`

### metric_collectors.py

```python
class MetricCollector(Protocol):
    collector_name: str
    async def collect(self, labels: dict[str, str]) -> list[MetricSample]: ...
```

- 앵커: `src/services/target/node-collector/metric_collectors.py :: MetricCollector` — 타입 계약(Protocol).

```python
class NodeScopedKubernetesApi(Protocol):
    async def list_pods_on_node(self, node_name: str) -> dict[str, object]: ...
```

- 앵커: `src/services/target/node-collector/metric_collectors.py :: NodeScopedKubernetesApi` —
  collector가 cluster-wide 조회 계약을 주입받지 못하게 하는 agent-worker 경계.

```python
@dataclass(frozen=True)
class PodSummary:
    pod_count: int
    not_ready_pod_count: int
```

- 앵커: `src/services/target/node-collector/metric_collectors.py :: PodSummary`

```python
def collector_status_metric_sample(
    labels: dict[str, str],
    collector_name: str,
    has_error: bool,
) -> MetricSample
```

- 앵커: `src/services/target/node-collector/metric_collectors.py :: collector_status_metric_sample`

```python
class PodMetricCollector:
    collector_name = "pod"
    def __init__(self, kubernetes: NodeScopedKubernetesApi, node_name: str) -> None
    async def collect_pod_summary(self) -> PodSummary
    async def collect(self, labels: dict[str, str]) -> list[MetricSample]
```

- 앵커: `src/services/target/node-collector/metric_collectors.py :: PodMetricCollector`

### prometheus_metrics.py

```python
@dataclass(frozen=True)
class MetricSample:
    name: str
    help: str
    value: float | int
    labels: dict[str, str]
    type: Literal["gauge", "counter"] = "gauge"
```

- 앵커: `src/services/target/node-collector/prometheus_metrics.py :: MetricSample`

```python
def render_labels(labels: dict[str, str]) -> str
def render_metric_sample(sample: MetricSample) -> list[str]
def render_prometheus_metrics(samples: list[MetricSample]) -> str
```

- 앵커: `src/services/target/node-collector/prometheus_metrics.py :: render_labels`, `:: render_metric_sample`, `:: render_prometheus_metrics`

## 데이터 모델 (Data Model)

### NodeRuntimeSample (`/snapshot` 응답 body)

| 필드 | 타입 | 값 출처 |
|---|---|---|
| `node_name` | `str` | `NODE_NAME` 환경변수 |
| `pod_name` | `str` | `POD_NAME` 환경변수 |
| `namespace` | `str` | `POD_NAMESPACE` 환경변수 |
| `timestamp` | `str` | 호출 시점 `datetime.now(UTC).isoformat()` |
| `cpu_usage_ratio` | `float` | `NodeRuntimeSampler.cpu_usage_ratio()` — `/proc/stat` 델타 실측 (실패 시 `0.0`) |
| `memory_working_set_bytes` | `int` | `NodeRuntimeSampler.memory_working_set_bytes()` — `/proc/meminfo` 실측 (실패 시 `0`) |
| `filesystem_usage_ratio` | `float` | `NodeRuntimeSampler.filesystem_usage_ratio()` — `os.statvfs("/")` 실측 (실패 시 `0.0`) |
| `runtime` | `str` | 고정 상수 `"containerd"` |

## 공개 HTTP 인터페이스 (Public API — endpoints)

앵커: `src/services/target/node-collector/node_collector.py :: create_app`

| 메서드·경로 | 응답 | 내용 |
|---|---|---|
| `GET /healthz` | JSON | `{"status": "ok", "service": "node-collector", "node": <node_name>}` (키는 `Gateway.STATUS`/`Gateway.SERVICE`/`Field.NODE`) |
| `GET /snapshot` | JSON | `NodeRuntimeSample.to_body()` |
| `GET /metrics` | `text/plain; version=0.0.4` | Prometheus text exposition (아래 메트릭 목록) |

## 메트릭 명세 (수집기별)

모든 메트릭의 공통 라벨: `node=<node_name>`, `runtime="containerd"`. TYPE 은 전부 `gauge`(`MetricSample.type` 기본값). 각 샘플은 `# HELP` / `# TYPE` / `name{labels} value` 3줄로 렌더되고 마지막에 빈 줄 1개(`render_prometheus_metrics`).

### 1. 기본 노드 샘플 (snapshot 기반 — `NodeRuntimeSampler` 실측)

앵커: `src/services/target/node-collector/node_collector.py :: NodeCollector.prometheus_metrics`

| 메트릭 이름 | HELP | 값 |
|---|---|---|
| `node_collector_cpu_usage_ratio` | Node CPU usage ratio. | `/proc/stat` 델타 실측 (0.0~1.0) |
| `node_collector_memory_working_set_bytes` | Node memory working set. | `/proc/meminfo` `MemTotal - MemAvailable` (bytes) |
| `node_collector_filesystem_usage_ratio` | Node filesystem usage ratio. | `os.statvfs("/")` 실측 (0.0~1.0) |

### 2. PodMetricCollector (`collector_name="pod"`)

앵커: `src/services/target/node-collector/metric_collectors.py :: PodMetricCollector.collect`

읽는 곳: **Kubernetes API** `GET {base_url}/api/v1/pods` (클러스터 전체 PodList).
- `base_url = https://{KUBERNETES_SERVICE_HOST}:{KUBERNETES_SERVICE_PORT_HTTPS}` (기본 `https://kubernetes.default.svc:443`)
- 인증: `Authorization: Bearer <token>` — 토큰은 `/var/run/secrets/kubernetes.io/serviceaccount/token` 파일을 매 호출 읽어 strip
- TLS 검증: `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt`
- 타임아웃: `KUBERNETES_API_TIMEOUT_SECONDS` (기본 5초), `response.raise_for_status()` 로 비 2xx 시 예외

가공(`kubernetes_api.py`):
- `pods_on_node`: payload 최상위 `items` 리스트에서 `spec.nodeName == node_name` 인 Pod 만 필터 (`items` 가 리스트가 아니면 빈 목록, dict 아닌 항목·dict 아닌 `spec` 은 건너뜀)
- `is_pod_ready`: `status.conditions` 에서 `{"type": "Ready"}` condition 을 찾아 `status == "True"` 여야 Ready. Ready condition 부재·형식 손상 시 not ready 로 간주
- `count_not_ready_pods`: not ready Pod 수

| 메트릭 이름 | HELP | 값 |
|---|---|---|
| `node_collector_node_pod_count` | Pods scheduled on this Kubernetes node. | 이 노드에 스케줄된 Pod 수 |
| `node_collector_node_not_ready_pod_count` | Pods scheduled on this Kubernetes node that are not Ready. | 그중 not Ready 수 |

### 3. 수집기 상태 메트릭 (수집기마다 항상 1개)

앵커: `src/services/target/node-collector/metric_collectors.py :: collector_status_metric_sample`

| 메트릭 이름 | HELP | 라벨 | 값 |
|---|---|---|---|
| `node_collector_scrape_error` | Whether node collector failed to read Kubernetes API data. | 공통 라벨 + `collector=<collector_name>` (현재 `"pod"`) | 성공 `0` / 실패 `1` |

## 이벤트 (Events)

발행·구독 없음 — 이 서비스는 이벤트 버스에 연결되지 않는다.

## 동작 (Behavior)

1. **기동**: `app.py :: main` → `AsyncService("node-collector", run).run()` — `Runtime.SERVICE_NAME_ENV` 를 서비스명으로 setdefault, 로깅 구성 후 `asyncio.run(run())`.
2. `run()`: `create_app()` 으로 FastAPI 앱 생성 후 uvicorn `Server` 로 서빙 — host `"0.0.0.0"`, port `int(env("PORT", "9100"))`, log_level `"info"`.
3. `create_app(collector=None)`: collector 미주입 시 `NodeCollector.from_env()` 로 환경변수에서 구성. FastAPI `lifespan` 에서:
   - 시작 시 `asyncio.create_task(node_collector.log_forever())` 를 `app.state.log_task` 에 보관,
   - 종료 시 해당 task `cancel()`.
4. **주기 로그** (`log_forever`): 무한 루프로 `LOGGER.info("node_runtime_sample_collected", extra={"context": {"service": "node-collector", "kind": "node_runtime_sample", "sample": snapshot().to_body()}})` 기록 후 `interval_seconds` 만큼 sleep.
5. **`/metrics` 처리** (`prometheus_metrics`):
   1. `snapshot()` 호출, 공통 라벨 `{"node": ..., "runtime": ...}` 구성.
   2. 기본 3개 메트릭(위 표 1) 추가.
   3. `self.collectors` 순회 — 각 collector 에 대해:
      - `collector.collect(metric_labels)` 성공 → 결과 샘플들 추가 + `node_collector_scrape_error{collector=...} 0` 추가.
      - 예외 발생 → `LOGGER.warning("node_metric_collector_failed", extra={"context": {"service": ..., "collector": ..., "exception_type": ...}})` 후 `node_collector_scrape_error{collector=...} 1` 만 추가 (해당 수집기 메트릭은 생략, 응답은 계속 성공).
   4. `render_prometheus_metrics` 로 텍스트 렌더링. 라벨 렌더 형식: `name{key="value",...} value`, 라벨 없으면 중괄호 생략.

## 불변식·오류 (Invariants & Errors)

- 개별 수집기 실패가 `/metrics` 응답 전체를 실패시키지 않는다 — 실패한 수집기는 `node_collector_scrape_error=1` 로만 표면화된다.
- `node_collector_scrape_error` 는 수집기 개수만큼(성공/실패 무관) 항상 노출된다.
- 기본 3개 메트릭은 Kubernetes API 가용성과 무관하게 항상 노출된다. 샘플러의 개별 읽기 실패(`/proc/stat`·`/proc/meminfo`·`statvfs`)도 예외를 던지지 않고 해당 값만 `0` 으로 보고한다(측정 불가 값보다 명확한 '측정 불가' + 경고 로그).
- `cpu_usage_ratio` 는 상태가 있는 측정이다 — 첫 호출은 부팅 이후 평균, 이후 호출은 직전 호출과의 구간 사용률(`_last_cpu` 프로세스 메모리 상태).
- `KubernetesApiClient.auth_headers` 는 ServiceAccount 토큰 파일이 없으면 예외(`FileNotFoundError` 등) — 이는 `prometheus_metrics` 의 수집기 예외 처리로 흡수된다.
- Pod payload 의 형식 이상(`items`/`spec`/`status`/`conditions` 가 기대 타입이 아님)은 예외가 아니라 필터링/제외로 처리된다.
- `/snapshot` 과 주기 로그의 리소스 수치는 매 호출 시점에 샘플러가 실측한 값이다(`runtime` 만 고정 상수 `"containerd"`).

## 설정 (Settings)

모든 값은 `packages.config.settings :: env` (= `os.getenv(name, default)`) 로 읽는다.

| 환경변수 | 타입 | 기본값 | 의미 | 읽는 위치 |
|---|---|---|---|---|
| `PORT` | int (문자열 파싱) | `"9100"` | HTTP 리스닝 포트 | `node_collector.py :: run` |
| `NODE_NAME` | str | `"unknown-node"` | 담당 노드 이름(Pod 필터 기준, 메트릭 `node` 라벨) | `NodeCollector.from_env` |
| `POD_NAME` | str | `"node-collector"` | 자기 Pod 이름(스냅샷 필드) | `NodeCollector.from_env` |
| `POD_NAMESPACE` | str | `"target"` | 자기 Pod 네임스페이스(스냅샷 필드) | `NodeCollector.from_env` |
| `COLLECT_INTERVAL_SECONDS` | int (문자열 파싱) | `"15"` | 주기 로그 간격(초) | `NodeCollector.from_env` |
| `KUBERNETES_SERVICE_HOST` | str | `"kubernetes.default.svc"` | Kubernetes API 호스트 | `KubernetesApiClient.base_url` |
| `KUBERNETES_SERVICE_PORT_HTTPS` | str | `"443"` | Kubernetes API 포트 | `KubernetesApiClient.base_url` |
| `KUBERNETES_API_TIMEOUT_SECONDS` | int (문자열 파싱) | `"5"` | k8s API 호출 타임아웃(초) — **모듈 import 시 1회 확정** | `kubernetes_api.py` 모듈 레벨 |
