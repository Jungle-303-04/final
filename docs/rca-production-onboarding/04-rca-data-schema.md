# RCA 데이터 스키마

이 문서는 RCA 구현에 필요한 데이터 스키마를 코드 기준으로 정리한 것이다.
목표는 단순히 필드 이름을 외우는 것이 아니라, 각 값이 왜 필요하고 어느 작업자가 어디서 생산/소비하는지 이해하는 것이다.

기준 파일:

- `src/packages/contracts/gateway/requests.py`
- `src/packages/contracts/gateway/responses.py`
- `src/packages/contracts/event_bus/subjects.py`
- `src/domains/rca/events.py`
- `src/domains/command/events.py`
- `src/domains/scm/events.py`
- `src/domains/rca/models.py`
- `src/domains/identity/models.py`
- `src/domains/dashboard/models.py`
- `src/domains/dashboard/repository.py`
- `src/packages/contracts/identity.py`
- `src/services/target/cluster-agent/queries/registry.py`
- `src/services/target/cluster-agent/providers/*_providers.py`

## 스키마를 나누는 기준

| 구분 | 담당 | 왜 따로 두는가 |
| --- | --- | --- |
| Gateway request/response | 민정, 찬빈 | HTTP와 frontend가 직접 보는 계약이다. event 내부 구조를 화면이 직접 읽지 않게 한다. |
| Event body | 민정, 가인, 찬빈 | worker 사이의 비동기 계약이다. 이벤트가 바뀌면 다음 worker와 projection이 같이 바뀐다. |
| Provider query value object | 민정 | Prometheus/Loki/Tempo/Kubernetes마다 query 실행 방식이 다르다. 문자열 dict를 직접 넘기지 않는다. |
| RCA value object | 가인 | 증거, 사고, 후보, 평가, 보고서를 단계별로 분리한다. |
| Storage model | 가인, 찬빈 | 재시작/재처리/대시보드 조회를 위해 event 결과를 DB에 남긴다. |
| Permission model | 찬빈 | 화면 표시와 backend 차단 기준이 달라지면 보안 사고가 난다. |

## AgentEvidenceRequest

파일: `src/packages/contracts/gateway/requests.py`

HTTP route: `POST /agent/evidence`

producer: target agent  
consumer: `src/domains/rca/router.py` -> `ClusterEvidenceReceivedBody`

| 필드 | 타입 | 필수 | 왜 필요한가 | 주의 |
| --- | --- | --- | --- | --- |
| `cluster_id` | `str` | 입력 가능 | agent가 말하는 cluster 식별자 | router에서 신뢰하지 않고 토큰 identity로 덮어쓴다. |
| `workspace_id` | `str` | 입력 가능 | agent가 말하는 workspace 식별자 | router에서 신뢰하지 않고 토큰 identity로 덮어쓴다. |
| `correlation_id` | `str | None` | 선택 | 수동 수집/디버그 흐름과 같은 timeline으로 묶을 때 쓴다. | 없으면 event 생성 시 새 correlation이 붙는다. |
| `agent_id` | `str | None` | 선택 | 어떤 agent가 수집했는지 추적한다. | 운영 장애 조사에서 필요하다. |
| `source_id` | `str | None` | 선택 | 같은 agent 안에서도 수집 source를 구분한다. | 기본값은 router의 `cluster-snapshot`이다. |
| `window_start` | `str | None` | 선택 | evidence window 시작 시각 또는 키 기준이다. | 중복 방지 키와 같이 쓰인다. |
| `evidence_key` | `str | None` | 선택 | 같은 수집 window 중복 발행을 막는다. | router가 `workspace_id:cluster_id:` prefix를 붙인다. |
| `kubernetes` | `dict` | 기본 `{}` | pod/event/node/workload/service/endpoints snapshot | `KubernetesSnapshotProvider`가 채운다. |
| `metrics` | `dict` | 기본 `{}` | Prometheus 결과 | instant/range query 결과가 정규화되어 들어간다. |
| `logs` | `list[dict]` | 기본 `[]` | Loki 로그 snippet | 길이 제한이 있다. |
| `traces` | `dict` | 기본 `{}` | Tempo/OTel trace 요약 | 전체 trace raw를 무제한 저장하지 않는다. |

