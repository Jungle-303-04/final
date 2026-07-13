---
source_commit: 664925a6
status: synced
---

# workflow-controller — GitOps 이벤트 흐름을 Application / WorkflowRun / WorkflowRunStep / Approval 실행 객체로 투영하는 상태 머신 워커

> 소스: `src/services/gitops/workflow-controller/app.py`

## 책임 (Responsibility)

- 기존 git-pull → render → diff → command 워커 체인이 발행하는 이벤트 12종을 **관찰**해, 그 흐름을 콘솔이 읽을 수 있는 사용자 실행 객체(Application, WorkflowRun, WorkflowRunStep, Approval)로 기록한다. (추가로 자기 발행 `workflow.run.completed`와 target 도메인의 `cluster.desired_state.changed`를 구독 — 아래 승격/글로벌 룰.)
- 워크플로 상태 전이에 대응하는 `workflow.*` / `approval.*` 이벤트를 발행한다.
- 승인 승인(`approval.granted`) 시 details에 실린 `command_requested` payload를 `command.requested`로 재발행해 적용 체인을 재개한다.
- **승격 파이프라인**: 바인딩 `deploy_policy`의 `{"promotes_to_binding_id": ...}` 룰 — run 성공 종결(`workflow.run.completed`) 시 같은 commit으로 대상 바인딩의 표준 파이프라인을 `git.webhook.received` 재발행으로 연다.
- **글로벌 서비스**: 바인딩 `deploy_policy`의 `{"global": true}` 룰 — (a) 웹훅을 같은 repo의 global 바인딩들로 fan-out, (b) 신규 클러스터 등록(`cluster.desired_state.changed`, reason=`"target registered"`) 시 글로벌 그룹 바인딩을 자동 생성하고 템플릿 바인딩의 최근 성공 run으로 초기 배포를 연다.
- 하지 않는 것: manifest 렌더, diff 계산, PR 생성, 클러스터 명령 실행 — 기존 워커 체인은 그대로 유지되고 이 워커는 같은 이벤트를 병렬 구독한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.command.events` | [command 도메인](../domains/command.md) | `CommandCompletedBody`, `CommandQueuedForAgentBody`, `CommandRejectedBody`, `CommandRequestedBody` |
| import | `domains.gitops.events` | [gitops 도메인](../domains/gitops.md) | 구독/발행 이벤트 body 전부 (아래 표) |
| import | `domains.gitops.repository` | [gitops 도메인](../domains/gitops.md) | `derive_application_id`, `derive_approval_id`, `derive_deployment_binding_id`, `derive_repository_id`, `derive_watch_target_id`, `derive_workflow_run_id` |
| import | `domains.scm.events` | [scm 도메인](../domains/scm.md) | `SafePrCreatedBody`, `SafePrFailedBody` |
| import | `domains.target.events` | [target 도메인](../domains/target.md) | `ClusterDesiredStateChangedBody` — 신규 클러스터 등록 감지(글로벌 바인딩 자동 attach) |
| import | `packages.config.constants` | [config 패키지](../packages/config.md) | `CommandStatus`, `Sandbox`, `Target` |
| import | `packages.config.logs` | [config 패키지](../packages/config.md) | `get_logger` — 승격/fan-out 관찰 로그 |
| import | `packages.contracts.event_bus` | [contracts 패키지](../packages/contracts.md) | `EventBody`, `JsonObject` |
| import | `packages.contracts.gitops` | [contracts 패키지](../packages/contracts.md) | `DEFAULT_ENVIRONMENT`, `ApprovalStatus`, `WorkflowRunStatus`, `WorkflowStepName`, `WorkflowStepStatus` |
| import | `packages.contracts.identity` | [contracts 패키지](../packages/contracts.md) | `DEFAULT_WORKSPACE_ID`, `ResourceRole` |
| import | `packages.contracts.stores` | [contracts 패키지](../packages/contracts.md) | `WorkflowStore` (ctx.db 능력) |
| import | `packages.runtime.app` | [runtime 패키지](../packages/runtime.md) | `App`, `EventContext` |
| 구독 | gitops/scm/command 이벤트 12종 + `workflow.run.completed`(자기 발행 재구독) + `cluster.desired_state.changed` | [manifest-render-worker](gitops-manifest-render-worker.md), [scm-worker](gitops-scm-worker.md) 등 발행 | 입력 |
| 발행 | `workflow.*`, `approval.requested`, `command.requested`, (조건부) `git.webhook.received` | 콘솔/게이트웨이·command 계열·[git-pull-worker](gitops-git-pull-worker.md) 소비 | 출력 |

## 공개 인터페이스 (Public API)

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `app` | `App("workflow-controller")` | `src/services/gitops/workflow-controller/app.py :: app` |
| `LOGGER` | `get_logger(__name__)` | `src/services/gitops/workflow-controller/app.py :: LOGGER` |
| `MANUAL_APPROVAL_ROLE` | `ResourceRole.RELEASE_OPERATOR.value` = `"release_operator"` | `src/services/gitops/workflow-controller/app.py :: MANUAL_APPROVAL_ROLE` |
| `POLICY_DECISION_REF_PREFIX` | `"policy-decision"` | `src/services/gitops/workflow-controller/app.py :: POLICY_DECISION_REF_PREFIX` |
| `POLICY_ROUTE_SAFE_PR` | `"safe_pr"` | `src/services/gitops/workflow-controller/app.py :: POLICY_ROUTE_SAFE_PR` |
| `normalize_payload` | `def normalize_payload(payload: JsonObject) -> JsonObject` | `src/services/gitops/workflow-controller/app.py :: normalize_payload` |
| `application_name_hint` | `def application_name_hint(payload: JsonObject) -> str` | `src/services/gitops/workflow-controller/app.py :: application_name_hint` |
| `gitops_payload` | `def gitops_payload(evt: EventBody, app_name: str \| None = None) -> JsonObject` | `src/services/gitops/workflow-controller/app.py :: gitops_payload` |
| `diff_payload` | `def diff_payload(evt: DesiredDesiredDiffDetectedBody \| DiffAnalyzedBody) -> JsonObject` | `src/services/gitops/workflow-controller/app.py :: diff_payload` |
| `rendered_application_name` | `def rendered_application_name(evt: ManifestRenderedBody) -> str \| None` — kind가 `Deployment`일 때만 `metadata.name` | `src/services/gitops/workflow-controller/app.py :: rendered_application_name` |
| `ensure_run` | `async def ensure_run(ctx: EventContext[WorkflowStore], payload: JsonObject, status: str, current_step: str, summary: str, metadata: JsonObject \| None = None) -> JsonObject` | `src/services/gitops/workflow-controller/app.py :: ensure_run` |
| `transition_run` | `async def transition_run(ctx: EventContext[WorkflowStore], payload: JsonObject, status: str, current_step: str, summary: str, metadata: JsonObject \| None = None) -> JsonObject` | `src/services/gitops/workflow-controller/app.py :: transition_run` |
| `record_step` | `async def record_step(ctx: EventContext[WorkflowStore], payload: JsonObject, step: str, status: str, message: str \| None = None, details: JsonObject \| None = None) -> WorkflowStepRecordedBody` | `src/services/gitops/workflow-controller/app.py :: record_step` |
| `approval_payload` | `def approval_payload(payload: JsonObject, reason: str, status: str) -> JsonObject` | `src/services/gitops/workflow-controller/app.py :: approval_payload` |
| `policy_decision_ref` | `def policy_decision_ref(approval_id: str, route: str) -> str` — `f"policy-decision:{approval_id}:{route}"` | `src/services/gitops/workflow-controller/app.py :: policy_decision_ref` |
| `command_result_succeeded` | `def command_result_succeeded(result: JsonObject) -> bool` | `src/services/gitops/workflow-controller/app.py :: command_result_succeeded` |
| `rollout_result_details` | `def rollout_result_details(command_id: str, result: JsonObject) -> JsonObject` | `src/services/gitops/workflow-controller/app.py :: rollout_result_details` |
| `workflow_created_fields` | `def workflow_created_fields(payload: JsonObject) -> JsonObject` | `src/services/gitops/workflow-controller/app.py :: workflow_created_fields` |
| `PROMOTES_TO_KEY` | `"promotes_to_binding_id"` — deploy_policy 승격 룰 키 | `src/services/gitops/workflow-controller/app.py :: PROMOTES_TO_KEY` |
| `GLOBAL_BINDING_KEY` | `"global"` — deploy_policy 글로벌 룰 키 | `src/services/gitops/workflow-controller/app.py :: GLOBAL_BINDING_KEY` |
| `DEFAULT_PROMOTION_REPLICAS` | `2` — diff 상세에 replicas가 없을 때 fallback | `src/services/gitops/workflow-controller/app.py :: DEFAULT_PROMOTION_REPLICAS` |
| `CLUSTER_REGISTERED_REASON` | `"target registered"` — 반응 대상 `cluster.desired_state.changed` reason | `src/services/gitops/workflow-controller/app.py :: CLUSTER_REGISTERED_REASON` |
| `binding_policy` | `def binding_policy(binding: JsonObject) -> JsonObject` — `binding["deploy_policy"]`를 dict로 (없으면 `{}`) | `src/services/gitops/workflow-controller/app.py :: binding_policy` |
| `binding_source_type` | `def binding_source_type(binding: JsonObject) -> str` — binding deploy_policy의 `manifest_source` 또는 `source_type`을 문자열로 반환 | `src/services/gitops/workflow-controller/app.py :: binding_source_type` |
| `promoted_image_and_replicas` | `async def promoted_image_and_replicas(ctx: EventContext[WorkflowStore], workflow_run_id: str) -> tuple[str, int]` — 소스 run의 `diff` 스텝 details에서 `desired_image`·`basis.replicas`(파싱 실패·부재 시 2)를 읽음(합성 금지) | `src/services/gitops/workflow-controller/app.py :: promoted_image_and_replicas` |
| `entry_webhook_for_binding` | `def entry_webhook_for_binding(*, workspace_id, application_id, binding, commit_sha, image, replicas, repo_ref, branch) -> GitWebhookReceivedBody` — 대상 바인딩으로 표준 파이프라인을 재진입시키는 입구 이벤트 생성 | `src/services/gitops/workflow-controller/app.py :: entry_webhook_for_binding` |
| `run_exists_for` | `async def run_exists_for(ctx, *, workspace_id, application_id, binding, commit_sha) -> bool` — `derive_workflow_run_id`로 결정적 run_id를 파생해 `get_workflow_run` 존재 확인 | `src/services/gitops/workflow-controller/app.py :: run_exists_for` |
| `fanout_global_bindings` | `async def fanout_global_bindings(evt: GitWebhookReceivedBody, ctx) -> AsyncIterator[EventBody]` — `on_git_webhook`이 호출하는 글로벌 fan-out 생성기 | `src/services/gitops/workflow-controller/app.py :: fanout_global_bindings` |

이벤트 핸들러 (모두 `@app.on(...)`, `async def ...(evt, ctx: EventContext[WorkflowStore]) -> AsyncIterator[EventBody]`):

| 핸들러 | 구독 body | 앵커 |
|---|---|---|
| `on_git_webhook` | `GitWebhookReceivedBody` | `src/services/gitops/workflow-controller/app.py :: on_git_webhook` |
| `on_git_changed` | `GitChangedBody` | `src/services/gitops/workflow-controller/app.py :: on_git_changed` |
| `on_manifest_rendered` | `ManifestRenderedBody` | `src/services/gitops/workflow-controller/app.py :: on_manifest_rendered` |
| `on_manifest_invalid` | `ManifestInvalidBody` | `src/services/gitops/workflow-controller/app.py :: on_manifest_invalid` |
| `on_diff_detected` | `DesiredDesiredDiffDetectedBody` | `src/services/gitops/workflow-controller/app.py :: on_diff_detected` |
| `on_diff_analyzed` | `DiffAnalyzedBody` | `src/services/gitops/workflow-controller/app.py :: on_diff_analyzed` |
| `on_safe_pr_created` | `SafePrCreatedBody` | `src/services/gitops/workflow-controller/app.py :: on_safe_pr_created` |
| `on_safe_pr_failed` | `SafePrFailedBody` | `src/services/gitops/workflow-controller/app.py :: on_safe_pr_failed` |
| `on_approval_granted` | `ApprovalGrantedBody` | `src/services/gitops/workflow-controller/app.py :: on_approval_granted` |
| `on_approval_rejected` | `ApprovalRejectedBody` | `src/services/gitops/workflow-controller/app.py :: on_approval_rejected` |
| `on_command_queued` | `CommandQueuedForAgentBody` | `src/services/gitops/workflow-controller/app.py :: on_command_queued` |
| `on_command_rejected` | `CommandRejectedBody` | `src/services/gitops/workflow-controller/app.py :: on_command_rejected` |
| `on_command_completed` | `CommandCompletedBody` | `src/services/gitops/workflow-controller/app.py :: on_command_completed` |
| `on_run_completed_promote` | `WorkflowRunCompletedBody` (자기 발행 재구독 — 승격 룰) | `src/services/gitops/workflow-controller/app.py :: on_run_completed_promote` |
| `on_cluster_registered_attach_globals` | `ClusterDesiredStateChangedBody` (글로벌 바인딩 자동 attach) | `src/services/gitops/workflow-controller/app.py :: on_cluster_registered_attach_globals` |

### 헬퍼 의미

- `normalize_payload`: `derive_repository_id` → `derive_watch_target_id` → `derive_deployment_binding_id` → `derive_application_id` → `derive_workflow_run_id` 순으로 파생 식별자를 채우고, `workspace_id`(기본 `"default"`), `environment`(기본 `"sandbox"`), `cluster_id`(기본 `"default-target-cluster"`)를 문자열로 보정한다.
- `application_name_hint`: `name`/`app_name` → `resource`(`kind/name`의 name 부분) → `repo_ref`(마지막 `/` 뒤) 순으로 앱 이름 후보 추출.
- `ensure_run`: `upsert_application`(이름 없으면 `application_id`로 대체, metadata에 `repository_id`/`manifest_path`) 후, 반환된 canonical `application_id`가 파생값과 다르면(**동명 앱 dedup 병합**) `workflow_run_id`를 canonical 기준으로 재파생한다. 이어 `start_workflow_run`(status/current_step/summary/metadata 포함) 호출.
- `transition_run`: `update_workflow_run`만 호출(Application upsert 없음).
- `record_step`: `record_workflow_step` 저장 후 `WorkflowStepRecordedBody`를 반환 — 핸들러가 이를 yield하면 `workflow.step.recorded`가 발행된다.
- `approval_payload`: run 정규화 후 `approval_id = derive_approval_id(workflow_run_id)`와 `status`, `reason`, `requested_role="release_operator"`를 담은 payload 생성.
- `command_result_succeeded(result)`: `packages.contracts.gitops.promotion_gate_from_command_result`의 `eligible`을 소비한다. 단일 계약은 `result.status != "completed"` 또는 `applied is False`, 실패 resource 존재, `rollout.ready is False` 중 하나라도 참이면 False다. API의 `promotion_gate`도 같은 함수를 사용하므로 worker와 노출 조건을 따로 복제하지 않는다.
- `rollout_result_details`: `{"command_id", "result", "resources", "failed_resources", "rollout"}` 구성 (`resources`는 리스트가 아니면 `[]`, `rollout`은 Mapping이 아니면 `{}`).
- `workflow_created_fields`: `WorkflowCreatedBody` 생성용 필드 딕셔너리(workspace/application/workflow_run/repository/watch_target/binding/environment/cluster/commit_sha/manifest_path).

## 데이터 모델 (Data Model)

`ctx.db`는 `WorkflowStore`(`src/packages/contracts/stores.py :: WorkflowStore`). 사용 메서드:
`upsert_application`, `start_workflow_run`, `update_workflow_run`, `record_workflow_step`, `resolve_workflow_approval`, `attach_workflow_command`, `update_workflow_run_for_command`, `get_workflow_identity_for_command`.
승격/글로벌 경로는 Protocol 밖의 리포지토리 조회 메서드를 추가로 사용한다(실 구현 `RepoChangeRepository`가 제공): `get_deployment_binding`, `list_repository_deployment_bindings`, `list_workspace_deployment_bindings`, `get_workflow_run`, `get_workflow_step_details`, `latest_succeeded_run_for_binding`, `get_application`, `register_deployment_binding` — 앵커 `src/domains/gitops/repository.py :: RepoChangeRepository.get_deployment_binding` 등(각 메서드명 동일).
실제 테이블(Application, WorkflowRun, WorkflowRunStep, Approval, DeploymentBinding)과 upsert 규칙은 [gitops 도메인](../domains/gitops.md)(`src/domains/gitops/repository.py :: RepoChangeRepository`) 참조.

**DB 레벨 전이 가드** (`src/domains/gitops/repository.py :: WORKFLOW_STATUS_RANKS`, `:: workflow_transition_guard`): 상태에 순위를 부여해 재배달·지연 이벤트가 뒤 단계 상태를 앞 단계로 되돌리는 회귀를 차단한다.

| 상태 | 순위 |
|---|---|
| `started` | 1 |
| `rendering` | 2 |
| `diffing` | 3 |
| `policy_checking` | 4 |
| `waiting_for_approval` | 5 |
| `applying` | 6 |
| `rollout_waiting` | 7 |
| `succeeded` / `failed` | 8 (종결 — `TERMINAL_WORKFLOW_STATUSES`, 이후 어떤 갱신도 불가) |

상태 갱신은 "현재 상태가 종결이 아니고, 새 상태 순위 ≥ 현재 순위"일 때만 반영된다. 같은 순위 재기록은 허용(멱등 재갱신).

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키(NATS subject) | 핵심 body 필드 | 앵커 |
|---|---|---|---|
| `GitWebhookReceivedBody` | `git.webhook.received` | `commit_sha`, `image`, `replicas`, `repo_ref`, `branch`, `source_type`, 식별자 필드들, `force: bool = False` | `src/domains/gitops/events.py :: GitWebhookReceivedBody` |
| `GitChangedBody` | `git.changed` | `commit_sha`, `image`, `replicas`, `repo_ref`, `branch`, `source_type`, 식별자 필드들 | `src/domains/gitops/events.py :: GitChangedBody` |
| `ManifestRenderedBody` | `manifest.rendered` | `rendered_manifest: RenderedManifest`, 식별자 필드들, `commit_sha`, `manifest_path` | `src/domains/gitops/events.py :: ManifestRenderedBody` |
| `ManifestInvalidBody` | `manifest.invalid` | `reason`, `commit_sha`, `manifest_path`, 식별자 필드들 | `src/domains/gitops/events.py :: ManifestInvalidBody` |
| `DesiredDesiredDiffDetectedBody` | `desired.diff.detected` | `diff: Diff` | `src/domains/gitops/events.py :: DesiredDesiredDiffDetectedBody` |
| `DiffAnalyzedBody` | `diff.analyzed` | `diff: Diff`, `safe: bool`, `risk: str`, `reason: str` | `src/domains/gitops/events.py :: DiffAnalyzedBody` |
| `SafePrCreatedBody` | `safe_pr.created` | `pr_url`, `provider`, `mode`, 식별자 필드들 | `src/domains/scm/events.py :: SafePrCreatedBody` |
| `SafePrFailedBody` | `safe_pr.failed` | `provider`, `title`, `reason`, `reason_code`, `stage`, 식별자 필드들 | `src/domains/scm/events.py :: SafePrFailedBody` |
| `ApprovalGrantedBody` | `approval.granted` | `approval_id`, `workflow_run_id`, `application_id`, `decided_by`, `decision = "granted"`, `details` | `src/domains/gitops/events.py :: ApprovalGrantedBody` |
| `ApprovalRejectedBody` | `approval.rejected` | `approval_id`, `workflow_run_id`, `application_id`, `reason`, `decided_by`, `details` | `src/domains/gitops/events.py :: ApprovalRejectedBody` |
| `CommandQueuedForAgentBody` | `command.queued_for_agent` | `command_id`, `cluster_id`, 식별자 필드들, `approval_ref`, `policy_decision_ref` | `src/domains/command/events.py :: CommandQueuedForAgentBody` |
| `CommandRejectedBody` | `command.rejected` | `reason`, `requested: JsonObject` | `src/domains/command/events.py :: CommandRejectedBody` |
| `CommandCompletedBody` | `command.completed` | `command_id`, `result: JsonObject` | `src/domains/command/events.py :: CommandCompletedBody` |
| `WorkflowRunCompletedBody` | `workflow.run.completed` | (발행 표와 동일 — 자기 발행 재구독, 승격 룰 트리거) | `src/domains/gitops/events.py :: WorkflowRunCompletedBody` |
| `ClusterDesiredStateChangedBody` | `cluster.desired_state.changed` | `cluster_id`, `desired_state_version`, `components`, `reason`, `workspace_id`, `requested_by` — `reason == "target registered"`일 때만 반응 | `src/domains/target/events.py :: ClusterDesiredStateChangedBody` |

### 발행 (Publishes)

| 이벤트 | 라우팅 키(NATS subject) | body | 앵커 |
|---|---|---|---|
| `WorkflowCreatedBody` | `workflow.created` | `workspace_id`, `application_id`, `workflow_run_id`, `repository_id`, `watch_target_id`, `binding_id`, `environment`, `cluster_id`, `commit_sha`, `manifest_path` | `src/domains/gitops/events.py :: WorkflowCreatedBody` |
| `WorkflowRunStartedBody` | `workflow.run.started` | 위 + `status = "started"`, `current_step = "git"` | `src/domains/gitops/events.py :: WorkflowRunStartedBody` |
| `WorkflowStepRecordedBody` | `workflow.step.recorded` | `workflow_run_id`, `application_id`, `step`, `status`, `workspace_id`, `binding_id`, `environment`, `message`, `details` | `src/domains/gitops/events.py :: WorkflowStepRecordedBody` |
| `WorkflowRunCompletedBody` | `workflow.run.completed` | `workflow_run_id`, `application_id`, `workspace_id`, `binding_id`, `environment`, `summary`, `details` | `src/domains/gitops/events.py :: WorkflowRunCompletedBody` |
| `WorkflowRunFailedBody` | `workflow.run.failed` | `workflow_run_id`, `application_id`, `reason`, `workspace_id`, `binding_id`, `environment`, `details` | `src/domains/gitops/events.py :: WorkflowRunFailedBody` |
| `ApprovalRequestedBody` | `approval.requested` | `approval_id`, `workflow_run_id`, `application_id`, `reason`, `workspace_id`, `binding_id`, `environment`, `requested_role = "release_operator"`, `details` | `src/domains/gitops/events.py :: ApprovalRequestedBody` |
| `CommandRequestedBody` (조건부) | `command.requested` | `approval.granted.details["command_requested"]`를 `CommandRequestedBody.from_body`로 복원 | `src/domains/command/events.py :: CommandRequestedBody` |
| `GitWebhookReceivedBody` (조건부) | `git.webhook.received` | `entry_webhook_for_binding`이 대상 바인딩 좌표(binding_id/environment/cluster_id/manifest_path/source_type 등)와 commit_sha·image·replicas로 구성 — 승격/글로벌 fan-out/신규 클러스터 초기 배포의 파이프라인 재진입 입구 | `src/domains/gitops/events.py :: GitWebhookReceivedBody` |

## 동작 (Behavior)

### 워크플로 상태 머신

상태 값은 `WorkflowRunStatus`(`src/packages/contracts/gitops/__init__.py :: WorkflowRunStatus`): `started`, `rendering`, `diffing`, `policy_checking`, `waiting_for_approval`, `applying`, `rollout_waiting`, `succeeded`, `failed`.
스텝 이름은 `WorkflowStepName`: `git`, `render`, `diff`, `policy`, `approval`, `safe_pr`, `apply`, `health`.
스텝 상태는 `WorkflowStepStatus`: `pending`, `running`, `succeeded`, `failed`, `skipped`.

**전이표** — 각 행: 트리거 이벤트(+조건) → run 상태/현재 스텝 기록 → 스텝 기록 → 발행 이벤트. 모든 `record_step`은 `workflow.step.recorded` 발행을 동반한다.

| # | 트리거(조건) | run 전이 (status / current_step / summary) | 스텝 기록 (step=status) | 발행 이벤트 |
|---|---|---|---|---|
| 1 | `git.webhook.received` | ensure_run: `started` / `git` / "git webhook received" (metadata: commit_sha, repo_ref) | `git`=`running` ("webhook accepted", details: commit_sha, branch) | `workflow.created`, `workflow.run.started`, `workflow.step.recorded` (+ 글로벌 fan-out 대상이 있으면 바인딩별 `git.webhook.received` — `fanout_global_bindings`) |
| 2 | `git.changed` | ensure_run: `rendering` / `render` / "git change confirmed; rendering manifest" | `git`=`succeeded` ("git change confirmed") | `workflow.step.recorded` |
| 3 | `manifest.rendered` | kind가 `Deployment`면 ensure_run(앱 이름 = metadata.name), 아니면 transition_run: `diffing` / `diff` / "manifest rendered; calculating desired diff" (metadata: kind, resource) | `render`=`succeeded` ("manifest rendered", details: rendered_manifest.to_body()) | `workflow.step.recorded` |
| 4 | `manifest.invalid` | ensure_run: `failed` / `render` / "manifest render failed" (metadata: reason) | `render`=`failed` (message=evt.reason, details: manifest_path) | `workflow.step.recorded`, `workflow.run.failed` |
| 5 | `desired.diff.detected` | transition_run: `policy_checking` / `policy` / "desired diff detected; checking policy" (metadata: resource) | `diff`=`succeeded` ("desired diff detected", details: diff.to_body()) | `workflow.step.recorded` |
| 6a | `diff.analyzed` (공통 선행) | — | `policy`=`succeeded` (message=evt.reason, details: safe, risk) | `workflow.step.recorded` |
| 6b | `diff.analyzed` + `diff.is_image_only_noop()` | transition_run: `succeeded` / `health` / `Sandbox.NO_DIFF_REASON`("desired and actual images already match") | `apply`=`skipped` (message=NO_DIFF_REASON, details: diff.to_body()) | `workflow.step.recorded`, `workflow.run.completed` |
| 6c | `diff.analyzed` + noop 아님 + `safe=True` | transition_run: `applying` / `safe_pr` / "policy auto-approved; creating safe PR" (metadata: risk) | `approval`=`skipped` ("approval not required by sandbox policy", details: safe=True, risk, policy_route=`safe_pr`, policy_decision_ref=`policy-decision:{approval_id}:safe_pr`, approval_ref, diff) — approval_id는 `derive_approval_id(workflow_run_id)`, approval status 후보는 `not_required` | `workflow.step.recorded` |
| 6d | `diff.analyzed` + noop 아님 + `safe=False` | transition_run: `waiting_for_approval` / `approval` / "approval required before write" (metadata=details) | `approval`=`pending` (message=evt.reason, details: safe=False, risk, policy_route=`approval_required`, policy_decision_ref=`policy-decision:{approval_id}:approval_required`, approval_ref, diff) | `workflow.step.recorded`, `approval.requested` (requested_role=`release_operator`) |
| 7 | `safe_pr.created` | (run 전이 없음) | `safe_pr`=`succeeded` ("safe PR created", details: pr_url, provider, mode) | `workflow.step.recorded` |
| 8 | `safe_pr.failed` | transition_run: `failed` / `safe_pr` / evt.reason (metadata: provider, title) | `safe_pr`=`failed` (message=evt.reason) | `workflow.step.recorded`, `workflow.run.failed` |
| 9 | `approval.granted` | `resolve_workflow_approval`(status=`granted`, decided_by, decision, details) 후 transition_run: `applying` / `apply` / "approval granted; waiting for command execution" (metadata=evt.details) | `approval`=`succeeded` (message=evt.decision, details=evt.details) | `workflow.step.recorded`, (details["command_requested"]가 Mapping이면) `command.requested` |
| 10 | `approval.rejected` | `resolve_workflow_approval`(status=`rejected`, decision="rejected") 후 transition_run: `failed` / `approval` / evt.reason | `approval`=`failed` (message=evt.reason, details=evt.details) | `workflow.step.recorded`, `workflow.run.failed` |
| 11 | `command.queued_for_agent` | ensure_run: `rollout_waiting` / `apply` / "command queued for outbound agent" (metadata: command_id); `attach_workflow_command(workflow_run_id, command_id)` | `apply`=`running` ("command queued for agent", details: command_id, cluster_id) | `workflow.step.recorded` |
| 12 | `command.rejected` | transition_run(`evt.requested` 기반): `failed` / `apply` / evt.reason (metadata: requested) | `apply`=`failed` (message=evt.reason, details: requested) | `workflow.step.recorded`, `workflow.run.failed` |
| 13a | `command.completed` + 성공 (`command_result_succeeded(evt.result)=True`) | `get_workflow_identity_for_command(command_id)` 조회 (None이면 아무것도 안 하고 종료); `attach_workflow_command`; `update_workflow_run_for_command`: `succeeded` / `health` / result message (metadata=rollout_result_details) | `apply`=`succeeded`, `health`=`succeeded` ("rollout health completed") | `workflow.step.recorded` ×2, `workflow.run.completed` |
| 13b | `command.completed` + 실패 | 위와 동일 조회·attach; `update_workflow_run_for_command`: `failed` / `health` / message | `apply`=`failed` | `workflow.step.recorded`, `workflow.run.failed` (reason=message 또는 "command failed") |

승인 상태 값은 `ApprovalStatus`(`src/packages/contracts/gitops/__init__.py :: ApprovalStatus`): `requested`, `granted`, `rejected`, `expired`, `not_required`. 이 워커는 `granted`/`rejected` 해결(`resolve_workflow_approval`)만 수행하고, `requested`/`not_required` payload는 approval_ref·policy_decision_ref 구성에 사용한다(6c/6d에서 Approval 행 삽입은 하지 않음 — `request_workflow_approval` 미호출).

### 페이로드 정규화 흐름

모든 핸들러는 이벤트 body를 `gitops_payload`/`diff_payload`/`normalize_payload`로 정규화해 파생 식별자를 채운 뒤 DB에 기록한다:

- `gitops_payload(evt, app_name)`: `evt.to_body()`에 앱 이름 힌트(`name`)를 주입 후 `normalize_payload`.
- `diff_payload(evt)`: `evt.diff.to_body()`에 `diff.resource`의 name 부분을 `name`으로 주입 후 `normalize_payload`.
- `on_manifest_rendered`는 `rendered_application_name`이 반환한 이름(Deployment일 때만)이 있으면 `ensure_run`(Application upsert 포함), 없으면 `transition_run`만 수행 — 한 파일에 Service/ConfigMap이 같이 렌더될 때 부속 리소스 이름이 Application.name을 덮는 문제 방지.
- `on_approval_granted`/`on_approval_rejected`/`on_command_rejected`는 `normalize_payload(evt.to_body())`/`normalize_payload(evt.requested)`를 직접 사용.
- `on_command_completed`는 DB에서 `command_id`로 워크플로 identity를 역조회(`get_workflow_identity_for_command`; WorkflowRun에 없으면 AgentCommand payload에서 복원)한다.

### 승격 파이프라인 / 글로벌 서비스

두 룰 모두 바인딩의 `deploy_policy` JSONB에 선언된다 — 스키마·이벤트 계약 변경 없음. 재진입은 항상 `entry_webhook_for_binding`이 만든 `git.webhook.received`로 표준 파이프라인(렌더→디프→정책→승인→적용)을 그대로 탄다.

**승격 (`on_run_completed_promote`)** — `workflow.run.completed` 구독:
1. 소스 바인딩 조회(`get_deployment_binding`) → `deploy_policy["promotes_to_binding_id"]`가 없거나 자기 자신이면 종료.
2. 대상 바인딩 조회 — 없으면 `promotion_target_missing` 경고 후 종료.
3. 소스 run에서 `commit_sha` 조회(`get_workflow_run`) — 없으면 종료.
4. **순환/재전달 가드**: `run_exists_for` — 대상 바인딩+같은 commit의 결정적 run_id가 이미 존재하면 no-op.
5. Application 조회(`get_application`; `repo_ref`/`default_branch` 포함) 후 `promoted_image_and_replicas`로 소스 run의 `diff` 스텝 details에서 image·replicas를 읽음 — image가 비면 `promotion_skipped_no_image` 경고 후 종료(합성 금지).
6. `promotion_triggered` 로그 후 대상 바인딩용 `git.webhook.received` yield.

**글로벌 fan-out (`fanout_global_bindings`)** — `on_git_webhook` 마지막에 호출:
1. 소스 바인딩이 이미 global이면 종료 — 자식 웹훅은 재확장하지 않아 증폭이 1단으로 끝난다.
2. `repository_id`(소스 바인딩 → evt 순 fallback)로 `list_repository_deployment_bindings` 조회.
3. 형제 바인딩 중 자기 자신 제외 + `deploy_policy["global"]` truthy + 같은 commit run 미존재(`run_exists_for`)인 것마다 `global_binding_fanout` 로그 후 evt의 image/replicas/repo_ref/branch를 그대로 실은 `git.webhook.received` yield.

**신규 클러스터 자동 attach (`on_cluster_registered_attach_globals`)** — `cluster.desired_state.changed` 구독, `reason == "target registered"`일 때만:
1. `list_workspace_deployment_bindings`에서 global 바인딩만 골라 `(repository_id, app_name, namespace)` 그룹으로 묶는다.
2. 그룹에 새 클러스터의 바인딩이 이미 있으면 skip. 없으면 템플릿(그룹 첫 바인딩)을 복제해 `register_deployment_binding`으로 새 클러스터 바인딩 생성(`global_binding_attached` 로그).
3. 템플릿 바인딩의 `latest_succeeded_run_for_binding`이 있으면 그 run의 commit·image(`promoted_image_and_replicas`)로 새 바인딩에 초기 배포 `git.webhook.received` yield. 배포 이력이 없으면 skip — 다음 git 변경 때 fan-out으로 합류.

관련: `POST /applications/{id}/deployments`가 `cluster_id="*"`를 받아 모든 등록 클러스터에 대해 `DEPLOY_RUN` 권한을 사전 검증한 뒤 클러스터별로 전개하는 글로벌 배포 입구는 게이트웨이/도메인 라우터 담당(`src/domains/applications/router.py`) — 이 워커의 범위 밖.

## 불변식·오류 (Invariants & Errors)

- **관찰자 원칙**: 이 워커는 기존 처리 체인의 이벤트를 재발행하거나 대체하지 않는다. 예외는 두 가지 — (1) `approval.granted` 시 details에 실려 온 `command_requested`를 `command.requested`로 발행하는 재개 경로, (2) 승격/글로벌 룰이 새 (binding, commit) 좌표로 발행하는 `git.webhook.received` 파이프라인 재진입 경로.
- **승격/fan-out 수렴**: 재진입 run_id는 `derive_workflow_run_id`로 결정적이라 `run_exists_for` 가드가 승격 순환·재전달·중복 fan-out을 no-op으로 수렴시킨다. 글로벌 fan-out은 소스 바인딩이 global이면 실행되지 않아(자식 재확장 금지) 증폭이 1단으로 끝난다.
- **승격은 합성하지 않는다**: 승격/초기 배포의 image·replicas는 소스 run의 `diff` 스텝 details(`desired_image`, `basis.replicas`)에서만 읽는다. image가 없으면 경고 후 skip.
- **상태 회귀 차단**: run 상태 갱신은 DB 레벨 가드(`workflow_transition_guard`)로 보호 — 종결 상태(`succeeded`/`failed`) 이후 갱신 불가, 낮은 순위로의 역행 불가. 핸들러는 재배달에 대해 멱등(스텝은 `(workflow_run_id, name)` upsert).
- **application dedup**: `upsert_application`이 같은 (workspace, repository, name)의 기존 앱으로 병합하면 `ensure_run`이 canonical `application_id` 기준으로 `workflow_run_id`를 재파생한다.
- `on_command_completed`에서 identity를 찾지 못하면(`None`) 아무 이벤트도 발행하지 않고 조용히 종료한다.
- 성공 판정은 `command_result_succeeded`의 3중 검사(전체 status/applied, 리소스별 applied/status, rollout.ready)를 모두 통과해야 한다.
- `GET /applications/{application_id}/runs`의 `promotion_gate`는 위 성공 판정의 구조화된 read model이다. 관측 윈도우나 별도 배포 안정성 신호는 이 게이트에 포함하지 않는다.
- 발행되는 `approval.requested`의 `requested_role`은 항상 `release_operator`.
- 예외는 핸들러에서 잡지 않고 런타임으로 전파된다.

## 설정 (Settings)

이 워커는 자체 환경변수를 읽지 않는다 (`env` 미사용). 기본값 상수는 import로 참조: `DEFAULT_WORKSPACE_ID = "default"`, `DEFAULT_ENVIRONMENT = "sandbox"`, `Target.DEFAULT_CLUSTER_ID = "default-target-cluster"`.
