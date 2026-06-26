# 팀 컨벤션

이 문서는 코드 스타일, 브랜치 이름, Pull Request, 리뷰, CI에 대한 팀 공통 규칙이다.

## 기준 문서

- 제품/WBS 기준: `WIKI/projects/final`
- 실행 코드 기준: 이 repository
- 아키텍처 기준: `docs/architecture.md`, `docs/events.md`, `docs/service-split-plan.md`
- 팀원 Codex 자동화 기준: `docs/team/codex-automation.md`
- 코드와 문서가 다르면 같은 PR에서 문서도 함께 수정한다.

## 5인 담당 영역

대시보드는 별도 담당으로 세지 않는다. 현재 5개 역할은 구현 흐름을 기준으로 나눈다.

| 역할 | 주 담당 폴더 | 주 담당 문서 |
| --- | --- | --- |
| Platform/Integration | `packages/config`, `packages/contracts`, `packages/events`, `packages/storage`, `packages/runtime`, `deploy`, `scripts`, `.github` | `docs/events.md`, `docs/team/conventions.md` |
| Gateway/Auth | `services/api-gateway`, `packages/contracts/gateway`, `packages/contracts/event_bus` | `docs/team/member-guides/gateway-auth.md` |
| GitOps/Command | `services/gitops-sync-worker`, `services/command-worker` | `docs/team/member-guides/gitops-command.md` |
| RCA/Safe PR | `services/rca-worker`, `services/audit-timeline-service` | `docs/team/member-guides/rca-safe-pr.md` |
| Target/Telemetry | `services/target-cluster-agent`, `services/node-collector`, `deploy/target` | `docs/team/member-guides/target-telemetry.md` |

`services/dashboard-projection-service`와 dashboard 관련 문서는 현재 공통 read model 영역으로 둔다. UI가 실제로 추가되면 별도 담당을 다시 만든다.

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

- 짧은 이름보다 의미가 분명한 이름을 우선한다.
- 한 파일에서만 쓰는 상수는 해당 파일 상단에 둔다.
- 여러 파일이 공유하는 runtime/env 기본값은 `packages/config/constants.py`에 둔다.
- Gateway 요청 계약은 `packages/contracts/gateway`에 둔다.
- EventBus subject, stream, subscription 계약은 `packages/contracts/event_bus`에 둔다.
- 특정 서비스만 쓰는 설정은 `services/<service-name>/settings.py`에 둔다.
- 교체 가능한 경계는 `packages/contracts/interfaces.py`의 `Protocol` port로 표현한다.
- HTTP, worker, async loop 실행은 `packages/runtime/service.py`의 `FastApiService`, `WorkerService`, `AsyncService`를 사용한다.
- 서비스 폴더에서 NATS client, PostgreSQL connection, `WorkerRuntime`을 직접 조립하지 않는다.
- 서비스 workflow는 concrete NATS/PostgreSQL client가 아니라 port에 의존한다.
- runner에는 `SERVICE_NAME`, `SUBSCRIPTION`, polling interval 같은 설정값을 직접 쓰지 않는다.
- 작은 불변 값 객체에는 dataclass를 사용한다.
- process 경계 밖에서 넓은 `except Exception`을 남발하지 않는다. Runtime/process edge에서는 예외를 잡아 DLQ로 전환할 수 있다.
- secret은 event, log, fixture, docs, screenshot, test에 넣지 않는다.

이름 규칙:

| 대상 | 스타일 | 예시 |
| --- | --- | --- |
| module/file | `snake_case.py` | `gateway.py`, `node_collector.py` |
| class | `PascalCase` | `CommandWorkflow`, `WorkerService` |
| function/method | 동사형 `snake_case` | `publish_event`, `record_dead_letter` |
| constant | `UPPER_SNAKE_CASE` | `MAX_DEAD_LETTER_LIMIT` |
| event subject | `<domain>.<thing>.<verb>` | `command.requested` |
| service folder | `kebab-case` | `api-gateway` |

## 이벤트 규칙

- 발행은 `EventClient`를 사용한다.
- 구독은 각 worker `settings.py`의 `SUBSCRIPTION = WorkerSubscription(...)`으로 선언한다.
- runner는 `WorkerService.from_subscription(SUBSCRIPTION, ...)`만 호출한다.
- 새 event subject는 `packages/contracts/event_bus/subjects.py`와 `docs/events.md`에 함께 추가한다.
- event payload는 JSON object여야 한다.
- 하나의 업무 흐름은 `correlation_id`를 유지한다.
- handler write는 at-least-once delivery에 안전하도록 idempotent하게 작성한다.
- handler는 local work를 끝낸 뒤 ack되어야 한다. `ack/nak/DLQ`는 `packages/runtime/worker.py`가 담당한다.

## API 규칙

- 외부 HTTP는 Gateway만 담당한다.
- Worker는 HTTP route를 노출하지 않는다.
- UI는 Gateway만 호출한다.
- Request/response 검증은 Pydantic schema를 사용한다.
- Write command는 auth와 policy check를 반드시 지난다.
- 팀이 명시적으로 정책을 바꾸기 전까지 production namespace write는 금지한다.
- 처음부터 완전 분리 마이크로서비스로 구현한다.
- 서비스는 `services/<service-name>/runner.py`와 Kubernetes Deployment/DaemonSet 경계를 유지한다.
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

팀원 Codex 자동화는 `docs/team/codex-automation.md`의 공통 프롬프트를 사용한다.
각 팀원은 자기 GitHub ID만 지정하고, issue/PR/역할은 현재 문서와 GitHub 상태에서 매번 다시 계산한다.
정기 자동화는 읽기, 점검, 제안만 수행한다.
자동화가 `git add`, `git commit`, `git push`, branch 생성/삭제, PR 생성/수정/댓글/닫기, Ready 전환, issue 상태 변경을 직접 수행하면 안 된다.
commit과 PR은 팀원이 필요를 판단하고 명시적으로 요청한 작업 세션에서만 수행한다.

Merge 기준:

- CI 통과
- 사람 리뷰 1명 이상
- 관련 없는 파일 없음
- raw secret 없음
- 동작 변경에는 테스트 추가 또는 수정
- 담당 member guide checklist 충족

## 리뷰 규칙

Reviewer는 아래 경우 PR을 막는다.

- CI 실패
- 동작 변경에 대한 테스트 누락
- event subject 추가 후 문서 누락
- worker가 `EventClient` 대신 raw NATS 직접 사용
- Gateway 밖에 HTTP route 추가
- target write가 `sandbox` 밖으로 확장
- secret commit 또는 log 출력
- 아키텍처 변경 후 docs/WIKI 미수정
- 마이크로서비스 분리 실행 경계를 약화하는 변경
- health/restart/DLQ 없이 단일 프로세스 내부 호출에 의존하는 변경
