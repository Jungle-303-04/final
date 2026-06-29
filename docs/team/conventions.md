# 팀 컨벤션

이 문서는 코드 스타일, 브랜치 이름, Pull Request, 리뷰, CI에 대한 팀 공통 규칙이다.

## 기준 문서

- 제품/WBS 기준: `WIKI/projects/final`
- 실행 코드 기준: 이 repository
- 아키텍처 기준: `docs/architecture.md`, `docs/events.md`, `docs/service-split-plan.md`
- 팀원 Codex 자동화 기준: `docs/team/codex-automation.md`
- 계약/데모 구현 경계 기준: `docs/team/contract-vs-demo-boundary.md`
- 코드와 문서가 다르면 같은 PR에서 문서도 함께 수정한다.

## 5인 담당 영역

대시보드는 별도 담당으로 세지 않는다. 현재 5개 역할은 구현 흐름을 기준으로 나눈다.

| 역할 | 주 담당 폴더 | 주 담당 문서 |
| --- | --- | --- |
| Platform/Integration | `src/packages/config`, `src/packages/contracts`, `src/packages/events`, `src/packages/storage`, `src/packages/runtime`, `deploy`, `scripts`, `.github` | `docs/events.md`, `docs/team/conventions.md` |
| Gateway/Auth | `src/services/api-gateway`, `src/packages/contracts/gateway`, `src/packages/contracts/event_bus` | `docs/team/member-guides/gateway-auth.md` |
| GitOps/Command | `src/services/gitops/*`, `src/services/command-worker` | `docs/team/member-guides/gitops-command.md` |
| RCA/Safe PR | `src/services/rca-worker`, `src/services/gitops/scm-worker`, `src/services/projection/audit-worker` | `docs/team/member-guides/rca-safe-pr.md` |
| Target/Telemetry | `src/services/target/cluster-agent`, `src/services/target/node-collector`, `deploy/target` | `docs/team/member-guides/target-telemetry.md` |

`src/services/projection/dashboard-worker`와 dashboard 관련 문서는 현재 공통 read model 영역으로 둔다. UI가 실제로 추가되면 별도 담당을 다시 만든다.

## 브랜치 규칙

짧게 쓰고 빨리 합치는 브랜치를 사용한다. 브랜치 이름에는 담당 역할명이 아니라 작업자의 GitHub ID를 넣는다.

```text
feat/<git-id>/<topic>
fix/<git-id>/<topic>
docs/<git-id>/<topic>
ci/<git-id>/<topic>
refactor/<git-id>/<topic>
```

예시:

```text
feat/woonyong/github-oauth
feat/hayden/manifest-render
feat/jiyoon/safe-pr-client
feat/minsu/prometheus-adapter
ci/woonyong/pr-gate
```

규칙:

- `<git-id>`는 GitHub username을 그대로 쓴다. 역할명인 `gateway`, `gitops`, `platform` 같은 값은 쓰지 않는다.
- `main`은 보호 브랜치이며 직접 push하지 않는다.
- 작업 브랜치는 팀이 별도 통합 브랜치를 만들지 않는 한 `main`으로 PR을 보낸다.
- 브랜치가 오래되면 리뷰 요청 전에 `main`을 반영한다.
- PR 하나는 하나의 담당 영역 또는 하나의 vertical slice에 집중한다.

## 커밋 규칙

아래 형식을 사용한다.

```text
type: 짧은 한국어 요약
```

허용 type:

- `feat`: 새 기능 또는 실행 동작 추가
- `fix`: 버그 수정
- `refactor`: 동작 변경 없는 구조 개선
- `docs`: 문서만 변경
- `test`: 테스트만 변경
- `ci`: GitHub Actions 또는 자동화
- `chore`: 의존성, 정리, 유지보수

예시:

```text
feat: GitHub OAuth adapter 추가
fix: DLQ replay 중복 처리 방지
docs: 팀 PR 규칙과 역할 분배 추가
ci: PR 필수 검증 workflow 추가
```

## Python 코드 스타일

- Python 스타일 기준은 Google Python Style Guide 한글 번역본을 따른다.
  - 기준 문서: https://github.com/Yosseulsin-JOB/Google-Python-Style-Guide-kor/blob/master/Google%20Python%20Style%20Guide%20kor.md
  - 린트: `make lint` (`uv run ruff check services packages scripts tests`)
  - 포맷: `make format` (`uv run ruff format ...`)
- 줄 길이는 100자를 기본으로 한다. 80자는 의미 없는 줄바꿈을 부르고, 무제한은
  가로 스크롤을 부른다. 폭은 포매터가 관리하므로 `E501`(line-too-long) 린트는 끈다.
- 한 줄로 표현 가능한 짧은 코드는 한 줄로 둔다. 긴 호출·import·생성자는 한
  항목씩 세로로 나눈다. magic trailing comma(끝 콤마)를 유지하므로, 블록 끝에
  콤마를 붙이면 포매터가 그 블록을 세로로 유지한다(의도적 세로 정렬 + 깔끔한 diff).