검증:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_agent_evidence_ingest.py -q
```

## ClusterEvidenceReceivedBody

파일: `src/domains/rca/events.py`

event subject: `cluster.evidence.received`

producer:

- `src/domains/rca/router.py`
- `src/domains/target/router.py`의 evidence job result aggregation

consumer:

- `src/services/ai/evidence-worker/app.py`

| 필드 | 왜 필요한가 |
| --- | --- |
| `workspace_id` | RCA, audit, dashboard가 반드시 workspace로 분리되어야 한다. |
| `cluster_id` | target cluster별 RCA와 command route를 구분한다. |
| `kubernetes` | pod 상태, event reason, workload replica, endpoint 상태를 RCA rule에 제공한다. |
| `metrics` | CPU, memory, restart, latency 같은 수치 기반 판단에 쓴다. |
| `logs` | 애플리케이션 오류, dependency 오류, 인증/권한 오류 판단에 쓴다. |
| `traces` | timeout, upstream/downstream 병목 판단에 쓴다. |
| `agent_id` | 같은 cluster에 agent가 여러 개일 때 수집자를 구분한다. |
| `source_id` | 수집 source를 표시한다. |
| `window_start` | 수집 window 표시와 중복 방지에 쓴다. |
| `evidence_key` | idempotency 기준이다. |

## TelemetryQueryDefinition

파일: `src/services/target/cluster-agent/queries/registry.py`

producer:

- agent policy의 provider query
- `POST /agent/debug/query`

consumer:

- `TelemetryQueryDefinition.to_provider_query()`
- `EvidenceCollector.run_query()`

| 필드 | 타입 | 왜 필요한가 |
| --- | --- | --- |
| `source` | `str` | provider registry에서 어떤 provider를 호출할지 찾는다. |
| `name` | `str` | 결과 map의 key가 된다. RCA rule은 이 이름을 기준으로 evidence를 찾는다. |
| `description` | `str` | 사람이 읽는 query 의도다. dashboard와 문서에 표시할 수 있다. |
| `query` | `str` | PromQL, LogQL, TraceQL 또는 provider query 문자열이다. |
| `range_seconds` | `int | None` | Prometheus range query가 필요한 window 길이다. |
| `step_seconds` | `int | None` | range query sample 간격이다. 없으면 provider가 기본값을 계산한다. |

## Provider query value object

파일: `src/services/target/cluster-agent/queries/registry.py`

| 값 객체 | source | provider | 왜 필요한가 |
| --- | --- | --- | --- |
| `PrometheusInstantQuery` | `prometheus` | `PrometheusMetricsProvider.query_instant()` | 지금 한 시점의 값을 볼 때 쓴다. |
| `PrometheusRangeQuery` | `prometheus` | `PrometheusMetricsProvider.query_range()` | 일정 window의 변화량, 추세, rate를 볼 때 쓴다. |
| `LokiLogQuery` | `loki` | `LokiLogsProvider` | 오류 로그 snippet을 가져온다. |
| `OpenTelemetrySpanQuery` | `tempo` | `TempoTracesProvider` | trace/span 기반 병목을 본다. |
| `KubernetesSnapshotQuery` | `kubernetes` | `KubernetesSnapshotProvider` | Kubernetes API snapshot을 가져온다. |
| `MetadataSnapshotQuery` | `metadata` | `MetadataProvider` | 변경 맥락 metadata bucket을 만든다. |

Prometheus range query는 현재 구현되어 있다.

- 등록 위치: `PrometheusMetricsProvider`의 `@telemetry.source(..., range_query_type=PrometheusRangeQuery)`
- 실행 위치: `PrometheusMetricsProvider.query_range()`
- normalize 결과: `result_type="matrix"`, `series`, `point_count`, `analysis`
- 테스트: `tests/test_target_metric_evidence.py`

Prometheus provider는 instant/range 결과 모두에 `analysis`를 추가한다.
`analysis`는 이미 받은 숫자만 보고 만든 요약이다. 항상 `metric_kind`, `unit`, `signals`를 담고,
숫자 point가 있으면 `value_summary`를 담는다. known metric이면 `threshold`를 담을 수 있고,
range query에서 비교 가능한 series가 있으면 `baseline_comparison`을 담는다.
외부 baseline이나 이전 배포 기준선은 여기서 조회하지 않는다.

## Kubernetes snapshot payload

파일: `src/services/target/cluster-agent/providers/kubernetes_providers.py`

`KubernetesSnapshotProvider`는 metrics/logs/traces provider와 같은 evidence job 흐름으로 실행된다.

| bucket | 내용 | 왜 필요한가 |
| --- | --- | --- |
| `cluster` | `cluster_id`, `namespace`, `collected_at` | 어느 cluster/namespace snapshot인지 고정한다. |
| `pods` | pod name, namespace, phase, readiness, restart, owner | CrashLoop, OOMKilled, Pending, probe failure 판단에 쓴다. |
| `events` | event reason/message/count/type | scheduling failure, image pull, admission deny 판단에 쓴다. |
| `nodes` | node condition, capacity/allocatable 요약 | CPU/memory/disk/PID pressure 판단에 쓴다. |
| `workloads` | deployment/statefulset/daemonset/replicaset replica 상태 | rollout/progress/replica unavailable 판단에 쓴다. |
| `services` | service selector/type/ports | service discovery와 endpoint 문제를 연결한다. |
| `endpoints` | endpoint slice address/condition | service has no ready endpoints 판단에 쓴다. |
| `provider_status` | query별 status/count/reason | 수집 자체가 성공했는지 dashboard와 RCA가 구분한다. |

검증:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_kubernetes_evidence.py -q
```

## Evidence

파일: `src/domains/rca/events.py`

producer: `evidence-worker`  
consumer: `incident-worker`, `rca_reports` 저장, dashboard projection

| 필드 | 왜 필요한가 |
| --- | --- |
| `workspace_id` | tenant 분리 기준이다. |
| `cluster_id` | 분석 대상 cluster다. |
| `object_ref` | evidence 저장/조회/PR body 연결 기준이다. |
| `kubernetes` | Kubernetes rule이 읽는다. |
| `metrics` | metric rule이 읽는다. |
| `logs` | log rule이 읽는다. |
| `traces` | trace rule이 읽는다. |

저장 table: `evidence`

| 컬럼 | 왜 필요한가 |
| --- | --- |
| `workspace_id` | query filter와 권한 필터 기준이다. |
| `correlation_id` | timeline grouping 기준이다. |
| `kind` | evidence 종류 구분이다. |
| `payload` | 정규화된 evidence body를 보관한다. |
| `created_at` | 최신 evidence와 과거 evidence를 구분한다. |

## IncidentRecord

producer: `incident-worker`  
consumer: `plan-worker`, dashboard detail

