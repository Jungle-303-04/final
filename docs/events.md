# 이벤트/큐 시스템 사용 가이드

이 문서는 이벤트를 작성, 발행, 구독, 재시도, 재처리할 때 따르는 작업 규칙이다.

팀원이 처음 읽을 때는 내부 NATS, JetStream, ack/nak 세부 구현을 먼저 볼 필요가 없다.
서비스 담당자는 아래 네 가지만 기억하면 된다.

```text
1. 내가 받을 이벤트 body를 고른다.
2. app.py에 @app.on(BodyType) 핸들러를 만든다.
3. 처리 결과로 다음 이벤트 body를 yield 한다.
4. retry, ack, DLQ는 runtime이 처리한다.
```

## 0. 처음 쓰는 방법

새 worker를 만들거나 기존 worker에 이벤트 흐름을 추가할 때는 이 순서대로 한다.

### 0.1 받을 이벤트 확인

먼저 `src/packages/contracts/event_bus/bodies/`에서 내가 받을 body를 찾는다.

예를 들어 `command.requested`를 처리하려면 `CommandRequestedBody`를 사용한다.

```python
from packages.contracts.event_bus.bodies import CommandRequestedBody
```

body와 subject 연결은 `@event(...)`로 이미 등록되어 있다. 팀원은 subject 문자열을 직접 외울 필요가 없다.

### 0.2 worker handler 작성

worker 파일은 `src/services/<domain>/<service-name>/app.py` 또는
`src/services/<service-name>/app.py` 한 곳에 둔다.

```python
from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import (
    CommandRequestedBody,
    CommandRejectedBody,
    EventBody,
)
from packages.runtime.app import App, EventContext

app = App("example-worker")


@app.on(CommandRequestedBody)
async def on_command_requested(
    evt: CommandRequestedBody,
    ctx: EventContext,
) -> AsyncIterator[EventBody]:
    if evt.namespace != "sandbox":
        yield CommandRejectedBody(reason="sandbox only", requested=evt.to_body())
        return

    # 처리 결과가 있다면 다음 이벤트 body를 yield 한다.
    # NATS publish, ack, retry, DLQ는 여기서 직접 하지 않는다.
```

### 0.3 DB가 필요하면 ctx.db를 쓴다

worker가 DB를 써야 하면 `src/packages/contracts/stores.py`의 필요한 store protocol을
타입으로 붙인다.

```python
from packages.contracts.stores import AgentCommandStore


@app.on(CommandRequestedBody)
async def on_command_requested(
    evt: CommandRequestedBody,
    ctx: EventContext[AgentCommandStore],
) -> AsyncIterator[EventBody]:
    await ctx.db.queue_agent_command(ctx.correlation_id, evt.to_body(), "queued")
```

핵심 규칙:

- `ctx.db`는 자기 handler에 필요한 능력만 보이게 한다.
- DB 호출은 `await` 한다.
- handler 안에서 직접 PostgreSQL connection을 만들지 않는다.

### 0.4 새 이벤트가 필요하면 계약부터 추가

새 이벤트를 만들 때는 아래 순서로 추가한다.

1. `src/packages/contracts/event_bus/subjects.py`에 subject 추가
2. `src/packages/contracts/event_bus/bodies/<domain>.py`에 `<EventName>Body` 추가
3. body class에 `@event(EventSubject.X)` 등록
4. 생산 worker에서 `yield NewBody(...)`
5. 소비 worker에서 `@app.on(NewBody)` 사용
6. `docs/events.md`의 흐름 표 갱신
7. 테스트 추가

### 0.5 절대 하지 말 것

서비스 담당자는 아래를 직접 하지 않는다.

- raw NATS client import
- `ack()`, `nak()` 직접 호출
- `WorkerService.from_subscription(...)` 직접 호출
- event payload를 raw dict로 마음대로 조립
- secret/token/kubeconfig를 event body에 넣기

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
| envelope 객체 | `src/packages/contracts/event_bus/interfaces.py`의 `EventEnvelope` |
| wire/storage dict | `src/packages/contracts/event_bus/interfaces.py`의 `Event` |
| envelope 생성 | `src/packages/events/envelope.py`의 `event(...)` |

## 이벤트 Body

