# Target / Telemetry: 구현 Phase 계획

## 목적

이 문서는 Target/Telemetry 담당자가 PR/커밋 단위로 작업할 수 있게 Phase를 나눈다.

한 Phase는 가능한 한 한 PR로 끝낸다. 모르는 상태에서도 “이번 PR에서 어디까지 해야 하는지”가 보여야 한다.

## 현재 프로젝트 상태 먼저 이해하기

작업자는 새로 설계하기 전에 현재 repo가 어디까지 되어 있는지 먼저 확인한다.

| 현재 파일 | 이미 있는 것 | 주의할 점 |
| --- | --- | --- |
| `src/services/target/cluster-agent/agent.py` | Management Gateway로 register/evidence/command poll/result를 보내는 client 흐름 | Gateway 계약이 아직 바뀔 수 있으므로 이 흐름을 확장하기 전에 Prometheus 폐쇄 루프를 먼저 만든다. |
| `src/services/target/cluster-agent/fake_telemetry.py` (`FAKE_TELEMETRY_KIND=prometheus`) | fake Prometheus 실행 entrypoint | 실제 Prometheus가 아니다. query 저장소도 scrape도 없다. fixed JSON을 반환하는 fake server다. |
| `src/services/target/cluster-agent/fake_telemetry.py` (`FAKE_TELEMETRY_KIND=loki`) | fake Loki 실행 entrypoint | 실제 Loki ingest/query가 아니다. |
| `src/services/target/cluster-agent/fake_telemetry.py` (`FAKE_TELEMETRY_KIND=otel`) | fake OTel 실행 entrypoint | 실제 OTLP collector나 trace backend가 아니다. |
| `src/services/target/node-collector/node_collector.py` | `/snapshot`, `/metrics`, structured stdout log | 이미 Prometheus text format 비슷한 metric을 제공하므로 real Prometheus scrape 첫 대상으로 쓰기 좋다. |
| `deploy/target/target.yaml` | fake-prometheus/fake-loki/fake-otel, cluster-agent, node collector 관리 권한 배포 | 정적 node collector DaemonSet을 직접 담지 않는다. cluster-agent가 DaemonSet을 생성/패치한다. |

현재 상태에서 제일 중요한 판단:

```text
fake-prometheus
  Prometheus처럼 생긴 응답을 주는 테스트용 FastAPI 서버
  scrape 저장소 아님
  PromQL query 엔진 아님

real Prometheus
  /metrics target을 scrape
  time-series 저장
  query API로 데이터를 다시 꺼낼 수 있음
```

따라서 작업자는 `fake_telemetry.py`의 `FAKE_TELEMETRY_KIND=prometheus` 모드를 실제 Prometheus로 착각하면 안 된다. 다음 단계는 fake server를 더 키우는 것이 아니라, real Prometheus를 Helm으로 설치하고 이미 있는 `node-collector /metrics`를 scrape하게 만드는 것이다.

## 첫 작업자가 따라 할 순서

Management Gateway API 계약이 아직 확정되지 않았으므로, 처음에는 Gateway에 의존하지 않는다.

첫 번째 목표는 아래 폐쇄 루프다.

```text
node-collector /metrics
  -> real Prometheus scrape
  -> Prometheus HTTP query API
  -> 작은 Python client
  -> Agent debug query API
  -> MetricEvidence 형태 응답
```

이 루프가 되면, 나중에 Gateway 계약이 바뀌어도 Prometheus 설치/query/요약 코드는 그대로 살릴 수 있다.

## Phase별 작은 PR 계획