| 필드 | 왜 필요한가 |
| --- | --- |
| `incident_id` | RCA 전체의 기준 ID다. |
| `workspace_id` | tenant 분리다. |
| `cluster_id` | command/recovery route와 연결한다. |
| `resource_kind` | Pod/Deployment/Service 등 어떤 객체인지 표시한다. |
| `resource_name` | 사람이 찾을 수 있는 리소스 이름이다. |
| `namespace` | Kubernetes 명령과 화면 필터에 필요하다. |
| `symptom` | RCA rule catalog의 매칭 키다. |
| `secondary_symptoms` | 대표 symptom 외에 snapshot에서 함께 관측된 신호 라벨이다. 여러 장애 신호가 겹쳐도 triage 정보를 잃지 않는다. |
| `severity` | alert/UI 우선순위에 필요하다. |
| `first_seen_at` | incident timeline 시작점이다. |
| `summary` | 대시보드 카드와 PR body에 표시한다. |

## EvidenceBundle

producer: `incident-worker`  
consumer: `plan-worker`, `analyze-worker`, `rca-worker`

| 필드 | 왜 필요한가 |
| --- | --- |
| `incident_id` | 어떤 incident의 판단 근거인지 묶는다. |
| `items` | 실제 판단에 쓴 evidence 목록이다. |
| `missing_evidence` | 수집 부족으로 결론을 멈춰야 하는지 판단한다. |
| `complete` | downstream worker가 확정/보류를 결정할 수 있다. |

`EvidenceItem`:

| 필드 | 왜 필요한가 |
| --- | --- |
| `source` | `kubernetes`, `metrics`, `logs`, `traces`, `metadata` 중 어디서 왔는지 구분한다. |
| `name` | rule이 찾는 evidence key다. |
| `value` | 판단에 필요한 구조화 값이다. |
| `summary` | 사람이 읽는 근거 설명이다. |

### EvidenceItem value schema v1

이 섹션은 provider payload가 RCA 내부에서 어떤 `EvidenceItem`으로 승격되는지 정리한다.
DB table schema가 아니라 `EvidenceItem.value`에 들어가는 JSON 계약이다.

현재 코드 기준 evidence key는 다음과 같다.

| evidence key | 입력 위치 | RCA에서 쓰는 의미 |
| --- | --- | --- |
| `kubernetes:cluster_resource_state` | `ClusterEvidenceReceivedBody.kubernetes` | Pod, container, workload, service, endpoint, event 상태 근거 |
| `metrics:telemetry_metrics` | `ClusterEvidenceReceivedBody.metrics` | Prometheus/metric 기반 resource, restart, latency, error 근거 |
| `logs:related_logs` | `ClusterEvidenceReceivedBody.logs` | incident namespace/workload와 관련된 log snippet 근거 |
| `traces:related_traces` | `ClusterEvidenceReceivedBody.traces` | trace/span 기반 dependency, timeout, error path 근거 |
| `metadata:current_workload_snapshots` | `metadata.current_workload_snapshots` 또는 `metadata.change_context.current_workload_snapshots` | target namespace의 Deployment metadata snapshot 목록 |
| `metadata:current_workload_snapshot` | `metadata.current_workload_snapshot` 또는 `metadata.change_context.current_workload_snapshot` | 특정 Deployment 1개의 metadata snapshot |
| `metadata:service_selector_matches` | `metadata.service_selector_matches` 또는 `metadata.change_context.service_selector_matches` | Service selector와 Pod labels 매칭 결과 |
| `metadata:endpoint_slice_ready_endpoints` | `metadata.endpoint_slice_ready_endpoints` 또는 `metadata.change_context.endpoint_slice_ready_endpoints` | EndpointSlice ready endpoint 요약 |

#### `kubernetes:cluster_resource_state`

producer:

- `KubernetesSnapshotProvider`
- `collect_evidence_items()` -> `compact_kubernetes_value()`

입력 위치:

```text
ClusterEvidenceReceivedBody.kubernetes
```

RCA evidence item:

```json
{
  "source": "kubernetes",
  "name": "cluster_resource_state",
  "value": {}
}
```

`value`는 전체 Kubernetes payload를 그대로 복사하지 않는다.
incident resource 주변 항목만 고르고, 개수 제한을 적용한다.

| 필드 | 타입 | 코드 기준 생성 규칙 |
| --- | --- | --- |
| `cluster` | object | 입력 payload에 있으면 유지한다. |
| `resource` | object | 입력 payload에 있으면 유지한다. |
| `symptom` | string | 입력 payload에 있으면 유지한다. |
| `severity` | string | 입력 payload에 있으면 유지한다. |
| `pods` | list<object> | incident namespace/resource와 관련된 pod를 최대 16개 남긴다. |
| `events` | list<object> | incident namespace/resource 또는 선택된 pod와 관련된 event를 최대 24개 남긴다. |
| `nodes` | list<object> | `ready == false` 또는 `"False"`인 node를 최대 12개 남긴다. |
| `workloads` | list<object> | incident resource kind/name과 일치하는 workload를 최대 4개 남긴다. |
| `services` | list<object> | 같은 namespace에서 이름이 incident resource명으로 시작하는 service를 최대 8개 남긴다. |
| `endpoints` | list<object> | 같은 namespace에서 이름이 incident resource명으로 시작하는 endpoint를 최대 8개 남긴다. |
| `_lineage` | object | 원본 evidence lineage가 있으면 유지한다. |

선택 기준:

- pod는 `name == resource_name`, `owner_name == resource_name`, 또는 `workload_key`가 `/<resource_name>`으로 끝나면 우선 선택한다.
- event는 `involved_name`이 선택된 pod 이름이거나 resource 이름이면 우선 선택한다.
- 관련 항목이 없으면 같은 namespace의 앞쪽 항목을 제한 개수만큼 사용한다.

#### `metrics:telemetry_metrics`

producer:

- `PrometheusMetricsProvider`
- `collect_evidence_items()` -> `compact_metrics_value()`

입력 위치:

```text
ClusterEvidenceReceivedBody.metrics
```

RCA evidence item:

