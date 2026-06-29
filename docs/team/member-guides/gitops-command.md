# 멤버 가이드: GitOps / Command

## 미션

Git provider를 주기적으로 polling해서 새 commit/merge를 감지하고, Kubernetes manifest 변화로 해석한 뒤 안전한 command plan으로 바꿔 Target Agent가 가져갈 수 있는 queue까지 연결한다.

이 담당자는 이벤트 시스템 내부 구현을 모두 알 필요는 없다. 다만 worker는 이벤트를 받아서 처리하고, 다음 이벤트를 발행한다는 규칙을 지켜야 한다.

```text
Git Poller (git-pull-worker)
  -> git.webhook.received
  -> git.changed

GitOps split workers (5단계 파이프라인)
  git-pull-worker        -> git.changed
  manifest-render-worker -> manifest.rendered
  diff-worker            -> desired.diff.detected
  diff-analyze-worker    -> diff.analyzed (안전 시 safe_pr.requested)
  repo-gateway-worker    -> safe_pr.created / safe_pr.failed

Command Worker (command.requested 는 API Gateway 가 발행)
  -> command.dispatch.ready
  -> command.dispatched
  -> agent command queue 저장
  -> command.queued_for_agent

Target Agent
  -> Gateway에서 command poll
```

## 담당 영역

- `services/gitops/git-pull-worker`
- `services/gitops/manifest-render-worker`
- `services/gitops/diff-worker`
- `services/gitops/diff-analyze-worker`
- `services/gitops/repo-gateway-worker`
- `services/command-worker`
- git watch target polling
- manifest render
- desired state diff
- command 생성과 dispatch 준비
- command policy
- command planner/dispatcher
- 관련 worker test

## 현재 책임

- Git 변경을 `git.changed`, `manifest.rendered`, `desired.diff.detected`, `diff.analyzed` 5단계 파이프라인으로 정리한다.
- 안전한 diff면 `diff-analyze-worker`가 `safe_pr.requested`를 발행하고, `repo-gateway-worker`가 실제 PR(`safe_pr.created`)을 만든다.
- diff 결과가 안전한 command/PR 요청 body로 변환되게 만든다.
- command는 production write가 아니라 `sandbox` 또는 demo namespace 기준으로 제한한다.
- command 생성과 dispatch 준비 event에 대한 테스트를 추가한다.
- command worker는 agent를 직접 호출하지 않고 agent command queue에 저장한다.

## 이벤트 시스템을 몰라도 되는 작업 규칙

Worker 담당자가 꼭 알아야 할 것:

- handler는 `@app.sub(BodyType)`로 구독하고 타입 body를 입력으로 받는다. 원본 envelope의 transport 필드는 `evt.payload`다.
- 새 이벤트는 다음 body를 `yield`로 발행한다(체이닝).
- `correlation_id`는 runtime/client가 이어가므로 직접 새로 만들지 않는다.
- ack/nak/retry/DLQ는 `packages/runtime/worker.py` 책임이다. workflow 코드에서 직접 처리하지 않는다.
- subject를 새로 만들면 `packages/contracts/event_bus/subjects.py`, body DTO를 새로 만들면 `packages/contracts/event_bus/bodies/`, 설명은 `docs/events.md`에 같이 반영한다.

모르는 상태에서 작업할 때의 기준:

- “다음 서비스가 알았으면 하는 사실”은 event로 발행한다.
- “Agent가 나중에 가져가야 하는 일”은 DB agent command queue에 저장한다.
- “이미 처리한 event인지”는 runtime ledger가 처리하므로 handler에서 중복 ack를 다루지 않는다.

## 코드 규칙

- 한 서비스는 한 파일 `app.py`다. worker 구독은 `@app.sub(BodyType)`으로 선언한다.
- `App.run()`이 내부적으로 worker 런타임을 조립한다. 서비스가 `WorkerService.from_subscription(...)`을 직접 호출하지 않는다.
- Worker는 다음 이벤트 body를 `yield`로 발행한다.
- Handler는 타입 body를 받고, 필요하면 원본 envelope의 `evt.payload`(transport)도 읽는다.
- 발행 body는 `packages/contracts/event_bus/bodies/`의 dataclass를 사용한다(base class `EventBody`).
- `correlation_id`를 유지한다.
- handler write는 idempotent하거나 conflict-safe해야 한다.
- workflow code에서 직접 ack/nak하지 않는다.
- command policy, planner, dispatcher는 분리한다.
- secret/token은 command body에 넣지 않는다. 필요하면 `credential_ref`만 넣는다.

