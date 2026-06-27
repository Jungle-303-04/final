# Target / Telemetry: 구현 Phase 계획

## 목적

이 문서는 Target/Telemetry 담당자가 PR/커밋 단위로 작업할 수 있게 Phase를 나눈다.

한 Phase는 가능한 한 한 PR로 끝낸다. 모르는 상태에서도 “이번 PR에서 어디까지 해야 하는지”가 보여야 한다.

## Phase별 작은 PR 계획

| Phase | PR 목표 | 왜 이 단위인가 |
| --- | --- | --- |
| 1 | Observability stack 설치 경계 | Prometheus 설치물이 user workload diff와 섞이지 않게 한다. |
| 2 | Prometheus Helm 설치/values/dry-run | 관측 플랫폼을 먼저 독립 실행 가능하게 만든다. |
| 3 | 더미 `/metrics` exporter | 실제 Kubernetes 없이 Prometheus scrape를 검증한다. |
| 4 | Prometheus query 직접 검증 | Prometheus에 들어간 값을 query로 다시 꺼낼 수 있는지 확인한다. |
| 5 | Prometheus query client 구조화 | curl 수준 검증을 코드 adapter로 옮긴다. |
| 6 | Agent 더미 query API | Gateway 계약 없이도 Agent가 query를 받아 실행하는 흐름을 만든다. |
| 7 | Agent 더미 evidence response | query 결과를 사람이 읽을 수 있는 작은 응답으로 축약한다. |
| 8 | Kubernetes API pod/event 수집 | 실제 cluster 상태를 evidence 재료로 읽는다. |
| 9 | Node Collector `/metrics` | 우리가 수집한 node/runtime metric을 Prometheus에 넣는다. |
| 10 | Node Collector metric query 회수 | Prometheus에 들어간 우리 metric을 Agent가 다시 꺼낸다. |
| 11 | Evidence summarizer | raw telemetry를 Gateway로 보내기 전 축약한다. |
| 12 | Gateway 계약 연결 | Management API가 준비되면 실제 connect/evidence/poll/result 계약에 붙인다. |
| 13 | Loki/OTel ingest 경로 | Prometheus 흐름이 안정된 뒤 log/trace를 확장한다. |

## Phase 1. Observability stack 설치 경계

목표:

```text
Prometheus/Loki/OTel 설치 YAML과 사용자 workload GitOps diff 대상을 분리한다.
```

구현할 것:

- `deploy/target/observability/` 경로 규칙.
- GitOps Sync Worker workload 후보 제외 규칙 문서화.
- 플랫폼용 Prometheus와 사용자 커스텀 Prometheus의 구분 기준 문서화.
- `owner`, `purpose`, `gitops_managed`, `risk_level` 같은 manifest scope 초안 정리.

하지 말 것:

- Prometheus/Loki/OTel 설치 manifest를 command.requested 대상에 섞지 않는다.
- cluster-wide RBAC를 설명 없이 추가하지 않는다.

검증:

- observability 경로가 GitOps workload diff 후보에서 제외되는 기준이 문서화됨.
- 사용자 커스텀 Prometheus 요구가 생겨도 플랫폼용 Prometheus와 같은 release/namespace/RBAC를 공유하지 않도록 설계됨.

## Phase 2. Prometheus Helm 설치/values/dry-run

목표:

```text
Prometheus를 우리 플랫폼 관측용으로 설치할 수 있게 Helm values와 설치 절차를 만든다.
```

구현할 것:

- `deploy/target/observability/prometheus/values.yaml`.
- install/uninstall README.
- chart repository와 chart version 고정.
- namespace 예: `observability-system`.
- secret 없는 demo values.

하지 말 것:

- Helm values에 token/password를 넣지 않는다.
- 사용자 workload GitOps diff 대상으로 넣지 않는다.

검증:

- `helm template` 또는 `helm install --dry-run` 통과.
- 생성되는 RBAC/ServiceAccount/Service/PVC 범위를 PR에 설명.

## Phase 3. 더미 `/metrics` exporter

목표:

```text
Prometheus가 읽을 수 있는 더미 metric endpoint를 만든다.
```

구현할 것:

- 아주 작은 HTTP server 또는 기존 Node Collector에 `/metrics` 추가.
- Prometheus text format으로 더미 metric 출력.
- 예: `demo_target_info`, `demo_pod_restart_total`, `demo_error_count_total`.

테스트:

- `/metrics` 응답이 Prometheus text format에 맞음.
- metric label에 secret이나 긴 log line이 없음.

## Phase 4. Prometheus query 직접 검증

목표:

```text
Prometheus가 더미 metric을 scrape했고 query API로 다시 꺼낼 수 있는지 확인한다.
```

구현할 것:

- Prometheus scrape target 설정.
- 더미 exporter target 등록.
- query 예시 문서화.
- `up`, `demo_pod_restart_total`, `rate(...)` 같은 기본 query.

테스트:

- Prometheus UI 또는 HTTP API에서 더미 metric 조회 성공.
- query 실패 시 원인 확인 방법 문서화.

## Phase 5. Prometheus query client 구조화

목표:

```text
curl로 확인한 Prometheus query를 코드에서 재사용 가능한 client로 감싼다.
```

구현할 것:

