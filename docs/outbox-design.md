# Transactional Outbox (완전판) 설계

> 상태: 1~3단계 **구현 완료 + `make smoke` 통과**(실 Postgres+NATS, gitops/rca/command
> 전 경로 정상 흐름 확인). 남은 검증: 크래시 주입 시 exactly-once(정상 경로만 확인됨).
> 알려진 caveat: 핸들러를 트랜잭션으로 감싸므로 outbound 게이트웨이의 외부 HTTP가
> tx 안에서 돌아 tx 가 길게 잡힌다(정확성 OK, 성능 이슈). 4단계에서 분리 예정.

목표: **업무 쓰기 + 이벤트 발행 + ledger 완료**를 한 DB 트랜잭션으로 묶어
"정확히 한 번 처리(exactly-once processing)"를 보장한다. 워커 작성자의 코드
(`yield`, `await ctx.db.x`)는 한 글자도 안 바뀐다 — 모든 변경은 프레임워크 내부.

## 문제 (왜 필요한가)

지금은 한 핸들러가 ① DB 쓰기 ② 이벤트 발행을 **별개 작업**으로 한다. 중간에
죽으면 ①은 됐는데 ②는 안 됨(또는 반대) → 어긋남. 재시도하면 ①을 또 함. 재발행
이벤트는 새 event_id라 downstream ledger도 못 막는다.

## 핵심 아이디어

발행을 NATS로 *직접* 하지 않고, 업무 데이터와 **같은 트랜잭션**으로 `outbox`
테이블에 적재(stage)한다. 별도 relay가 outbox를 읽어 NATS로 publish하고 sent
표시. 그러면:

- 업무쓰기 + outbox적재 + ledger완료가 **원자적**(전부 commit 되거나 전부 안 됨).
- 한 번 commit 되면 ledger=완료 → 재배달돼도 dedup → 핸들러 재실행 없음 →
  outbox에 이벤트가 **정확히 한 벌**.
- relay는 같은 event_id를 at-least-once publish → downstream ledger가 dedup.

## 왜 async 전면 도입인가

한 트랜잭션을 공유하려면 핸들러의 `ctx.db.x` 쓰기가 outbox·ledger와 **같은
커넥션**에서 실행돼야 한다. 지금은 sync 엔진 + `asyncio.to_thread`라, 하나의 sync
커넥션을 여러 풀 스레드가 공유하게 돼 위험하다. 그래서 **async 엔진(asyncpg) +
async 커넥션 + async DB 메서드**로 간다 — 단일 이벤트 루프에서 커넥션 하나를
`await`로 순차 사용 → 스레드 위험 0, 트랜잭션 의미가 명확.

## 구성 요소

### 1. outbox 테이블 (`src/packages/storage/schema.py`)

```
outbox(id PK autoincr, event_id UNIQUE, subject, source,
       correlation_id, causation_id, payload jsonb, created_at, sent_at NULL)
```

- `id`: relay 발행 순서.
- `event_id`: 안정 식별자(한 번 생성, relay 재시도 시 동일) → downstream dedup 키.
- `sent_at NULL` = 아직 발행 안 됨.

### 2. UnitOfWork (`src/packages/storage/unit_of_work.py`)

async 트랜잭션을 열고, 활성 커넥션을 contextvar 에 심는다. `ctx.db` 의 async
메서드는 contextvar 의 커넥션을 쓴다(없으면 자기 트랜잭션 — 레거시 호환).

```python
_ACTIVE = ContextVar("active_conn", default=None)

class UnitOfWork:
    def __init__(self, engine): self.engine = engine
    @asynccontextmanager
    async def begin(self):
        async with self.engine.begin() as conn:   # 트랜잭션 1개
            token = _ACTIVE.set(conn)
            try: yield conn
            finally: _ACTIVE.reset(token)
        # 정상 종료 = commit, 예외 = rollback (전부 또는 전무)
```

`async_connection()` 은 `_ACTIVE` 가 있으면 그걸 yield(commit 안 함 — UoW 소유),
없으면 새 트랜잭션.

### 3. 핸들러는 발행 대신 수집 (`src/packages/runtime/dispatch.py`)

`make_event_handler` 가 yield 를 NATS 로 보내지 않고 **EventEnvelope 리스트로
수집해 반환**한다. (client 의존 제거)

```python
async def handle(evt) -> list[EventEnvelope]:
    body = sub.body_type.from_body(evt.payload)
    ctx = EventContext.of(evt, db)           # db = UoW 바인딩
    result = sub.fn(body, ctx) ...
    return [event(o.__subject__, source, o.to_body(), evt.correlation_id, evt.event_id)
            async for o in _iter_results(result)]
```

### 4. EventProcessor 가 한 트랜잭션으로 커밋 (`src/packages/runtime/worker.py`)

```python
async def process(message):
    evt = decode(message)
    async with uow.begin() as conn:          # ← 트랜잭션 시작
        if not ledger.begin(evt): ack; return # dedup(같은 커넥션)
        events = await handler(evt)            # 업무쓰기(같은 커넥션) + 수집
        outbox.stage(conn, events)             # outbox 적재(같은 커넥션)
        ledger.finish(evt)                     # 완료 표시(같은 커넥션)
    # exit = commit (전부 원자적)
    await message.ack()
```

실패 시 트랜잭션 rollback → 아무 효과 없음 → 재시도. max 초과 → DLQ.

### 5. OutboxRelay (`src/packages/runtime/relay.py`)

```python
class OutboxRelay:
    async def run_once(self):
        rows = await self.store.unsent_events(limit)
        for e in rows:
            await self.bus.publish_envelope(e)   # 저장된 봉투 그대로(같은 id)
        await self.store.mark_sent([e.event_id for e in rows])
```

워커 런타임이 소비 루프와 함께 relay 루프를 `asyncio.gather` 로 돌린다. 각 워커는
자기 outbox 만 relay.

### 6. bus.publish_envelope (`src/packages/events/bus.py`)

저장된 EventEnvelope 를 *그대로*(같은 event_id) NATS 에 발행. relay 재시도 시
동일 id → downstream dedup.

## 워커 작성자 관점 (변화 0)

```python
@app.on(GitChangedBody)
async def on_git_changed(evt, ctx: EventContext[RepoChangeStore]):
    await ctx.db.save_repo_change(...)   # ← 그대로 (내부적으로 UoW 트랜잭션)
    yield ManifestRenderedBody(...)      # ← 그대로 (내부적으로 outbox 적재)
```

작성자는 트랜잭션·outbox·relay 를 전혀 모른다. 이게 캡슐화.

## 단계별 도입 (이 순서로 머지, 각 단계 스모크)

1. **[이 커밋] 골격**: outbox 테이블 · Outbox 포트 · OutboxRelay ·
   `publish_envelope` · in-memory 테스트. 임계경로 미변경(기존 직접 발행 유지).
2. **async write path**: 워커-쓰기 DB 메서드 async 버전 + `async_connection` 이
   contextvar 커넥션 사용. `make up` 스모크.
3. **UoW + EventProcessor flip**: 수집-적재-완료 한 트랜잭션. `make up` 스모크.
4. **직접 발행 경로 제거** + relay 단일화. 스모크.

## 검증

- 1단계: in-memory outbox와 test bus로 relay 동작 단위 테스트.
- 2~4단계: 실DB/NATS 필요 → `make up && make smoke`(크래시 주입 시 효과 1회 확인).
