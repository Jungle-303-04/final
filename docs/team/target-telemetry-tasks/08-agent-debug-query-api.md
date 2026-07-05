# 08. Agent Debug Query API

## 목표

Management Gateway에서 provider query 하나를 `telemetry.query.run` command로 만들어 Target Agent가 실행하게 한다.

## 먼저 읽을 파일

- `src/domains/command/router.py`
- `src/packages/contracts/gateway/routes.py`
- `src/packages/contracts/gateway/requests.py`
- `src/packages/contracts/gateway/responses.py`
- `src/services/target/cluster-agent/agent.py`
- [07. Prometheus Query Client](07-prometheus-query-client.md)

## 수정 후보

- `src/domains/command/router.py`
- `src/packages/contracts/gateway/routes.py`
- `tests/test_command_router.py`
- `tests/test_target_agent_commands.py`

## 선형 절차

1. route 상수는 `AGENT_DEBUG_QUERY_PATH = "/agent/debug/query"`를 쓴다.
2. request body는 `cluster_id`, `query`, optional `reason`을 받는다.
3. Gateway는 cluster read access를 확인한다.
4. Gateway는 `action=telemetry.query.run` plan을 만든다.
5. Gateway는 `db.queue_agent_command(correlation_id, plan, queued)`로 agent queue에 넣는다.
6. Target Agent는 기존 `/agent/commands/poll` 경로로 command를 가져간다.
7. query payload는 `TelemetryQueryDefinition`으로 변환된다.
8. range query는 `range_seconds`, `step_seconds`가 있을 때 `PrometheusRangeQuery`로 실행된다.

## request 예시

```json
{
  "cluster_id": "target-cluster-01",
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

## 검증

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_command_router.py::test_agent_debug_query_requires_cluster_read_access_and_queues_agent_command \
  tests/test_target_agent_commands.py \
  -q
```

## 완료 기준

- Gateway debug route가 read access를 확인한다.
- `telemetry.query.run` command가 agent queue에 들어간다.
- Target Agent가 기존 command poll/result 경로를 그대로 사용한다.
- query payload가 provider 값 객체로 변환된다.

## 다음 작업

[09. MetricEvidence Summary](09-metric-evidence-summary.md)