```json
{
  "source": "metrics",
  "name": "telemetry_metrics",
  "value": {}
}
```

`value`는 metric provider result를 compact한 형태다.

| 필드 | 타입 | 코드 기준 생성 규칙 |
| --- | --- | --- |
| `_lineage` | object | 원본 evidence lineage가 있으면 유지한다. |
| `source` | string | 입력 payload에 있으면 유지한다. |
| `status` | string | 입력 payload에 있으면 유지한다. |
| `query_count` | number | 입력 payload에 있으면 유지한다. |
| `result_count` | number | 입력 payload에 있으면 유지한다. |
| `results` | object | query name별 결과를 최대 12개 남긴다. |
| `summary` | object | `results`가 없으면 payload 요약으로 대체한다. |

`results.<query_name>`은 다음 규칙으로 줄인다.

| 입력 값 | compact 규칙 |
| --- | --- |
| dict | key별로 compact한다. |
| list | 최대 8개까지만 남긴다. |
| string | 최대 1600자로 자른다. |
| nested dict/list | 값 전체 대신 요약을 남긴다. |
| `data`, `result`, `values`, `streams` list | list 내부를 최대 8개까지 재귀 compact한다. |

provider 원본 payload의 `results.<query_name>.analysis`는 nested object다.
현재 RCA evidence bundle compact 단계에서는 nested dict/list 규칙에 따라 요약될 수 있다.
원본 evidence에는 `analysis.metric_kind`가 항상 남고, 조건이 맞으면 `analysis.threshold`,
`analysis.baseline_comparison`도 남아 있다.

#### `logs:related_logs`

producer:

- `LokiLogsProvider`
- `collect_evidence_items()` -> `select_incident_log_entries()` -> `compact_log_entries()`

입력 위치:

```text
ClusterEvidenceReceivedBody.logs
```

RCA evidence item:

```json
{
  "source": "logs",
  "name": "related_logs",
  "value": {
    "entries": []
  }
}
```

`value.entries[]`는 incident namespace 로그만 최대 8개 남긴다.

| 필드 | 타입 | 코드 기준 생성 규칙 |
| --- | --- | --- |
| `entries` | list<object> | incident namespace와 맞는 log entry를 최대 8개 남긴다. |
| `entries[].streams` | list<object> | entry 안의 stream을 최대 4개 남긴다. |
| `entries[].streams[].values` | list<object> | stream 안의 sample을 최대 20개 남긴다. |
| `entries[].streams[].values[].line` | string | provider가 민감정보를 마스킹한 log line을 최대 1600자로 자른다. |
| `entries[].streams[].values[].line_truncated` | boolean | provider 단계에서 line이 4096자 제한으로 잘렸으면 true다. |
| `entries[].streams[].values[].original_line_length` | number | provider 단계에서 line이 잘렸을 때의 제한 전 마스킹된 line 길이다. |
| `entries[].line_count` | number | namespace 필터 후 남은 stream value 개수를 계산한다. |
| `entries[].pattern_counts` | object | 선택된 stream 기준으로 다시 합산한 장애 pattern별 line 개수다. legacy stream summary가 없으면 provider result 값을 유지할 수 있다. |
| `entries[].severity_counts` | object | 선택된 stream 기준으로 다시 합산한 severity별 line 개수다. legacy stream summary가 없으면 provider result 값을 유지할 수 있다. |
| `entries[].trace_ids` | list<string> | 선택된 stream에서 추출된 안전한 trace id 목록이다. legacy stream summary가 없으면 provider result 값을 유지할 수 있다. |
| `entries[].redaction_summary` | object | provider redaction 적용 여부, redacted line 개수, truncated line 개수다. namespace 필터 후 다시 계산하지 않는다. |

Loki provider는 RCA가 로그 문맥을 읽을 수 있도록 `line` 필드는 유지한다.
하지만 원문 그대로 보내지 않고 `password`, `token`, `secret`, `api_key`/`api-key`, `client_secret`/`client-secret`, `private_key`/`private-key`, `Authorization`, `Cookie`, JWT 같은
민감값을 `[REDACTED]` 계열 문자열로 바꾼 뒤 전달한다.
provider는 evidence job result 크기 보호를 위해 line을 최대 4096자로 먼저 제한하고,
RCA bundle compact 단계는 다시 최대 1600자로 줄인다.

namespace 필터:

- stream label의 `k8s_namespace_name` 또는 `namespace`가 incident namespace와 같으면 유지한다.
- namespace label이 없으면 귀속 불가라 보수적으로 유지한다.
- `streams`가 없는 legacy entry는 그대로 유지한다.

#### `traces:related_traces`

producer:

- `TempoTracesProvider`
- `collect_evidence_items()` -> `compact_traces_value()`

입력 위치:

```text
ClusterEvidenceReceivedBody.traces
```

RCA evidence item:

```json
{
  "source": "traces",
  "name": "related_traces",
  "value": {}
}
```

`value`는 metrics와 같은 compact mapping 규칙을 쓴다.
차이는 결과 개수 제한이다.

| 필드 | 타입 | 코드 기준 생성 규칙 |
| --- | --- | --- |
| `_lineage` | object | 원본 evidence lineage가 있으면 유지한다. |
| `source` | string | 입력 payload에 있으면 유지한다. |
| `status` | string | 입력 payload에 있으면 유지한다. |
| `query_count` | number | 입력 payload에 있으면 유지한다. |
| `result_count` | number | 입력 payload에 있으면 유지한다. |
| `results` | object | query name별 trace 결과를 최대 12개 남긴다. |
| `summary` | object | `results`가 없으면 payload 요약으로 대체한다. |