- 포맷은 팀 전체가 동일하게 적용된다. ruff 버전은 `uv.lock`에 고정되고,
  `make hooks`(또는 `make setup`)로 설치하는 pre-commit 훅(`.pre-commit-config.yaml`)이
  커밋 시 자동으로 포맷·린트한다.
- import는 표준 라이브러리, 서드파티, 로컬 패키지 순서로 나누고 Ruff import
  정렬을 통과해야 한다.
- 패키지 내부 import는 가능한 한 전체 패키지 경로를 사용한다.
  예: `from packages.contracts.event_bus.interfaces import Event`
- wildcard import는 사용하지 않는다.
- 함수와 메서드는 작게 유지하고 한 가지 책임만 갖게 한다.
- public module, class, function은 동작이 이름만으로 충분히 드러나지 않으면
  docstring을 작성한다. 단순 getter, dataclass, Protocol 선언처럼 자명한 코드는
  생략할 수 있다.
- 예외는 구체적으로 잡는다. process/runtime 경계에서만 넓은 `Exception`을 잡고,
  이 경우 retry, DLQ, 로그처럼 후속 처리가 반드시 있어야 한다.
- 짧은 이름보다 의미가 분명한 이름을 우선한다.
- 한 파일에서만 쓰는 상수는 해당 파일 상단에 둔다.
- 여러 파일이 공유하는 runtime/env 기본값은 `src/packages/config/constants.py`에 둔다.
- Gateway 요청 계약은 `src/packages/contracts/gateway`에 둔다.
- event bus subject, stream, subscription 계약은 `src/packages/contracts/event_bus`에 둔다.
- 특정 서비스만 쓰는 설정(상수)은 별도 `settings.py`가 아니라 `src/services/<service-name>/app.py` 안에 둔다.
- 교체 가능한 경계는 `src/packages/contracts/interfaces.py`의 `Protocol` port로 표현한다.
- worker 서비스는 한 파일 `app.py`에서 `src/packages/runtime/app.py`의 `App`을 사용한다. `App.run()`이 내부적으로 `FastApiService`/`WorkerService`/`AsyncService`를 조립한다.
- 서비스 폴더에서 NATS client, PostgreSQL connection, `WorkerRuntime`을 직접 조립하지 않는다.
- 서비스 workflow는 concrete NATS/PostgreSQL client가 아니라 port에 의존한다.
- 서비스 설정값은 `app.py` 상단 상수로 두고, 한 줄 가드는 `src/packages/config/errors.py`의 `require(cond, msg, error)` / `fail(msg, error)`를 쓴다(에러 메시지는 `[event-system]` 접두사).
- 한 파일에서만 쓰는 검증/사전조건 헬퍼는 별도 모듈로 빼지 않고 그 파일 하단에 `ensure_*` 함수로 co-locate한다(예: `src/packages/runtime/app.py`의 `ensure_registered`). 여러 파일이 공유하는 검증 원시 함수(`require`/`fail`)만 `src/packages/config/errors.py`에 둔다.
- 작은 불변 값 객체에는 dataclass를 사용한다.
- process 경계 밖에서 넓은 `except Exception`을 남발하지 않는다. Runtime/process edge에서는 예외를 잡아 DLQ로 전환할 수 있다.
- secret은 event, log, fixture, docs, screenshot, test에 넣지 않는다.

이름 규칙:

| 대상 | 스타일 | 예시 |
| --- | --- | --- |
| module/file | `snake_case.py` | `gateway.py`, `node_collector.py` |
| class | `PascalCase` | `App`, `WorkerService`, `Policy` |
| function/method | 동사형 `snake_case` | `publish_event`, `record_dead_letter` |
| constant | `UPPER_SNAKE_CASE` | `MAX_DEAD_LETTER_LIMIT` |
| event subject | `<domain>.<thing>.<verb>` | `command.requested` |
| service folder | `kebab-case` | `api-gateway` |

## 이벤트 규칙

- API 입구 발행은 `ApiEventGateway.accept_body(...)`, worker 후속 발행은 `yield Body(...)`를 사용한다. raw NATS 직접 발행은 금지한다.
- 구독은 각 worker `app.py`의 `@app.on(BodyType)`으로 선언한다. dashboard, audit 같은 cross-cutting projector는 `@app.on_any`로 모든 이벤트(`>`)를 구독하고 전체 `EventEnvelope`를 받는다.
- 핸들러는 다음 이벤트를 `yield`로 흘려보낸다(체이닝). `WorkerService`는 `App.run()` 내부 구현이며 서비스가 직접 호출하지 않는다.
- 새 event subject는 `src/packages/contracts/event_bus/subjects.py`와 `docs/events.md`에 함께 추가한다.
- 새 event body나 변경된 event body는 `src/packages/contracts/event_bus/bodies/`에 dataclass 계약으로 추가한다(base class `EventBody`, 클래스명 `<EventName>Body`).
- event body는 직렬화하면 JSON object여야 하며, workflow는 body 객체의 `to_body()` 결과를 발행한다(역직렬화는 `from_body()`). envelope의 transport 필드는 소문자 `payload`다.
- Python 필드는 `snake_case`를 사용하고, wire key 별칭은 body class metadata에서만 관리한다.
- 하나의 업무 흐름은 `correlation_id`를 유지한다.
- typed handler는 body 객체를 받고, `@app.on_any` projector만 `EventEnvelope`를 받는다.
- handler write는 at-least-once delivery에 안전하도록 idempotent하게 작성한다.
- handler는 local work를 끝낸 뒤 ack되어야 한다. `ack/nak/DLQ`는 `src/packages/runtime/worker.py`가 담당한다.
- 워커는 `ctx: EventContext[XStore]`로 받는다(`src/packages/contracts/stores.py`의 능력별 async Protocol). 자기 store 메서드만 노출되어 다른 서비스의 DB 능력은 안 보인다. `ctx.db` 호출은 비차단(`AsyncDb`)이라 항상 `await`.