- `PrometheusClient` 또는 `TelemetryQueryClient` Protocol.
- `query(query: str)`.
- `query_range(query: str, start, end, step)`.
- timeout, response size limit.
- mock HTTP 테스트.

테스트:

- 더미 query 결과 파싱.
- timeout 처리.
- Prometheus error response 처리.

## Phase 6. Agent 더미 query API

목표:

```text
Management Gateway 계약이 없어도 Agent가 임시 API로 query를 받아 Prometheus에 실행할 수 있게 한다.
```

구현할 것:

- Target Agent 내부 demo endpoint.
- 예: `POST /debug/query`.
- request: `{ "query": "demo_pod_restart_total" }`.
- Agent가 PrometheusClient로 query 실행.
- response로 query 결과 반환.

주의:

- 이 API는 demo/debug용이다.
- 나중에 Gateway 계약이 생기면 제거하거나 내부 adapter로 전환한다.
- 인증 없이 외부에 노출하지 않는다.

테스트:

- Agent API에 query 요청.
- Agent가 Prometheus query 실행.
- 더미 metric 결과 반환.

## Phase 7. Agent 더미 evidence response

목표:

```text
Prometheus query 결과를 그대로 반환하지 않고 evidence처럼 작은 응답으로 축약한다.
```

구현할 것:

- `MetricEvidence` 초안.
- latest/max/rate 같은 간단 summary.
- source query, window, observed_at 포함.
- raw samples 전체 반환 금지.

테스트:

- Prometheus sample -> MetricEvidence 변환.
- 큰 query 결과 제한.

## Phase 8. Kubernetes API pod/event 수집

목표:

```text
실제 cluster의 pod 상태와 event를 읽어 evidence 재료로 만든다.
```

구현할 것:

- Kubernetes client adapter.
- pod phase, container status, restart_count 조회.
- Kubernetes Event reason/message 조회.
- sandbox namespace 우선.

테스트:

- fake Kubernetes client 테스트.
- CrashLoopBackOff/OOMKilled/Pending fixture.
- RBAC 최소 권한 설명.

## Phase 9. Node Collector `/metrics`

목표:

```text
우리가 수집한 node/runtime metric을 Prometheus가 scrape할 수 있게 한다.
```

구현할 것:

- Node Collector `/metrics` endpoint.
- Prometheus scrape config 또는 ServiceMonitor 초안.
- metric naming 규칙.
- label 최소화: cluster_id, node, namespace, pod 정도만 우선.

하지 말 것:

- Prometheus에 임의 데이터를 insert하는 API가 있다고 가정하지 않는다.
- log line을 metric label에 넣지 않는다.
- secret이나 env 값을 metric label/value로 노출하지 않는다.

테스트:

- `/metrics` 응답이 Prometheus text format에 맞는다.
- metric 이름과 label이 안정적이다.
- scrape 실패 시 collector가 죽지 않는다.

## Phase 10. Node Collector metric query 회수

목표:

```text
Node Collector가 Prometheus에 넣은 metric을 Agent query API로 다시 꺼낸다.
```

구현할 것:

- Node Collector metric scrape 확인.
- Agent debug query로 Node Collector metric 조회.
- MetricEvidence 변환.

테스트:

- `node_collector_*` metric query 성공.
- Agent response/evidence 형태 확인.

## Phase 11. Evidence summarizer

목표:

```text
Kubernetes/Prometheus/Loki/OTel raw 데이터를 RCA가 이해하는 evidence로 축약한다.
```

구현할 것:

- `EvidenceSummarizer` Protocol.
- `MetricEvidence`, `LogEvidence`, `PodEvidence`, `TraceEvidence`.
- derived signal 계산: restart_rate, oom_killed, node_pressure, error_burst.
- source_ref: provider, query, time_window.

테스트:

- Prometheus samples -> MetricEvidence.
- Loki lines -> LogEvidence.
- Kubernetes pod status -> PodEvidence.
- secret-like text redaction.

## Phase 12. Gateway 계약 연결

목표:

```text
Management Gateway API 계약이 준비되면 Agent의 debug 흐름을 실제 API로 연결한다.
```

구현할 것:

- `POST /agent/connect`.
- `POST /agent/evidence`.
- `GET /agent/commands/poll`.
- `POST /agent/commands/{command_id}/result`.
- 기존 debug query/evidence 흐름을 production API adapter로 전환.

하지 말 것:

- Gateway 계약이 확정되기 전 endpoint 이름/DTO를 강하게 고정하지 않는다.
- raw Prometheus response를 Gateway에 그대로 보내지 않는다.

테스트:

- fake Gateway client로 evidence 전송 확인.
- correlation_id가 있으면 유지.
- provider token이 payload에 없음.

## Phase 13. Loki/OTel ingest 경로

목표:

```text
Prometheus 흐름이 안정된 뒤 logs/traces를 외부 관측 플랫폼으로 넣는 경로를 하나 검증한다.
```

구현할 것:

- demo에서는 Loki 또는 OTel Collector 중 하나만 선택.
- log shipper 또는 OTLP exporter fake.
- redaction filter.
- payload size limit.

테스트:

- error log sample -> redacted log evidence.
- OTLP/exporter 실패 시 fallback 처리.
- 큰 log 응답 제한.
