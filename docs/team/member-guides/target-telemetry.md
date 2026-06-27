# 멤버 가이드: Target / Telemetry

## 미션

대상 클러스터와 Management Plane을 연결한다. Target Agent는 대상 클러스터 안에서 실행되고, Gateway로만 outbound HTTP 요청을 보낸다. Node Collector는 node/runtime 정보를 수집해서 Agent가 보낼 수 있는 evidence 재료를 만든다.

이 담당자는 NATS, JetStream, worker 내부 구현을 몰라도 된다. Target 쪽은 이벤트 버스에 직접 붙지 않고 Gateway HTTP API만 호출한다.

```text
Target Cluster
  Node Collector
    -> local metrics/logs

  Target Agent
    -> POST /agent/connect
    -> POST /agent/evidence
    -> GET /agent/commands/poll
    -> POST /agent/commands/{command_id}/result

Management Gateway
  -> cluster.evidence.received event 발행
  -> command queue에서 agent command lease
  -> command.completed event 발행
```

## 담당 영역

- `services/target-cluster-agent`
- `services/node-collector`
- `deploy/target`
- `packages/contracts/agent` 또는 agent 관련 request/response 계약
- fake/real Prometheus, Loki, OpenTelemetry adapter
- ServiceAccount/RBAC manifest

## 현재 책임

- Target Agent는 inbound port 없이 outbound-only 구조를 유지한다.
- Agent는 NATS를 직접 알지 않는다. Gateway HTTP API만 호출한다.
- Node Collector는 secret 없이 node/runtime 정보를 수집한다.
- Kubernetes write 권한은 `sandbox` namespace 또는 demo namespace로 제한한다.
- Prometheus/Loki/OTel은 처음부터 모두 붙이지 않고 fake adapter -> one real adapter 순서로 확장한다.
- command 결과는 Gateway에 보고해서 Management Plane의 event 흐름으로 들어가게 한다.

## 이벤트/커맨드 시스템을 몰라도 되는 연결 규칙

Target/Telemetry 담당자가 알아야 할 것은 내부 이벤트 구현이 아니라 Gateway와 주고받는 HTTP 계약이다.

- evidence를 보내면 Gateway가 `cluster.evidence.received`를 발행한다.
- command poll을 호출하면 Gateway가 DB의 agent command queue에서 하나를 lease한다.
- command result를 보내면 Gateway가 command 완료 이벤트를 발행한다.
- Agent는 `correlation_id`를 새로 만들지 않는다. Gateway가 내려준 command에 있으면 그대로 돌려준다.
- Agent는 credential, kubeconfig, bearer token을 response/event/log에 남기지 않는다.

모르는 상태에서 작업할 때의 기준:

- “이걸 이벤트로 직접 발행해야 하나?”라고 느껴지면 Target 담당자는 거의 항상 아니다. Gateway API를 호출한다.
- “NATS client를 import해야 하나?”라고 느껴지면 Target 담당자는 아니다.
- “명령 실행 결과를 어디에 저장하지?”라고 느껴지면 DB에 직접 쓰지 말고 Gateway result API로 보낸다.

## 코드 규칙

- Target Agent는 NATS가 아니라 Management Gateway를 호출한다.
- write 권한은 `sandbox` namespace로 제한한다.
- RBAC는 최소 권한 원칙을 따른다.
- fake telemetry는 fallback으로 유지한다.
- Node Collector는 secret 없이 `/metrics`와 structured stdout log를 제공한다.
- Kubernetes client, telemetry client는 interface/adapter 뒤에 둔다.
- command 실행은 idempotent하게 만든다. 같은 command가 재전달될 수 있다.
- command 결과 payload에는 raw secret, kubeconfig, service account token을 넣지 않는다.

## Phase별 작은 PR 계획

아래 순서대로 구현한다. 한 Phase는 한 PR로 끝낼 수 있어야 한다.

| Phase | PR 목표 | 왜 이 단위인가 |
| --- | --- | --- |
| 1 | Agent HTTP 계약과 fake client 정리 | Gateway와 연결할 입구를 먼저 고정한다. |
| 2 | Agent connect/session heartbeat | 대상 클러스터가 살아 있는지 Management가 알 수 있어야 한다. |
| 3 | Evidence request schema와 fake evidence 전송 | RCA 담당자가 실제 클러스터 없이도 작업할 수 있다. |
| 4 | Command poll/lease client | Command Worker가 queue에 넣은 명령을 Agent가 가져갈 수 있다. |
| 5 | Command executor sandbox guard | demo write를 안전하게 제한한다. |
| 6 | Command result report | command lifecycle이 Gateway/Event 흐름으로 닫힌다. |
| 7 | Node Collector 최소 metrics/logs | evidence 품질을 높일 입력을 만든다. |
| 8 | Prometheus 또는 Loki adapter 1개 | fake에서 실제 telemetry로 확장 가능함을 검증한다. |

## Phase 1. Agent HTTP 계약과 fake client 정리

목표:

```text
Agent가 Gateway와 어떤 API를 주고받는지 request/response 형태를 먼저 고정한다.
```

