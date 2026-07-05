# Target / Telemetry: 현재 구현 기준 작업 계획

## 목적

이 문서는 Target/Telemetry 담당자가 지금 repository에 있는 실제 코드 기준으로
무엇을 고치고, 어디를 확인하고, 어떤 테스트로 검증해야 하는지 정리한 작업 계획이다.

중요한 기준은 하나다.

```text
Kubernetes snapshot -> metrics -> logs -> traces
```

이 네 bucket은 같은 evidence job 흐름에서 채워져야 한다. 새 provider를 붙일 때도
Management나 RCA가 provider 내부 구현을 몰라도 `cluster.evidence.received` payload만
읽으면 되게 만들어야 한다.

## 먼저 확인할 현재 코드

| 역할 | 실제 파일 | 왜 봐야 하는가 |
| --- | --- | --- |
| Agent process | `src/services/target/cluster-agent/agent.py` | Gateway connect, command poll, result post, evidence post 흐름이 있다. |
| Evidence collector | `src/services/target/cluster-agent/evidence/collector.py` | provider들을 같은 방식으로 실행하고 evidence bucket에 합친다. |
| Provider registry | `src/services/target/cluster-agent/telemetry_registry.py` | `@telemetry.source`가 source, evidence_key, query type의 단일 출처다. |
| Query value objects | `src/services/target/cluster-agent/queries/registry.py` | `PrometheusRangeQuery`, `KubernetesSnapshotQuery`가 여기 있다. |
| Prometheus provider | `src/services/target/cluster-agent/providers/prometheus_providers.py` | `/api/v1/query`, `/api/v1/query_range`를 실제로 호출한다. |
| Loki provider | `src/services/target/cluster-agent/providers/loki_providers.py` | LogQL query를 `logs` bucket으로 정규화한다. |
| Tempo provider | `src/services/target/cluster-agent/providers/tempo_providers.py` | TraceQL query를 `traces` bucket으로 정규화한다. |
| Kubernetes provider | `src/services/target/cluster-agent/providers/kubernetes_providers.py` | pod/event/node/workload/service/endpoints snapshot을 `kubernetes` bucket에 넣는다. |
| Debug query route | `src/domains/command/router.py` | `POST /agent/debug/query`를 `telemetry.query.run` command로 queue한다. |
| Gateway contract | `src/packages/contracts/gateway/requests.py`, `responses.py`, `routes.py` | `AgentDebugQueryRequest`, `AgentDebugQueryResponse`, `AGENT_DEBUG_QUERY_PATH` 계약이다. |

## 현재 동작 흐름

```text
Management Gateway
  POST /agent/debug/query
  -> require_cluster_read_access()
  -> debug_query_plan()
  -> db.queue_agent_command(..., action="telemetry.query.run")

Target Agent
  poll /agent/commands/poll
  -> @command.handler("telemetry.query.run")
  -> TelemetryQueryDefinition.from_mapping()
  -> definition.to_provider_query()
  -> EvidenceCollector.run_query()
  -> provider.query()
  -> normalized result
  -> /agent/commands/{command_id}/result
```

Evidence job 흐름은 debug query와 같은 provider registry를 쓴다.

```text
evidence job
  -> EvidenceCollector.collect()
  -> KubernetesSnapshotProvider
  -> PrometheusMetricsProvider
  -> LokiLogsProvider
  -> TempoTracesProvider
  -> cluster.evidence.received
  -> RCA worker
```

## source와 evidence_key 기준

| source | provider | query value object | evidence bucket |
| --- | --- | --- | --- |
| `kubernetes` | `KubernetesSnapshotProvider` | `KubernetesSnapshotQuery` | `kubernetes` |
| `prometheus` | `PrometheusMetricsProvider` | `PrometheusInstantQuery`, `PrometheusRangeQuery` | `metrics` |
| `loki` | `LokiLogsProvider` | `LokiLogQuery` | `logs` |
| `tempo` | `TempoTracesProvider` | `OpenTelemetrySpanQuery` | `traces` |

source 이름을 if/elif로 새로 해석하지 않는다. provider class에 붙은
`@telemetry.source(...)`가 등록 기준이다.

## 새 query를 추가하는 순서

1. `TelemetryQueryDefinition` payload shape를 먼저 정한다.
2. source가 기존 source인지 확인한다.
3. range window가 필요하면 Prometheus에만 `range_seconds`, `step_seconds`를 둔다.
4. `TelemetryQueryDefinition.to_provider_query()`가 올바른 value object를 만드는지 테스트한다.
5. provider의 `normalize_payload()` 결과가 RCA가 읽을 수 있는 bounded summary인지 확인한다.
6. debug query route 또는 evidence job으로 실제 queue/result 흐름을 검증한다.

