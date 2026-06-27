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

## 왜 하위 문서로 나누는가

Target/Telemetry는 Kubernetes, Prometheus, Loki, OpenTelemetry, Gateway API, command queue, evidence 모델이 모두 섞인다. 한 문서에 모두 적으면 담당자가 어디부터 해야 할지 더 헷갈린다.

그래서 이 메인 문서는 길잡이로만 사용한다. 실제 구현자는 아래 하위 문서를 순서대로 읽는다.

| 순서 | 문서 | 언제 읽는가 |
| --- | --- | --- |
| 1 | [Telemetry 기본 개념](target-telemetry-concepts.md) | Prometheus scrape, Loki/OTel ingest 차이를 모를 때 |
| 2 | [Telemetry 데이터 흐름](target-telemetry-data-flows.md) | Kubernetes 정보를 어떻게 수집/주입/조회할지 설계할 때 |
| 3 | [Evidence 모델](target-telemetry-evidence-model.md) | Gateway/RCA로 어떤 데이터를 보낼지 정할 때 |
| 4 | [구현 Phase 계획](target-telemetry-implementation-plan.md) | PR/커밋 단위로 작업을 시작할 때 |
| 5 | [Prometheus 실전 Runbook](target-telemetry-prometheus-runbook.md) | 실제 파일을 고치고 테스트할 때 |

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
- Prometheus/Loki/OTel은 fake adapter -> one real adapter -> ingest/exporter 순서로 확장한다.
- command 결과는 Gateway에 보고해서 Management Plane의 event 흐름으로 들어가게 한다.

## 가장 중요한 설계 판단

Telemetry 연결은 두 방향을 분리해서 생각한다.

```text
Direction A. 외부 관측 플랫폼에서 꺼내오기
  Prometheus / Loki / OTel backend
    -> Target Agent 또는 Management Gateway adapter가 query
    -> 필요한 부분만 evidence로 축약
    -> POST /agent/evidence

Direction B. 우리가 수집한 데이터를 관측 플랫폼에 넣기
  Kubernetes API / kubelet / Node Collector
    -> /metrics exporter, log shipper, OTLP exporter
    -> Prometheus / Loki / OTel Collector
    -> 나중에 다시 query해서 evidence로 사용
```

두 방향은 같은 말이 아니다.

- Prometheus에서 데이터를 조회한다: Prometheus HTTP API를 호출한다.
- Prometheus가 읽을 데이터를 제공한다: `/metrics` endpoint를 만들고 Prometheus가 scrape하게 한다.
- Loki에 로그를 넣는다: promtail/fluent-bit/OTel Collector 같은 수집기가 Loki ingest API로 보낸다.
- OTel로 trace를 보낸다: app 또는 collector가 OTLP endpoint로 push한다.

자세한 설명은 [Telemetry 기본 개념](target-telemetry-concepts.md)과 [Telemetry 데이터 흐름](target-telemetry-data-flows.md)에 있다.

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
- raw telemetry를 Gateway로 그대로 보내지 말고 evidence로 축약한다.

## 작업 시작 순서

Management Gateway API 계약은 아직 구현 중이므로 처음부터 Agent-Gateway 계약을 고정하지 않는다. 먼저 Prometheus를 독립적으로 설치하고, 더미 데이터를 넣고, 다시 query로 꺼내는 폐쇄 루프를 만든다.

1. Prometheus를 Helm으로 설치하고 values/dry-run 기준을 정리한다.
2. 더미 `/metrics` exporter를 만들어 Prometheus가 scrape하게 한다.
3. Prometheus query API로 더미 metric을 직접 조회한다.
4. Prometheus query를 코드 구조로 감싼다.
5. Target Agent 안에 더미 query API를 만들고, 받은 query를 Prometheus에 실행한다.
6. Agent가 Prometheus 결과를 더미 response/evidence 형태로 돌려준다.
7. Kubernetes API로 pod/event evidence를 수집한다.
8. Node Collector `/metrics`를 구현하고 Prometheus에 scrape시킨다.
9. Node Collector metric을 Agent query API로 다시 꺼내본다.
10. 그 다음 Gateway API 계약이 준비되면 실제 `POST /agent/evidence` 흐름과 연결한다.

상세 Phase는 [구현 Phase 계획](target-telemetry-implementation-plan.md)을 따른다.
실제 구현은 [Prometheus 실전 Runbook](target-telemetry-prometheus-runbook.md)의 PR 단위 체크리스트를 그대로 따라간다.

## PR 체크리스트

- target manifest dry-run 통과
- PR에 RBAC 범위 설명 포함
- demo 전 `make up`, `make smoke`, `make status` 확인
- telemetry evidence schema 변경 시 RCA/Safe PR 담당자와 조율
- kubeconfig나 token commit 없음
- Agent 코드에 raw NATS import 없음
- Gateway API 계약 변경 시 Gateway/Auth 문서와 계약 파일 갱신
- telemetry provider token이 evidence/event/log에 없음
- Prometheus/Loki/OTel 연결 변경 시 query path와 ingest path를 구분해서 설명
- raw telemetry를 Gateway로 보내지 않고 summary evidence로 축약

## 처음 읽을 파일

1. `services/target-cluster-agent/agent.py`
2. `services/node-collector/node_collector.py`
3. `deploy/target/target.yaml`
4. `services/api-gateway/gateway.py`의 agent route
5. `packages/contracts/event_bus/payloads.py`의 evidence/command payload
6. `docs/events.md`

## Codex 지시문

이 영역을 작업할 때는 `deploy/target/target.yaml`, `services/target-cluster-agent/agent.py`, `services/node-collector/node_collector.py`, `services/api-gateway/gateway.py`, `docs/events.md`, 그리고 이 문서의 하위 문서들을 먼저 읽어라. Target Agent는 이벤트 버스 구현을 몰라도 되며, Gateway HTTP API만 호출하게 유지하라.
