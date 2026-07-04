# 민정: Command + Target + Evidence

민정 파트는 target cluster 안에서 실제 상태를 읽고, management plane이 실행할 command를 안전하게 처리하는 역할이다.

끝에서 가인에게 넘기는 값은 보통 `cluster.evidence.received`다. command를 실행했다면 `command.completed`도 같이 흐른다.

## 먼저 열 파일

| 순서 | 파일 | 이유 |
| --- | --- | --- |
| 1 | `src/services/target/cluster-agent/agent.py` | agent가 command, policy, evidence loop를 같이 돌리는 중심 |
| 2 | `src/services/target/cluster-agent/evidence/jobs.py` | evidence scheduler와 provider worker pool |
| 3 | `src/services/target/cluster-agent/evidence/collector.py` | provider query 실행과 payload 조립 |
| 4 | `src/services/target/cluster-agent/providers/` | Kubernetes, Prometheus, Loki, Tempo provider |
| 5 | `src/services/target/cluster-agent/queries/registry.py` | `TelemetryQueryDefinition`, query 값 객체 |
| 6 | `src/services/target/cluster-agent/telemetry_registry.py` | `@telemetry.source(...)` 등록 방식 |
| 7 | `src/domains/target/router.py` | evidence job HTTP API |
| 8 | `src/domains/command/router.py` | command와 debug query HTTP API |
| 9 | `src/domains/target/evidence_policy.py` | 기본 provider query 목록 |

## 데코레이터 사용법

provider를 추가할 때는 provider class 위에 `@telemetry.source(...)`를 붙인다.

```python
@telemetry.source(
    source="prometheus",
    evidence_key="metrics",
    query_type=PrometheusInstantQuery,
    range_query_type=PrometheusRangeQuery,
)
class PrometheusMetricsProvider:
    ...
```

의미는 아래처럼 읽으면 된다.

| 값 | 의미 |
| --- | --- |
| `source` | query definition에서 쓰는 이름 |
| `evidence_key` | 최종 evidence payload bucket 이름 |
| `query_type` | 일반 query 값 객체 |
| `range_query_type` | range query를 지원할 때만 넣는 값 객체 |

collector와 scheduler는 provider 목록을 직접 외우지 않는다. provider가 자기 계약을 등록하면 registry가 source와 evidence key를 이어준다.

## Evidence provider 현재 구현

| provider key | source | 값 객체 | 결과 bucket |
| --- | --- | --- | --- |
| `kubernetes` | `kubernetes` | `KubernetesSnapshotQuery` | `kubernetes` |
| `metrics` | `prometheus` | `PrometheusInstantQuery`, `PrometheusRangeQuery` | `metrics` |
| `logs` | `loki` | `LokiLogQuery` | `logs` |
| `traces` | `tempo` | `OpenTelemetrySpanQuery` | `traces` |

`KubernetesSnapshotProvider`는 pods, events, nodes, workloads, services, endpoint slices를 읽는다.

`PrometheusRangeQuery`는 `range_seconds`, `step_seconds`가 있을 때 만들어지고 `/api/v1/query_range`를 호출한다.

## Command 흐름

```text
POST /commands
  -> command.requested
  -> command-worker
  -> agent_commands queue
  -> GET /agent/commands/poll
  -> POST /agent/commands/{command_id}/start
  -> heartbeat
  -> POST /agent/commands/{command_id}/result
  -> command.completed
```

민정이 지켜야 하는 기준:

- agent는 management로 outbound HTTP만 한다.
- agent route는 `x-agent-token` identity를 기준으로 workspace/cluster를 정한다.
- write command는 approval/policy evidence 없으면 막는다.
- sandbox namespace 밖 write는 조심해서 다룬다.
- result에는 token, kubeconfig, service account token을 넣지 않는다.

## Debug query 흐름

provider query 하나를 agent로 보내 확인할 때는 `POST /agent/debug/query`를 쓴다.

```text
POST /agent/debug/query
  -> cluster read access 확인
  -> action=telemetry.query.run plan 생성
  -> agent_commands queue
  -> Target Agent poll
  -> provider query 실행
  -> command result 보고
```

요청 예시:

```json
{
  "cluster_id": "target-cluster-01",
  "reason": "RCA 확인용",
  "query": {
    "source": "prometheus",
    "name": "restart_rate",
    "description": "Restart trend.",
    "query": "increase(kube_pod_container_status_restarts_total{namespace=\"target\"}[15m])",
    "range_seconds": 900,
    "step_seconds": 30
  }
}
```

## Evidence job 흐름

```text
EvidenceJobScheduler.schedule_once()
  -> POST /agent/evidence/jobs
  -> provider별 job 생성

EvidenceJobScheduler.work_once(provider_key)
  -> GET /agent/evidence/jobs/poll
  -> provider query 실행
  -> POST /agent/evidence/jobs/{job_id}/result

Management
  -> 같은 evidence_key의 모든 provider terminal 확인
  -> cluster.evidence.received 발행
```

가인에게 넘어가는 payload의 핵심:

- `workspace_id`
- `cluster_id`
- `agent_id`
- `source_id`
- `window_start`
- `evidence_key`
- `kubernetes`
- `metrics`
- `logs`
- `traces`

`correlation_id`는 body 필드가 아니라 event envelope 메타데이터다.

## 연습 순서

1. `tests/test_telemetry_registry.py`에서 provider 등록을 본다.
2. `tests/test_target_kubernetes_evidence.py`에서 Kubernetes snapshot normalize를 본다.
3. `tests/test_target_metric_evidence.py`에서 instant/range query를 본다.
4. `tests/test_target_evidence_jobs.py`에서 schedule/poll/result/aggregate를 본다.
5. `tests/test_command_router.py`에서 debug query queue plan을 본다.
6. `tests/test_target_agent_commands.py`에서 agent command 실행 경로를 본다.

## 바로 돌릴 테스트

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_telemetry_registry.py \
  tests/test_target_kubernetes_evidence.py \
  tests/test_target_metric_evidence.py \
  tests/test_target_log_evidence.py \
  tests/test_target_trace_evidence.py \
  tests/test_target_evidence_jobs.py \
  tests/test_command_router.py \
  tests/test_target_agent_commands.py \
  -q
```

## 민정이 바꾸면 같이 봐야 하는 것

| 바꾸는 것 | 같이 확인할 것 |
| --- | --- |
| provider query payload | `TelemetryQueryDefinition`, provider별 evidence test |
| provider key | `telemetry_registry`, `evidence_policy`, scheduler test |
| command action | action catalog, command worker, target agent handler |
| evidence bucket shape | RCA evidence builder, projection/realtime contract |
| route path | `routes.py`, router test, docs |

내부 구현은 바꿔도 된다. 대신 event/API/payload 계약은 말없이 바꾸지 않는다.
