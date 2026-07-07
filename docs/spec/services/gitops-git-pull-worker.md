---
source_commit: 1616d295
status: synced
---

# git-pull-worker — 깃 webhook 정규화·중복 커밋 필터, GitOps 파이프라인 입구

> 소스: `src/services/gitops/git-pull-worker/` (`app.py` 단일 모듈) · 테스트: `tests/test_git_pull_worker.py`

## 책임 (Responsibility)

- `git.webhook.received`를 구독해 (1) commit 식별자를 보정하고 (2) gitops 식별자 체인(repository → watch_target → binding → application → workflow_run)을 결정적으로 파생하고 (3) 마지막으로 본 commit과 같으면 중복을 걸러낸 뒤 `git.changed`를 발행한다.
- 모듈 docstring 명시: 원본 `GitOpsSyncWorkflow.handle()`의 commit_sha 결정·GIT_CHANGED 발행 블록에 대응하며, 변경 감지 책임만 분리한 것이다. manifest 생성은 다음 단계 [manifest-render-worker](gitops-manifest-render-worker.md) 책임.
- 하지 않는 것: GitHub 폴링(→ [github-poll-worker](gitops-github-poll-worker.md)), webhook HTTP 수신(→ [api-gateway](gateway-api-gateway.md)의 `/github/webhook`), 렌더/비교/명령.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.gitops` | [../../domains/gitops.md](../domains/gitops.md) | events(`GitChangedBody`, `GitWebhookReceivedBody`), repository(`derive_application_id`, `derive_deployment_binding_id`, `derive_repository_id`, `derive_watch_target_id`, `derive_workflow_run_id`) |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `EventBody`, `JsonObject` |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext` |
| DB (ctx.db) | `RepoChangeRepository.get_watch_last_seen_commit_sha` | [../../domains/gitops.md](../domains/gitops.md) | watch target의 마지막 관측 commit 조회(중복 필터) |
| 구독 | `git.webhook.received` | [../gateway/api-gateway.md](gateway-api-gateway.md) | 입력 이벤트(게이트웨이 webhook 입구가 발행) |
| 발행 | `git.changed` | [./manifest-render-worker.md](gitops-manifest-render-worker.md) | 출력 이벤트 |

## 공개 인터페이스 (Public API)

| 심볼 | 값/시그니처 | 앵커 |
|---|---|---|
| `app` | `App("git-pull-worker")` | `src/services/gitops/git-pull-worker/app.py :: app` |

```python
def normalize_gitops_identity(payload: JsonObject) -> JsonObject
```
`src/services/gitops/git-pull-worker/app.py :: normalize_gitops_identity`

```python
@app.on(GitWebhookReceivedBody)
async def on_git_webhook(
    evt: GitWebhookReceivedBody, ctx: EventContext
) -> AsyncIterator[EventBody]
```
`src/services/gitops/git-pull-worker/app.py :: on_git_webhook`

진입점: `if __name__ == "__main__": app.run()`.

## 데이터 모델 (Data Model)

자체 테이블 없음. `ctx.db.get_watch_last_seen_commit_sha(watch_target_id, workspace_id)`로 gitops 도메인 `GitWatchTarget.last_seen_commit_sha`를 읽기만 한다(쓰기는 다른 워커의 `mark_watch_observed` 책임 — 이 워커는 갱신하지 않는다).

## 이벤트 (Events)

라우팅 키(subject) = 이벤트명 문자열(stream `SERVICE_EVENTS`).

### 구독 (Consumes)