왜 해야 하는가:

- Target 담당자가 이벤트 시스템을 몰라도 HTTP 계약만 보고 구현할 수 있다.
- Gateway 담당자가 route를 만들 때 같은 DTO를 사용할 수 있다.
- fake agent와 real agent가 같은 interface를 쓰면 demo와 실제 구현을 바꾸기 쉽다.

구현할 것:

- Agent config: `GATEWAY_URL`, `AGENT_ID`, `CLUSTER_ID`, `POLL_INTERVAL_SECONDS`.
- `AgentGatewayClient` Protocol.
- fake/in-memory client.
- `connect`, `send_evidence`, `poll_command`, `report_result` 메서드 이름 통일.
- request/response DTO 위치 확인 또는 생성.

생각할 것:

- agent_id는 누가 발급하는가? 초기에는 설정값으로 두고, 나중에 connect 응답으로 받을 수 있다.
- cluster_id는 command routing에 쓰이므로 stable해야 한다.
- Gateway URL이 없을 때 agent가 바로 죽을지, retry할지 정해야 한다.

하지 말 것:

- 이 단계에서 Kubernetes API를 붙이지 않는다.
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

왜 해야 하는가:

- Management는 command를 보낼 target cluster를 알아야 한다.
- Agent가 죽었는지 알 수 있어야 command queue lease 정책을 잡을 수 있다.
- dashboard에서 target cluster 상태를 보여줄 수 있다.

구현할 것:

- `POST /agent/connect` 호출 client.
- heartbeat loop.
- retry/backoff.
- connect response에 server time 또는 lease 설정이 있으면 반영.

생각할 것:

- Gateway가 잠시 죽었을 때 agent가 계속 재시도하는가?
- 같은 agent_id가 두 개 뜨면 어떻게 볼 것인가?
- heartbeat 실패가 command 실행 중단을 의미하는가? 기본은 아니다.

하지 말 것:

- heartbeat 실패 때 command result를 버리지 않는다.
- retry를 무한 tight loop로 돌리지 않는다.

테스트:

- connect 성공 시 agent 상태가 connected가 된다.
- Gateway 오류 시 retry한다.
- retry interval이 너무 짧지 않다.

## Phase 3. Evidence request schema와 fake evidence 전송

목표:

```text
cluster 상태, pod 상태, log snippet, metric snapshot을 Gateway에 보낼 수 있게 한다.
```

왜 해야 하는가:

- RCA Worker는 evidence 없이는 원인 분석을 할 수 없다.
- 처음부터 Prometheus/Loki를 붙이면 어려우니 fake evidence로 흐름을 먼저 뚫는다.
- evidence schema가 안정되어야 RCA/Safe PR 담당자가 병렬로 작업할 수 있다.

구현할 것:

- evidence DTO 확인 또는 생성.
- fake evidence builder.
- `POST /agent/evidence` 호출.
- evidence kind 구분: `pod`, `metric`, `log`, `trace`, `node`.

생각할 것:

- evidence가 너무 크면 event payload와 DB 저장에 부담이 된다.
- log는 민감정보를 포함할 수 있으므로 짧고 마스킹된 snippet만 보낸다.
- timestamp와 cluster_id는 필수다.

하지 말 것:

- 전체 로그 파일을 전송하지 않는다.
- kubeconfig, token, env secret을 evidence에 넣지 않는다.

테스트:

- fake evidence가 Gateway request schema를 통과한다.
- 필수 field 누락 시 실패한다.
- secret처럼 보이는 값이 마스킹된다.

## Phase 4. Command poll/lease client

목표:

```text
Agent가 Gateway에서 자신에게 할당된 command 하나를 가져온다.
```

왜 해야 하는가:

- Management Plane이 대상 클러스터로 inbound 접근하지 않아도 된다.
- Agent가 outbound polling만 하므로 demo/kind 환경과 실제 보안 환경 모두 단순해진다.
- command queue는 at-least-once 성격이라 같은 명령이 다시 올 수 있다.

구현할 것:

- `GET /agent/commands/poll?cluster_id=...`.
- no command 응답 처리.
- command lease 만료 고려.
- command_id 중복 처리 guard.

생각할 것:

- poll interval이 너무 짧으면 Gateway에 부담이 된다.
- lease 받은 command를 실행하다 agent가 죽으면 어떻게 재전달될 수 있는가?
- 같은 command_id를 이미 완료했다면 다시 실행하지 않아야 한다.

하지 말 것:

- DB의 agent_commands 테이블을 직접 읽지 않는다.
- poll 응답에 secret이 있다고 가정하지 않는다.

테스트:

- command 없음 응답 처리.
- command 있음 응답 처리.
- 같은 command_id 중복 수신 시 재실행 방지.

## Phase 5. Command executor sandbox guard

목표:

```text
받은 command를 실행하기 전에 namespace/action 정책을 한 번 더 확인한다.
```

왜 해야 하는가:

- Gateway/Command Worker가 이미 정책 검사를 해도 target edge에서 방어선을 하나 더 둔다.
- demo 중 실수로 production namespace에 write하는 것을 막는다.
- Agent는 실제 Kubernetes write에 가장 가까운 위치라 최소 권한이 중요하다.

