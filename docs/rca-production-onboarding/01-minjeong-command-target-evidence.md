# 민정: Command + Target + Evidence

민정 파트의 목표는 target cluster 내부에서 실제 상태를 읽고, management plane이 내려준 command를 안전하게 처리한 뒤, 가인이 RCA에 쓸 수 있는 evidence window를 넘기는 것이다.

끝에서 넘기는 값은 두 가지다.

- command 실행 결과: `command.completed`
- RCA 입력 증거: `cluster.evidence.received`

## 먼저 열 파일 순서

| 순서 | 파일 | 무엇을 봐야 하는가 | 왜 먼저 보는가 |
| --- | --- | --- | --- |
| 1 | `src/services/target/cluster-agent/agent.py` | `TargetClusterAgent.run_with_client`, `poll_commands`, `execute_command`, `run_query_command` | agent가 command, policy, evidence, reconcile loop를 동시에 돌리는 중심이다. |
| 2 | `src/services/target/cluster-agent/commands/registry.py` | `@command.handler`, `@command.k8s`, `AgentCommandRegistry.execute` | agent 내부 command handler 등록 방식을 알아야 새 command를 안전하게 추가할 수 있다. |
| 3 | `src/domains/command/router.py` | `commands`, `agent_debug_query`, `poll_command`, `command_result` | management plane과 target agent가 어떤 HTTP 계약으로 연결되는지 본다. |
| 4 | `src/domains/command/handler.py` | `evaluate_command_policy`, `build_plan`, `handle_command_requested` | command가 바로 agent로 가지 않고 정책/plan/queue를 거치는 이유를 본다. |
| 5 | `src/services/target/cluster-agent/evidence/jobs.py` | `EvidenceJobScheduler.schedule_once`, `work_once`, `collect_job` | evidence가 provider별 job으로 나뉘어 schedule/poll/result 되는 구조다. |
| 6 | `src/services/target/cluster-agent/evidence/collector.py` | `collect`, `run_query`, `_collect_with_queries` | provider query 실행과 결과 package 흐름이다. |
| 7 | `src/services/target/cluster-agent/telemetry_registry.py` | `@telemetry.source`, `TelemetrySourceSpec` | provider source와 evidence bucket을 한 곳에서 연결한다. |
| 8 | `src/services/target/cluster-agent/providers/` | Kubernetes, Prometheus, Loki, Tempo provider | 실제 수집 구현을 provider별로 확인한다. |
| 9 | `src/services/target/cluster-agent/queries/registry.py` | `TelemetryQueryDefinition`, query value object | debug query와 policy query가 provider query 객체로 바뀌는 지점이다. |
| 10 | `src/domains/target/router.py` | evidence job schedule/poll/result route | provider별 결과가 모여 `cluster.evidence.received`로 발행되는 지점이다. |

## Command를 왜 이렇게 나누는가

target agent가 직접 모든 요청을 받으면 cluster inbound port와 credential 문제가 생긴다. 현재 구조는 agent가 management plane으로 outbound HTTP만 연결한다. 그래서 command는 아래 순서를 지킨다.

```text
사용자 또는 RCA
  -> command.requested
  -> command-worker policy
  -> agent_commands queue
  -> target agent poll
  -> target agent execute
  -> command.completed
```

| 값 | 어디에서 만들어지는가 | 왜 필요한가 | 어디에서 쓰이는가 |
| --- | --- | --- | --- |
| `command_id` | `build_plan()` | 재시도/중복 실행을 구분한다. | agent poll, start, heartbeat, result route |
| `idempotency_key` | `idempotency_key()` | 같은 요청이 중복 queue되는 것을 막는다. | `agent_commands.command_id` 산출 기준 |
| `lease` | `Plan.lease` | agent가 가져간 command가 멈췄을 때 회수할 기준이다. | poll/start/heartbeat/result |
| `retry_policy` | `Plan.retry_policy` | 실패 command를 어디까지 재시도할지 정한다. | command janitor, queue 상태 관리 |
| `routing_constraint` | `Plan.routing_constraint` | 어떤 cluster/agent가 실행할 수 있는지 제한한다. | `poll_command()`에서 identity와 함께 검증된다. |
| `approval_ref` | API 또는 RCA dispatch | 쓰기 command가 승인 근거 없이 실행되지 않게 한다. | `evaluate_command_policy`, target agent write guard |
| `policy_decision_ref` | API 또는 RCA dispatch | 어떤 정책 판단으로 허용됐는지 남긴다. | command plan, audit, target agent write guard |