**`git.webhook.received`** (`EventSubject.GIT_WEBHOOK_RECEIVED`) — body `src/domains/gitops/events.py :: GitWebhookReceivedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| commit_sha | str | (필수) — 빈 문자열 허용(아래 보정) |
| image | str | (필수) |
| replicas | int | (필수) |
| workspace_id | str | `DEFAULT_WORKSPACE_ID`(`"default"`) |
| repository_id | str | `""` |
| repo_ref | str | `""` |
| branch | str | `"main"` |
| watch_target_id | str | `""` |
| binding_id | str | `""` |
| application_id | str | `""` |
| workflow_run_id | str | `""` |
| environment | str | `"sandbox"` |
| cluster_id | str | `Target.DEFAULT_CLUSTER_ID`(`"default-target-cluster"`) |
| manifest_path | str | `"deploy.yaml"` |
| source_type | str | `""` |
| force | bool | `False` — True면 중복 필터 무시 |

### 발행 (Publishes)

**`git.changed`** (`EventSubject.GIT_CHANGED`) — body `src/domains/gitops/events.py :: GitChangedBody` — 중복이 아닐 때만 발행.

| 필드 | 타입 | 값 |
|---|---|---|
| commit_sha | str | `evt.commit_sha` 또는 보정된 랜덤 8자 |
| image | str | `evt.image` |
| replicas | int | `evt.replicas` |
| workspace_id | str | `identity["workspace_id"]` |
| repository_id | str | 파생된 `repository_id` |
| repo_ref | str | `evt.repo_ref` |
| branch | str | `evt.branch` |
| watch_target_id | str | 파생된 `watch_target_id` |
| binding_id | str | 파생된 `binding_id` |
| application_id | str | 파생된 `application_id` |
| workflow_run_id | str | 파생된 `workflow_run_id` |
| environment | str | `evt.environment` |
| cluster_id | str | `evt.cluster_id` |
| manifest_path | str | `evt.manifest_path` |
| source_type | str | `evt.source_type` |

`GitChangedBody`에는 `force` 필드가 없다(필터 통과 후 소멸). `source_type`은 레포 연결 시 선택된 manifest renderer를 downstream render-worker까지 보존하기 위해 그대로 전달한다.

## 동작 (Behavior)

### 핸들러 `on_git_webhook`

1. **commit 보정**: `commit_sha = evt.commit_sha or str(uuid.uuid4())[:8]` — webhook에 commit이 없으면 랜덤 8자로 생성. (코드 주석: webhook은 계약 객체로 정규화되어 들어오므로 commit 식별자만 보정.)
2. **식별자 파생**: `identity = normalize_gitops_identity(evt.to_body())` (아래).
3. **중복 조회**: `last_seen = await ctx.db.get_watch_last_seen_commit_sha(str(identity["watch_target_id"]), str(identity["workspace_id"]))`.
4. **필터**: `last_seen == commit_sha and not evt.force` → 아무 이벤트도 발행하지 않고 `return`.
5. 아니면 위 표대로 `GitChangedBody`를 `yield`.

### `normalize_gitops_identity` (파생 순서 — 각 단계가 앞 단계 결과를 payload에 합쳐 전달)

1. `repository_id = derive_repository_id(payload)` — 명시값이 기본값과 다르면 그대로, 아니면 `repo-<sha256(workspace_id|repo_ref)[:32]>`.
2. `watch_target_id = derive_watch_target_id({**payload, "repository_id": ...})` — `watch-<sha256(workspace_id|repository_id|branch|manifest_path)[:32]>`.
3. `binding_id = derive_deployment_binding_id({**payload, repository_id, watch_target_id})` — `binding-<sha256(workspace_id|repository_id|cluster_id|namespace|app_name)[:32]>` (webhook payload에 `namespace`/`app_name` 키가 없으면 derive 함수 기본값 `"sandbox"`/`DEFAULT_APPLICATION_ID` 사용).
4. `application_id = derive_application_id(scoped)` — 이름은 `derive_application_name`(payload의 `name`/`app_name` → `resource`의 `/` 뒷부분 → `repo_ref`의 마지막 세그먼트 순), `app-<sha256(workspace_id|repository_id|manifest_path|name)[:32]>`.
5. `workflow_run_id = derive_workflow_run_id({**scoped, "application_id": ...})` — `workflow-<sha256(workspace_id|application_id|binding_id|environment|commit_sha)[:32]>`.
6. 반환: 원 payload + `repository_id, watch_target_id, binding_id, application_id, workflow_run_id`.

각 derive 함수 앵커: `src/domains/gitops/repository.py :: derive_repository_id / derive_watch_target_id / derive_deployment_binding_id / derive_application_id / derive_workflow_run_id`. 모두 명시값이 존재하고 기본값(`""`)과 다르면 파생 대신 명시값을 그대로 쓴다.

## 불변식·오류 (Invariants & Errors)

- 같은 `(watch_target_id, workspace_id)`에서 `last_seen_commit_sha`와 동일한 commit은 `force=True`가 아닌 한 절대 `git.changed`로 나가지 않는다(중복 억제). 최종 dedup은 downstream ledger가 보장한다는 것이 설계 전제(github-poll-worker docstring 참조).
- 식별자 파생은 순수 해시 기반으로 결정적이다 — 같은 입력이면 항상 같은 ID(멱등 재처리 안전).
- **주의**: `normalize_gitops_identity`에 전달되는 payload는 `evt.to_body()`이므로 `workflow_run_id` 파생에 쓰이는 `commit_sha`는 **보정 전 원본 값**이다. `evt.commit_sha`가 비어 있으면 payload의 `commit_sha=""`로 workflow_run_id가 파생되고, 발행되는 `GitChangedBody.commit_sha`는 랜덤 8자다(둘이 불일치할 수 있음 — 코드 사실 그대로).
- `evt.commit_sha`가 비어 랜덤 sha가 생성된 경우 `last_seen`과 일치할 수 없어 필터는 사실상 항상 통과한다.
- 이 워커는 `last_seen_commit_sha`를 갱신하지 않는다 — 조회 전용.
- 핸들러는 예외를 잡지 않는다 — DB 실패 등은 런타임 재시도/DLQ 정책에 위임.

## 설정 (Settings)

없음 (환경변수를 직접 읽지 않는다).
