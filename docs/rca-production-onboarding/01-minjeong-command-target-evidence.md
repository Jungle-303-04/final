# 민정: Command + Target + Evidence 프로덕션 흐름

민정 파트의 목표는 target cluster 내부에서 실제 상태를 읽고, management plane이 내려준 command를 안전하게 처리한 뒤, 가인이 RCA에 쓸 수 있는 evidence window를 넘기는 것이다.

끝에서 넘기는 값은 두 가지다.

1. command 실행 결과인 `command.completed`
2. RCA 입력 증거인 `cluster.evidence.received`

이 문서는 [민정 온보딩](../onboarding/minjeong-command-target-evidence.md)을 더 production 흐름에 맞춰 풀어 쓴 문서다.

## 1단계. Agent 중심 파일을 연다

먼저 이 파일을 연다.

```text
src/services/target/cluster-agent/agent.py
```

확인할 함수는 `TargetClusterAgent.run_with_client`, `poll_commands`, `execute_command`, `run_query_command`다.

이 단계에서는 command, policy, evidence, reconcile loop가 agent 안에서 어떻게 같이 도는지만 본다.
target cluster는 inbound API를 열지 않는다.
agent가 management Gateway로 outbound 요청을 보내는 구조가 기준이다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_agent_commands.py -q
```

## 2단계. Command handler registry를 연다

이 파일을 연다.

```text
src/services/target/cluster-agent/commands/registry.py
```

찾을 것은 `@command.handler`, `@command.k8s`, `AgentCommandRegistry.execute`다.

일반 command는 `@command.handler(...)`로 등록한다.

Kubernetes API를 건드리는 command는 `@command.k8s(...)`로 등록한다.

왜 나누는가:
Kubernetes write는 resource, verb, namespace, payload model, policy guard가 필요하다.
단순 action 문자열만 보고 실행하면 운영 사고가 난다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_agent_commands.py -q
```

## 3단계. Management command route를 연다

이 파일을 연다.

```text
src/domains/command/router.py
```

찾을 것은 `commands`, `agent_debug_query`, `poll_command`, `command_result`다.

사용자가 누르는 `POST /commands`는 바로 target에서 실행되지 않는다.

흐름은 아래와 같다.

```text
사용자 또는 RCA
  -> command.requested
  -> command-worker policy
  -> agent_commands queue
  -> target agent poll
  -> target agent execute
  -> command.completed
```

`command_id`는 재시도와 중복 실행 구분에 필요하다.

`idempotency_key`는 같은 요청이 중복 queue되는 것을 막는다.

`lease`는 agent가 가져간 command가 멈췄을 때 회수 기준이다.

`retry_policy`는 실패 command 재시도 기준이다.

`routing_constraint`는 어느 cluster/agent가 실행할 수 있는지 제한한다.

`approval_ref`와 `policy_decision_ref`는 write command가 승인 근거 없이 실행되지 않게 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_command_router.py tests/test_command_worker.py -q
```

## 4단계. Command policy와 plan을 확인한다

이 파일을 연다.

```text
src/domains/command/handler.py
```

찾을 것은 `evaluate_command_policy`, `build_plan`, `handle_command_requested`다.

command가 바로 agent queue로 가지 않는 이유는 policy와 plan이 먼저 필요하기 때문이다.
write action이면 approval과 policy decision이 있어야 한다.
read/debug action이면 cluster read 권한이 있어야 한다.

policy를 통과하면 plan이 생기고, plan이 agent command queue로 들어간다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_command_worker.py -q
```

## 5단계. Debug query 흐름을 확인한다

`src/domains/command/router.py`에서 `agent_debug_query`를 다시 본다.

Debug query는 provider query 하나를 agent command로 보내 실제 target에서 실행되는지 확인하는 기능이다.

요청 예시는 아래다.

```json
{
  "cluster_id": "replace-with-target-cluster-id",
  "reason": "RCA 확인용",
  "query": {
    "source": "prometheus",
    "name": "restart_rate",
    "query": "increase(kube_pod_container_status_restarts_total{namespace=\"sandbox\"}[15m])",
    "range_seconds": 900,
    "step_seconds": 30
  }
}
```

`range_seconds`가 있으면 Prometheus range query다.
이 값은 `PrometheusRangeQuery`로 바뀌고 `/api/v1/query_range`로 실행된다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_command_router.py -q
```

Bruno에서는 `04-command/02-debug-query.bru`를 보낸다.

## 6단계. Evidence job scheduler를 연다

이 파일을 연다.

```text
src/services/target/cluster-agent/evidence/jobs.py
```

찾을 것은 `EvidenceJobScheduler.schedule_once`, `work_once`, `collect_job`다.

evidence는 provider별 job으로 나뉜다.
Kubernetes, metrics, logs, traces는 같은 수준으로 schedule, poll, result 되어야 한다.

흐름은 아래다.

```text
schedule_once()
  -> POST /agent/evidence/jobs
  -> evidence_jobs: kubernetes, metrics, logs, traces

work_once("metrics")
  -> GET /agent/evidence/jobs/poll?provider_key=metrics
  -> PrometheusMetricsProvider.query()
  -> POST /agent/evidence/jobs/{job_id}/result
