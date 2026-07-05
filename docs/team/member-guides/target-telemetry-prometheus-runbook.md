# Target / Telemetry: Prometheus와 Debug Query Runbook

## 목적

이 문서는 Prometheus query를 실제 provider 흐름으로 확인하는 실행서다.
지금 코드는 이미 Prometheus instant query, range query, agent debug query route,
Kubernetes snapshot provider를 가지고 있다. 따라서 새 서버를 꾸며서 흉내 내는 방식이
아니라 현재 provider를 직접 검증한다.

## 전체 흐름

```text
Frontend 또는 운영자
  -> POST /agent/debug/query
  -> Management Gateway가 cluster read 권한 확인
  -> command action = telemetry.query.run
  -> Target Agent가 command poll
  -> PrometheusMetricsProvider
  -> /api/v1/query 또는 /api/v1/query_range
  -> command result post
```

## 실제 코드 위치

| 단계 | 파일 | 확인할 내용 |
| --- | --- | --- |
| route constant | `src/packages/contracts/gateway/routes.py` | `AGENT_DEBUG_QUERY_PATH = "/agent/debug/query"` |
| request DTO | `src/packages/contracts/gateway/requests.py` | `AgentDebugQueryRequest` |
| response DTO | `src/packages/contracts/gateway/responses.py` | `AgentDebugQueryResponse` |
| Gateway route | `src/domains/command/router.py` | `agent_debug_query()`, `debug_query_plan()` |
| command action | `src/packages/config/constants.py` | `Command.TELEMETRY_QUERY_RUN_ACTION` |
| Agent handler | `src/services/target/cluster-agent/agent.py` | `@command.handler(QUERY_RUN_ACTION)` |
| query value object | `src/services/target/cluster-agent/queries/registry.py` | `PrometheusInstantQuery`, `PrometheusRangeQuery` |
| provider | `src/services/target/cluster-agent/providers/prometheus_providers.py` | `query_instant()`, `query_range()` |

## 환경 변수

Target Agent에서 Prometheus provider가 읽는 값:

```text
PROMETHEUS_BASE_URL
```

설정하지 않으면 code default인 `DEFAULT_PROMETHEUS_BASE_URL`을 사용한다.
실제 클러스터에서는 Prometheus service 주소를 넣는다.

예시:

```bash
export PROMETHEUS_BASE_URL=http://prometheus.target.svc:9090
```

GitHub/SCM token과 달리 Prometheus query 자체에는 provider token을 event payload에
넣지 않는다. 인증이 필요한 Prometheus를 붙일 때도 secret은 provider config나 vault
경계에서 처리하고 event에는 query 정의만 둔다.

## Instant query 실행 예시

요청 payload:

```json
{
  "cluster_id": "target-cluster-01",
  "query": {
    "source": "prometheus",
    "name": "up",
    "description": "Prometheus target health",
    "query": "up"
  },
  "reason": "prometheus 연결 확인"
}
```

Gateway에서 일어나는 일:

1. `require_cluster_read_access()`로 cluster read 권한을 확인한다.
2. `debug_query_plan()`이 command plan을 만든다.
3. `action`은 `telemetry.query.run`으로 고정된다.
4. `db.queue_agent_command()`가 command를 queued 상태로 저장한다.
5. 응답은 `accepted`, `command_id`, `correlation_id`만 반환한다.

Agent에서 일어나는 일:

1. command poll로 queued command를 받는다.
2. `TelemetryQueryCommandPayload`가 `query` object를 검증한다.
3. `TelemetryQueryDefinition.from_mapping()`이 source와 필수 필드를 검증한다.
4. `to_provider_query()`가 `PrometheusInstantQuery`를 만든다.
5. `PrometheusMetricsProvider.query_instant()`가 `/api/v1/query`를 호출한다.
6. provider가 vector/scalar/string 결과를 bounded summary로 정규화한다.

## Range query 실행 예시

요청 payload:

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
  },
  "reason": "RCA restart trend 확인"
}
```

`range_seconds`가 있으면 `PrometheusRangeQuery`가 만들어진다. provider는 현재 시간을
`end`, `end - range_seconds`를 `start`로 계산하고 `/api/v1/query_range`를 호출한다.
`step_seconds`가 없으면 range를 30등분한 값으로 기본 step을 만든다.

정규화 결과에는 다음 정보가 포함된다.

- `query_mode = "range"`
- `range_seconds`
- `step_seconds`
- `result_type = "matrix"`
- `series`
- `point_count`

## Kubernetes evidence와 같이 보는 방법

RCA는 Prometheus metric만 보고 판단하지 않는다. 같은 window 안에서 Kubernetes snapshot도
필요하다. Kubernetes provider는 다음 값을 `kubernetes` bucket에 넣는다.

- `cluster`
- `pods`
- `events`
- `nodes`
- `workloads`
- `services`
- `endpoints`
- `provider_status`

그래서 restart 증가량을 봤다면 같은 시점의 pod phase, restart count, event reason,
deployment replica 상태를 같이 확인해야 한다.

## 바로 돌릴 테스트

Prometheus value object와 provider 정규화:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_telemetry_registry.py \
  tests/test_target_metric_evidence.py -q
```

Gateway debug query route:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_command_router.py -q
```

Agent command payload:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_agent_commands.py -q
```

Kubernetes snapshot provider:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_kubernetes_evidence.py -q
```

전체 evidence provider 묶음:

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_target_metric_evidence.py \
  tests/test_target_log_evidence.py \
  tests/test_target_trace_evidence.py \
  tests/test_target_kubernetes_evidence.py -q
```

## 수정할 때 지켜야 할 기준

- source 이름은 `@telemetry.source` 등록값과 payload가 같아야 한다.
- Prometheus range query는 Prometheus source에서만 허용한다.
- provider 응답은 RCA가 읽을 수 있게 작게 정규화한다.
- command result에 raw token, kubeconfig, provider secret을 넣지 않는다.
- provider 하나가 실패해도 실패 상태와 이유가 evidence bucket에 남아야 한다.
- Target Agent는 Gateway HTTP API로만 Management와 연결한다.