## Phase별 작은 PR 계획

| Phase | PR 목표 | 왜 이 단위인가 |
| --- | --- | --- |
| 1 | GitOps worker 입력/출력 계약 정리 | event 흐름의 첫 단추를 고정한다. |
| 2 | Git polling observation -> GitChanged 변환 | polling 결과를 내부 표준 event로 바꾼다. |
| 3 | Manifest render DTO와 fake renderer | 실제 Git/Kustomize 없이 다음 담당자가 작업 가능하다. |
| 4 | Desired diff DTO와 diff detector | PR 제안 또는 command 판단 전에 변경 내용을 구조화한다. |
| 5 | Safe PR request 생성 | 안전한 diff를 바로 실행하지 않고 PR 제안으로 넘긴다. |
| 6 | Command policy rule 구조 | namespace/action 제한을 범용 rule로 검사한다. |
| 7 | Planner/Dispatcher/Queue 연결 | command를 Agent가 poll할 수 있는 상태로 만든다. |
| 8 | E2E worker chain test | subject/body 연결이 끊기지 않았는지 검증한다. |

## Phase 1. GitOps worker 입력/출력 계약 정리

목표:

```text
GitOps split workers가 어떤 event를 받고 어떤 event를 발행하는지 계약을 고정한다.
```

왜 해야 하는가:

- 이벤트 시스템을 모르는 팀원도 subject 이름과 body DTO만 보고 작업할 수 있다.
- subject/body가 흔들리면 Gateway, Dashboard, Audit, Command Worker가 모두 깨진다.
- 구현 전에 계약을 먼저 고정하면 테스트를 작게 쓸 수 있다.

구현할 것:

- `git.poll.tick`, `git.repo.observed`, `git.changed` 계약 후보 확인.
- `GitChangedBody`, `ManifestRenderedBody`, `DiffDetectedBody`, `SafePrRequestedBody` 확인 또는 보강.
- 각 body의 필수 필드 정리.
- `docs/events.md`에 입력/출력 흐름 표 추가.

생각할 것:

- repo, commit_sha, branch, target_id 같은 추적 필드가 있는가?
- polling 결과에 provider token이나 raw credential이 섞이지 않는가?
- 같은 commit을 여러 번 보더라도 중복 command가 생기지 않는가?

하지 말 것:

- subject 문자열을 서비스 코드에 직접 하드코딩하지 않는다.
- body dict를 아무 곳에서나 자유롭게 만들지 않는다.

테스트:

- body DTO `to_body()` 결과가 기대 field를 가진다.
- worker `@app.sub(...)` 구독 subject가 문서와 일치한다.

## Phase 2. Git polling observation -> GitChanged 변환

목표:

```text
Git Poller가 관찰한 repo 상태를 내부 GitChanged event로 변환한다.
```

왜 해야 하는가:

- GitHub/GitLab provider별 응답 형식을 내부 서비스 전체에 퍼뜨리면 확장이 어렵다.
- 내부 worker들은 `GitChangedBody`만 알면 된다.
- polling은 같은 commit을 반복해서 볼 수 있으므로 중복 방지가 핵심이다.

구현할 것:

- `GitRepoObserved` 입력 검증.
- repo_ref, branch, head_commit_sha 추출.
- 마지막으로 처리한 commit_sha와 비교.
- 새 commit이면 `git.changed` 발행.
- 같은 commit이면 아무 event도 발행하지 않음.

생각할 것:

- 처음에는 branch 최신 commit만 볼지, merge PR까지 볼지.
- branch filter가 필요한지.
- 첫 관찰 때 command를 만들지 baseline만 저장할지.

하지 말 것:

- provider raw response 전체를 다른 event에 그대로 복사하지 않는다.
- provider token을 event에 넣지 않는다.

테스트:

- 새 commit 관찰 -> `git.changed` 발행.
- 같은 commit 재관찰 -> event 없음.
- 필수 field 누락 -> 실패.

## Phase 3. Manifest render DTO와 fake renderer

목표:

```text
Git 변경을 Kubernetes manifest 형태로 렌더링한 결과를 event로 만든다.
```

왜 해야 하는가:

- 실제 Kustomize/Helm/Git checkout 없이도 command 흐름을 먼저 연결할 수 있다.
- renderer를 interface로 두면 fake -> real renderer 교체가 쉽다.
- manifest render 결과는 diff의 입력이므로 구조가 명확해야 한다.

