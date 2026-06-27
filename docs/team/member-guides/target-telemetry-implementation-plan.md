# Target / Telemetry: 구현 Phase 계획

## 목적

이 문서는 Target/Telemetry 담당자가 PR/커밋 단위로 작업할 수 있게 Phase를 나눈다.

한 Phase는 가능한 한 한 PR로 끝낸다. 모르는 상태에서도 “이번 PR에서 어디까지 해야 하는지”가 보여야 한다.

## Phase별 작은 PR 계획

| Phase | PR 목표 | 왜 이 단위인가 |
| --- | --- | --- |
| 1 | Agent HTTP 계약과 fake client 정리 | Gateway와 연결할 입구를 먼저 고정한다. |
| 2 | Agent connect/session heartbeat | 대상 클러스터가 살아 있는지 Management가 알 수 있어야 한다. |
| 3 | Evidence request schema와 fake evidence 전송 | RCA 담당자가 실제 클러스터 없이도 작업할 수 있다. |
| 4 | Command poll/lease client | Command Worker가 queue에 넣은 명령을 Agent가 가져갈 수 있다. |
| 5 | Command executor sandbox guard | demo write를 안전하게 제한한다. |
| 6 | Command result report | command lifecycle이 Gateway/Event 흐름으로 닫힌다. |
| 7 | Node Collector 최소 metrics/logs | evidence 품질을 높일 입력을 만든다. |
| 8 | Prometheus 또는 Loki query adapter 1개 | fake에서 실제 telemetry 조회로 확장 가능함을 검증한다. |
| 9 | Prometheus scrape/exporter 경로 | 우리가 만든 metric을 Prometheus가 읽게 한다. |
| 10 | Loki/OTel ingest 경로 | log/trace를 외부 관측 플랫폼으로 넣는 방식을 검증한다. |
| 11 | Evidence summarizer | raw telemetry를 Gateway로 보내기 전 축약한다. |
| 12 | Observability stack 설치 경계 | Prometheus/Loki/OTel 설치물을 user workload diff와 분리한다. |

## Phase 1. Agent HTTP 계약과 fake client 정리

목표:

```text
Agent가 Gateway와 어떤 API를 주고받는지 request/response 형태를 먼저 고정한다.
```

구현할 것:

- Agent config: `GATEWAY_URL`, `AGENT_ID`, `CLUSTER_ID`, `POLL_INTERVAL_SECONDS`.
- `AgentGatewayClient` Protocol.
- fake/in-memory client.
- `connect`, `send_evidence`, `poll_command`, `report_result` 메서드 이름 통일.
- request/response DTO 위치 확인 또는 생성.

하지 말 것:

- Kubernetes API를 붙이지 않는다.
- NATS를 import하지 않는다.
- secret을 설정 파일에 평문 예시로 넣지 않는다.

테스트:

- fake client가 각 메서드 호출 payload를 기록한다.
- 필수 설정 누락 시 명확한 오류가 난다.
- DTO에 unknown field가 있으면 거부된다.

## Phase 2. Agent connect/session heartbeat

목표:

```text
Agent가 Gateway에 자신이 어떤 cluster의 어떤 agent인지 등록하고 주기적으로 살아 있음을 알린다.
```

구현할 것:

- `POST /agent/connect` 호출 client.
- heartbeat loop.
- retry/backoff.
- connect response에 server time 또는 lease 설정이 있으면 반영.

테스트:

- connect 성공 시 agent 상태가 connected가 된다.
- Gateway 오류 시 retry한다.
- retry interval이 너무 짧지 않다.

## Phase 3. Evidence request schema와 fake evidence 전송

목표:

```text
cluster 상태, pod 상태, log snippet, metric snapshot을 Gateway에 보낼 수 있게 한다.
```

구현할 것:

- evidence DTO 확인 또는 생성.
- fake evidence builder.
- `POST /agent/evidence` 호출.
- evidence kind 구분: `pod`, `metric`, `log`, `trace`, `node`.