| Phase | PR 목표 | 왜 이 단위인가 |
| --- | --- | --- |
| 1 | 현재 fake/real telemetry 차이 문서화 | 작업자가 fake-prometheus를 실제 Prometheus로 오해하지 않게 한다. |
| 2 | Observability stack 설치 경계 | Prometheus 설치물이 user workload diff와 섞이지 않게 한다. |
| 3 | Prometheus Helm values 초안 | real Prometheus를 설치할 준비를 한다. |
| 4 | Helm template/dry-run 검증 | 실제 cluster 적용 전 생성 YAML을 확인한다. |
| 5 | node-collector scrape target 연결 | 이미 있는 `/metrics`를 Prometheus가 읽게 한다. |
| 6 | Prometheus query 직접 검증 | Prometheus에 들어간 값을 query로 다시 꺼낸다. |
| 7 | Prometheus query client 구조화 | curl 수준 검증을 코드 adapter로 옮긴다. |
| 8 | Agent debug query API | Gateway 계약 없이 Agent가 query를 받아 실행하는 흐름을 만든다. |
| 9 | MetricEvidence summary | raw query 결과를 작은 evidence 응답으로 축약한다. |
| 10 | Kubernetes API pod/event 수집 | 실제 cluster 상태를 evidence 재료로 읽는다. |
| 11 | Kubernetes 상태를 metric/evidence로 연결 | pod/event 정보와 Prometheus metric을 함께 볼 수 있게 한다. |
| 12 | Gateway 계약 연결 | Management API가 준비되면 실제 connect/evidence/poll/result 계약에 붙인다. |
| 13 | Loki/OTel ingest 경로 | Prometheus 흐름이 안정된 뒤 log/trace를 확장한다. |
| 14 | Approval evidence/action allowlist | write command를 approval_ref와 policy_decision_ref 기준으로 fail-closed한다. |
| 15 | Partial failure result schema | resource별 status, sanitized stdout/stderr, retryable flag, applied flag를 Gateway result와 맞춘다. |
| 16 | Control-plane telemetry metadata | provider failure/fallback, source freshness, payload size를 metric/audit metadata로 남긴다. |

Phase 14 이후는 [하드닝 로드맵](../../hardening-roadmap.md)의 Target/Agent 기준을 따른다.

## Phase 1. 현재 fake/real telemetry 차이 문서화

목표:

```text
현재 fake telemetry와 앞으로 설치할 real telemetry의 차이를 작업자가 이해하게 한다.
```

구현할 것:

- `docs/team/member-guides/target-telemetry-data-flows.md`에 현재 파일별 역할을 적는다.
- `fake_telemetry.py`의 Prometheus 모드는 real Prometheus가 아니라는 점을 명시한다.
- `node_collector.py`의 `/metrics`가 첫 scrape target이라는 점을 명시한다.
- `deploy/target/target.yaml`의 fake-prometheus Deployment가 real Prometheus 설치가 아니라는 점을 명시한다.

검증:

- 문서에 `fake-prometheus != real Prometheus` 설명이 있다.
- 첫 real scrape target이 `optional-node-collector`라는 설명이 있다.

## Phase 2. Observability stack 설치 경계

목표:

```text
Prometheus/Loki/OTel 설치 YAML과 사용자 workload GitOps diff 대상을 분리한다.
```

구현할 것:

- `deploy/target/observability/` 경로 규칙.
- GitOps split worker workload 후보 제외 규칙 문서화.
- 플랫폼용 Prometheus와 사용자 커스텀 Prometheus의 구분 기준 문서화.
- `owner`, `purpose`, `gitops_managed`, `risk_level` 같은 manifest scope 초안 정리.

하지 말 것:

- Prometheus/Loki/OTel 설치 manifest를 command.requested 대상에 섞지 않는다.
- cluster-wide RBAC를 설명 없이 추가하지 않는다.

검증:

- observability 경로가 GitOps workload diff 후보에서 제외되는 기준이 문서화됨.
- 사용자 커스텀 Prometheus 요구가 생겨도 플랫폼용 Prometheus와 같은 release/namespace/RBAC를 공유하지 않도록 설계됨.

## Phase 3. Prometheus Helm values 초안

목표:

```text
Prometheus를 우리 플랫폼 관측용으로 설치할 수 있게 Helm values 초안을 만든다.
```