구현할 것:

- `ManifestRenderer` Protocol.
- `FakeManifestRenderer`.
- `RenderedManifest` DTO.
- `manifest.rendered` 발행.

생각할 것:

- manifest가 너무 크면 event payload에 다 넣을지, DB/ref로 뺄지.
- apiVersion/kind/namespace/name은 diff에 필요한 최소 키다.
- render 실패는 retry 가능한가? Git/network 문제면 가능하다.

하지 말 것:

- render 단계에서 Kubernetes cluster에 apply하지 않는다.
- manifest 문자열을 ad-hoc parsing하지 않는다. 가능하면 structured object로 둔다.

테스트:

- fake renderer 결과가 `manifest.rendered` payload로 변환된다.
- render 실패 시 handler 예외가 runtime retry로 이어질 수 있다.

## Phase 4. Desired diff DTO와 diff detector

목표:

```text
현재 원하는 상태와 이전 상태의 차이를 구조화한다.
```

왜 해야 하는가:

- Safe PR 제안과 command 판단은 diff를 근거로 만들어져야 한다.
- diff가 구조화되어야 policy가 어떤 namespace/resource인지 검사할 수 있다.
- RCA/Safe PR도 diff를 근거로 설명할 수 있다.

구현할 것:

- `DiffDetector` Protocol.
- fake diff detector.
- diff item schema: kind, namespace, name, action, before, after.
- `desired.diff.detected` 발행.

생각할 것:

- create/update/delete 중 어떤 변경을 Safe PR 또는 command 후보로 볼 것인가.
- namespace가 없는 cluster-scoped resource는 어떻게 제한할 것인가.
- diff가 없으면 command를 만들지 말아야 하는가? 맞다.

하지 말 것:

- diff가 비어도 후속 요청을 발행하지 않는다.
- production namespace 변경을 통과시키지 않는다.

테스트:

- diff 있음 -> `desired.diff.detected`.
- diff 없음 -> `safe_pr.requested` 또는 command 요청 없음.
- namespace/action 필드 포함.

## Phase 5. Safe PR request 생성

목표:

```text
안전한 diff를 repo-gateway-worker가 이해할 수 있는 safe_pr.requested event로 변환한다.
```

왜 해야 하는가:

- GitOps split workers는 target command를 직접 queue에 넣지 않는다.
- diff가 안전하더라도 바로 실행하지 않고, 사람이 확인 가능한 PR 제안으로 남긴다.
- command 실행은 Gateway 승인 또는 별도 command 요청을 통해 Command Worker가 담당한다.

구현할 것:

- safe PR requested body DTO (`SafePrRequestedBody`).
- PR 제목과 본문 결정.
- provider 결정.
- `safe_pr.requested` 발행.

생각할 것:

- 어떤 diff를 안전하다고 볼 것인가.
- PR 본문에 사람이 이해할 수 있는 before/after가 들어가는가.
- PR 생성에 필요한 credential은 body가 아니라 token_ref/provider 경계로 처리되는가.

하지 말 것:

- Agent command queue에 직접 저장하지 않는다.
- Target Agent를 직접 호출하지 않는다.
- `safe_pr.requested` body에 secret을 넣지 않는다.

테스트:

- 안전한 diff -> `safe_pr.requested` 발행.
- 위험한 diff -> `diff.analyzed`만 발행.
- PR payload에 secret 없음.

## Phase 6. Command policy rule 구조

목표:

```text
Command Worker가 command.requested를 받아 범용 policy rule로 허용/거부를 결정한다.
```

왜 해야 하는가:

- 처음 정책은 sandbox namespace 하나지만 앞으로 action, cluster, requester, environment 조건이 늘어난다.
- 정책을 if문으로 흩뿌리면 새 조건을 추가할 때 핵심 workflow를 계속 수정하게 된다.
- 실패 reason을 명확히 남겨야 dashboard/audit에서 설명할 수 있다.

구현할 것:

- `Lookup` wrapper.
- `Rule` Protocol.
- `EqualsRule` 같은 기본 rule.
- `Policy.evaluate(lookup)`.
- 실패 시 `command.rejected` 발행.

생각할 것:

- 첫 실패만 반환할지, 모든 실패를 모을지. 현재는 첫 실패가 단순하다.
- default 값을 rule config에 둘지, lookup wrapper에 둘지.
- policy 실패는 retry 대상이 아니다. 정상 거절 event로 끝난다.