## Command handler 추가 방법

### 일반 command

일반 command는 Kubernetes API 권한 검증이 필요하지 않은 경우에 쓴다.

```python
@command.handler("telemetry.query.run", payload_model=TelemetryQueryCommandPayload)
async def run_query_command(self, ctx: CommandContext[TelemetryQueryCommandPayload]):
    definition = self.query_definition_from_payload(ctx.payload.definition_payload())
    result = await self.evidence_collector.run_query(definition)
    return ctx.ok("telemetry query executed", query=definition.__dict__, result=result)
```

왜 필요한가:

- debug query처럼 agent 내부 기능만 실행하면 된다.
- payload model을 붙이면 잘못된 입력을 handler 앞에서 걸러낼 수 있다.
- 결과는 항상 `ctx.ok()` 또는 `ctx.fail()` 형태로 정리해야 command result가 일정해진다.

### Kubernetes write command

Kubernetes write command는 `@command.k8s(...)`를 쓴다.

```python
@command.k8s(
    "kubernetes.deployment.patch",
    api_group="apps",
    version="v1",
    resource="deployments",
    verb="patch",
    payload_model=KubernetesPatchPayload,
)
async def patch_deployment_command(self, ctx: CommandContext[KubernetesPatchPayload]):
    ...
```

왜 필요한가:

- action 이름만 보고 실행하지 않고, 어떤 API group/resource/verb인지 같이 검증한다.
- `KubernetesCommandPolicy`가 cluster role과 scope를 확인한다.
- payload model이 namespace/name/patch 구조를 검증한다.

주의할 점:

- write command는 approval 근거가 없으면 target agent에서도 막힌다.
- sandbox namespace 밖 write는 정책 확장 전까지 조심해서 다룬다.
- result에 token, kubeconfig, secret 원문을 넣지 않는다.

## Evidence provider를 왜 job으로 나누는가

RCA는 Kubernetes, metrics, logs, traces를 한 번에 필요로 하지만 네 provider의 실패 원인은 다르다. 그래서 agent는 provider별 job을 poll하고, management plane은 같은 `evidence_key`의 결과가 모이면 하나의 `cluster.evidence.received`를 만든다.

```text
schedule_once()
  -> POST /agent/evidence/jobs
  -> evidence_jobs: kubernetes, metrics, logs, traces

work_once("metrics")
  -> GET /agent/evidence/jobs/poll?provider_key=metrics
  -> PrometheusMetricsProvider.query()
  -> POST /agent/evidence/jobs/{job_id}/result
```

| provider key | 현재 provider | 왜 필요한가 | 가인에게 넘어가는 bucket |
| --- | --- | --- | --- |
| `kubernetes` | `KubernetesSnapshotProvider` | pod/event/node/workload/service/endpoint 상태가 RCA의 기본 증거다. | `kubernetes` |
| `metrics` | `PrometheusMetricsProvider` | restart, memory, latency, error rate처럼 시간 흐름이 필요한 증거다. | `metrics` |
| `logs` | `LokiLogsProvider` | app error, probe failure, dependency error 같은 문장 증거다. | `logs` |
| `traces` | `TempoTracesProvider` | dependency timeout, span error, service path를 확인한다. | `traces` |

## Provider 등록 데코레이터

provider class 위에는 `@telemetry.source(...)`를 붙인다.

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

| 인자 | 왜 필요한가 | 어디에서 쓰이는가 |
| --- | --- | --- |
| `source` | query definition이 provider를 찾을 이름이다. | `TelemetryQueryDefinition.source` |
| `evidence_key` | 최종 evidence payload bucket 이름이다. | evidence job provider key, `ClusterEvidenceReceivedBody` |
| `query_type` | 일반 query를 provider 값 객체로 만든다. | `TelemetryQueryDefinition.to_provider_query()` |
| `range_query_type` | range query 지원 여부를 명시한다. | Prometheus `/api/v1/query_range` |