`results.<query_name>`은 list를 최대 8개까지 남기고, 긴 문자열은 최대 1600자로 자른다.
provider 단계에서도 trace 내부 긴 문자열은 최대 1024자로 제한되고, 중첩 list는 최대 20개만 남는다.
한 trace가 계속 너무 크면 provider가 `trace_truncated`, `original_trace_bytes`를 붙인 RCA용 summary로 대체할 수 있다.
provider 원본 payload의 `results.<query_name>.analysis`는 nested object다.
현재 RCA evidence bundle compact 단계에서는 nested dict/list 규칙에 따라 요약될 수 있다.
원본 evidence에는 `trace_summaries`, `trace_ids`, `services`, `operations`,
`status_counts`, `error_count`, `dependency_count`, `duration_ms` 같은 RCA용 표준 요약이 남아 있다.
span attribute 원문 전체나 parent/child span 관계 전체는 이 구조화 필드에 넣지 않는다.

#### `metadata:current_workload_snapshots`

producer:

- `MetadataProvider`
- query: `change_context`, `current_workload_snapshots`, `deployments`

provider bucket:

```json
{
  "metadata": {
    "change_context": {
      "current_workload_snapshots": []
    }
  }
}
```

RCA evidence item:

```json
{
  "source": "metadata",
  "name": "current_workload_snapshots",
  "value": {
    "items": []
  }
}
```

`value.items[]`:

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `workload.kind` | string | 현재는 `Deployment` 중심이다. |
| `workload.namespace` | string | workload namespace다. |
| `workload.name` | string | workload 이름이다. |
| `deployment_labels` | object | Deployment labels 중 안전한 subset이다. `app`, `app.kubernetes.io/name` 같은 식별 label을 먼저 남기고 최대 12개까지 담는다. 민감 단어가 key/value에 있으면 제외한다. |
| `pod_template_labels` | object | Pod template labels 중 안전한 subset이다. `app`, `app.kubernetes.io/name` 같은 식별 label을 먼저 남기고 최대 12개까지 담는다. 민감 단어가 key/value에 있으면 제외한다. |
| `pod_template_auth` | object | serviceAccountName, automountServiceAccountToken, imagePullSecrets name 요약이다. |
| `persistent_volume_claim_refs` | list<object> | Pod template volume이 참조하는 PVC claim name 요약이다. |
| `deployment_status` | object | Deployment replica count와 condition 요약이다. |
| `pod_statuses` | list<object> | owned Pod phase, ready, condition 샘플 요약이다. |
| `containers[].name` | string | container 이름이다. |
| `containers[].image` | string | 현재 cluster에서 보이는 container image다. |
| `containers[].ports` | list<object> | container `ports[]`의 `name`, `container_port`, `protocol` 요약이다. Service targetPort와 probe port 비교에 쓴다. hostPort/hostIP는 넣지 않는다. |
| `containers[].readiness_probe` | object | readiness probe 요약이다. |
| `containers[].liveness_probe` | object | liveness probe 요약이다. |
| `containers[].startup_probe` | object | startup probe 요약이다. |
| `containers[].resources` | object | requests/limits 요약이다. |
| `replicaset_revisions[].name` | string | Deployment가 소유한 ReplicaSet 이름이다. |
| `replicaset_revisions[].revision` | string | `deployment.kubernetes.io/revision` 값이다. |
| `pod_status_count` | number | `pod_statuses`가 샘플로 잘렸을 때만 있는 전체 Pod 수다. |
| `pod_statuses_truncated` | boolean | `pod_statuses`가 샘플로 잘렸을 때 true다. |
| `replicaset_revision_count` | number | `replicaset_revisions`가 샘플로 잘렸을 때만 있는 전체 ReplicaSet 수다. |
| `replicaset_revisions_truncated` | boolean | `replicaset_revisions`가 샘플로 잘렸을 때 true다. |

probe summary:

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `path` | string 또는 null | HTTP probe path다. |
| `port` | string 또는 number 또는 null | probe port다. |
| `timeout_seconds` | number 또는 null | timeout 설정이다. |
| `period_seconds` | number 또는 null | probe 주기다. |
| `failure_threshold` | number 또는 null | 실패 threshold다. |

보안 기준:

- `kubectl.kubernetes.io/last-applied-configuration` 같은 raw manifest annotation은 제외한다.
- `secret`, `token`, `password`, `credential`, `authorization`, `private` 계열 annotation은 제외한다.
- raw env value, Secret value, token value는 넣지 않는다.

#### `metadata:current_workload_snapshot`

producer:

- `MetadataProvider`
- query: `deployment/<name>`, `deployment/<namespace>/<name>`, `<namespace>/<name>`

provider bucket:

```json
{
  "metadata": {
    "change_context": {
      "current_workload_snapshot": {}
    }
  }
}
```

RCA evidence item:

```json
{
  "source": "metadata",
  "name": "current_workload_snapshot",
  "value": {}
}
```

`value`는 `current_workload_snapshots.items[]`의 summary 필드에 detail-only 필드를 더한 형태다.
특정 Deployment 하나를 자세히 볼 때 사용한다.
detail-only 필드는 안전한 `deployment_annotations`, `pod_template_annotations`,
`managed_fields_managers`, `scheduling_constraints`, env/envFrom/volume reference,
referenced ConfigMap/Secret object summary, ReplicaSet condition 요약이다.

#### `metadata:change_context`와의 관계

현재 provider bucket 이름은 `change_context`지만, RCA v1에서는 이 이름을
GitOps 변경 이력으로 해석하지 않는다.

현재 의미는 다음과 같다.

```text
metadata.change_context.current_workload_snapshots
= target agent가 Kubernetes API로 본 현재 workload metadata snapshot 목록
```

RCA bundle builder는 이 값을 다음 evidence item으로 승격한다.

