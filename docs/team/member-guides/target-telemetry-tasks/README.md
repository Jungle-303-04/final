# Target / Telemetry 선형 작업 가이드

이 디렉터리는 `minmings111` 작업자가 Target/Telemetry 작업을 한 페이지씩 따라 할 수 있게 나눈 작업 목록이다.

원본 설계 문서:

- [Target / Telemetry 멤버 가이드](../target-telemetry.md)
- [Target / Telemetry 구현 Phase 계획](../target-telemetry-implementation-plan.md)
- [Prometheus 실전 Runbook](../target-telemetry-prometheus-runbook.md)
- [팀 간 구현 연결과 테스트 가이드](../../cross-role-implementation-test-guide.md)

## 사용 방법

1. 아래 순서대로 한 파일씩 진행한다.
2. 현재 파일의 `완료 기준`을 만족할 때까지 다음 파일로 넘어가지 않는다.
3. Gateway 계약이 흔들릴 수 있으므로 먼저 Prometheus 폐쇄 루프를 만든다.
4. Target Agent는 NATS나 DB를 직접 import하지 않는다.
5. raw telemetry는 Gateway로 보내지 않고 summary evidence로 축약한다.

## 엔드 기준 흐름

```text
node-collector /metrics
  -> real Prometheus scrape
  -> Prometheus HTTP query API
  -> Python query client
  -> Agent debug query API
  -> MetricEvidence summary
  -> Kubernetes pod/event evidence 결합
  -> POST /agent/evidence
```

## 작업 순서

| 순서 | 파일 | 끝 상태 |
| --- | --- | --- |
| 0 | [현재 코드 지도와 테스트 기준](00-current-code-map.md) | 실제 route/client/test 위치를 확인함 |
| 1 | [Fake/Real Telemetry 경계](01-fake-real-telemetry-boundary.md) | fake Prometheus와 real Prometheus 차이가 문서화됨 |
| 2 | [Observability 설치 경계](02-observability-stack-boundary.md) | 플랫폼 관측 설치물과 user workload diff가 분리됨 |
| 3 | [Prometheus Helm Values](03-prometheus-helm-values.md) | secret 없는 Helm values 초안이 생김 |
| 4 | [Helm Template / Dry-run](04-helm-template-dry-run.md) | apply 없이 생성 YAML을 검증할 수 있음 |
| 5 | [Node Collector Scrape Target](05-node-collector-scrape-target.md) | Prometheus가 node-collector `/metrics`를 scrape함 |
| 6 | [Prometheus Query 직접 검증](06-prometheus-query-verification.md) | scrape된 metric을 query API로 다시 읽음 |
| 7 | [Prometheus Query Client](07-prometheus-query-client.md) | query API 호출이 코드 adapter로 감싸짐 |
| 8 | [Agent Debug Query API](08-agent-debug-query-api.md) | Gateway 없이 agent가 query를 실행함 |
| 9 | [MetricEvidence Summary](09-metric-evidence-summary.md) | raw query 결과가 작은 evidence로 축약됨 |
| 10 | [Kubernetes Pod/Event Reader](10-kubernetes-pod-event-reader.md) | pod 상태와 event를 evidence 재료로 읽음 |
| 11 | [Kubernetes + Metric Evidence 결합](11-combined-kubernetes-metric-evidence.md) | pod 상태와 Prometheus metric이 같은 resource 기준으로 묶임 |
| 12 | [Gateway 계약 연결](12-gateway-contract-connection.md) | `/agent/evidence`, command poll/result 계약에 연결됨 |
| 13 | [Loki / OTel Ingest 경로](13-loki-otel-ingest-path.md) | Prometheus 이후 log 또는 trace 경로 하나가 검증됨 |

## 공통 금지 사항

- fake Prometheus를 real Prometheus처럼 확장하지 않는다.
- Target Agent에 raw NATS client나 DB session을 넣지 않는다.
- raw Prometheus/Loki/OTel response 전체를 event로 보내지 않는다.
- `deploy/target/target.yaml`을 통째로 갈아엎지 않는다.
- Node Collector를 정적 DaemonSet으로 되돌리지 않는다. cluster-agent 관리 흐름을 유지한다.
