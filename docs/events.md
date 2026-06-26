# 이벤트 계약과 DLQ 운영 가이드

이 문서는 이벤트를 작성, 발행, 구독, 재시도, 재처리할 때 따르는 작업 규칙이다.

처음 분석하는 담당자는 먼저 [event-bus-learning-guide.md](event-bus-learning-guide.md)를 읽고, 이 문서를 source of truth로 사용한다.

## 이벤트 Envelope

모든 이벤트는 같은 envelope 구조를 사용한다.

```json
{
  "event_id": "uuid",
  "subject": "command.requested",
  "source": "api-gateway",
  "correlation_id": "uuid-or-business-flow-id",
  "causation_id": null,
  "created_at": "2026-06-26T00:00:00Z",
  "payload": {}
}
```

규칙:

- `subject`는 routing 계약이다.
- `source`는 이벤트를 만든 서비스다.
- `correlation_id`는 하나의 업무 흐름을 여러 서비스 사이에서 연결한다.
- `causation_id`는 이 이벤트를 만든 직접 원인 이벤트의 `event_id`다. 사용자가 처음 요청한 root 이벤트는 `null`을 사용한다.
- `created_at`은 envelope가 만들어진 UTC ISO 시각이다.
- `payload`는 raw string이나 array가 아니라 JSON object여야 한다.
- provider token, session token, kubeconfig, `.env` 값은 이벤트에 넣지 않는다.

## Subject 이름 규칙

가능하면 `<domain>.<thing>.<verb>` 형식을 사용한다.

| 영역 | 현재 subject |
| --- | --- |
| OAuth | `oauth.start.requested`, `oauth.connected` |
| GitOps | `git.webhook.received`, `git.changed`, `manifest.rendered`, `desired.diff.detected` |
| Agent | `agent.connected`, `cluster.evidence.received` |
| Command | `command.requested`, `command.rejected`, `command.dispatch.ready`, `command.dispatched`, `command.queued_for_agent`, `command.completed` |
| RCA | `evidence.built`, `rca.completed`, `safe_pr.created` |
| Dashboard | `dashboard.updated` |
| DLQ | `dead_letter.created` |

새 subject는 아래 내용을 결정한 뒤 추가한다.

- 누가 발행하는가
- 누가 구독하는가
- command 요청인지, 상태 사실인지, projection 알림인지
- 숨은 local state 없이 retry/replay할 수 있을 만큼 payload가 충분한지

## 발행

서비스는 raw NATS가 아니라 `EventClient`를 사용해야 한다. Subject enum은 `packages/contracts/event_bus/subjects.py`에서 관리한다.

```python
await self.events.publish(
    EventSubject.COMMAND_REQUESTED,
    SERVICE_NAME,
    {"cluster_id": "target-cluster-01", "namespace": "sandbox"},
    correlation_id,
)
```

`RecordedEventClient`는 JetStream에 발행하고 PostgreSQL `events`에도 envelope를 저장한다.

Gateway code는 호환성을 위해 `publish_and_record(...)`를 사용할 수 있다. 새 worker code는 `EventClient`를 우선 사용한다.

Worker handler 안에서 발행하는 후속 이벤트는 `causation_id`를 직접 넘기지 않아도 된다. `WorkerRuntime`이 현재 처리 중인 원본 이벤트를 context로 잡고, `RecordedEventClient`가 자동으로 원본 `event_id`를 `causation_id`에 넣는다.

## 구독

각 worker의 구독 위치는 자기 서비스 폴더의 `settings.py`다. Runner는 구독 subject를 직접 쓰지 않고 `SUBSCRIPTION`만 넘긴다.

```python
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.event_bus.subscriptions import WorkerSubscription

SERVICE_NAME = "command-worker"
SUBSCRIPTION = WorkerSubscription(
    service_name=SERVICE_NAME,
    subject=EventSubject.COMMAND_REQUESTED,
)
```

```python
WorkerService.from_subscription(
    SUBSCRIPTION,
    lambda events, db: CommandWorkflow(events, db).handle,
).run()
```

`WorkerService`는 내부에서 `EventHandlerSpec`과 `WorkerRuntime`을 만든다. durable consumer 이름은 기본적으로 `service_name`을 사용한다. 한 서비스가 여러 독립 consumer를 가져야 하면 `WorkerSubscription(..., durable_name="...")`을 명시한다.

현재 worker 구독 위치:

| 서비스 | 설정 파일 | 구독 subject |
| --- | --- | --- |
| GitOps Sync Worker | `services/gitops-sync-worker/settings.py` | `git.webhook.received` |
| Command Worker | `services/command-worker/settings.py` | `command.requested` |
| RCA Worker | `services/rca-worker/settings.py` | `cluster.evidence.received` |
| Dashboard Projection Service | `services/dashboard-projection-service/settings.py` | `>` |
| Audit Timeline Service | `services/audit-timeline-service/settings.py` | `>` |