## Prometheus range query 흐름

range query는 `range_seconds`가 있을 때 만들어진다.

```json
{
  "source": "prometheus",
  "name": "restart_rate",
  "description": "Pod restart trend",
  "query": "increase(kube_pod_container_status_restarts_total{namespace=\"sandbox\"}[15m])",
  "range_seconds": 900,
  "step_seconds": 30
}
```

코드 흐름:

```text
TelemetryQueryDefinition.from_mapping()
  -> range_seconds 확인
  -> PrometheusRangeQuery
  -> PrometheusMetricsProvider.query_range()
  -> /api/v1/query_range
  -> normalize_payload(result_type="matrix")
```

왜 필요한가:

- 순간값만 보면 restart 증가 추세나 latency spike를 판단하기 어렵다.
- RCA rule은 “같은 window 안에서 증가했는가”를 봐야 한다.
- 가인은 `metrics.results.<name>.query_mode == "range"`와 `series`를 보고 근거로 쓴다.

## Kubernetes snapshot provider 흐름

`KubernetesSnapshotProvider`는 service account token과 Kubernetes API base URL이 있을 때 실제 Kubernetes API를 읽는다.

수집 대상:

- pods
- events
- nodes
- deployments
- statefulsets
- daemonsets
- replicasets
- services
- endpoint slices

왜 필요한가:

- RCA의 첫 판단은 대부분 Kubernetes status/event에서 시작한다.
- `containerStatuses.state.waiting.reason`, `lastState.terminated.reason`, workload replica count, EndpointSlice ready 상태가 symptom 분류에 쓰인다.
- Prometheus/log/trace가 잠깐 비어 있어도 Kubernetes snapshot은 최소 근거가 된다.

## 민정이 넘기는 최종 evidence payload

`ClusterEvidenceReceivedBody` 기준 필드:

| 필드 | 왜 필요한가 | 다음에 쓰는 곳 |
| --- | --- | --- |
| `workspace_id` | tenant 경계다. | RCA 저장, audit, frontend filter |
| `cluster_id` | 어느 target cluster 증거인지 구분한다. | incident, command route, dashboard |
| `agent_id` | 어떤 agent가 수집했는지 남긴다. | 운영 추적, provider 문제 분석 |
| `source_id` | evidence source를 구분한다. | evidence window dedupe |
| `window_start` | 같은 시간 창의 provider 결과를 묶는다. | RCA evidence_ref, chart 기준 |
| `evidence_key` | window dedupe key다. | `evidence_windows`, RCA `evidence_ref` |
| `kubernetes` | Kubernetes 상태 요약이다. | incident classifier, cause rule |
| `metrics` | Prometheus 결과다. | cause evaluation |
| `logs` | log evidence다. | cause evaluation, RCA 설명 |
| `traces` | trace evidence다. | dependency/network RCA |

## 바로 돌릴 테스트

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_command_router.py \
  tests/test_command_worker.py \
  tests/test_target_agent_commands.py \
  tests/test_target_agent_client.py \
  tests/test_target_evidence_jobs.py \
  tests/test_target_kubernetes_evidence.py \
  tests/test_target_metric_evidence.py \
  tests/test_target_log_evidence.py \
  tests/test_target_trace_evidence.py \
  tests/test_telemetry_registry.py \
  -q
```

## 구현 체크리스트

| 작업 | 파일 | 완료 기준 |
| --- | --- | --- |
| 새 provider 추가 | `providers/*.py`, `telemetry_registry.py` | `@telemetry.source` 등록, query value object, provider test 추가 |
| 새 query 정책 추가 | `domains/target/evidence_policy.py` | provider policy에 query가 들어가고 scheduler가 job에 싣는다 |
| 새 command action 추가 | `domains/command/actions.py`, `agent.py` | action catalog, policy, handler, command test가 모두 통과 |
| debug query 확장 | `domains/command/router.py`, `queries/registry.py` | `POST /agent/debug/query`가 queue plan을 만들고 agent가 실행 |
| evidence payload shape 변경 | provider test, `tests/test_rca_evidence.py` | 가인의 `EvidenceBundle`이 깨지지 않는다 |