Prometheus range query 예시:

```json
{
  "cluster_id": "target-cluster-01",
  "query": {
    "source": "prometheus",
    "name": "pod_restart_increase",
    "description": "최근 15분 pod restart 증가량",
    "query": "increase(kube_pod_container_status_restarts_total[15m])",
    "range_seconds": 900,
    "step_seconds": 30
  }
}
```

이 payload는 `POST /agent/debug/query`에서 queue되고, agent 내부에서는
`PrometheusRangeQuery`가 된다. provider는 `/api/v1/query_range`를 호출하고
`query_mode=range`, `series`, `point_count`를 가진 결과로 정규화한다.

## Kubernetes snapshot 기준

`KubernetesSnapshotProvider`는 ServiceAccount token과 Kubernetes API base URL이 있으면
실제 Kubernetes API를 읽는다. 읽는 대상은 아래와 같다.

- namespace pods
- namespace events
- nodes
- deployments
- statefulsets
- daemonsets
- replicasets
- services
- endpoint slices

Kubernetes API 설정이 없으면 provider는 예외로 전체 collector를 깨지 않고
`status=unavailable`, `reason`, `namespace`, `cluster_id`를 반환한다. 이 값도
`kubernetes.provider_status`에 남기므로 RCA는 어떤 증거가 비어 있는지 알 수 있다.

## 작업자가 자주 수정하는 파일

| 하고 싶은 일 | 수정 위치 | 같이 고칠 테스트 |
| --- | --- | --- |
| 새 metric query 추가 | `queries/registry.py` 또는 query 등록 지점 | `tests/test_telemetry_registry.py`, `tests/test_target_metric_evidence.py` |
| Prometheus range 결과 모양 변경 | `providers/prometheus_providers.py` | `tests/test_target_metric_evidence.py` |
| Kubernetes snapshot 필드 추가 | `providers/kubernetes_providers.py` | `tests/test_target_kubernetes_evidence.py` |
| log evidence 모양 변경 | `providers/loki_providers.py` | `tests/test_target_log_evidence.py` |
| trace evidence 모양 변경 | `providers/tempo_providers.py` | `tests/test_target_trace_evidence.py` |
| debug query 권한/queue 변경 | `domains/command/router.py` | `tests/test_command_router.py` |
| agent command payload 변경 | `agent.py`, `queries/payloads.py` | `tests/test_target_agent_commands.py` |

## PR을 나누는 순서

| 순서 | 목표 | 완료 기준 |
| --- | --- | --- |
| 1 | provider registry 계약 확인 | `@telemetry.source`와 source/evidence_key/query type 테스트가 통과한다. |
| 2 | Prometheus instant/range query 보강 | instant는 `/api/v1/query`, range는 `/api/v1/query_range`로 나뉜다. |
| 3 | Kubernetes snapshot 보강 | `kubernetes` bucket에 pod/event/node/workload/service/endpoints가 들어간다. |
| 4 | debug query 흐름 검증 | `/agent/debug/query`가 cluster read 권한을 검사하고 command를 queue한다. |
| 5 | evidence job 통합 검증 | `kubernetes`, `metrics`, `logs`, `traces` bucket이 같은 evidence window에서 만들어진다. |
| 6 | RCA 연결 검증 | `cluster.evidence.received`가 RCA worker 테스트에서 실제 evidence로 쓰인다. |

## 바로 돌릴 테스트

작업 시작 전:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_telemetry_registry.py \
  tests/test_target_metric_evidence.py \
  tests/test_target_log_evidence.py \
  tests/test_target_trace_evidence.py \
  tests/test_target_kubernetes_evidence.py \
  tests/test_command_router.py \
  tests/test_target_agent_commands.py -q
```

작업 후 전체 확인:

```bash
PYTHONPATH=src .venv/bin/ruff check src tests
PYTHONPATH=src .venv/bin/python -m pytest -q
```

## 완료 기준

- provider source 이름이 문서, contract, test에서 같아야 한다.
- raw provider response 전체를 event에 그대로 싣지 않는다.
- Kubernetes, metrics, logs, traces 중 일부가 실패해도 실패 상태와 이유가 evidence에 남아야 한다.
- debug query는 deploy 권한이 아니라 cluster read 권한으로만 열린다.
- Target Agent는 DB/NATS를 직접 알지 않고 Gateway HTTP command/result 경로로만 연결된다.