발행 body는 `src/packages/contracts/event_bus/bodies/`에 dataclass 계약으로 둔다. 여기서 "body"는 타입이 있는 이벤트 본문 객체를 가리킨다. envelope 안의 wire/transport 필드는 여전히 소문자 `payload`로 부른다(직렬화된 형태).

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
| Identity | `mail.email_verification.requested`, `mail.email_verification.sent` |
| GitOps | `git.webhook.received`, `git.changed`, `manifest.rendered`, `manifest.invalid`, `desired.diff.detected`, `diff.analyzed` |
| Agent/Target | `agent.connected`, `cluster.evidence.received`, `cluster.desired_state.changed`, `cluster.reconcile.requested`, `cluster.reconcile.started`, `cluster.drift.detected`, `cluster.reconcile.completed`, `cluster.reconcile.failed` |
| Command | `command.requested`, `command.rejected`, `command.dispatched`, `command.queued_for_agent`, `command.completed` |
| RCA/Safe PR | `incident.detected`, `evidence.built`, `evidence.bundle.built`, `rca.candidates.planned`, `rca.candidates.evaluated`, `rca.completed`, `rca.analysis_blocked`, `rca.followup.required`, `rca.rule_missing`, `rca.backlog.created`, `rca.ai_fallback.requested`, `recovery.planned`, `recovery.selection_requested`, `recovery.action_selected`, `safe_pr.requested`, `safe_pr.patch_prepared`, `diff.explained`, `safe_pr.ready_for_creation`, `rollout.diagnosed`, `approval.recommended`, `rca.action_required`, `alert.requested`, `alert.dispatched`, `alert.rejected`, `safe_pr.created`, `safe_pr.failed` |
| Workflow/Approval | `workflow.created`, `workflow.run.started`, `workflow.step.recorded`, `workflow.run.completed`, `workflow.run.failed`, `approval.requested`, `approval.granted`, `approval.rejected` |
| Dashboard | `dashboard.updated` |
| DLQ | `dead_letter.created` |

새 subject는 아래 내용을 결정한 뒤 추가한다.

- 누가 발행하는가
- 누가 구독하는가
- command 요청인지, 상태 사실인지, projection 알림인지
- 숨은 local state 없이 retry/replay할 수 있을 만큼 body가 충분한지

## 발행

서비스는 raw NATS를 직접 사용하지 않는다. Subject enum은 `src/packages/contracts/event_bus/subjects.py`에서 관리하고, 발행 본문은 `src/packages/contracts/event_bus/bodies/`의 body 객체를 사용한다.

현재 서비스 코드에서 발행 방식은 두 가지다.

| 위치 | 발행 방식 | 예 |
| --- | --- | --- |
| API Gateway HTTP 입구 | `ApiEventGateway.accept_body(...)` | HTTP request -> root event |
| Worker handler | `yield SomeBody(...)` | event -> 다음 event |

API Gateway 같은 HTTP 입구는 `src/packages/runtime/gateway.py`의
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
event table 기록을 함께 처리한다. 로그인/권한은 session과 resource access repository
기준으로 검사하고, 내부 표현은 `src/packages/contracts/auth.py`의 `Actor`로 맞춘다.

Worker handler 안에서는 직접 `publish(...)`를 호출하지 않고 다음 body를 `yield`한다.

```python
@app.on(DiffDetectedBody)
async def on_desired_diff(evt: DiffDetectedBody, ctx: EventContext):
    yield DiffAnalyzedBody(
        diff=evt.diff,
        safe=True,
        risk=evt.diff.risk,
        reason="sandbox 한정 변경이라 안전",
    )
```

런타임은 yield된 body를 envelope로 바꿔 outbox에 적재하고, relay가 NATS로 발행한다.
따라서 worker 담당자는 `event_id`, `causation_id`, `ack`, `nak`를 직접 만들지 않는다.

`RecordedEventClient`는 runtime/API 경계에서 JetStream 발행과 PostgreSQL `events` 저장을 담당한다.

Typed worker handler는 body 객체를 받는다.

```python
async def on_command_requested(evt: CommandRequestedBody, ctx: EventContext):
    namespace = evt.namespace
```

dashboard, audit 같은 전체 이벤트 projector는 `EventEnvelope`를 받는다.

```python
@app.on_any
async def on_event(evt: EventEnvelope, ctx: EventContext):
    subject = evt.subject
```

`ack`, `nak`, DLQ 이동은 workflow가 직접 처리하지 않는다. 이 책임은 `src/packages/runtime/worker.py`의 `EventProcessor`에 있다.

## 구독

한 서비스는 한 파일 `app.py`다. 구독은 `App` 객체에 `@app.on(BodyType)`으로 선언한다. 별도의 `settings.py`나 `WorkerSubscription` 모델, `WorkerService.from_subscription(...)` 호출은 더 이상 서비스 파일에 두지 않는다.

```python
from packages.contracts.event_bus.bodies import (
    CommandRequestedBody,
)
from packages.runtime.app import App

app = App("command-worker")

@app.on(CommandRequestedBody)              # 한 body 타입 구독
async def on_command_requested(evt, ctx):

if __name__ == "__main__":
    app.run()
```

`@app.on(BodyType)`이 구독할 subject를 body 타입에서 자동으로 유도한다. 핸들러는 다음 이벤트를 `yield`로 흘려보낸다(체이닝). 테스트나 카탈로그가 필요하면 `app.subscriptions`로 등록된 구독 계약을 확인한다.

