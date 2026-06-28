# 이벤트 계약과 DLQ 운영 가이드

이 문서는 이벤트를 작성, 발행, 구독, 재시도, 재처리할 때 따르는 작업 규칙이다.

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
- 코드 안에서는 `dict` 인덱싱 대신 `EventEnvelope` 속성으로 접근한다. 예: `evt.subject`, `evt.payload`, `evt.correlation_id`.

계약 위치:

| 항목 | 파일 |
| --- | --- |
| envelope 객체 | `packages/contracts/event_bus/interfaces.py`의 `EventEnvelope` |
| wire/storage dict | `packages/contracts/event_bus/interfaces.py`의 `Event` |
| envelope 생성 | `packages/events/envelope.py`의 `event(...)` |

## 이벤트 Body

발행 body는 `packages/contracts/event_bus/bodies/`에 dataclass 계약으로 둔다. 여기서 "body"는 타입이 있는 이벤트 본문 객체를 가리킨다. envelope 안의 wire/transport 필드는 여전히 소문자 `payload`로 부른다(직렬화된 형태).

규칙:

- 새 이벤트 본문은 `<EventName>Body` 클래스로 추가한다(base class는 `EventBody`).
- body 안에 들어가는 값 객체는 `Manifest`, `Diff`, `Plan`, `Evidence`처럼 접미사 없는 명사로 둔다.
- 서비스 workflow는 임의 dict를 직접 조립하기보다 body 객체를 만들고 `to_body()`로 발행한다. 역직렬화는 `from_body()`를 사용한다.
- Python 필드명은 `snake_case`를 사용한다. 외부 wire key가 `apiVersion`처럼 camelCase여야 하면 `field(metadata={"payload_name": "apiVersion"})` 별칭을 사용한다.
- 입력 body 검증은 gateway request schema 또는 worker 입력 Pydantic schema에서 처리하고, 출력 body 구성은 `bodies/`의 dataclass로 처리한다.

## Subject 이름 규칙

가능하면 `<domain>.<thing>.<verb>` 형식을 사용한다.

| 영역 | 현재 subject |
| --- | --- |
| OAuth | `oauth.start.requested`, `oauth.connected` |
| GitOps | `git.webhook.received`, `git.changed`, `manifest.rendered`, `desired.diff.detected`, `diff.analyzed` |
| Agent | `agent.connected`, `cluster.evidence.received` |
| Command | `command.requested`, `command.rejected`, `command.dispatch.ready`, `command.dispatched`, `command.queued_for_agent`, `command.completed` |
| RCA/Safe PR | `evidence.built`, `rca.completed`, `safe_pr.requested`, `safe_pr.created`, `safe_pr.failed` |
| Dashboard | `dashboard.updated` |
| DLQ | `dead_letter.created` |
| Demo (골든패스) | `demo.ping.requested`, `demo.pong.requested`, `demo.pong.delivered`, `demo.pong.failed` |

새 subject는 아래 내용을 결정한 뒤 추가한다.

- 누가 발행하는가
- 누가 구독하는가
- command 요청인지, 상태 사실인지, projection 알림인지
- 숨은 local state 없이 retry/replay할 수 있을 만큼 body가 충분한지

## 발행

서비스는 raw NATS가 아니라 `EventClient`를 사용해야 한다. Subject enum은 `packages/contracts/event_bus/subjects.py`에서 관리하고, 발행 본문은 `packages/contracts/event_bus/bodies/`의 body 객체를 우선 사용한다.

API Gateway 같은 HTTP 입구는 `packages/runtime/gateway.py`의
`ApiEventGateway`를 사용한다.

```python
accepted = await self.events.accept_body(
    CommandRequestedBody(...),
    actor=Actor(current.user_id, tuple(current.roles)),
)
return accepted.response()
```

`accept_body`는 타입이 있는 body 하나를 받아 subject를 자동으로 유도하고 envelope로 발행한다.

`ApiEventGateway`는 API 요청을 event envelope로 만들고, event bus 발행과
event table 기록을 함께 처리한다. 로그인/권한 구현이 아직 fake여도 내부
표현은 `packages/contracts/auth.py`의 `Actor`로 맞춘다.

```python
from packages.contracts.event_bus.bodies import CommandRequestedBody, Diff
from packages.contracts.event_bus.subjects import EventSubject

diff = Diff(
    resource="deployment/demo",
    namespace="sandbox",
    desired_image="demo:v2",
    actual_image="demo:v1",
    risk="low",
)

await self.events.publish(
    EventSubject.COMMAND_REQUESTED,
    SERVICE_NAME,
    CommandRequestedBody(
        cluster_id="target-cluster-01",
        action="rollout_restart",
        namespace="sandbox",
        reason="desired diff detected",
        diff=diff,
    ).to_body(),
    correlation_id,
)
```

`RecordedEventClient`는 JetStream에 발행하고 PostgreSQL `events`에도 envelope를 저장한다.

