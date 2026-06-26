# 이벤트 버스 학습 가이드

이 문서는 이벤트 시스템 담당자가 현재 구현을 읽고 다음 작업을 판단하기 위한 가이드다.

목표는 “NATS를 어떻게 쓰는가”보다 “우리 서비스들이 같은 방식으로 사건을 기록하고, 실패를 복구할 수 있는가”를 이해하는 것이다.

## 먼저 잡을 개념

| 개념 | 쉬운 설명 | 코드 위치 |
| --- | --- | --- |
| Event Envelope | 모든 이벤트가 입는 공통 포장지 | `packages/events/envelope.py` |
| Subject | 이벤트 라우팅 주소 | `packages/contracts/event_bus/subjects.py` |
| EventClient | 서비스 코드가 이벤트를 발행하는 입구 | `packages/contracts/event_bus/interfaces.py` |
| EventBus | NATS JetStream concrete adapter | `packages/events/bus.py` |
| RecordedEventClient | 발행한 이벤트를 DB에도 기록하는 client | `packages/events/bus.py` |
| WorkerSubscription | worker가 어떤 subject를 구독하는지 적는 선언 | `packages/contracts/event_bus/subscriptions.py` |
| WorkerRuntime | fetch, handler 실행, ack/nak, DLQ를 담당하는 runtime | `packages/runtime/worker.py` |
| event_processing | consumer별 처리 상태 ledger | `packages/storage/database.py` |
| DLQ | 계속 실패한 이벤트를 운영자가 볼 수 있게 빼두는 곳 | `packages/events/bus.py`, `packages/storage/database.py` |

## 읽는 순서

1. `docs/events.md`
   - 현재 약속된 subject와 처리 정책을 먼저 본다.
   - at-least-once, retry, DLQ, replay 의미를 이해한다.

2. `packages/contracts/event_bus/subjects.py`
   - 어떤 subject가 공식 계약인지 확인한다.
   - 새 subject는 여기에 먼저 들어가야 한다.

3. `packages/events/envelope.py`
   - `event_id`, `correlation_id`, `causation_id`가 어떻게 생기는지 본다.
   - 한 업무 흐름을 추적하는 핵심이다.

4. `packages/events/bus.py`
   - NATS stream 생성, publish, subscribe, recorded publish, DLQ publish를 본다.
   - 서비스 코드는 raw NATS를 직접 만지면 안 된다.

5. `packages/runtime/worker.py`
   - worker가 메시지를 가져와 handler를 실행하고 ack/nak/DLQ 처리하는 흐름을 본다.
   - 버그가 나기 쉬운 핵심 파일이다.

6. `packages/storage/database.py`
   - `events`, `event_processing`, `event_dead_letters` table을 본다.
   - 중복 처리와 실패 추적이 DB에서 어떻게 막히는지 확인한다.

7. 각 서비스 `settings.py`
   - worker 구독은 여기서 확인한다.
   - 예: `services/command-worker/settings.py`

8. 각 서비스 workflow
   - 예: `services/command-worker/command_worker.py`
   - handler가 어떤 이벤트를 받고 어떤 이벤트를 발행하는지 본다.

## 현재 큐 알고리즘

```text
NATS JetStream durable pull consumer
-> WorkerRuntime fetch
-> event_processing 시작
-> workflow handler 실행
-> 후속 이벤트 발행
-> event_processing 완료
-> ack
```

실패하면 아래 흐름이다.

```text
handler 실패
-> event_processing retrying
-> nak(delay)
-> 다시 delivery
-> max attempts 초과
-> event_dead_letters 저장
-> dead_letter.created 발행
-> 원본 message ack
```

현재 정책은 아름다운 척하는 복잡한 큐가 아니라, MVP에서 디버깅 가능한 큐다.

- delivery는 at-least-once다.
- exactly-once는 목표가 아니다.
- 중복은 `event_processing`과 업무 테이블의 stable id로 막는다.
- 무한 재시도는 금지한다.
- 실패는 DLQ로 보내서 사람이 볼 수 있게 한다.
- 선후행은 HTTP 호출 순서가 아니라 subject 전이로 표현한다.

## 내가 새 이벤트를 추가할 때

예시: `command.validated`를 추가한다고 가정한다.