구현할 것:

- `CommandExecutor` Protocol.
- `KubernetesCommandExecutor` 또는 fake executor.
- allowed namespace check.
- allowed action check.
- dry-run 옵션.

생각할 것:

- `rollout_restart`만 먼저 허용할 것인가?
- namespace가 없으면 기본값을 둘 것인가, 거부할 것인가? 안전하게는 거부가 낫다.
- executor 실패는 retry 가능한 실패인가, 영구 실패인가?

하지 말 것:

- 모든 namespace write 권한을 주지 않는다.
- command payload에 있는 값을 검증 없이 kubectl 명령 문자열로 붙이지 않는다.

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

왜 해야 하는가:

- Command Worker는 queue에 넣는 역할이고, 실제 실행 완료 여부는 Agent가 알려줘야 한다.
- Gateway가 result를 받으면 event system으로 `command.completed` 같은 완료 흐름을 만들 수 있다.
- dashboard/audit은 이 result를 보고 사용자에게 상태를 보여준다.

구현할 것:

- `POST /agent/commands/{command_id}/result`.
- status: `succeeded`, `failed`, `rejected`.
- stdout/stderr는 짧게 제한.
- error reason 구조화.

생각할 것:

- result 전송 실패 시 재시도해야 한다.
- 같은 result를 두 번 보내도 Gateway가 idempotent하게 처리해야 한다.
- 실패 reason은 사람이 읽을 수 있어야 한다.

하지 말 것:

- 긴 로그 전체를 result에 넣지 않는다.
- secret이 포함된 kubectl output을 그대로 보내지 않는다.

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

왜 해야 하는가:

- Prometheus/Loki가 아직 없어도 target cluster 상태를 demo할 수 있다.
- RCA evidence에 node/runtime context가 들어가면 분석 품질이 좋아진다.
- collector와 agent를 분리하면 권한을 다르게 줄 수 있다.

구현할 것:

- `/metrics` endpoint.
- structured stdout log.
- node name, runtime, CPU/memory snapshot.
- agent가 collector에서 읽을 수 있는 local endpoint 또는 log scrape 방식.

생각할 것:

- collector에는 Kubernetes write 권한이 필요 없는가? 기본은 필요 없다.
- node마다 하나씩 떠야 하므로 DaemonSet이 적절한가?
- metric 이름은 Prometheus가 읽기 쉬운가?

하지 말 것:

- collector에 cluster admin 권한을 주지 않는다.
- secret env를 출력하지 않는다.

테스트:

- `/metrics` 응답 형식 검증.
- structured log JSON parse 가능.
- manifest dry-run.

## Phase 8. Prometheus 또는 Loki adapter 1개

목표:

```text
fake telemetry를 유지한 채 실제 telemetry provider 하나를 adapter로 붙인다.
```

왜 해야 하는가:

- 추상화가 맞는지 실제 도구 하나로 검증해야 한다.
- RCA 담당자가 실제 metric/log query 결과를 받을 수 있다.
- Gateway/Auth의 IntegrationTarget/TokenBroker 구조와 연결될 준비가 된다.

구현할 것:

- `TelemetryClient` Protocol.
- `FakeTelemetryClient`.
- `PrometheusTelemetryClient` 또는 `LokiTelemetryClient` 중 하나.
- query timeout.
- response size limit.

생각할 것:

- credential은 어디서 받는가? 최종 구조에서는 Token Broker다.
- telemetry query가 실패해도 fake fallback을 쓸 것인가?
- query result를 evidence로 줄일 때 어떤 필드만 남길 것인가?

하지 말 것:

- provider token을 event/evidence/log에 넣지 않는다.
- provider별 필드를 공통 evidence에 무분별하게 섞지 않는다.

테스트:

- fake adapter 테스트.
- real adapter는 mock HTTP로 테스트.
- timeout/큰 응답 처리.

## PR 체크리스트

- target manifest dry-run 통과
- PR에 RBAC 범위 설명 포함
- demo 전 `make up`, `make smoke`, `make status` 확인
- telemetry evidence schema 변경 시 RCA/Safe PR 담당자와 조율
- kubeconfig나 token commit 없음
- Agent 코드에 raw NATS import 없음
- Gateway API 계약 변경 시 Gateway/Auth 문서와 계약 파일 갱신

## 처음 읽을 파일

1. `services/target-cluster-agent/agent.py`
2. `services/node-collector/node_collector.py`
3. `deploy/target/target.yaml`
4. `services/api-gateway/gateway.py`의 agent route
5. `packages/contracts/event_bus/payloads.py`의 evidence/command payload
6. `docs/events.md`

## Codex 지시문

이 영역을 작업할 때는 `deploy/target/target.yaml`, `services/target-cluster-agent/agent.py`, `services/node-collector/node_collector.py`, `services/api-gateway/gateway.py`, `docs/events.md`를 먼저 읽어라. Target Agent는 이벤트 버스 구현을 몰라도 되며, Gateway HTTP API만 호출하게 유지하라.