```text
metadata:current_workload_snapshots
metadata:current_workload_snapshot
metadata:service_selector_matches
metadata:endpoint_slice_ready_endpoints
```

큰 namespace에서는 provider가 evidence job result의 1MiB JSON 제한을 피하기 위해
metadata 목록을 샘플로 제한할 수 있다.
이때 provider bucket에는 `metadata.change_context.collection_limits`가 남고,
각 list별 `original_count`와 `returned_count`로 잘린 범위를 알 수 있다.
RCA evidence item으로 승격될 때는 해당 목록 item의 `value.collection_limit`에도
같은 제한 정보가 붙는다.
Service selector의 `matched_pods`, EndpointSlice의 `ready_targets`, workload의
`pod_statuses`와 `replicaset_revisions`도 샘플로 제한될 수 있으며, 전체 count와
`*_truncated` flag가 함께 제공된다.

Git commit, rollback 가능 여부, risk level, 실제 배포 이력은 이 schema의 필수 근거가 아니다.
그 정보가 필요하면 GitOps/SCM/Safe PR 단계에서 별도 근거로 다룬다.

## CauseCandidate와 CauseEvaluation

producer:

- `plan-worker`: `CauseCandidate`
- `analyze-worker`: `CauseEvaluation`

consumer:

- `rca-worker`
- dashboard root cause detail

| 객체 | 필드 | 왜 필요한가 |
| --- | --- | --- |
| `CauseCandidate` | `candidate_id` | 평가 결과와 후보를 연결한다. |
| `CauseCandidate` | `title` | 사람이 보는 원인 후보 이름이다. |
| `CauseCandidate` | `description` | 후보가 무엇을 의미하는지 설명한다. |
| `CauseCandidate` | `expected_evidence` | 이 후보를 판단하려면 어떤 근거가 필요한지 적는다. |
| `CauseCandidate` | `checks` | evaluator가 수행해야 할 체크 목록이다. |
| `CauseEvaluation` | `candidate_id` | 후보와 평가를 join한다. |
| `CauseEvaluation` | `score` | 후보 우선순위다. |
| `CauseEvaluation` | `checks` | 어떤 check가 실행됐는지 표시한다. |
| `CauseEvaluation` | `supporting_evidence` | 결론을 지지하는 evidence key다. |
| `CauseEvaluation` | `missing_evidence` | 확신을 낮추거나 action_required로 보내는 근거다. |
| `CauseEvaluation` | `reason` | 왜 이 점수인지 사람이 읽는 설명이다. |

## RcaCompletedBody와 RcaActionRequiredBody

producer: `rca-worker`  
consumer: `recovery-worker`, dashboard projection, audit

| event | 필드 | 왜 필요한가 |
| --- | --- | --- |
| `rca.completed` | `root_cause` | 최종 원인이다. |
| `rca.completed` | `action` | 다음 조치의 큰 방향이다. |
| `rca.completed` | `evidence_ref` | 근거 없이 결론만 떠도는 일을 막는다. |
| `rca.completed` | `rca_detail` | confidence, candidate, supporting/missing evidence를 담는다. |
| `rca.completed` | `incident` | 화면과 recovery target을 연결한다. |
| `rca.completed` | `evidence_bundle` | PR body와 dashboard 근거 표시에 쓴다. |
| `rca.action_required` | `reason` | 자동 진행을 멈춘 이유다. |
| `rca.action_required` | `evidence_ref` | 어떤 증거에서 멈췄는지 추적한다. |

저장 table: `rca_reports`

| 컬럼 | 왜 필요한가 |
| --- | --- |
| `workspace_id` | tenant 분리다. |
| `correlation_id` | timeline grouping이다. |
| `root_cause` | 검색/요약용 컬럼이다. |
| `action` | 추천 조치 요약이다. |
| `payload` | 상세 결과 전체다. |
| `created_at` | 최신 보고서 판단 기준이다. |

## RecoveryPlan

producer: `recovery-worker`, `select-worker`  
consumer: `dispatch-worker`, dashboard

| 필드 | 왜 필요한가 |
| --- | --- |
| `plan_id` | 복구 후보 묶음 ID다. |
| `incident_id` | 어떤 장애에서 나온 계획인지 연결한다. |
| `evidence_ref` | 근거 연결이다. |
| `summary` | 화면 카드 제목이다. |
| `target` | namespace/resource_kind/resource_name 같은 조치 대상이다. |
| `recommended_action_id` | 기본 추천 후보다. |
| `execution_route` | `command`, `safe_pr`, `manual` 중 어디로 보낼지 결정한다. |
| `selection_required` | 자동 선택 가능한지 사람이 골라야 하는지 구분한다. |
| `candidates` | 선택 가능한 복구 후보 목록이다. |

`RecoveryActionCandidate`는 action의 안전 기준을 담는다.

| 필드 | 왜 필요한가 |
| --- | --- |
| `risk_level` | 승인/차단 기준이다. |
| `blast_radius` | 영향 범위 설명이다. |
| `approval_required` | 바로 실행할지 승인 요청으로 보낼지 결정한다. |
| `prerequisites` | 실행 전 확인 조건이다. |
| `validation_checks` | 실행 후 검증 조건이다. |
| `rollback_plan` | 실패 시 되돌리는 방법이다. |
| `evidence_refs` | 이 후보가 어떤 근거에서 나왔는지 연결한다. |

## Command schema

producer:

- `POST /commands`
- `dispatch-worker`
- approval grant route
- debug query route

consumer:

- `command-worker`
- target agent command poll