1. `packages/contracts/event_bus/subjects.py`
   - `EventSubject.COMMAND_VALIDATED = "command.validated"` 추가
   - 필요하면 `STREAM_SUBJECTS`에 domain prefix가 있는지 확인

2. `docs/events.md`
   - subject 표에 생산자, 소비자, 목적을 추가
   - payload 예시를 추가

3. 생산자 workflow
   - `await self.events.publish(EventSubject.COMMAND_VALIDATED, SERVICE_NAME, payload, correlation_id)`

4. 소비자 `settings.py`
   - `SUBSCRIPTION = WorkerSubscription(..., subject=EventSubject.COMMAND_VALIDATED)`

5. 테스트
   - envelope 필드 확인
   - handler 성공 시 ack
   - handler 실패 시 retry
   - max retry 후 DLQ

## 새 worker를 만들 때

서비스 폴더는 아래 형태를 따른다.

```text
services/my-worker
  settings.py
  my_worker.py
  runner.py
```

`settings.py`:

```python
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.event_bus.subscriptions import WorkerSubscription

SERVICE_NAME = "my-worker"
SUBSCRIPTION = WorkerSubscription(
    service_name=SERVICE_NAME,
    subject=EventSubject.COMMAND_REQUESTED,
)
```

`runner.py`:

```python
from packages.runtime.service import WorkerService
from settings import SUBSCRIPTION
from my_worker import MyWorkflow


def main() -> None:
    WorkerService.from_subscription(
        SUBSCRIPTION,
        lambda events, db: MyWorkflow(events, db).handle,
    ).run()


if __name__ == "__main__":
    main()
```

workflow는 `EventClient`와 repository port만 받는다. NATS, psycopg connection을 직접 만들지 않는다.

## 분석할 때 보는 질문

이벤트 하나를 보면 아래 질문을 한다.

- 이 이벤트는 command 요청인가, 이미 일어난 사실인가, dashboard projection 알림인가?
- 생산자는 누구인가?
- 소비자는 누구인가?
- replay해도 같은 결과가 나오는가?
- payload에 secret이 들어가지 않는가?
- correlation_id로 화면, audit, command, RCA를 묶을 수 있는가?
- 실패하면 retry해야 하는가, 바로 DLQ로 보내야 하는가?
- 후속 이벤트를 발행하기 전에 DB에 기록해야 하는가?

## 앞으로 보강할 부분

현재 구현은 MVP 기준으로 충분하지만 운영 전에는 아래를 더 봐야 한다.

| 항목 | 이유 | 우선순위 |
| --- | --- | --- |
| exponential backoff | 모든 실패를 같은 delay로 재시도하면 장애 때 몰릴 수 있다. | 높음 |
| outbox relay | DB write와 event publish를 하나의 논리 transaction으로 묶어야 하는 workflow가 생긴다. | 높음 |
| schema version | payload 구조가 바뀌어도 구버전 worker가 깨지지 않아야 한다. | 중간 |
| DLQ replay 권한 | 아무나 실패 이벤트를 재실행하면 안 된다. | 높음 |
| poison event 분류 | 재시도해도 절대 성공하지 않는 이벤트는 빠르게 DLQ로 보내야 한다. | 중간 |
| consumer lag 지표 | 어떤 worker가 밀리는지 운영자가 봐야 한다. | 중간 |
| subject ownership table | 각 subject의 생산자/소비자/담당자를 문서와 코드로 맞춰야 한다. | 중간 |

## 빠른 실험

```bash
make check
make up
make smoke
```

DLQ 동작을 볼 때는 일부러 handler에서 예외를 발생시키고 아래를 확인한다.

```text
event_processing.status = retrying
event_processing.status = dead_lettered
event_dead_letters row 생성
dead_letter.created event 발행
Gateway /dead-letters 조회
Gateway /dead-letters/{id}/replay 재발행
```

## 담당자가 지켜야 할 선

- 서비스 코드에서 raw NATS를 직접 호출하지 않는다.
- event payload에 token, kubeconfig, `.env` 값을 넣지 않는다.
- retry 횟수를 무한대로 만들지 않는다.
- DLQ를 단순 로그로 취급하지 않는다. 운영자가 복구할 수 있는 queue다.
- subject 문자열을 파일마다 직접 쓰지 않는다. `EventSubject`를 쓴다.
- worker마다 다른 bootstrap 방식을 만들지 않는다. `WorkerService`를 쓴다.