## 큐 처리 알고리즘

현재 큐 정책은 MVP 기준으로 아래 조합을 사용한다.

```text
NATS JetStream durable pull consumer
-> handler 단위 at-least-once delivery
-> event_processing idempotency ledger
-> bounded retry
-> DLQ 저장
-> 운영자 확인 후 replay
```

선택 기준:

- exactly-once는 목표가 아니다. 중복 처리는 `event_processing`과 업무 테이블의 stable id로 막는다.
- 서비스 간 직접 HTTP 호출 순서를 큐에 숨기지 않는다. 선후행은 `command.requested -> command.dispatch.ready -> command.dispatched`처럼 subject 전이로 표현한다.
- MVP에서는 worker별 `fetch_batch_size=1`로 시작한다. 처리 순서와 디버깅을 쉽게 만들기 위해서다.
- 처리량이 필요해지면 worker replica 수, durable consumer 분리, batch size 조정 순서로 확장한다.
- 무한 재시도는 금지한다. 같은 이벤트가 계속 실패하면 운영자가 볼 수 있도록 DLQ로 이동한다.
- 전역 순서 보장은 하지 않는다. 순서가 중요한 흐름은 `correlation_id`와 상태 전이 검증으로 보호한다.

현재 구현 기준:

| 항목 | 기준 |
| --- | --- |
| stream | `SERVICE_EVENTS` |
| subject set | `packages/contracts/event_bus/subjects.py`의 `STREAM_SUBJECTS` |
| durable name | 기본값은 `service_name` |
| delivery | at-least-once |
| retry | 최대 3회, 기본 delay 2초 |
| batch | MVP 기본 1개 |
| idempotency | `event_processing(event_id, consumer)` primary key |
| DLQ subject | `dead_letter.created` |

## 처리 상태

소비된 모든 이벤트는 `event_processing`에 row를 남긴다.

| 상태 | 의미 |
| --- | --- |
| `processing` | handler가 실행 중이거나 곧 실행될 상태 |
| `retrying` | handler 실패 후 message가 `nak`된 상태 |
| `processed` | handler 완료 후 message가 `ack`된 상태 |
| `dead_lettered` | 최대 재시도 횟수를 초과해 DLQ에 저장된 상태 |

Runtime 처리 순서:

```text
message decode
-> event envelope 기록
-> event_processing 시작
-> workflow handler 실행
-> event_processing 완료
-> ack
```

실패 처리 순서:

```text
handler error
-> event_processing을 retrying으로 기록
-> delay를 두고 nak
```

최종 실패 처리 순서:

```text
max attempts에서 handler error
-> event_processing을 dead_lettered로 기록
-> event_dead_letters insert
-> dead_letter.created 발행
-> 원본 message ack
```

## Dead Letter 관리

Dead letter는 PostgreSQL에 저장하고 이벤트로도 발행한다.

| 저장소 | 목적 |
| --- | --- |
| `event_dead_letters` | 운영자가 확인할 수 있는 실패 queue |
| `dead_letter.created` | dashboard/audit를 위한 event stream 알림 |

Gateway endpoint:

```text
GET  /dead-letters
POST /dead-letters/{dead_letter_id}/replay
```

두 endpoint 모두 유효한 session이 필요하다. Replay는 원본 payload를 원본 subject로 새 `event_id`와 함께 다시 발행한다. 이때 `correlation_id`는 유지하고 `causation_id`는 원본 실패 이벤트의 `event_id`로 기록한 뒤 dead letter row를 `replayed`로 표시한다.

## Transaction과 순서 정책

이 프로젝트는 at-least-once event delivery를 사용한다.

따라서 handler는 idempotent 또는 near-idempotent하게 작성해야 한다.

- command record 작성 시 stable id를 사용한다.
- unique해야 하는 record는 `on conflict`를 사용한다.
- side effect 전에 input event를 기록한다.
- 후속 event는 local validation과 local write 이후 발행한다.
- local handler 작업이 끝나기 전에 ack하지 않는다.

DB와 event 발행의 엄격한 원자성이 필요한 workflow는 운영 전 outbox table을 추가한다.

```text
single DB transaction
-> business row 작성
-> outbox row 작성
-> commit
-> outbox relay가 event 발행
-> outbox row를 published로 표시
```

현재 MVP는 processing ledger와 DLQ를 먼저 구현한다. business write와 emitted event가 반드시 함께 commit되어야 하는 시점에는 outbox relay를 다음 hardening 단계로 추가한다.
