# 민정: Command + Target + Evidence

민정 파트는 target cluster 안에서 실제 상태를 읽고, management plane이 내려보낸 command를 안전하게 처리하는 역할이다.
끝에서 가인에게 넘기는 값은 `cluster.evidence.received`다.
command를 실행했다면 `command.completed`도 같이 흐른다.

이 문서는 한 번에 하나씩 따라가면 된다.
파일을 여러 개 동시에 고치지 말고, 단계마다 테스트를 하나씩 돌린다.

## 1단계. Agent 시작점을 찾는다

먼저 이 파일을 연다.

```text
src/services/target/cluster-agent/agent.py
```

여기서 확인할 것은 세 가지다.

1. agent가 management Gateway로 outbound 요청만 하는지 본다.
2. command loop가 어디서 도는지 본다.
3. evidence loop가 어디서 도는지 본다.

이 단계에서는 코드를 고치지 않는다.
내가 바꿀 위치가 agent 내부인지, management router인지, provider인지 구분하는 것만 목표다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_agent_commands.py -q
```

## 2단계. Command poll 흐름을 찾는다

이 파일을 연다.

```text
src/domains/target/router.py
```

찾을 route는 아래 네 개다.

```text
GET /agent/commands/poll
POST /agent/commands/{command_id}/start
POST /agent/commands/{command_id}/heartbeat
POST /agent/commands/{command_id}/result
```

이 route들은 browser session이 아니라 `x-agent-token`으로 agent identity를 확인한다.
agent token에서 workspace와 cluster를 결정해야 하므로, body에서 임의로 받은 workspace를 믿으면 안 된다.
poll은 DB의 `agent_commands`를 lease하는 것이 정본이다.
`COMMAND_NOTIFY_DATABASE_URL`이 설정된 gateway는 Postgres `LISTEN/NOTIFY`로 새 command가 queue되는 순간 poll 대기를 깨우지만, 이건 지연을 줄이는 보조 경로다.
리스너가 꺼져도 `timeout`까지 기다렸다가 다시 DB lease를 시도하므로 기능 자체는 기존 long-poll과 동일하게 동작해야 한다.

이 단계의 완료 기준은 poll부터 result까지 어떤 repository를 쓰는지 설명할 수 있는 것이다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_agent_commands.py -q
```

## 3단계. 사용자가 command를 만드는 입구를 찾는다

이 파일을 연다.

```text
src/domains/command/router.py
```

먼저 `POST /commands`를 찾는다.

이 route는 사용자가 command를 요청하는 입구다.
여기서 command는 바로 agent에게 가지 않는다.
먼저 `command.requested` event가 만들어지고, `command-worker`가 agent queue로 넘긴다.

전체 흐름은 이렇게 읽는다.

```text
POST /commands
  -> command.requested
  -> command-worker
  -> agent_commands
  -> /agent/commands/poll
  -> /agent/commands/{command_id}/result
  -> command.completed
```

write command는 `approval_ref`와 `policy_decision_ref`가 있어야 한다.
이 값이 없으면 command-worker와 target agent 양쪽에서 막아야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_command_router.py \
  tests/test_command_worker.py \
  -q
```

## 4단계. Debug query API를 확인한다

같은 파일에서 `POST /agent/debug/query`를 찾는다.

이 API는 Prometheus, Loki, Tempo 같은 provider query 하나를 agent command로 보내서 확인하는 입구다.
RCA를 만들기 전에 “이 query가 target에서 실제로 실행되는지” 확인할 때 쓴다.

요청 body는 이런 형태다.

```json
{
  "cluster_id": "replace-with-target-cluster-id",
  "reason": "RCA 확인용",
  "query": {
    "source": "prometheus",
    "name": "restart_rate",
    "query": "increase(kube_pod_container_status_restarts_total{namespace=\"target\"}[15m])",
    "range_seconds": 900,
    "step_seconds": 30
  }
}
```

`range_seconds`와 `step_seconds`가 있으면 `PrometheusRangeQuery`로 처리한다.
이 값이 없으면 instant query로 처리한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_command_router.py -q
```

Bruno에서는 `04-command/02-debug-query.bru`를 보낸다.

## 5단계. Evidence job schedule을 찾는다

이 파일을 연다.

```text
src/services/target/cluster-agent/evidence/jobs.py
```

여기서 `EvidenceJobScheduler`를 찾는다.

민정이 이해해야 하는 흐름은 아래다.

```text
schedule_once()
  -> POST /agent/evidence/jobs
  -> provider별 job 생성

work_once(provider_key)
  -> GET /agent/evidence/jobs/poll
  -> provider query 실행
  -> POST /agent/evidence/jobs/{job_id}/result
```

provider job은 `kubernetes`, `metrics`, `logs`, `traces`, `metadata`가 같은 수준으로 돌아야 한다.
어떤 provider만 특별 취급하면 나중에 RCA 입력이 깨진다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_evidence_jobs.py -q
```

Bruno에서는 `03-agent-runtime/05-schedule-evidence-jobs.bru`부터 보낸다.

## 6단계. Provider 등록 데코레이터를 확인한다

이 파일을 연다.

```text
src/services/target/cluster-agent/telemetry_registry.py
```

provider class에는 `@telemetry.source(...)`가 붙어야 한다.

예시는 이런 식이다.

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

`source`는 query definition에서 쓰는 이름이다.

`evidence_key`는 최종 evidence payload bucket 이름이다.

`query_type`은 일반 query 값 객체다.

`range_query_type`은 range query를 지원할 때 넣는 값 객체다.

collector와 scheduler는 provider 목록을 직접 외우면 안 된다.
provider가 등록한 계약을 registry에서 읽어야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_telemetry_registry.py -q
```