| 객체 | 필드 | 왜 필요한가 |
| --- | --- | --- |
| `CommandRequestedBody` | `workspace_id` | tenant 분리다. |
| `CommandRequestedBody` | `cluster_id` | target agent route다. |
| `CommandRequestedBody` | `action` | agent handler 선택 기준이다. |
| `CommandRequestedBody` | `namespace` | Kubernetes write boundary다. |
| `CommandRequestedBody` | `reason` | 감사 로그와 화면 설명이다. |
| `CommandRequestedBody` | `diff` | 어떤 리소스를 왜 바꾸는지 담는다. |
| `CommandRequestedBody` | `approval_ref` | 승인 근거다. |
| `CommandRequestedBody` | `policy_decision_ref` | 정책 판단 근거다. |
| `Plan` | `command_id` | agent queue와 result 연결 ID다. |
| `Plan` | `idempotency_key` | 같은 요청 중복 실행을 줄인다. |
| `Plan` | `lease` | agent가 명령을 오래 쥐고 있을 수 없게 한다. |
| `Plan` | `retry_policy` | 실패 재시도 기준이다. |
| `Plan` | `routing_constraint` | 어떤 cluster agent가 가져가야 하는지 고정한다. |
| `CommandCompletedBody` | `command_id` | 실행 결과를 queue row와 연결한다. |
| `CommandCompletedBody` | `result` | stdout/stderr/resources/status를 담는다. |

권한:

- `/commands`: cluster `deploy.run` 필요
- `/agent/debug/query`: cluster `evidence.read` 필요
- agent poll/start/heartbeat/result: `x-agent-token` 필요

## Safe PR schema

파일: `src/domains/scm/events.py`

producer:

- `dispatch-worker`
- `scm-worker`

consumer:

- `src/services/gitops/scm-worker/app.py`

| 객체 | 필드 | 왜 필요한가 |
| --- | --- | --- |
| `SafePrFilePatch` | `path` | branch에 커밋할 파일 경로다. |
| `SafePrFilePatch` | `content` | 커밋할 최종 파일 내용이다. |
| `SafePrFilePatch` | `description` | PR body에서 변경 이유를 설명한다. |
| `SafePrRequestedBody` | `title` | PR 제목이다. |
| `SafePrRequestedBody` | `body` | RCA 근거, 변경 이유, 검증 방법을 담는다. |
| `SafePrRequestedBody` | `provider` | 현재 실제 처리자는 `github` provider다. |
| `SafePrRequestedBody` | `patches` | 실제 커밋할 파일 변경 목록이다. |
| `SafePrRequestedBody` | `repository_id` | 어느 repository에 PR을 만들지 찾는다. |
| `SafePrRequestedBody` | `binding_id` | 배포 binding과 연결한다. |
| `SafePrRequestedBody` | `next_alert` | PR 이후 알림을 이어붙일 때 쓴다. |
| `SafePrCreatedBody` | `pr_url` | dashboard 버튼과 audit 기록에 쓴다. |
| `SafePrFailedBody` | `reason` | credential/provider/repo 설정 문제를 사람이 고칠 수 있게 한다. |

현재 실제 PR 생성 경계:

- `src/services/gitops/scm-worker/app.py`
- `GithubScmProvider`

## Permission schema

파일:

- `src/packages/contracts/identity.py`
- `src/domains/identity/models.py`
- `src/domains/identity/repository.py`
- `src/domains/identity/dependencies.py`

| 객체/테이블 | 필드 | 왜 필요한가 |
| --- | --- | --- |
| `AuthSession` | `token` | httpOnly cookie 또는 header로 들어오는 세션 ID다. |
| `AuthSession` | `user_id` | 권한 검사 subject다. |
| `AuthSession` | `roles` | account admin 여부를 판단한다. |
| `AuthSession` | `workspace_id` | query/API 기본 tenant다. |
| `OrganizationMember` | `organization_id`, `user_id`, `role` | 사용자가 어느 조직의 소유자/관리자/구성원인지 나타낸다. |
| `GroupMember` | `group_id`, `user_id`, `role` | 그룹 관리자/구성원 여부를 나타낸다. |
| `ResourceAssignment` | `organization_id`, `group_id`, `resource_type`, `resource_id` | 특정 리소스를 조직의 특정 그룹에 배정한다. |
| `MemberResourceRole` | `resource_assignment_id`, `user_id`, `role` | 사용자가 그 리소스에서 어떤 작업 책임을 가지는지 나타낸다. |
| `RolePermission` | `organization_id`, `resource_type`, `role`, `permission` | 전역 기본 또는 조직별 리소스 역할 정책이다. |

권한 함수:

| 함수 | 어디에 쓰는가 | 왜 필요한가 |
| --- | --- | --- |
| `require_session` | 일반 사용자 API | 로그인 없이 접근하지 못하게 한다. |
| `require_admin_session` | 사용자 승인, cluster policy 변경 | 서비스 최고 관리자만 가능한 작업을 분리한다. |
| `require_cluster_agent` | agent route | body가 아니라 token registry 기준으로 cluster/workspace를 확정한다. |
| `require_resource_access` | 새 dashboard/query API | backend 단건 권한 차단 기준이다. |
| `require_cluster_access` | command/debug/approval/dashboard cluster API | cluster 권한 shortcut이다. |
| `accessible_resource_ids` | dashboard list query | 목록 조회에서 허용된 resource만 남긴다. |

검증:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_identity_repository.py \
  tests/test_command_router.py \
  tests/test_gitops_approval_router.py \
  tests/test_realtime_gateway.py \
  -q