테스트:

- fake evidence가 Gateway request schema를 통과한다.
- 필수 field 누락 시 실패한다.
- secret처럼 보이는 값이 마스킹된다.

## Phase 4. Command poll/lease client

목표:

```text
Agent가 Gateway에서 자신에게 할당된 command 하나를 가져온다.
```

구현할 것:

- `GET /agent/commands/poll?cluster_id=...`.
- no command 응답 처리.
- command lease 만료 고려.
- command_id 중복 처리 guard.

테스트:

- command 없음 응답 처리.
- command 있음 응답 처리.
- 같은 command_id 중복 수신 시 재실행 방지.

## Phase 5. Command executor sandbox guard

목표:

```text
받은 command를 실행하기 전에 namespace/action 정책을 한 번 더 확인한다.
```

구현할 것:

- `CommandExecutor` Protocol.
- `KubernetesCommandExecutor` 또는 fake executor.
- allowed namespace check.
- allowed action check.
- dry-run 옵션.

테스트:

- sandbox namespace command 허용.
- non-sandbox namespace command 거부.
- unknown action 거부.
- dry-run 결과가 result payload로 만들어진다.

## Phase 6. Command result report

목표:

```text
명령 실행 결과를 Gateway에 보고해서 command lifecycle을 닫는다.
```

구현할 것:

- `POST /agent/commands/{command_id}/result`.
- status: `succeeded`, `failed`, `rejected`.
- stdout/stderr는 짧게 제한.
- error reason 구조화.

테스트:

- 성공 result 전송.
- 실패 result 전송.
- result 전송 실패 retry.
- duplicate result 전송 안정성.

## Phase 7. Node Collector 최소 metrics/logs

목표:

```text
Node Collector가 secret 없이 node/runtime 관측 정보를 제공한다.
```

구현할 것:

- `/metrics` endpoint.
- structured stdout log.
- node name, runtime, CPU/memory snapshot.
- agent가 collector에서 읽을 수 있는 local endpoint 또는 log scrape 방식.

테스트:

- `/metrics` 응답 형식 검증.
- structured log JSON parse 가능.
- manifest dry-run.

## Phase 8. Prometheus 또는 Loki query adapter 1개

목표:

```text
fake telemetry를 유지한 채 실제 telemetry provider 하나를 query adapter로 붙인다.
```

구현할 것:

- `TelemetryClient` Protocol.
- `FakeTelemetryClient`.
- `PrometheusTelemetryClient` 또는 `LokiTelemetryClient` 중 하나.
- query timeout.
- response size limit.

테스트:

- fake adapter 테스트.
- real adapter는 mock HTTP로 테스트.
- timeout/큰 응답 처리.

## Phase 9. Prometheus scrape/exporter 경로

목표:

```text
우리가 만든 node/runtime metric을 Prometheus가 scrape할 수 있게 한다.
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

## Phase 10. Loki/OTel ingest 경로

목표:

```text
logs/traces를 외부 관측 플랫폼으로 넣는 경로를 하나 검증한다.
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

## Phase 12. Observability stack 설치 경계

목표:

```text
Prometheus/Loki/OTel 설치 YAML과 사용자 workload GitOps diff 대상을 분리한다.
```

구현할 것:

- `deploy/target/observability/` 경로 규칙.
- Prometheus Helm values 초안.
- install/uninstall README.
- GitOps Sync Worker workload 후보 제외 규칙 문서화.
- chart version pinning.

하지 말 것:

- Prometheus/Loki/OTel 설치 manifest를 command.requested 대상에 섞지 않는다.
- Helm values에 secret을 넣지 않는다.
- cluster-wide RBAC를 설명 없이 추가하지 않는다.

테스트/검증:

- Helm template 또는 dry-run 통과.
- observability 경로가 GitOps workload diff 후보에서 제외됨.
- RBAC 범위가 PR에 설명됨.
