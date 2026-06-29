# 멤버 가이드: Platform / Integration

## 미션

전체 시스템이 merge 가능하고, 테스트 가능하고, demo 가능한 상태를 유지한다. 각 서비스 담당자가 이벤트 시스템을 깊게 몰라도 정해진 계약과 런타임을 사용해 붙을 수 있게 공통 기반을 관리한다.

Platform/Integration 담당자는 “모든 코드를 직접 구현하는 사람”이 아니라 “팀원이 안전하게 구현할 수 있는 레일을 까는 사람”이다.

```text
Common Contracts
  subjects.py
  packages/contracts/event_bus/bodies/
  EventEnvelope
  service ports

Runtime
  App (서비스 진입점)
  WorkerService (App.run 내부)
  EventProcessor
  outbound.py deliver(call, ok, fail)
  retry/DLQ/idempotency

Infrastructure
  NATS JetStream
  PostgreSQL
  Redis
  CI/smoke
  deploy scripts
```

## 담당 영역

- `packages/config`
- `packages/contracts`
- `packages/events`
- `packages/storage`
- `packages/runtime`
- `.github`
- `deploy`
- `scripts`
- `docs/events.md`
- `docs/team/conventions.md`
- `docs/team/member-guides/*.md`

## 현재 책임

- `packages/contracts/event_bus`, `EventEnvelope`, body DTO, `EventClient`, `App`/`WorkerService`, retry, DLQ, replay 계약을 유지한다.
- CI가 실패한 PR이 merge되지 않도록 GitHub Actions와 branch protection 기준을 관리한다.
- 배포 스크립트와 수요일 demo 검증 흐름을 유지한다.
- DB/event 원자성이 필요해지는 시점에 outbox relay 도입 여부를 결정한다.
- dashboard projection은 별도 UI 담당이 생기기 전까지 read model 계약만 관리한다.
- 팀원이 이벤트/커맨드 시스템을 몰라도 구현 가능한 문서와 예제를 유지한다.

## 팀원이 이벤트 시스템을 몰라도 되게 하는 설명 규칙

팀원에게는 내부 구현보다 아래 네 가지를 반복해서 알려준다.

1. 어떤 event subject를 구독하는가.
2. handler는 어떤 body DTO를 읽는가(`@app.sub(BodyType)`).
3. 처리 후 어떤 event subject를 발행하는가.
4. retry/DLQ/ack/nak는 runtime이 처리한다.

서비스 담당자가 직접 알 필요 없는 것:

- NATS JetStream pull consumer 세부 구현
- ack/nak 호출 위치
- event_processing ledger SQL
- DLQ 저장 방식

서비스 담당자가 반드시 지켜야 하는 것:

- raw NATS client를 서비스 workflow에 import하지 않는다.
- event body는 DTO 또는 계약 클래스로 만든다(`EventBody` 하위).
- secret은 event, response, log, audit에 넣지 않는다.
- subject/body 변경은 문서와 테스트를 같이 바꾼다.

## 코드 규칙

- 교체 가능한 infrastructure는 `Protocol` interface로 표현한다.
- runtime error handling은 runtime/process edge code에 모은다.
- service workflow가 raw NATS client를 import하지 않게 한다.
- service workflow가 raw event dict에 의존하지 않고 `EventEnvelope`와 body DTO를 사용하게 한다.
- 상수는 의미 있는 이름으로 명시한다.
- 클래스는 바뀌는 이유가 하나가 되도록 작게 유지한다.
- 공통 계약 변경은 최소 하나 이상의 서비스 테스트 또는 contract test를 동반한다.
- GitHub Actions와 Docker runtime dependency는 같은 의존성 집합을 보게 한다.

## Phase별 작은 PR 계획