하지 말 것:

- policy 실패를 exception으로 던져 DLQ로 보내지 않는다.
- namespace 비교를 workflow 본문에 계속 추가하지 않는다.

테스트:

- sandbox namespace 허용.
- non-sandbox namespace 거부.
- 거부 payload에 reason과 requested 포함.

## Phase 7. Planner/Dispatcher/Queue 연결

목표:

```text
허용된 command를 실행 plan으로 만들고 agent command queue에 저장한다.
```

왜 해야 하는가:

- plan은 command_id, cluster_id, action, namespace, steps를 가진 실행 계획이다.
- dispatcher는 이벤트로 상태를 알리고, queue에 저장해 Agent가 poll할 수 있게 한다.
- Agent 호출은 이 단계에서 하지 않는다.

구현할 것:

- `Planner` Protocol.
- `Plan` DTO.
- `Dispatcher`.
- `command.dispatch.ready` 발행.
- `command.dispatched` 발행.
- `queue_agent_command`.
- `command.queued_for_agent` 발행.

생각할 것:

- plan.data가 Agent가 실행하기 충분한가?
- queue 저장 실패 시 앞선 event와 불일치가 생길 수 있다. outbox는 플랫폼 담당과 논의한다.
- command_id는 어디서 생성하고 추적하는가?

하지 말 것:

- Dispatcher에서 Kubernetes API를 호출하지 않는다.
- DB queue 저장 없이 queued event만 발행하지 않는다.

테스트:

- policy 통과 -> ready/dispatched/queued event 순서.
- queue_agent_command 호출 검증.
- correlation_id 유지.

## Phase 8. E2E worker chain test

목표:

```text
polling으로 감지한 git.changed에서 command queued까지 fake bus/fake db로 한 줄 흐름을 검증한다.
```

왜 해야 하는가:

- 각 worker 단위 테스트가 통과해도 subject/payload 이름이 어긋나면 전체 흐름은 끊긴다.
- 팀원들이 이벤트 시스템을 몰라도 회귀를 잡을 수 있다.
- demo 전에 가장 싼 안전장치다.

구현할 것:

- fake EventClient.
- fake command queue.
- git.repo.observed 또는 git.changed input fixture.
- expected subjects list.

테스트:

- `git.changed`.
- `manifest.rendered`.
- `desired.diff.detected`.
- `command.requested`.
- `command.dispatch.ready`.
- `command.dispatched`.
- `command.queued_for_agent`.

## PR 체크리스트

- 새 event subject가 `packages/contracts/event_bus/subjects.py`와 `docs/events.md`에 있음
- 새/변경 event body가 `packages/contracts/event_bus/bodies/`에 있음
- manifest/diff/command 흐름 테스트 존재
- handler가 `@app.sub` body DTO 흐름을 유지함
- raw NATS 사용 없음
- command payload 변경 시 Gateway/Auth와 Target/Telemetry에 공유
- audit/dashboard 영향이 있으면 문서화
- policy 실패는 DLQ가 아니라 command.rejected로 끝나는지 확인

## Git polling이 기본 입력인 이유

이 프로젝트의 GitOps 입력은 webhook이 아니라 polling이다.

```text
Scheduler 또는 수동 poll 요청
  -> git.poll.tick
  -> Git provider adapter가 repo 최신 상태 조회
  -> git.repo.observed
  -> 이전 observed state와 비교
  -> 새 commit 또는 merge 발견
  -> git.changed
```

중요한 설계 원칙:

```text
외부 Git provider가 먼저 알려주는 구조가 아니다.
우리 시스템이 주기적으로 물어보고 차이를 발견한다.
그 뒤 내부 흐름은 git.changed부터 시작한다.
```

## Git polling 기본 사이클

가장 작은 사이클:

```text
1. repo target 등록
2. polling interval 등록
3. poller가 주기적으로 repo default branch 최신 commit 조회
4. 마지막으로 본 commit_sha와 비교
5. 달라졌으면 git.changed 발행
6. 현재 observed state 저장
7. GitOps split workers가 manifest.rendered -> desired.diff.detected -> command.requested 진행
```

PR merge까지 보고 싶을 때:

```text
1. repo pull requests 또는 branch 상태 조회
2. merged_at이 새로 생긴 PR 찾기
3. merge_commit_sha 확인
4. 이미 처리한 merge_commit_sha인지 확인
5. 처음 보는 merge면 git.changed 발행
```

