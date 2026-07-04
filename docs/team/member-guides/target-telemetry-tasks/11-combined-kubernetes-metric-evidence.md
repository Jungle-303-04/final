# 11. Kubernetes + Metric Evidence 결합

## 목표

Kubernetes pod/event evidence와 Prometheus metric evidence를 같은 cluster/namespace/pod 기준으로 묶는다.

## 먼저 읽을 파일

- [09. MetricEvidence Summary](09-metric-evidence-summary.md)
- [10. Kubernetes Pod/Event Reader](10-kubernetes-pod-event-reader.md)
- `src/services/target/cluster-agent/evidence/collector.py`
- `src/services/target/cluster-agent/evidence/jobs.py`

## 수정 후보

- `src/services/target/cluster-agent/evidence/collector.py`
- `src/services/target/cluster-agent/queries/payloads.py`
- `tests/test_agent_evidence_ingest.py`
- `tests/test_target_metric_evidence.py`
- `tests/test_target_pod_evidence.py`

## 선형 절차

1. PodEvidence와 MetricEvidence의 공통 key를 정한다.
   - `cluster_id`
   - `namespace`
   - `pod`
   - `container`
2. pod restart count와 CPU/memory metric을 같은 resource summary에 넣는다.
3. source reference에는 Kubernetes API source와 Prometheus query를 모두 남긴다.
4. pod 이름이나 namespace가 맞지 않으면 억지로 결합하지 않는다.
5. 결합 실패도 evidence 수집 실패가 아니라 partial evidence로 표현할지 결정한다.
6. pod fixture + metric fixture 결합 테스트를 추가한다.

## 예시 combined evidence

```json
{
  "kind": "pod_metric_summary",
  "cluster_id": "target-dev",
  "namespace": "sandbox",
  "pod": "checkout-api-5d9c",
  "restart_count": 7,
  "cpu_latest": 0.37,
  "memory_latest_bytes": 268435456,
  "source_refs": [
    "kubernetes://pods/sandbox/checkout-api-5d9c",
    "prometheus://query/node_collector_cpu_usage_ratio"
  ]
}
```

## 검증

```bash
uv run pytest tests/test_target_pod_evidence.py tests/test_target_metric_evidence.py tests/test_agent_evidence_ingest.py
uv run ruff check src tests
```

## 완료 기준

- pod 상태와 metric이 같은 resource 기준으로 결합된다.
- mismatch는 테스트로 다룬다.
- source references가 남는다.
- raw telemetry 전체를 합쳐서 큰 payload로 만들지 않는다.

## 다음 작업

[12. Gateway 계약 연결](12-gateway-contract-connection.md)