| Phase | PR 목표 | 왜 이 단위인가 |
| --- | --- | --- |
| 1 | 이벤트 계약 문서/예제 정비 | 팀원이 subject/body를 보고 구현할 수 있게 한다. |
| 2 | Worker template/fake runtime test helper | 새 worker 테스트를 쉽게 만든다. |
| 3 | Contract test 추가 | subject/body 변경 회귀를 잡는다. |
| 4 | CI dependency/runtime gap 제거 | 로컬/CI/Docker 차이로 부팅 실패를 막는다. |
| 5 | Smoke test 강화 | import만이 아니라 최소 event path를 검증한다. |
| 6 | DLQ/replay 운영 가이드 | 실패 복구 방법을 팀에 제공한다. |
| 7 | Outbox 도입 판단 문서 | DB write + event publish 불일치 시점을 준비한다. |
| 8 | Team guide/issue split 관리 | 큰 작업을 PR 단위 이슈로 쪼개 유지한다. |

## Phase 1. 이벤트 계약 문서/예제 정비

목표:

```text
새 담당자가 subject와 body만 보고 worker 입출력을 이해하게 만든다.
```

왜 해야 하는가:

- 이벤트 시스템을 구현한 사람이 아니면 `EventEnvelope`, `correlation_id`, `causation_id`를 바로 이해하기 어렵다.
- 문서가 없으면 각 서비스가 dict key를 제각각 쓰기 시작한다.
- subject 흐름이 문서화되어야 dashboard/audit 담당도 따라갈 수 있다.

구현할 것:

- `docs/events.md`에 subject별 producer/consumer/body 표.
- `subjects.py` 그룹 주석 유지.
- `packages/contracts/event_bus/bodies/` DTO 예제.
- `make events`(`python scripts/events.py`) 카탈로그 유지: 각 이벤트를 `subject  Body  by=service/handler  fields=(...)`로 출력하고, `@app.on_event` 서비스는 "ALL-EVENT 구독(프로젝터)" 섹션에 모은다.
- 각 멤버 가이드에 “이벤트를 몰라도 되는 연결 규칙” 섹션.

생각할 것:

- 새 subject가 사실인지 명령인지 이름으로 구분되는가?
- body에 secret이 들어갈 가능성이 있는가?
- producer와 consumer가 실제로 존재하는가?

하지 말 것:

- 구현되지 않은 subject를 확정된 것처럼 많이 만들지 않는다.
- 문서와 코드 subject 이름을 다르게 두지 않는다.

테스트:

- subject 상수 중복 없음.
- body DTO `to_body()`/`from_body()` round-trip smoke.
- docs 링크 깨짐 없음.

## Phase 2. Worker template/fake runtime test helper

목표:

```text
각 worker 담당자가 NATS 없이 handler 단위 테스트를 쉽게 쓰게 한다.
```

왜 해야 하는가:

- 초보자가 JetStream을 띄우지 못해도 로직 테스트를 작성할 수 있어야 한다.
- 테스트 helper가 있으면 핸들러가 yield한 subject/body를 바로 검증할 수 있다.
- runtime은 별도 테스트하고 service workflow는 작게 테스트한다.

구현할 것(`tests/conftest.py`):

- `load_service` — `app.py`를 로드해 `App`을 꺼낸다.
- `run_handler` — 핸들러를 envelope로 호출하고 yield된 body를 모은다.
- `subjects_of` — yield된 body들의 subject 목록을 뽑는다.
- `SpyDb` — DB 호출을 기록하는 fake.
- worker test 예제 하나.

생각할 것:

- helper가 production 코드에 섞이지 않는가?
- correlation_id/causation_id 기본값이 테스트에서 예측 가능한가?
- fake가 너무 많은 behavior를 숨기지 않는가?

하지 말 것:

- 단위 테스트에서 실제 NATS/Postgres를 기본으로 요구하지 않는다.
- fake를 실제 런타임 adapter처럼 복잡하게 만들지 않는다.

테스트:

- sample handler가 `run_handler`/`subjects_of`로 발행 subject 검증.
- EventEnvelope fixture가 body DTO와 잘 맞는다.