새 API code는 `ApiEventGateway`, 새 worker code는 `EventClient`를 우선 사용한다.

Worker handler 안에서 발행하는 후속 이벤트는 `causation_id`를 직접 넘기지 않아도 된다. `WorkerRuntime`이 현재 처리 중인 원본 이벤트를 context로 잡고, `RecordedEventClient`가 자동으로 원본 `event_id`를 `causation_id`에 넣는다.

Handler는 `EventEnvelope`를 받는다.

```python
async def handle(self, evt: EventEnvelope) -> None:
    payload = evt.payload
    correlation_id = evt.correlation_id
```

`ack`, `nak`, DLQ 이동은 workflow가 직접 처리하지 않는다. 이 책임은 `packages/runtime/worker.py`의 `EventProcessor`에 있다.

## 구독

한 서비스는 한 파일 `app.py`다. 구독은 `App` 객체에 `@app.sub(BodyType)`으로 선언한다. 별도의 `settings.py`나 `WorkerSubscription` 모델, `WorkerService.from_subscription(...)` 호출은 더 이상 서비스 파일에 두지 않는다.

```python
from packages.contracts.event_bus.bodies import (
    CommandRequestedBody,
    CommandDispatchReadyBody,
)
from packages.runtime.app import App

app = App("command-worker")

@app.sub(CommandRequestedBody)              # 한 body 타입 구독
async def on_command_requested(evt, ctx):
    yield CommandDispatchReadyBody(...)     # 체이닝: 다음 이벤트는 yield

if __name__ == "__main__":
    app.run()
```

`@app.sub(BodyType)`이 구독할 subject를 body 타입에서 자동으로 유도한다. 핸들러는 다음 이벤트를 `yield`로 흘려보낸다(체이닝). 테스트나 카탈로그가 필요하면 `app.subscriptions`로 등록된 구독 계약을 확인한다.

dashboard, audit 같은 cross-cutting projector는 `@app.on_event`로 모든 이벤트(`>`)를 구독하고, 본문 대신 전체 `EventEnvelope`를 받는다.

```python
@app.on_event
async def on_event(evt: EventEnvelope, ctx):
    ctx.db.append_audit_log(evt)
```

`App.run()`은 내부적으로 `WorkerService`/`WorkerRuntime`을 조립한다. durable consumer 이름은 기본적으로 `service_name`을 사용한다. 즉 `WorkerService`는 런타임 내부 구현이며, 서비스 작성자는 직접 다루지 않는다.

현재 worker 구독 위치:

| 서비스 | 설정 파일 | 구독 subject |
| --- | --- | --- |
| Git Pull Worker (App) | `services/gitops/git-pull-worker/app.py` | `git.webhook.received` |
| Manifest Render Worker (App) | `services/gitops/manifest-render-worker/app.py` | `git.changed` |
| Diff Worker (App) | `services/gitops/diff-worker/app.py` | `manifest.rendered` |
| Diff Analyze Worker (App) | `services/gitops/diff-analyze-worker/app.py` | `desired.diff.detected` |
| Repo Gateway Worker (App) | `services/gitops/repo-gateway-worker/app.py` | `safe_pr.requested` |
| Command Worker (App) | `services/command-worker/app.py` | `command.requested` |
| RCA Worker (App) | `services/rca-worker/app.py` | `cluster.evidence.received` |
| Dashboard Projection Service (`@app.on_event`) | `services/projection/dashboard-projection-service/app.py` | `>` |
| Audit Timeline Service (`@app.on_event`) | `services/projection/audit-timeline-service/app.py` | `>` |

## Outbound Gateway 패턴

외부 시스템으로 나가는 작업은 요청/결과 이벤트를 분리한다.

```text
*.requested
-> outbound gateway가 외부 provider 호출
-> *.created/*.delivered 또는 *.failed
```

이 표준 모양은 `packages/runtime/outbound.py`의 helper `deliver(call, ok, fail)`로 구현한다. 외부 호출 1회를 받아 성공이면 `ok(결과)` body를, 실패면 `fail(예외)` body를 yield한다.

예: `safe_pr.requested -> repo-gateway-worker -> safe_pr.created`. PR 생성은 `repo-gateway-worker` 한 곳으로 모았다. `rca-worker`와 (안전한 diff일 때) `diff-analyze-worker` 둘 다 `safe_pr.requested`를 발행하고, `repo-gateway-worker`가 이를 소비해 `safe_pr.created`(또는 `safe_pr.failed`)를 발행한다.

외부 provider 호출 실패는 가능한 한 worker 예외로 터뜨려 DLQ로 보내기보다
`safe_pr.failed` 같은 도메인 실패 이벤트로 발행한다. 이렇게 하면 dashboard,
audit, replay 정책이 같은 이벤트 흐름 안에서 실패를 볼 수 있다. JSON decode,
계약 위반, DB 장애처럼 런타임 자체가 처리할 수 없는 오류는 기존 retry/DLQ
경로를 사용한다.

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