구현할 것:

- `deploy/target/observability/prometheus/README.md`.
- `deploy/target/observability/prometheus/values.yaml`.
- chart 이름과 version 후보 기록.
- chart repository와 chart version 고정.
- namespace 예: `observability-system`.
- secret 없는 demo values.
- node-collector scrape를 위한 설정 후보.

하지 말 것:

- Helm values에 token/password를 넣지 않는다.
- 사용자 workload GitOps diff 대상으로 넣지 않는다.

검증:

- values 파일에 secret이 없다.
- README에 install/template 명령이 있다.
- chart version이 문서에 고정되어 있다.

## Phase 4. Helm template/dry-run 검증

목표:

```text
실제 cluster에 적용하기 전에 Helm chart가 어떤 YAML을 만들지 확인한다.
```

구현할 것:

- `helm repo add ...` 명령 README 기록.
- `helm template ... -f values.yaml` 명령 README 기록.
- `helm install --dry-run ...` 명령 README 기록.
- dry-run 결과에서 namespace/RBAC/Service/PVC 확인할 항목 체크리스트.

검증:

- Helm template 명령이 성공한다.
- 생성 YAML에 `observability-system` namespace가 사용된다.
- 생성 YAML이 user workload diff 경로에 들어가지 않는다.

## Phase 5. node-collector scrape target 연결

목표:

```text
현재 이미 있는 node-collector /metrics를 Prometheus가 scrape하게 한다.
```

현재 코드 기준:

- `src/services/target/node-collector/node_collector.py`는 이미 `GET /metrics`를 제공한다.
- metric 예시:
  - `node_collector_cpu_usage_ratio`
  - `node_collector_memory_working_set_bytes`
  - `node_collector_filesystem_usage_ratio`
- cluster-agent가 생성하는 `optional-node-collector` DaemonSet spec에는 prometheus scrape annotation이 있다.

구현할 것:

- Prometheus values에서 annotation scrape 또는 scrape config로 node-collector를 잡는다.
- namespace `target`의 `optional-node-collector` service/pod를 scrape 대상으로 둔다.
- 필요하면 Node Collector Service를 추가한다.

검증:

- Prometheus target 목록에 node-collector가 보인다.
- target 상태가 `UP`이다.
- `/metrics` 응답이 Prometheus text format에 맞는다.

## Phase 6. Prometheus query 직접 검증

목표:

```text
Prometheus가 더미 metric을 scrape했고 query API로 다시 꺼낼 수 있는지 확인한다.
```

구현할 것:

- query 예시 문서화.
- `up`.
- `node_collector_cpu_usage_ratio`.
- `node_collector_memory_working_set_bytes`.
- `node_collector_filesystem_usage_ratio`.
- 필요한 경우 `rate(...)` 예시.

테스트:

- Prometheus UI 또는 HTTP API에서 더미 metric 조회 성공.
- query 실패 시 원인 확인 방법 문서화.

## Phase 7. Prometheus query client 구조화

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

## Phase 8. Agent debug query API

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
- target cluster 외부 Ingress로 열지 않는다.

테스트:

- Agent API에 query 요청.
- Agent가 Prometheus query 실행.
- 더미 metric 결과 반환.

## Phase 9. MetricEvidence summary

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

## Phase 10. Kubernetes API pod/event 수집

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

## Phase 11. Kubernetes 상태를 metric/evidence로 연결

목표:

```text
Kubernetes API에서 읽은 상태와 Prometheus metric을 함께 evidence로 볼 수 있게 한다.
```

구현할 것:

- PodEvidence와 MetricEvidence를 같은 cluster_id/namespace/pod 기준으로 연결.
- pod restart_count와 Prometheus cpu/memory metric을 함께 요약.
- source_ref에 Kubernetes API source와 Prometheus query를 모두 남김.

테스트:

- pod 상태 fixture + metric fixture -> combined evidence.
- pod 이름/namespace mismatch 처리.

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