```

## Dashboard read model schema

파일:

- `src/domains/dashboard/models.py`
- `src/domains/dashboard/repository.py`
- `src/domains/dashboard/router.py`
- `src/services/projection/dashboard-worker/app.py`
- `src/packages/contracts/gateway/responses.py`

이 read model은 이미 구현되어 있다. 목적은 frontend가 event payload 전체를 직접 파싱하지 않고, 권한이 적용된 `RcaTimelineResponse`만 읽게 하는 것이다.

| 필드 | 타입 | 왜 필요한가 | producer | consumer |
| --- | --- | --- | --- | --- |
| `workspace_id` | `str` | 모든 dashboard query의 첫 번째 filter다. | event body | router |
| `correlation_id` | `str` | command/evidence/RCA/PR timeline을 묶는다. | event envelope | UI |
| `cluster_id` | `str | None` | cluster filter와 권한 검사 기준이다. event에 없으면 기존 row 값을 보존한다. | event body | router/UI |
| `incident_id` | `str | None` | incident detail page route다. | `IncidentRecord` | UI |
| `evidence_ref` | `str | None` | 어떤 evidence window에서 나온 RCA인지 추적한다. | `Evidence.object_ref`, RCA body | UI |
| `current_subject` | `str` | 지금 어느 단계인지 표시한다. | event envelope | UI |
| `status` | `str` | badge와 filter에 쓴다. | projection rule | UI |
| `root_cause` | `str | None` | RCA 결과 요약이다. | `RcaCompletedBody` | UI |
| `confidence` | `float | None` | 결론 신뢰도를 표시한다. | `RcaReportDetail` | UI |
| `supporting_evidence` | `list[str]` | 결론 근거다. | `RcaReportDetail` | UI |
| `missing_evidence` | `list[str]` | 추가 수집이 필요한 항목이다. | `EvidenceBundle`, `RcaReportDetail` | UI |
| `action_route` | `str | None` | command/PR/manual 상태 전환 기준이다. | `RecoveryPlan` | UI |
| `command_id` | `str | None` | command result detail과 연결한다. | `CommandQueuedForAgentBody` | UI |
| `pr_url` | `str | None` | PR 버튼이다. | `SafePrCreatedBody` | UI |
| `error_reason` | `str | None` | 실패를 사람이 고칠 수 있게 보여준다. | failure/action-required event | UI |
| `last_event_id` | `str` | 마지막 반영 event를 추적한다. | event envelope | 운영 디버깅 |
| `last_event_at` | `str` | 최신 상태 시각을 표시한다. | event envelope | UI |
| `payload` | `dict` | 마지막 event payload를 보관한다. | event payload | 운영 디버깅 |

status mapping은 `src/domains/dashboard/repository.py`의 `RCA_TIMELINE_STATUS_BY_SUBJECT`가 단일 출처다.

| event subject | dashboard status | 왜 필요한가 |
| --- | --- | --- |
| `cluster.evidence.received` | `evidence_received` | target agent가 증거 window를 보낸 상태다. |
| `evidence.built` | `evidence_built` | RCA 공통 evidence 객체가 생긴 상태다. |
| `incident.detected` | `incident_detected` | 장애로 판단된 상태다. |
| `evidence.bundle.built` | `evidence_bundled` | incident별 판단 근거가 묶인 상태다. |
| `rca.rule_missing` | `rule_missing` | 현재 symptom에 맞는 RCA rule이 없는 상태다. |
| `rca.backlog.created` | `backlog_created` | rule 보강 backlog가 만들어진 상태다. |
| `rca.ai_fallback.requested` | `ai_fallback_requested` | rule 미매칭 보조 분석이 요청된 상태다. |
| `rca.candidates.planned` | `rca_planned` | 원인 후보가 만들어진 상태다. |
| `rca.candidates.evaluated` | `rca_evaluated` | 후보별 점수와 근거가 계산된 상태다. |
| `rca.completed` | `rca_completed` | 최종 원인과 조치 방향이 나온 상태다. |
| `rca.action_required` | `action_required` | 자동 진행이 막혀 사람이 봐야 하는 상태다. |
| `recovery.planned` | `recovery_planned` | 복구 후보 묶음이 만들어진 상태다. |
| `recovery.selection_requested` | `selection_required` | 사람이 복구 후보를 골라야 하는 상태다. |
| `recovery.action_selected` | `recovery_selected` | 선택된 복구 route가 정해진 상태다. |
| `approval.recommended` | `approval_recommended` | 승인/거절 보조 판단이 기록된 상태다. |
| `command.requested` | `command_requested` | command 실행 요청이 들어간 상태다. |
| `command.dispatched` | `command_dispatched` | command route가 정해진 상태다. |
| `command.queued_for_agent` | `command_queued` | target agent poll queue에 들어간 상태다. |
| `command.completed` | `command_completed` | target agent 실행이 끝난 상태다. |
| `command.rejected` | `command_rejected` | 정책 위반으로 command가 거절된 상태다. |
| `safe_pr.requested` | `pr_requested` | PR 생성을 요청한 상태다. |
| `safe_pr.patch_prepared` | `pr_patch_prepared` | PR patch 초안이 준비된 상태다. |
| `diff.explained` | `pr_diff_explained` | patch diff와 위험 설명이 준비된 상태다. |
| `safe_pr.created` | `pr_created` | 실제 PR URL이 만들어진 상태다. |
| `safe_pr.failed` | `pr_failed` | PR 생성이 실패한 상태다. |

지킬 기준:

- table query는 항상 `workspace_id`로 먼저 좁힌다.
- cluster 목록은 `accessible_resource_ids(user_id, workspace_id, "cluster", "rca.read")` 결과로 한 번 더 좁힌다.
- `None`이 반환되면 서비스 최고 관리자라 전체 리소스를 볼 수 있다는 뜻이다.
- set이 반환되면 그 resource ID만 조회한다.
- frontend는 숨김/비활성화로 사용성을 개선할 뿐, 권한 차단은 backend가 한다.

검증:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_dashboard_projection.py \
  tests/test_dashboard_router.py \
  -q
```
