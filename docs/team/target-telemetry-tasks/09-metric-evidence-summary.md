# 09. MetricEvidence Summary

## 목표

Prometheus query 결과를 raw samples 전체가 아니라 작은 evidence summary로 축약한다.

## 먼저 읽을 파일

- `src/services/target/cluster-agent/evidence/`
- `src/services/target/cluster-agent/providers/prometheus_providers.py`
- `src/packages/contracts/event_bus/bodies/`
- [08. Agent Debug Query API](08-agent-debug-query-api.md)

## 수정 후보

- `src/services/target/cluster-agent/evidence/collector.py`
- `src/services/target/cluster-agent/queries/payloads.py`
- `src/packages/contracts/target.py`
- `tests/test_target_metric_evidence.py`

## 선형 절차

1. `MetricEvidence` DTO 위치를 정한다.
2. raw samples 전체 대신 summary field를 둔다.
   - `latest`
   - `max`
   - `min`
   - `rate` 또는 `delta`
   - `window`
   - `source_query`
   - `observed_at`
3. sample 개수와 payload byte size 제한을 둔다.
4. source query는 남기되 provider token이나 URL secret은 제거한다.
5. debug API response도 MetricEvidence 형태로 바꿀지 결정한다.
6. 큰 query 결과가 잘리는 테스트를 추가한다.

## 예시 response

```json
{
  "kind": "metric",
  "metric": "node_collector_cpu_usage_ratio",
  "latest": 0.37,
  "max": 0.52,
  "window": "5m",
  "source_query": "node_collector_cpu_usage_ratio",
  "observed_at": "2026-07-04T09:00:00Z"
}
```

## 검증

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_metric_evidence.py -q
```

## 완료 기준

- Prometheus raw response 전체를 반환하지 않는다.
- provider result에 source query와 window가 남는다.
- payload 크기 제한이 테스트되어 있다.
- RCA가 읽을 수 있는 kind/summary 구조가 보인다.

## 다음 작업

[10. Kubernetes Pod/Event Reader](10-kubernetes-pod-event-reader.md)