```

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_evidence_jobs.py -q
```

## 7단계. Evidence collector를 연다

이 파일을 연다.

```text
src/services/target/cluster-agent/evidence/collector.py
```

찾을 것은 `collect`, `run_query`, `_collect_with_queries`다.

collector는 provider query를 실행하고 결과 package를 만든다.
provider 결과가 너무 커지면 RCA와 dashboard가 느려진다.
raw response 전체를 그대로 넣지 않고 필요한 summary와 supporting data만 넣는다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_target_metric_evidence.py \
  tests/test_target_telemetry_evidence.py \
  tests/test_target_telemetry_evidence.py \
  -q
```

## 8단계. Provider decorator를 확인한다

이 파일을 연다.

```text
src/services/target/cluster-agent/telemetry_registry.py
```

provider는 `@telemetry.source(...)`로 등록한다.

예시는 아래다.

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

`source`는 query definition이 provider를 찾을 이름이다.

`evidence_key`는 최종 evidence payload bucket 이름이다.

`query_type`은 일반 query를 provider 값 객체로 만든다.

`range_query_type`은 range query 지원 여부를 명시한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_telemetry_registry.py -q
```

## 9단계. Provider별 bucket을 확인한다

provider 구현은 이 폴더에 있다.

```text
src/services/target/cluster-agent/providers/
```

`KubernetesSnapshotProvider`는 `kubernetes` bucket을 채운다.
pods, events, nodes, deployments, statefulsets, daemonsets, replicasets, services, endpoint slices가 RCA의 기본 증거다.

`PrometheusMetricsProvider`는 `metrics` bucket을 채운다.
restart, memory, latency, error rate처럼 시간 흐름이 필요한 증거를 담당한다.

`LokiLogsProvider`는 `logs` bucket을 채운다.
app error, probe failure, dependency error 같은 문장 증거를 담당한다.

`TempoTracesProvider`는 `traces` bucket을 채운다.
dependency timeout, span error, service path를 확인한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_target_kubernetes_evidence.py \
  tests/test_target_metric_evidence.py \
  tests/test_target_telemetry_evidence.py \
  tests/test_target_telemetry_evidence.py \
  -q
```

## 10단계. Query value object를 확인한다

이 파일을 연다.

```text
src/services/target/cluster-agent/queries/registry.py
```

찾을 것은 `TelemetryQueryDefinition`과 provider별 query value object다.

Debug query와 policy query는 모두 provider query 객체로 바뀌어야 한다.
dict를 provider에 그대로 넘기면 validation과 source별 분기가 약해진다.

Prometheus range query는 아래 흐름으로 처리한다.

```text
TelemetryQueryDefinition.from_mapping()
  -> range_seconds 확인
  -> PrometheusRangeQuery
  -> PrometheusMetricsProvider.query_range()
  -> /api/v1/query_range
  -> normalize_payload(result_type="matrix")
```

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_metric_evidence.py -q
```

## 11단계. Evidence job management route를 확인한다

이 파일을 연다.

```text
src/domains/target/router.py
```

찾을 route는 아래다.

```text
POST /agent/evidence/jobs
GET /agent/evidence/jobs/poll
POST /agent/evidence/jobs/{job_id}/result
```

management는 같은 `evidence_key`의 provider job이 terminal 상태가 되었는지 본다.
모이면 `cluster.evidence.received`를 발행한다.

가인에게 넘길 body에는 아래 값이 있어야 한다.

```text
workspace_id
cluster_id
agent_id
source_id
window_start
evidence_key
kubernetes
metrics
logs
traces
```

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_evidence_jobs.py -q
```

## 12단계. 변경할 때 같이 고칠 곳을 확인한다

새 provider를 추가하면 `providers/*.py`, `telemetry_registry.py`, query value object, provider test를 같이 고친다.

새 query 정책을 추가하면 `src/domains/target/evidence_policy.py`와 scheduler test를 같이 고친다.

새 command action을 추가하면 `src/domains/command/actions.py`, action catalog, target agent handler, command test를 같이 고친다.

debug query를 확장하면 `src/domains/command/router.py`와 `queries/registry.py`를 같이 고친다.

evidence payload shape를 바꾸면 가인의 `tests/test_rca_evidence.py`와 찬빈의 projection test를 같이 본다.

## 13단계. 민정 전체 검증을 돌린다

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_command_router.py \
  tests/test_command_worker.py \
  tests/test_target_agent_commands.py \
  tests/test_target_agent_client.py \
  tests/test_target_registration.py \
  tests/test_target_evidence_jobs.py \
  tests/test_target_kubernetes_evidence.py \
  tests/test_target_metric_evidence.py \
  tests/test_target_telemetry_evidence.py \
  tests/test_target_telemetry_evidence.py \
  tests/test_telemetry_registry.py \
  -q
```

## 14단계. Bruno와 AWS로 확인한다

Bruno는 `docs/api`를 collection root로 연다.

민정은 `02-target-admin`, `03-agent-runtime`, `04-command`를 순서대로 보낸다.

AWS smoke는 Docker 없이 아래 명령으로 확인한다.

```bash
make smoke
```