audit/dashboard 같은 cross-cutting projector는 `@app.on_any`로 모든 이벤트(`>`)를 구독하고,
본문 대신 전체 `EventEnvelope`를 받는다. dashboard projection worker는
`src/services/projection/dashboard-worker`에 구현되어 있고, RCA/command/Safe PR 이벤트를
`RcaTimeline` read model로 투영한다.

```python
@app.on_any
async def on_event(evt: EventEnvelope, ctx):
    ctx.db.append_audit_log(evt)
```

`App.run()`은 내부적으로 `WorkerService`/`WorkerRuntime`을 조립한다. durable consumer 이름은 기본적으로 `service_name`을 사용한다. 즉 `WorkerService`는 런타임 내부 구현이며, 서비스 작성자는 직접 다루지 않는다.

현재 worker 구독 위치:

| 서비스 | 서비스 파일 | 구독 subject |
| --- | --- | --- |
| Git Pull Worker (App) | `src/services/gitops/git-pull-worker/app.py` | `git.webhook.received` |
| Manifest Render Worker (App) | `src/services/gitops/manifest-render-worker/app.py` | `git.changed` |
| Diff Worker (App) | `src/services/gitops/diff-worker/app.py` | `manifest.rendered` |
| Diff Analyze Worker (App) | `src/services/gitops/diff-analyze-worker/app.py` | `desired.diff.detected` |
| Workflow Controller (App) | `src/services/gitops/workflow-controller/app.py` | `git.webhook.received`, `git.changed`, `manifest.rendered`, `manifest.invalid`, `desired.diff.detected`, `diff.analyzed`, `safe_pr.created`, `safe_pr.failed`, `approval.granted`, `approval.rejected`, `command.queued_for_agent`, `command.completed` |
| AI Diff Worker (App) | `src/services/ai/diff-worker/app.py` | `safe_pr.patch_prepared` |
| Safe PR Worker (App) | `src/services/gitops/safe-pr-worker/app.py` | `safe_pr.requested` |
| SCM Worker (App) | `src/services/gitops/scm-worker/app.py` | `safe_pr.ready_for_creation` |
| Command Worker (App) | `src/services/command/command-worker/app.py` | `command.requested` |
| Alert Worker (App) | `src/services/alert/alert-worker/app.py` | `alert.requested` |
| Mail Worker (App) | `src/services/mail/mail-worker/app.py` | `mail.email_verification.requested` |
| Target Reconcile Worker (App) | `src/services/target/reconcile-worker/app.py` | `cluster.desired_state.changed`, `cluster.reconcile.requested` |
| Target Drift Worker (App) | `src/services/target/drift-worker/app.py` | `cluster.drift.detected` |
| Evidence Worker (App) | `src/services/ai/evidence-worker/app.py` | `cluster.evidence.received` |
| Incident Worker (App) | `src/services/ai/incident-worker/app.py` | `evidence.built` |
| Plan Worker (App) | `src/services/ai/plan-worker/app.py` | `evidence.bundle.built` |
| Analyze Worker (App) | `src/services/ai/analyze-worker/app.py` | `rca.candidates.planned` |
| RCA Worker (App) | `src/services/ai/rca-worker/app.py` | `rca.candidates.evaluated` |
| Recovery Worker (App) | `src/services/ai/recovery-worker/app.py` | `rca.completed` |
| Select Worker (App) | `src/services/ai/select-worker/app.py` | `recovery.planned` |
| Dispatch Worker (App) | `src/services/ai/dispatch-worker/app.py` | `recovery.action_selected` |
| Audit Timeline Service (`@app.on_any`) | `src/services/projection/audit-worker/app.py` | `>` |
| Dashboard Projection Service (`@app.on_any`) | `src/services/projection/dashboard-worker/app.py` | `>` |

## Outbound Gateway 패턴

외부 시스템으로 나가는 작업은 요청/결과 이벤트를 분리한다.

```text
*.requested
-> outbound gateway가 외부 provider 호출
-> *.created/*.delivered 또는 *.failed
```

이 표준 모양은 `src/packages/runtime/outbound.py`의 helper `deliver(call, ok, fail)`로 구현한다. 외부 호출 1회를 받아 성공이면 `ok(결과)` body를, 실패면 `fail(예외)` body를 yield한다.

예: `safe_pr.requested -> safe-pr-worker -> safe_pr.patch_prepared -> ai-diff-worker -> diff.explained + safe_pr.ready_for_creation -> scm-worker -> safe_pr.created | safe_pr.failed`. PR 생성은 `scm-worker`가 단일 repo write boundary로 수행하고, 요청 준비와 diff 설명은 앞단 worker 이벤트로 분리된다.