## API 규칙

- 외부 HTTP는 Gateway만 담당한다.
- Worker는 HTTP route를 노출하지 않는다.
- UI는 Gateway만 호출한다.
- Request/response 검증은 Pydantic schema를 사용한다.
- Write command는 auth와 policy check를 반드시 지난다.
- 팀이 명시적으로 정책을 바꾸기 전까지 production namespace write는 금지한다.
- 처음부터 완전 분리 마이크로서비스로 구현한다.
- 서비스는 `src/services/<service-name>/app.py`와 Kubernetes Deployment/DaemonSet 경계를 유지한다.
- 단일 FastAPI 앱, role dispatcher, 서비스 간 직접 함수 호출 구조로 회귀하지 않는다.
- 서비스 pod 삭제 뒤 재기동과 retry/DLQ/read model 복구 가능성을 확인한다.

## 테스트 규칙

PR을 열기 전:

```bash
make check
python3 -m py_compile $(find services packages -name '*.py' -print)
```

수요일 데모 전:

```bash
make build-image
make up
make smoke
make status
```

GitHub Actions CI가 실패하면 PR은 merge하지 않는다.

`main` 보호 브랜치에 필요한 설정:

- Pull Request 필수
- 최소 1명 승인 필수
- status check 통과 필수
- 필수 check:
  - `Python lint and tests`
  - `Kubernetes manifest and image checks`
- conversation resolve 필수
- force push 금지
- branch deletion 금지

## PR 규칙

모든 PR은 아래 내용을 포함한다.

- 무엇을 바꿨는지
- 왜 바꿨는지
- 어떻게 테스트했는지
- 위험과 rollback 방법
- 아키텍처, workflow, API, 일정이 바뀐 경우 WIKI/docs 수정 여부
- event subject, payload, worker subscription, retry/DLQ 흐름이 바뀐 경우 `docs/events.md`와 PR 체크리스트 반영 여부

팀원 Codex 자동화는 `docs/team/codex-automation.md`의 공통 프롬프트를 사용한다.
각 팀원은 자기 GitHub ID만 지정하고, issue/PR/역할은 현재 문서와 GitHub 상태에서 매번 다시 계산한다.
팀원별 정기 자동화는 담당 범위 안에서 Issue/Project/docs/WIKI 정합성을 직접 관리한다.
자동화가 `git add`, `git commit`, `git push`, branch 생성/삭제, PR close/Ready/merge를 직접 수행하면 안 된다.
자동화는 구현/커밋/PR 증거가 있는 작업의 issue 본문과 Project status를 최신화하고, 구현되지 않은 계획 항목은 issue/checklist로 정의해 Project `할일`에 둔다.
완료된 issue는 닫지 않고 Project status만 `완료`로 갱신한다.
commit과 PR은 팀원이 필요를 판단하고 명시적으로 요청한 작업 세션에서만 수행한다.

Merge 기준:

- CI 통과
- 사람 리뷰 1명 이상
- 관련 없는 파일 없음
- raw secret 없음
- 동작 변경에는 테스트 추가 또는 수정
- 담당 member guide checklist 충족
- event contract 변경에는 subject/payload/handler 테스트 또는 smoke 증거 포함

## 리뷰 규칙

Reviewer는 아래 경우 PR을 막는다.

- CI 실패
- 동작 변경에 대한 테스트 누락
- event subject 추가 후 문서 누락
- event body 추가/변경 후 `src/packages/contracts/event_bus/bodies/` 또는 테스트 누락
- typed handler가 body 객체 대신 raw dict 전제를 사용
- worker가 `yield Body(...)` 대신 raw NATS 직접 사용
- workflow가 직접 ack/nak/DLQ를 처리
- Gateway 밖에 HTTP route 추가
- target write가 `sandbox` 밖으로 확장
- secret commit 또는 log 출력
- 아키텍처 변경 후 docs/WIKI 미수정
- 마이크로서비스 분리 실행 경계를 약화하는 변경
- health/restart/DLQ 없이 단일 프로세스 내부 호출에 의존하는 변경