처음 MVP에서는 commit polling만 한다.

```text
default branch 최신 commit_sha 비교
```

그 다음 PR merge polling을 추가한다.

```text
merged PR 목록 또는 branch protection/check 상태 확인
```

## polling에서 반드시 저장해야 하는 상태

Polling은 이전 상태와 비교해야 하므로 DB 상태가 필요하다.

최소 테이블 후보:

```text
git_watch_targets
  id
  project_id
  target_id
  provider
  repo_ref
  branch
  enabled
  interval_seconds
  last_seen_commit_sha
  last_seen_merge_sha
  last_polled_at
  created_at
  updated_at

git_observations
  id
  watch_target_id
  observed_commit_sha
  observed_branch
  observed_at
  provider_payload_ref 또는 summary
  changed
```

MVP에서는 `git_watch_targets`만 있어도 된다.

주의:

- provider token은 이 테이블에 넣지 않는다.
- repo 접근 credential은 target/credential binding으로 찾는다.
- event payload에는 token을 넣지 않고 `target_id`, `repo_ref`, `commit_sha`만 넣는다.

## polling event 계약 후보

나중에 `packages/contracts/event_bus/subjects.py`, `packages/contracts/event_bus/bodies/`, `docs/events.md`에 반영한다.

```text
git.poll.tick
  "이 repo target을 지금 확인해라"

git.repo.observed
  "repo를 조회했더니 현재 상태가 이렇다"

git.changed
  "이전 상태와 비교했을 때 처리해야 할 새 commit/merge가 있다"
```

`git.poll.tick` payload 후보:

```json
{
  "project_id": "project_final",
  "target_id": "target_github_final",
  "repo_ref": "Jungle-303-04/final",
  "branch": "dev",
  "reason": "interval"
}
```

`git.repo.observed` payload 후보:

```json
{
  "project_id": "project_final",
  "target_id": "target_github_final",
  "repo_ref": "Jungle-303-04/final",
  "branch": "dev",
  "head_commit_sha": "abc123",
  "observed_at": "2026-06-27T13:00:00Z"
}
```

`git.changed` payload 후보:

```json
{
  "project_id": "project_final",
  "target_id": "target_github_final",
  "repo_ref": "Jungle-303-04/final",
  "branch": "dev",
  "commit_sha": "abc123",
  "change_type": "commit",
  "detected_by": "polling"
}
```

Polling으로 만든 `git.changed`가 downstream의 유일한 표준 입력이다.

## polling 담당 코드 후보

현재 작업 브랜치에서는 기존 단일 GitOps 폴더 대신 split worker 구조를 사용한다.

```text
services/gitops/git-pull-worker
  repo target을 확인하고 git.changed를 발행

services/gitops/manifest-render-worker
  git.changed를 받아 manifest.rendered 발행

services/gitops/diff-worker
  manifest.rendered를 받아 desired.diff.detected 발행

services/gitops/diff-analyze-worker
  desired.diff.detected를 받아 diff.analyzed 발행
  안전하면 safe_pr.requested 발행

services/gitops/repo-gateway-worker
  safe_pr.requested를 받아 guarded repo write 또는 fake PR event 발행
```

하지만 handler 책임은 분리한다.

```text
Poller
  repo 상태 관찰

GitOps Sync
  관찰 결과를 manifest/diff/command/PR request로 처리
```

## polling 테스트 목록

```text
tests/test_git_polling.py
  - first observation stores commit but does not create command by default
  - new commit emits git.changed
  - same commit emits no duplicate git.changed
  - merge commit emits git.changed with change_type=merge
  - provider failure raises retryable error
  - forbidden credential does not read provider API
```

처음 구현에서는 아래 3개만 먼저 한다.

```text
1. same commit -> no event
2. new commit -> git.changed
3. provider error -> runtime retry
```

## 처음 읽을 파일

1. `docs/events.md`
2. `packages/contracts/event_bus/subjects.py`
3. `packages/contracts/event_bus/bodies/`
4. `packages/runtime/app.py`
5. `packages/runtime/worker.py`
6. `services/gitops`
7. `services/command-worker`

## Codex 지시문

이 영역을 작업할 때는 `docs/events.md`, `packages/runtime/worker.py`, `packages/runtime/service.py`, `services/gitops`, `services/command-worker`를 먼저 읽어라. handler는 작게 유지하고 event contract를 깨지 마라.