## Phase 3. Contract test 추가

목표:

```text
공통 계약 변경이 서비스 흐름을 깨뜨리지 않는지 빠르게 잡는다.
```

왜 해야 하는가:

- subject 이름 하나가 바뀌면 모든 worker가 조용히 끊길 수 있다.
- body field 하나가 바뀌면 dashboard/audit/command가 깨질 수 있다.
- contract test는 팀원이 리팩토링할 때 안전망이 된다.

구현할 것:

- subject naming test.
- body required field test.
- worker `@app.sub` subscription subject 존재 test.
- docs/events subject mention test는 가능하면 추가.

생각할 것:

- 테스트가 너무 빡빡해서 모든 문구 변경을 막지는 않는가?
- 필수 field와 optional field를 구분했는가?

하지 말 것:

- contract test에서 외부 서비스 호출을 하지 않는다.
- payload dict 순서에 의존하지 않는다.

테스트:

- `make check`에 포함.
- Docker build와 같은 dependency set에서도 import 가능.

## Phase 4. CI dependency/runtime gap 제거

목표:

```text
CI에서는 통과하지만 Docker 컨테이너가 부팅 실패하는 차이를 없앤다.
```

왜 해야 하는가:

- pyproject에는 있는데 `services/requirements.txt`에 없는 의존성은 컨테이너에서 죽는다.
- import 이름 충돌 같은 문제는 실제 startup에서 드러난다.
- 초보 팀원은 CI 초록불을 신뢰하므로 CI가 실제 실행에 가까워야 한다.

구현할 것:

- `services/requirements.txt`와 pyproject dependency 정합성 확인.
- Gateway/worker container import smoke.
- `make smoke`가 실제 app startup을 확인하도록 개선.
- Redis/Postgres/NATS dependency health wait 확인.

생각할 것:

- CI에서 docker compose/kind까지 매번 돌릴지, nightly로 둘지.
- p0 PR에는 어떤 smoke를 required로 둘지.
- secret 없는 test env를 어떻게 구성할지.

하지 말 것:

- CI에서 실제 외부 GitHub/Prometheus에 의존하지 않는다.
- import smoke만으로 E2E가 된 것처럼 보지 않는다.

테스트:

- `make check`.
- container import/startup smoke.
- 최소 Gateway health check.

## Phase 5. Smoke test 강화

목표:

```text
Gateway -> event -> worker -> DB/read model 중 최소 한 줄이 실제로 흐르는지 확인한다.
```

왜 해야 하는가:

- compile/lint는 subject/body mismatch를 못 잡을 수 있다.
- demo 전 가장 중요한 것은 한 cycle이 흐르는지다.
- 팀원 PR이 서로를 깨뜨렸는지 빨리 알아야 한다.

구현할 것:

- local smoke script.
- fake webhook 또는 fake evidence input.
- expected event/read model 확인.
- failure log 출력 개선.

생각할 것:

- smoke가 너무 느리면 팀원이 안 돌린다.
- nightly integration과 PR required smoke를 나눌 수 있다.
- 실패 시 어느 서비스 로그를 보여줄지.

하지 말 것:

- smoke에서 실제 provider credential을 요구하지 않는다.
- 모든 시나리오를 smoke에 넣어 느리게 만들지 않는다.

테스트:

- `make smoke` 한 번으로 최소 경로 확인.
- 실패 시 exit code non-zero.

## Phase 6. DLQ/replay 운영 가이드

목표:

```text
실패 event가 DLQ로 갔을 때 팀원이 복구 절차를 알게 한다.
```

왜 해야 하는가:

- at-least-once/event-driven 시스템은 실패가 정상 운영 시나리오다.
- DLQ를 모르면 장애 때 데이터를 잃은 것으로 오해한다.
- replay API는 위험할 수 있으므로 권한과 절차가 필요하다.

구현할 것:

- DLQ 발생 조건 문서화.
- `dead_letter.created` 흐름 설명.
- Gateway replay API 사용 절차.
- replay 권한 guard 계획.

생각할 것:

- replay가 중복 side effect를 만들 수 있는가?
- 어떤 event는 replay하면 안 되는가?
- replay 전에 원인 수정이 되었는가?

하지 말 것:

- DLQ를 자동 무한 replay하지 않는다.
- secret 포함 payload를 DLQ에 넣지 않는다.

테스트:

- handler failure -> retry -> DLQ.
- replay API fake path.

## Phase 7. Outbox 도입 판단 문서

목표:

```text
DB 저장과 event publish가 동시에 필요한 흐름에서 불일치 위험을 판단한다.
```

왜 해야 하는가:

- queue 저장 성공 후 event publish 실패, 또는 event publish 성공 후 DB 실패가 생길 수 있다.
- 지금은 MVP 흐름이지만 command queue/read model이 중요해지면 outbox가 필요할 수 있다.
- 도입 시점을 문서화해야 과한 설계와 늦은 대응을 모두 피한다.

구현할 것:

- outbox 필요 조건 정리.
- command queue + event publish 흐름 분석.
- 도입 전/후 구조 그림.
- 아직 구현하지 않는다면 이유 명시.

생각할 것:

- 어떤 event가 반드시 DB transaction과 묶여야 하는가?
- replay/idempotency로 충분히 커버되는가?
- outbox relay를 누가 운영할 것인가?

하지 말 것:

- 근거 없이 모든 event에 outbox를 먼저 적용하지 않는다.
- 불일치 위험을 문서 없이 방치하지 않는다.

## Phase 8. Team guide/issue split 관리

목표:

```text
팀원이 큰 설계를 작은 PR로 가져갈 수 있게 이슈와 문서를 유지한다.
```

왜 해야 하는가:

- 초보 팀원은 큰 이슈를 받으면 시작 지점을 잃는다.
- “왜 하는지”가 없으면 구현 중 설계를 바꿔도 되는지 판단하기 어렵다.
- 커밋 단위 이슈가 있으면 리뷰와 rollback이 쉬워진다.

구현할 것:

- 각 멤버 가이드의 Phase 유지.
- GitHub issue를 Phase/PR 단위로 쪼갬.
- 상위 이슈는 tracking만 담당.
- 완료 기준과 테스트 기준을 각 이슈에 포함.

생각할 것:

- 한 이슈가 하루 안에 PR로 끝날 수 있는가?
- 테스트 없이 완료 기준을 적지 않았는가?
- 문서와 이슈가 서로 다른 말을 하지 않는가?

하지 말 것:

- epic 하나에 모든 구현 계획을 몰아넣지 않는다.
- 담당자가 질문해야만 시작할 수 있는 이슈를 만들지 않는다.

## PR 체크리스트

- `make check` 통과
- CI workflow가 required check로 유지됨
- 새 공통 contract에 최소 1개 테스트 존재
- 새 event body 계약이 `packages/contracts/event_bus/bodies/`와 테스트에 반영됨
- architecture/runtime 변경이 문서에 설명됨
- 다른 service owner 동작을 바꾼 경우 사전 조율 기록 존재
- Docker runtime dependency와 CI dependency가 어긋나지 않음
- 새 멤버 가이드 변경은 source와 WIKI에 모두 반영됨

## 처음 읽을 파일

1. `packages/contracts/event_bus`
2. `packages/events`
3. `packages/runtime`
4. `packages/storage`
5. `docs/events.md`
6. `docs/team/conventions.md`
7. `.github`
8. `scripts`

## Codex 지시문

이 영역을 작업할 때는 `packages/contracts`, `packages/events`, `packages/storage`, `packages/runtime`, `docs/events.md`, `.github`를 먼저 읽어라. 변경 범위를 좁게 유지하고 각 service의 공개 계약을 깨지 마라.