`safe_pr.requested`는 `pr_kind`로 PR 성격을 구분한다. `safe_pr_patch`는 실제 GitOps manifest 값을 바꾸는 PR이고, `safe_pr_review_doc`은 RCA 근거와 권장 조치를 repository에 남기는 검토 문서 PR이다. `diff-analyze-worker`는 `desired_manifest`가 있는 안전 diff를 `manifest_path`에 대한 rendered manifest patch와 `.gitops/rollback/<workflow_run_id>/...` rollback patch로 변환한다. `safe-pr-worker`는 이 요청을 `safe_pr.patch_prepared`로 정규화한 뒤 안전한 repository-relative path만 통과시킨다. `ai-diff-worker`는 `safe_pr.patch_prepared`를 소비해 `diff.explained`를 발행하고, 통과한 요청만 `safe_pr.ready_for_creation`으로 넘긴다. `scm-worker`는 검토 문서, apply patch, rollback patch를 같은 PR branch에 커밋한다.

`command.requested` 계열 write command는 `approval_ref`와 `policy_decision_ref`를 계약에 포함한다. `command-worker`는 write action catalog에서 approval이 필요한 action을 queue 전에 검증하고, DB의 approval record가 없거나 granted/not_required 상태가 아니거나 policy decision ref가 다르면 fail-closed한다. 통과한 ref는 `Plan`과 `command.queued_for_agent`에도 복사한다. target `cluster-agent`도 실행 직전 같은 ref가 없으면 fail-closed한다.

`command.completed.result`는 agent 결과 보고 기준으로 `applied`, `retryable`, `resources`, `rollout`, `stdout`, `stderr`를 포함할 수 있다. target `cluster-agent`는 write command 결과에 resource별 status를 채우고, Deployment 변경은 Kubernetes API의 rollout status를 구조화해 `rollout.ready`, replica count, condition 목록으로 보고한다. stdout/stderr는 제한 길이와 민감 문자열 redaction으로 정리한다.

## Repo / Cluster 매핑 상태

Git repo와 target cluster는 직접 1:1로 묶지 않는다. `deployment_bindings`를
중간 매핑으로 둔다. 하나의 repo가 여러 cluster로 갈 수도 있고, 하나의 cluster가
여러 repo를 받을 수도 있기 때문이다.

```text
git_repositories
  -> git_watch_targets(branch/path polling cursor)
  -> deployment_bindings(repo path -> cluster/namespace/app)
  -> applications(사용자가 보는 서비스 단위)
  -> workflow_runs / workflow_run_steps / approvals(제품 실행 상태)
  -> manifest_artifacts(commit별 render/invalid 상태)
  -> command queue / target agent
```

repo 접근 가능 여부와 배포 가능한 manifest 여부는 다른 상태다. repo는 정상이어도
YAML이 없거나 파싱할 수 없으면 `manifest.invalid` 이벤트와
`manifest_artifacts.status=invalid_config`으로 남긴다. 이 실패는 재시도/DLQ보다
사용자가 고쳐야 할 설정 상태에 가깝다.

사용자 접근권한은 조직/그룹/리소스 역할을 분리해 판단한다. 기본 조직 구성원은
클러스터를 제어할 수 없고, `resource_assignments`로 그룹에 배정된 리소스에 대해
`member_resource_roles`의 `observer`, `release_operator`, `incident_operator`,
`cluster_steward` 중 하나를 받아야 한다. 실제 permission matrix는
`role_permissions(organization_id, resource_type, role, permission)`가 담당한다.
token은 이벤트에 넣지 않고 `credential_ref`만 저장한다.

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
- 서비스 간 직접 HTTP 호출 순서를 큐에 숨기지 않는다. 선후행은 `command.requested -> command.dispatched`처럼 subject 전이로 표현한다.
- MVP에서는 worker별 `fetch_batch_size=1`로 시작한다. 처리 순서와 디버깅을 쉽게 만들기 위해서다.
- 처리량이 필요해지면 worker replica 수, durable consumer 분리, batch size 조정 순서로 확장한다.
- 무한 재시도는 금지한다. 같은 이벤트가 계속 실패하면 운영자가 볼 수 있도록 DLQ로 이동한다.
- 전역 순서 보장은 하지 않는다. 순서가 중요한 흐름은 `correlation_id`와 상태 전이 검증으로 보호한다.

현재 구현 기준:

| 항목 | 기준 |
| --- | --- |
| stream | `SERVICE_EVENTS` |
| subject set | `src/packages/contracts/event_bus/subjects.py`의 `STREAM_SUBJECTS` |
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

현재 구현은 handler가 yield한 후속 이벤트를 outbox에 적재하고, `OutboxRelay`가 발행한다.
business write와 emitted event를 더 강하게 묶어야 하는 시점에는 repository 단위 transaction과 relay locking을 다음 hardening 단계로 보강한다.