## 7단계. Kubernetes provider를 확인한다

이 폴더를 연다.

```text
src/services/target/cluster-agent/providers/
```

Kubernetes provider는 `KubernetesSnapshotProvider`를 찾는다.

이 provider는 `kubernetes` bucket을 채운다.
최소로 들어가야 하는 값은 pods, events, nodes, workloads, services, endpoint slices다.

가인에게 넘길 때는 raw Kubernetes object를 그대로 다 넣는 것이 아니라 RCA가 읽을 수 있는 bounded snapshot으로 줄여야 한다.
secret, token, kubeconfig는 절대 payload에 넣지 않는다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_kubernetes_evidence.py -q
```

## 8단계. Metrics provider를 확인한다

같은 provider 폴더에서 Prometheus provider를 찾는다.

metrics bucket은 `PrometheusInstantQuery`와 `PrometheusRangeQuery`를 처리한다.

instant query는 `/api/v1/query`를 호출한다.
range query는 `/api/v1/query_range`를 호출한다.

range query에는 `range_seconds`와 `step_seconds`가 있어야 한다.
step이 너무 작으면 payload가 커지고, RCA와 dashboard가 느려진다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_metric_evidence.py -q
```

## 9단계. Logs와 traces provider를 확인한다

logs는 Loki provider가 `logs` bucket을 채운다.

traces는 Tempo 또는 OpenTelemetry provider가 `traces` bucket을 채운다.

logs는 전체 원문을 무한히 넣으면 안 된다.
line count, stream, timestamp, message sample처럼 RCA에 필요한 범위로 줄인다.

traces도 span 전체를 무한히 넣지 않는다.
trace count, service name, operation, duration, error 여부를 중심으로 정리한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_target_telemetry_evidence.py \
  tests/test_target_telemetry_evidence.py \
  -q
```

## 10단계. 가인에게 넘기는 최종 payload를 확인한다

management 쪽은 provider job이 terminal 상태가 되었는지 확인한 뒤 `cluster.evidence.received`를 만든다.

가인에게 넘어가는 핵심 값은 아래다.

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

`correlation_id`는 body 필드가 아니라 event envelope 메타데이터다.
body에 중복으로 넣지 않는다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_evidence_jobs.py -q
```

## 11단계. 전체 민정 흐름을 한 번에 검증한다

작은 테스트가 모두 통과한 뒤에만 아래를 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_telemetry_registry.py \
  tests/test_target_kubernetes_evidence.py \
  tests/test_target_metric_evidence.py \
  tests/test_target_telemetry_evidence.py \
  tests/test_target_telemetry_evidence.py \
  tests/test_target_evidence_jobs.py \
  tests/test_command_router.py \
  tests/test_command_worker.py \
  tests/test_target_agent_commands.py \
  -q
```

## 12단계. Bruno에서 눈으로 확인한다

Bruno는 [Bruno API 테스트](../api/README.md)를 따라 `docs/api`를 collection으로 연다.

민정은 이 순서로 보낸다.

1. `00-health-auth/06-login.bru`
2. `02-target-admin/01-register-target-dry-run.bru`
3. `03-agent-runtime/01-agent-connect.bru`
4. `03-agent-runtime/05-schedule-evidence-jobs.bru`
5. `03-agent-runtime/06-poll-evidence-job.bru`
6. `03-agent-runtime/07-complete-evidence-job.bru`
7. `04-command/02-debug-query.bru`
8. `04-command/03-agent-command-poll.bru`
9. `04-command/06-agent-command-result.bru`

## 프로덕션 완료 기준

민정 파트는 외부 기준 저장소에서 확인한 fleet, GitOps, IaC, cluster, upgrade, rollout, test, DNS 실행 경계를 우리 구조로 옮겨야 끝난다.
전체 범위는 [벤치마크 최소선 기준 프로덕션 완성 설계](../rca-production-onboarding/05-production-completion-scope.md)를 따른다.

완료 기준은 하나씩 확인한다.

1. command poll/start/heartbeat/result가 agent token identity 기준으로 동작한다.
2. write command가 `approval_ref`와 `policy_decision_ref` 없이 실행되지 않는다.
3. evidence job schedule/poll/result가 provider별로 같은 수준에서 동작한다.
4. Kubernetes, metrics, logs, traces, metadata provider가 모두 실제 provider로 등록되어 있다.
5. Prometheus instant/range query가 값 객체와 provider 경계로 처리된다.
6. Kubernetes snapshot이 RCA 입력 bucket에 들어간다.
7. repository, install, lock, artifact digest가 command source와 연결된다.
8. upgrade queue, deferred update, rollout, test log 개념이 event와 read model로 이어진다.
9. agent result와 evidence payload에 secret, token, kubeconfig 원문이 없다.
10. Bruno에서 target, agent runtime, command, ops 폴더를 `aws-test` profile로 확인할 수 있다.
11. AWS smoke에서 target cluster가 등록되고 evidence/command가 한 세트로 돈다.

## 민정이 바꾸면 같이 확인할 것

provider query payload를 바꾸면 `TelemetryQueryDefinition`과 provider별 evidence test를 같이 본다.

provider key를 바꾸면 `telemetry_registry`, `evidence_policy`, scheduler test를 같이 본다.

command action을 바꾸면 action catalog, command worker, target agent handler를 같이 본다.

evidence bucket shape를 바꾸면 가인의 RCA evidence builder와 찬빈 projection/realtime 계약을 같이 본다.

route path를 바꾸면 `routes.py`, router test, Bruno request를 같이 본다.

내부 구현은 바꿔도 된다.
대신 event, API, payload 계약은 말없이 바꾸지 않는다.
