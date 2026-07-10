---
source_commit: 664925a6
status: synced
---

# gitops — git webhook→manifest→diff 파이프라인의 events·tables·repo

> 소스: `src/domains/gitops/` · 테스트: `tests/test_gitops_approval_router.py`, `tests/test_gitops_diffing.py`, `tests/test_git_pull_worker.py`, `tests/test_manifest_render_worker.py`, `tests/test_diff_worker.py`, `tests/test_diff_analyze_worker.py`, `tests/test_workflow_controller.py`, `tests/test_promotion_and_global.py`

## 책임 (Responsibility)

- git 변경 → manifest 렌더 → diff → 승인 → 배포로 이어지는 GitOps 파이프라인의 **도메인 계층**: 이벤트 body 정의, DB 테이블, SQL repository, HTTP 라우터(웹훅 입구·승인 결정), managed-field diff 정책 헬퍼를 제공한다.
- 하는 것:
  - GitHub webhook 수신 엔드포인트(HMAC-SHA256 서명 검증) 및 승인(grant/reject) 엔드포인트.
  - 파이프라인 전 구간 이벤트 body 정의 및 이벤트 레지스트리 등록(`@event`).
  - 저장소/감시 대상/배포 바인딩/애플리케이션/워크플로 실행/승인/manifest 아티팩트/repo 변경 이력 테이블과 upsert·조회 쿼리.
  - 워크플로 상태 전이 가드(재배달 이벤트에 의한 상태 회귀 차단)와 결정적(deterministic) ID 파생 함수.
  - "무엇을 비교할지"를 결정하는 managed-field 3-way diff 정책(`diffing.py`) — 워커(services)와 비교 정책을 분리.
- 하지 않는 것: 실제 git pull/렌더/dry-run/apply 실행(→ `src/services/gitops/*` 워커), 명령 실행·전달(→ [command 도메인](./command.md)), 인증·세션 관리(→ [identity 도메인](./identity.md)).

- 모듈 앵커: `src/domains/gitops/__init__.py`

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.command.models :: AgentCommand`, `domains.command.events :: CommandRequestedBody` | [command](./command.md) | 대기 중 명령 payload에서 워크플로 identity 복원, 승인 시 apply 명령 요청 body 구성 |
| import | `domains.identity.dependencies :: require_admin_session, require_cluster_access, require_session` | [identity](./identity.md) | 승인 엔드포인트의 세션·클러스터 권한 검사, repository wizard API admin 보호 |
| import | `packages.config` (`constants`, `logs`, `settings`) | [config](../packages/config.md) | `RiskLevel`/`Target`/`Command`/`Sandbox` 상수, 로거, `env()` |
| import | `packages.contracts` (`event_bus`, `gitops`, `identity`, `gateway`, `auth`) | [contracts](../packages/contracts.md) | 이벤트 subject/registry/body 기반 클래스, gitops enum·기본값, 요청/응답 모델, `Actor` |
| import | `packages.runtime.dependencies :: get_db, get_events` | [runtime](../packages/runtime.md) | FastAPI 의존성 주입(DB·이벤트 버스) |
| import | `packages.security.credentials` | [security](../packages/security.md) | `/repos/validate`가 받은 GitHub token을 `credential_ref("github", "github")`로 참조 가능한 암호문으로 저장 |
| import | `packages.storage` (`base`, `engine`) | [storage](../packages/storage.md) | `Base`, 컬럼 헬퍼, `DatabaseConnection`, `unit_of_work_or_null`, `iso_or_none`, `row_dict` |
| 소비자 | `src/services/gitops/*` (git-pull-worker, manifest-render-worker, diff-worker, diff-analyze-worker, workflow-controller), `src/services/gateway/api-gateway`, `src/services/target/drift-worker` | (services 스펙) | 이 도메인의 이벤트 body·repository·diffing 헬퍼를 사용 |

## 공개 인터페이스 (Public API)

### 라우터 — `src/domains/gitops/router.py`

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `router` | `APIRouter(dependencies=[Depends(verify_github_signature)])` — 웹훅 라우터(라우터 단위 HMAC 검증) | `src/domains/gitops/router.py :: router` |
| `approval_router` | `APIRouter()` — 승인 결정 라우터 | `src/domains/gitops/router.py :: approval_router` |
| `APPROVAL_NOT_FOUND` | `= "approval not found"` | `src/domains/gitops/router.py :: APPROVAL_NOT_FOUND` |
| `APPROVAL_DIFF_MISSING` | `= "approval diff is missing"` | `src/domains/gitops/router.py :: APPROVAL_DIFF_MISSING` |
| `APPROVAL_ACCESS_DENIED` | `= "approval access denied"` | `src/domains/gitops/router.py :: APPROVAL_ACCESS_DENIED` |
| `APPROVAL_CONFLICT` | `= "approval already resolved"` | `src/domains/gitops/router.py :: APPROVAL_CONFLICT` |
| `HTTP_NOT_FOUND` | `= 404` | `src/domains/gitops/router.py :: HTTP_NOT_FOUND` |
| `HTTP_CONFLICT` | `= 409` | `src/domains/gitops/router.py :: HTTP_CONFLICT` |
| `GITOPS_WEBHOOK_IMAGE_ENV` | `= "GITOPS_WEBHOOK_IMAGE"` | `src/domains/gitops/router.py :: GITOPS_WEBHOOK_IMAGE_ENV` |
| `build_git_webhook_body` | `def build_git_webhook_body(payload: GitHubWebhookRequest) -> GitWebhookReceivedBody` — `payload.model_dump()`를 그대로 body 로 | `src/domains/gitops/router.py :: build_git_webhook_body` |
| `github_raw_change` | `def github_raw_change(payload: Mapping[str, Any], event_name: str) -> tuple[str, str, str] \| None` — GitHub `push` 또는 merge된 `pull_request` payload에서 `(repo_ref, branch, commit_sha)` 추출 | `src/domains/gitops/router.py :: github_raw_change` |
| `build_git_webhook_bodies` | `def build_git_webhook_bodies(payload: Mapping[str, Any], *, db: Any \| None = None, event_name: str = "") -> list[GitWebhookReceivedBody]` — 표준 `GitHubWebhookRequest`면 1개 변환, raw GitHub payload면 active poll target과 매칭해 0..N개 변환 | `src/domains/gitops/router.py :: build_git_webhook_bodies` |
| `accepted_event_response` | `def accepted_event_response(accepted: Any) -> AcceptedEventResponse` | `src/domains/gitops/router.py :: accepted_event_response` |
| `github_webhook` | `async def github_webhook(request: Request, payload: dict[str, Any] = Body(...), events: Any = Depends(get_events), db: Any = Depends(get_db)) -> AcceptedEventResponse \| JSONResponse` | `src/domains/gitops/router.py :: github_webhook` |
| `approval_details` | `def approval_details(record: Mapping[str, Any]) -> dict[str, Any]` — record["details"]가 Mapping 이면 dict 복사, 아니면 `{}` | `src/domains/gitops/router.py :: approval_details` |
| `approval_diff` | `def approval_diff(record: Mapping[str, Any]) -> Diff` — details["diff"]를 `Diff.from_body`로 복원, 없으면 409 | `src/domains/gitops/router.py :: approval_diff` |
| `ensure_approval_is_open` | `def ensure_approval_is_open(record: Mapping[str, Any]) -> None` — status가 `{"requested", "not_required"}` 밖이면 409 | `src/domains/gitops/router.py :: ensure_approval_is_open` |
| `require_approval_deploy_access` | `def require_approval_deploy_access(db: Any, current: Any, workspace_id: str, diff: Diff) -> None` — `require_cluster_access(..., Permission.DEPLOY_RUN.value, detail=APPROVAL_ACCESS_DENIED)` | `src/domains/gitops/router.py :: require_approval_deploy_access` |
| `approval_command_request` | `def approval_command_request(record: Mapping[str, Any], diff: Diff, reason: str | None, user_id: str) -> CommandRequestedBody` | `src/domains/gitops/router.py :: approval_command_request` |
| `approval_record_or_404` | `def approval_record_or_404(db: Any, approval_id: str, workspace_id: str) -> dict[str, Any]` | `src/domains/gitops/router.py :: approval_record_or_404` |
| `resolve_approval_or_409` | `def resolve_approval_or_409(db: Any, approval_id: str, workspace_id: str, status: str, decided_by: str, decision: str, details: dict[str, Any]) -> None` | `src/domains/gitops/router.py :: resolve_approval_or_409` |
| `grant_approval` | `async def grant_approval(approval_id: str, payload: ApprovalDecisionRequest, current: Any = Depends(require_session), db: Any = Depends(get_db), events: Any = Depends(get_events)) -> AcceptedResponse` | `src/domains/gitops/router.py :: grant_approval` |
| `reject_approval` | `async def reject_approval(approval_id: str, payload: ApprovalDecisionRequest, current: Any = Depends(require_session), db: Any = Depends(get_db), events: Any = Depends(get_events)) -> AcceptedResponse` | `src/domains/gitops/router.py :: reject_approval` |

#### HTTP 엔드포인트

| 메서드+경로 | 핸들러 | 요청 모델 | 응답 모델 | 권한/의존성 |
|---|---|---|---|---|
| `POST /github/webhook` (`gateway_routes.GITHUB_WEBHOOK_PATH`) | `github_webhook` | `dict[str, Any]` (`GitHubWebhookRequest` 또는 GitHub raw `push`/`pull_request`) | `AcceptedEventResponse` 또는 202 ignored JSON | 라우터 의존성 `verify_github_signature` (HMAC-SHA256, fail-closed) |
| `POST /approvals/{approval_id}/grant` (`gateway_routes.APPROVAL_GRANT_PATH`) | `grant_approval` | `ApprovalDecisionRequest` (`reason: str | None = None`) | `AcceptedResponse` | `require_session` + 클러스터 권한 `Permission.DEPLOY_RUN`(`"deploy.run"`) — `require_cluster_access` |
| `POST /approvals/{approval_id}/reject` (`gateway_routes.APPROVAL_REJECT_PATH`) | `reject_approval` | `ApprovalDecisionRequest` | `AcceptedResponse` | `require_session` + `Permission.DEPLOY_RUN` |

요청/응답 모델 정의는 [contracts](../packages/contracts.md)의 `packages/contracts/gateway/requests.py :: GitHubWebhookRequest`, `packages/contracts/gateway/requests.py :: ApprovalDecisionRequest`, `packages/contracts/gateway/responses.py :: AcceptedResponse`, `packages/contracts/gateway/responses.py :: AcceptedEventResponse` 참조.
`AcceptedResponse = {accepted: bool, event_id: str, correlation_id: str}`, `AcceptedEventResponse = AcceptedResponse + {event: JsonMap}`.

### Repository discovery 라우터 — `src/domains/gitops/repository_discovery_router.py`

세션 보호된 repository 연결 전 탐색 API다. 프론트는 repository를 application으로 확정하기 전에 이 API로 repo 접근성, branch, manifest 후보, manifest 유효성을 확인한다. `/applications/connect`도 같은 `RepositoryDiscoveryService.validate_manifest`를 서버에서 다시 호출한다.

| 메서드+경로 | 핸들러 | 요청 모델 | 응답 모델 | 권한/의존성 |
|---|---|---|---|---|
| `POST /repositories/discovery/probe` (`REPOSITORY_DISCOVERY_PROBE_PATH`) | `probe_repository` | `RepositoryProbeRequest` | `RepositoryProbeResponse` | `require_session` |
| `GET /repositories/discovery/branches` (`REPOSITORY_DISCOVERY_BRANCHES_PATH`) | `list_repository_branches` | query `repo_ref` | `RepositoryBranchListResponse` | `require_session` |
| `GET /repositories/discovery/manifests` (`REPOSITORY_DISCOVERY_MANIFESTS_PATH`) | `list_repository_manifest_candidates` | query `repo_ref`, `branch` | `RepositoryManifestCandidateListResponse` | `require_session` |
| `POST /repositories/discovery/validate` (`REPOSITORY_DISCOVERY_VALIDATE_PATH`) | `validate_repository_manifest` | `RepositoryManifestValidationRequest` | `RepositoryManifestValidationResponse` | `require_session` |
| `POST /repos/validate` (`REPOS_VALIDATE_PATH`) | `validate_repo_for_wizard` | `RepoValidateRequest` | `RepoValidateResponse` | `require_admin_session` |
| `GET /repos/branches` (`REPOS_BRANCHES_PATH`) | `list_repo_branches_for_wizard` | query `repo` | `RepositoryBranchListResponse` | `require_admin_session` |
| `GET /repos/manifests` (`REPOS_MANIFESTS_PATH`) | `list_repo_manifests_for_wizard` | query `repo`, `branch` | `RepoManifestFileListResponse` | `require_admin_session` |

`discovery_http_error`는 `RepositoryDiscoveryError`를 원래 status/detail로, `ValueError`를 422로, 그 외 예외를 502 `"repository discovery failed"`로 변환한다.
위저드용 `/repos/*` 경로는 GitHub URL을 `owner/repo`로 정규화하고, `.yaml/.yml` 중 Kubernetes `kind`가 파싱되는 파일만 프론트 listbox 후보로 반환한다. token이 제공되면 workspace credential로 암호화 저장하고 원문은 응답하지 않는다.
후보 파일 본문 조회는 `GITHUB_MANIFEST_SCAN_CONCURRENCY`(기본 8, 최대 32)로 제한된 병렬 처리이며, `GITHUB_MANIFEST_SCAN_TIMEOUT_SECONDS`(기본 20초, 최대 60초)를 넘으면 완료된 실제 결과만 반환하고 warning에 부분 스캔임을 표시한다. 합성 후보를 만들거나 파일 내용을 추정하지 않는다.

### 인가 가드 — `src/domains/gitops/dependencies.py`

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `WEBHOOK_SECRET_ENV` | `= "GITHUB_WEBHOOK_SECRET"` | `src/domains/gitops/dependencies.py :: WEBHOOK_SECRET_ENV` |
| `SIGNATURE_HEADER` | `= "x-hub-signature-256"` | `src/domains/gitops/dependencies.py :: SIGNATURE_HEADER` |
| `SIGNATURE_PREFIX` | `= "sha256="` | `src/domains/gitops/dependencies.py :: SIGNATURE_PREFIX` |
| `verify_github_signature` | `async def verify_github_signature(request: Request) -> None` | `src/domains/gitops/dependencies.py :: verify_github_signature` |

### 리포지토리 — `src/domains/gitops/repository.py`

모듈 수준 심볼:

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `LOGGER` | `= get_logger(__name__)` | `src/domains/gitops/repository.py :: LOGGER` |
| `OPEN_APPROVAL_STATUSES` | `= (ApprovalStatus.REQUESTED.value, ApprovalStatus.NOT_REQUIRED.value)` — 열린 승인으로 간주하는 상태(라우터의 open 판정과 동일해야 함) | `src/domains/gitops/repository.py :: OPEN_APPROVAL_STATUSES` |
| `WORKFLOW_STATUS_RANKS` | `dict[str, int]` — 워크플로 상태 전이 순위(아래 상태 머신 표) | `src/domains/gitops/repository.py :: WORKFLOW_STATUS_RANKS` |
| `TERMINAL_WORKFLOW_STATUSES` | `= (WorkflowRunStatus.SUCCEEDED.value, WorkflowRunStatus.FAILED.value)` | `src/domains/gitops/repository.py :: TERMINAL_WORKFLOW_STATUSES` |
| `workflow_status_rank` | `def workflow_status_rank(column: Any) -> Any` — 상태 컬럼→순위 SQL CASE 식(미등록 상태는 0) | `src/domains/gitops/repository.py :: workflow_status_rank` |
| `workflow_transition_guard` | `def workflow_transition_guard(table: Any, new_status: Any) -> Any` — `현재 status ∉ TERMINAL AND rank(현재) <= rank(new)` 조건식. `new_status`는 문자열 또는 excluded 컬럼 | `src/domains/gitops/repository.py :: workflow_transition_guard` |
| `watch_target_settings` | `def watch_target_settings(payload: JsonObject) -> JsonObject` — `settings.source_type` 우선, 없으면 `deploy_policy.manifest_source`/`deploy_policy.source_type`에서 `source_type`을 보존해 watch target settings 로 반환 | `src/domains/gitops/repository.py :: watch_target_settings` |
| `RepoChangeRepository` | `class RepoChangeRepository(DatabaseConnection)` | `src/domains/gitops/repository.py :: RepoChangeRepository` |
| `manifest_artifact_id` | `def manifest_artifact_id(payload: JsonObject) -> str` — `"manifest-" + sha256("workspace_id|binding_id|commit_sha|manifest_path")[:32]` | `src/domains/gitops/repository.py :: manifest_artifact_id` |
| `derive_repository_id` | `def derive_repository_id(payload: JsonObject) -> str` — 명시값(비-기본) 우선, 아니면 `"repo-" + sha256("workspace_id|repo_ref")[:32]` | `src/domains/gitops/repository.py :: derive_repository_id` |
| `derive_watch_target_id` | `def derive_watch_target_id(payload: JsonObject) -> str` — `"watch-" + sha256("workspace_id|repository_id|branch|manifest_path")[:32]` | `src/domains/gitops/repository.py :: derive_watch_target_id` |
| `derive_deployment_binding_id` | `def derive_deployment_binding_id(payload: JsonObject) -> str` — `"binding-" + sha256("workspace_id|repository_id|cluster_id|namespace|app_name")[:32]` (namespace 기본 `"sandbox"`, cluster_id 기본 `Target.DEFAULT_CLUSTER_ID`) | `src/domains/gitops/repository.py :: derive_deployment_binding_id` |
| `derive_application_id` | `def derive_application_id(payload: JsonObject) -> str` — `"app-" + sha256("workspace_id|repository_id|manifest_path|name")[:32]` | `src/domains/gitops/repository.py :: derive_application_id` |
| `derive_application_name` | `def derive_application_name(payload: JsonObject) -> str` — `name`/`app_name` 우선, 없으면 `resource`(`kind/name`)의 `/` 뒷부분, 다음 `repo_ref`(`owner/name`)의 마지막 세그먼트, 모두 없으면 `""` | `src/domains/gitops/repository.py :: derive_application_name` |
| `derive_workflow_run_id` | `def derive_workflow_run_id(payload: JsonObject) -> str` — `"workflow-" + sha256("workspace_id|application_id|binding_id|environment|commit_sha")[:32]` | `src/domains/gitops/repository.py :: derive_workflow_run_id` |
| `derive_workflow_step_id` | `def derive_workflow_step_id(workflow_run_id: str, step_name: str) -> str` — `"step-" + sha256(f"{workflow_run_id}|{step_name}")[:32]` | `src/domains/gitops/repository.py :: derive_workflow_step_id` |
| `derive_approval_id` | `def derive_approval_id(workflow_run_id: str) -> str` — `"approval-" + sha256(f"{workflow_run_id}|deploy-approval")[:32]` | `src/domains/gitops/repository.py :: derive_approval_id` |
| `stable_credential_id` | `def stable_credential_id(workspace_id: str, provider: str, scope: str) -> str` — `"cred-" + sha256("workspace_id|provider|scope")[:32]` | `src/domains/gitops/repository.py :: stable_credential_id` |
| `serialize_application` | `def serialize_application(row: Any) -> JsonObject` — metadata dict 강제, created_at/updated_at ISO 문자열화 | `src/domains/gitops/repository.py :: serialize_application` |
| `serialize_deployment_binding` | `def serialize_deployment_binding(row: Any) -> JsonObject` — deploy_policy/access_policy dict 강제, 시각 ISO 화 | `src/domains/gitops/repository.py :: serialize_deployment_binding` |
| `serialize_workflow_run` | `def serialize_workflow_run(row: Any) -> JsonObject` — metadata dict 강제, 시각 ISO 화 | `src/domains/gitops/repository.py :: serialize_workflow_run` |

모든 ID 파생 함수는 결정적: 같은 입력 payload → 같은 ID (멱등 upsert 의 기반). `explicit` 값이 존재하고 계약의 기본값(`DEFAULT_*_ID`, 전부 `""`)과 다르면 그 값을 그대로 사용한다.

#### `RepoChangeRepository` 메서드

| 메서드 시그니처 | 쿼리 의미 | 앵커 |
|---|---|---|
| `def upsert_workspace_credential(self, payload: JsonObject) -> JsonObject` | `workspace_credentials`에 `(workspace_id, provider, scope)` 유니크 기준 upsert. `credential_id`가 없으면 `stable_credential_id`로 파생하고, `encrypted_value/status/metadata/updated_at`을 갱신한다. token 원문은 저장하지 않는다. | `src/domains/gitops/repository.py :: RepoChangeRepository.upsert_workspace_credential` |
| `def get_workspace_credential(self, workspace_id: str, provider: str, scope: str) -> JsonObject \| None` | active credential 단건 조회. 현재 wizard는 저장에만 사용하고 poller는 repository `credential_ref` 또는 env token ref를 별도로 해석한다. | `src/domains/gitops/repository.py :: RepoChangeRepository.get_workspace_credential` |
| `def register_repository(self, payload: JsonObject) -> JsonObject` | `git_repositories` upsert(`repository_id` 충돌 시 provider/repo_ref/default_branch/credential_ref/status/access_policy 갱신). `user_id` 있으면 `repository` 리소스에 `cluster_steward` 롤 부여. 반환: payload + 해석된 `workspace_id`/`repository_id` | `src/domains/gitops/repository.py :: RepoChangeRepository.register_repository` |
| `def register_watch_target(self, payload: JsonObject) -> JsonObject` | `git_watch_targets` upsert(`watch_target_id` 충돌 시 branch/manifest_path/interval_seconds/last_seen_commit_sha/last_polled_at/status/settings 갱신). `interval_seconds` 기본 30 | `src/domains/gitops/repository.py :: RepoChangeRepository.register_watch_target` |
| `def register_deployment_binding(self, payload: JsonObject) -> JsonObject` | `deployment_bindings` upsert(`binding_id` 충돌 시 대상·정책 필드 전부 갱신). `cluster_id`/`namespace`/`app_name`은 payload 필수(`payload["…"]`). `user_id` 있으면 `deployment_binding` 리소스에 롤 부여 | `src/domains/gitops/repository.py :: RepoChangeRepository.register_deployment_binding` |
| `def upsert_application(self, payload: JsonObject) -> JsonObject` | `applications` upsert. 먼저 `(workspace_id, repository_id, name)`으로 기존 행 조회 — 존재하고 application_id 가 다르면 기존 ID 로 흡수(dedup, `application_id_merged_by_name` 경고 로그) 후 UPDATE, 아니면 `application_id` 충돌 upsert. 반환 payload 에 `application_id`=해석된 ID | `src/domains/gitops/repository.py :: RepoChangeRepository.upsert_application` |
| `def list_applications(self, workspace_id: str, *, application_ids: set[str] | None = None, limit: int = 100) -> list[JsonObject]` | workspace 의 애플리케이션 목록 — `git_repositories` 와 조인해 `repo_ref`/`default_branch` 를 함께 반환. `application_ids`가 빈 set 이면 즉시 `[]`, None 아니면 IN 필터. 정렬 `name, application_id`, limit 1..500 클램프 | `src/domains/gitops/repository.py :: RepoChangeRepository.list_applications` |
| `def get_application(self, workspace_id: str, application_id: str) -> JsonObject | None` | 단건 조회(serialize_application) — `git_repositories` 조인으로 `repo_ref`/`default_branch` 포함 | `src/domains/gitops/repository.py :: RepoChangeRepository.get_application` |
| `def list_application_deployment_bindings(self, workspace_id: str, application_id: str, *, limit: int = 100) -> list[JsonObject]` | 애플리케이션 조회 후 `(workspace_id, repository_id=app.repository_id, app_name=app.name)`으로 바인딩 목록. 앱 없으면 `[]`. `git_watch_targets`를 watch id로 먼저 LEFT JOIN하고, 없으면 source identity(`workspace_id`, `repository_id`, default branch, manifest path)로 fallback JOIN해 API 응답의 `gitops_poll.status`, `status_code`, `error_kind`, `error`, `last_seen_commit_sha`, `last_polled_at`을 포함한다. 정렬 `environment, cluster_id, namespace` | `src/domains/gitops/repository.py :: RepoChangeRepository.list_application_deployment_bindings` |
| `def list_application_workflow_runs(self, workspace_id: str, application_id: str, *, limit: int = 100) -> list[JsonObject]` | 앱의 워크플로 실행 목록, `created_at DESC`. 조회한 run id 기준으로 `workflow_run_steps`를 한 번 더 읽어서 각 run의 `steps` 배열에 붙인다. step 항목은 `name/status/message/details/updated_at`이며, `details.changes[]`는 프론트 워크플로 미리보기에서 필드 변경 목록으로 사용한다. | `src/domains/gitops/repository.py :: RepoChangeRepository.list_application_workflow_runs` |
| `def get_deployment_binding(self, workspace_id: str, binding_id: str) -> JsonObject | None` | 바인딩 단건 조회(serialize_deployment_binding) | `src/domains/gitops/repository.py :: RepoChangeRepository.get_deployment_binding` |
| `def list_repository_deployment_bindings(self, workspace_id: str, repository_id: str) -> list[JsonObject]` | 같은 repo 를 바라보는 `active` 바인딩 전부 — 글로벌 서비스 webhook fan-out 대상 조회. 정렬 `cluster_id, binding_id` | `src/domains/gitops/repository.py :: RepoChangeRepository.list_repository_deployment_bindings` |
| `def list_workspace_deployment_bindings(self, workspace_id: str) -> list[JsonObject]` | 워크스페이스의 `active` 바인딩 전부 — 글로벌 그룹 탐색용(바인딩 수 소규모 전제). 정렬 `repository_id, app_name, cluster_id` | `src/domains/gitops/repository.py :: RepoChangeRepository.list_workspace_deployment_bindings` |
| `def list_active_github_poll_targets(self, workspace_id: str \| None = None, *, limit: int = 500) -> list[JsonObject]` | github-poll-worker 대상 조회. active GitHub repo + active application + active deployment binding을 조인하고, `git_watch_targets`는 LEFT JOIN한다. watch target row가 없으면 binding의 derived `watch_target_id`와 manifest path로 fallback한다. `source_type`은 watch target settings → binding deploy_policy(`manifest_source`, `source_type`) → application metadata 순서로 fallback한다. 반환 필드: `workspace_id`, `application_id`, `repository_id`, `repo_ref`, `credential_ref`, `branch`, `watch_target_id`, `binding_id`, `environment`, `cluster_id`, `manifest_path`, `source_type`, `last_seen_commit_sha`. | `src/domains/gitops/repository.py :: RepoChangeRepository.list_active_github_poll_targets` |
| `def get_workflow_run(self, workflow_run_id: str) -> JsonObject | None` | 워크플로 run 단건 조회(serialize_workflow_run) | `src/domains/gitops/repository.py :: RepoChangeRepository.get_workflow_run` |
| `def get_workflow_step_details(self, workflow_run_id: str, name: str) -> JsonObject | None` | 특정 step 의 `details` JSONB 단건 조회 — 승격(promotion) 시 소스 run 의 diff step details 에서 image/replicas 를 읽는 용도 | `src/domains/gitops/repository.py :: RepoChangeRepository.get_workflow_step_details` |
| `def latest_succeeded_run_for_binding(self, workspace_id: str, binding_id: str) -> JsonObject | None` | 바인딩의 최근 `succeeded` run(`updated_at DESC LIMIT 1`) — 신규 클러스터가 글로벌 바인딩에 합류할 때 초기 배포 기준 | `src/domains/gitops/repository.py :: RepoChangeRepository.latest_succeeded_run_for_binding` |
| `def start_workflow_run(self, payload: JsonObject) -> JsonObject` | `workflow_runs` upsert. 생성은 무조건, 기존 행 갱신은 `workflow_transition_guard` 통과 시에만(status/current_step/summary/command_id/metadata). status 기본 `started`, current_step 기본 `git` | `src/domains/gitops/repository.py :: RepoChangeRepository.start_workflow_run` |
| `def update_workflow_run(self, payload: JsonObject) -> JsonObject` | `workflow_run_id` 기준 UPDATE(status/current_step/summary/command_id/metadata 중 존재 키만). `status` 포함 시 전이 가드 적용 | `src/domains/gitops/repository.py :: RepoChangeRepository.update_workflow_run` |
| `def record_workflow_step(self, payload: JsonObject) -> JsonObject` | `workflow_run_steps` upsert(`(workflow_run_id, name)` 충돌 시 status/message/details 갱신). step 이름은 `name` 또는 `step` 키, 기본 `git`. status 기본 `succeeded` | `src/domains/gitops/repository.py :: RepoChangeRepository.record_workflow_step` |
| `def request_workflow_approval(self, payload: JsonObject) -> JsonObject` | `approvals` upsert(`approval_id` 충돌 시 갱신하되 `WHERE status IN OPEN_APPROVAL_STATUSES` — 이미 해결된 승인은 재요청으로 덮이지 않음). status 기본 `requested`, requested_role 기본 `release_operator` | `src/domains/gitops/repository.py :: RepoChangeRepository.request_workflow_approval` |
| `def resolve_workflow_approval_if_open(self, approval_id: str, workspace_id: str, status: str, decided_by: str | None, decision: str | None, details: JsonObject) -> bool` | 열린 승인만 원자적 단일 UPDATE(+RETURNING)로 해결. `False` = 이미 해결됨(호출자는 409) | `src/domains/gitops/repository.py :: RepoChangeRepository.resolve_workflow_approval_if_open` |
| `def resolve_workflow_approval(self, payload: JsonObject) -> JsonObject` | `approval_id` 기준 무조건 UPDATE(status 기본 `granted`) — open 검사 없는 비원자 버전 | `src/domains/gitops/repository.py :: RepoChangeRepository.resolve_workflow_approval` |
| `def get_workflow_approval(self, approval_id: str, workspace_id: str = DEFAULT_WORKSPACE_ID) -> JsonObject | None` | 승인 단건 조회(approval_id + workspace_id) | `src/domains/gitops/repository.py :: RepoChangeRepository.get_workflow_approval` |
| `def count_open_workflow_approvals(self, workspace_id: str) -> int` | fleet 합계용 — `status = requested`(사람 결정 대기)인 승인 수 COUNT. `NOT_REQUIRED`는 자동 진행 표식이라 세지 않음(`OPEN_APPROVAL_STATUSES`와 다른 기준) | `src/domains/gitops/repository.py :: RepoChangeRepository.count_open_workflow_approvals` |
| `def count_running_workflow_runs(self, workspace_id: str) -> int` | fleet 합계용 — 종결(`TERMINAL_WORKFLOW_STATUSES` = succeeded/failed) 전 상태의 워크플로 run 수 COUNT | `src/domains/gitops/repository.py :: RepoChangeRepository.count_running_workflow_runs` |
| `def attach_workflow_command(self, workflow_run_id: str, command_id: str) -> None` | 워크플로 행에 `command_id` 연결 | `src/domains/gitops/repository.py :: RepoChangeRepository.attach_workflow_command` |
| `def update_workflow_run_for_command(self, payload: JsonObject) -> JsonObject` | `command_id` 로 워크플로를 찾아 UPDATE(status/current_step/summary/metadata). `status` 포함 시 전이 가드 적용 | `src/domains/gitops/repository.py :: RepoChangeRepository.update_workflow_run_for_command` |
| `def get_workflow_identity_for_command(self, command_id: str) -> JsonObject | None` | `workflow_runs.command_id` 매칭 행의 identity(workflow_run_id/workspace_id/application_id/binding_id/environment/cluster_id/commit_sha). 없으면 `agent_commands.payload`(큐 대기 명령)에서 복원 — `workflow_run_id`·`application_id` 없으면 `None` | `src/domains/gitops/repository.py :: RepoChangeRepository.get_workflow_identity_for_command` |
| `def save_repo_change(self, correlation_id: str, commit_sha: str, manifest: JsonObject, workspace_id: str = DEFAULT_WORKSPACE_ID, repository_id: str | None = None, watch_target_id: str | None = None, binding_id: str | None = None, manifest_path: str | None = None) -> None` | `repo_changes` append-only INSERT | `src/domains/gitops/repository.py :: RepoChangeRepository.save_repo_change` |
| `def record_manifest_artifact(self, payload: JsonObject) -> JsonObject` | `manifest_artifacts` upsert(유니크 `(workspace_id, binding_id, commit_sha, manifest_path)` 충돌 시 status/status_reason/rendered_manifest/source_summary 갱신). `commit_sha`는 payload 필수. status 기본 `rendered` | `src/domains/gitops/repository.py :: RepoChangeRepository.record_manifest_artifact` |
| `def find_rendered_manifest_artifacts(self, workspace_id: str, binding_id: str, commit_sha: str, manifest_path: str, renderer_version: str) -> list[JsonObject]` | status=`rendered` 이고 `rendered_manifest IS NOT NULL` 이며 `manifest_path` 가 정확히 일치하거나 `"{manifest_path}#"` 접두(멀티 문서 분할)인 행을 `manifest_path ASC` 로 조회 후, `source_summary["renderer_version"] == renderer_version` 인 것만 반환(렌더러 버전 캐시 검증) | `src/domains/gitops/repository.py :: RepoChangeRepository.find_rendered_manifest_artifacts` |
| `def mark_watch_observed(self, watch_target_id: str, commit_sha: str, workspace_id: str = DEFAULT_WORKSPACE_ID, repository_id: str = DEFAULT_REPOSITORY_ID, branch: str = DEFAULT_REPO_BRANCH, manifest_path: str = DEFAULT_MANIFEST_PATH) -> None` | `git_watch_targets` upsert — source identity(`workspace_id`, `repository_id`, `branch`, `manifest_path`) 충돌 시 `last_seen_commit_sha`·`last_polled_at`만 갱신(신규면 interval 30초·active 로 생성). fallback/derived watch id와 기존 watch row id가 달라도 관측 커밋 기록이 빠지지 않게 source key를 기준으로 한다. | `src/domains/gitops/repository.py :: RepoChangeRepository.mark_watch_observed` |
| `def record_watch_poll_result(self, watch_target_id: str, *, ok: bool, status_code: int | None = None, error_kind: str = "", error: str = "", workspace_id: str = DEFAULT_WORKSPACE_ID, repository_id: str = DEFAULT_REPOSITORY_ID, branch: str = DEFAULT_REPO_BRANCH, manifest_path: str = DEFAULT_MANIFEST_PATH) -> None` | `git_watch_targets` upsert — source identity 충돌 시 GitHub poll 성공/실패를 `settings.poll_status`, `poll_status_code`, `poll_error_kind`, `poll_error`, `last_polled_at`에 저장해 운영 API와 readiness에서 확인할 수 있게 한다. | `src/domains/gitops/repository.py :: RepoChangeRepository.record_watch_poll_result` |
| `def get_watch_last_seen_commit_sha(self, watch_target_id: str, workspace_id: str = DEFAULT_WORKSPACE_ID) -> str | None` | 감시 대상의 마지막 관측 커밋 SHA | `src/domains/gitops/repository.py :: RepoChangeRepository.get_watch_last_seen_commit_sha` |

### diff 정책 헬퍼 — `src/domains/gitops/diffing.py`

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `JsonObject` | `= dict[str, Any]` (타입 별칭) | `src/domains/gitops/diffing.py :: JsonObject` |
| `MANAGED_FIELD_SOURCE` | `= "managed-field-3way"` | `src/domains/gitops/diffing.py :: MANAGED_FIELD_SOURCE` |
| `MISSING` | `= "<missing>"` — 필드 부재 센티널 | `src/domains/gitops/diffing.py :: MISSING` |
| `ManagedFieldSnapshot` | `@dataclass(frozen=True)` — `resource: str; namespace: str; fields: JsonObject; source: str` | `src/domains/gitops/diffing.py :: ManagedFieldSnapshot` |
| `resource_ref` | `def resource_ref(kind: str, name: str) -> str` — `f"{kind.lower()}/{name}"` | `src/domains/gitops/diffing.py :: resource_ref` |
| `rendered_manifest_to_object` | `def rendered_manifest_to_object(rendered: Any) -> JsonObject` — `rendered.manifest`(비어있지 않은 Mapping) → deepcopy, 아니면 `rendered.rendered_object`, 둘 다 없으면 metadata/spec 요약값으로 Deployment 형태 객체 합성 | `src/domains/gitops/diffing.py :: rendered_manifest_to_object` |
| `snapshot_from_rendered_manifest` | `def snapshot_from_rendered_manifest(rendered: Any, *, source: str = "rendered_manifest") -> ManagedFieldSnapshot` | `src/domains/gitops/diffing.py :: snapshot_from_rendered_manifest` |
| `extract_declared_field_paths` | `def extract_declared_field_paths(obj: Mapping[str, Any]) -> list[str]` — `sorted(extract_managed_fields(obj))` | `src/domains/gitops/diffing.py :: extract_declared_field_paths` |
| `snapshot_from_kubernetes_object` | `def snapshot_from_kubernetes_object(obj: Mapping[str, Any], *, source: str) -> ManagedFieldSnapshot` — kind 기본 `"Unknown"`, name 기본 `"unknown"`, namespace 기본 `"default"` | `src/domains/gitops/diffing.py :: snapshot_from_kubernetes_object` |
| `extract_managed_fields` | `def extract_managed_fields(obj: Mapping[str, Any]) -> JsonObject` — kind 별 관리 필드 추출: `Deployment`(`spec.replicas`, 컨테이너별 `spec.template.spec.containers[name=<n>].image/env/resources`), `Service`(`spec.type/selector/ports`), `ConfigMap`(`data`, `binaryData`), 그 외 kind → `{}` | `src/domains/gitops/diffing.py :: extract_managed_fields` |
| `compare_managed_fields` | `def compare_managed_fields(*, old_desired: Mapping[str, Any] | None, live: Mapping[str, Any], new_desired: Mapping[str, Any], managed_fields: Iterable[str] | None = None, ignored_fields: Iterable[str] | None = None) -> list[JsonObject]` — 3-way 비교. 각 change: `{field_path, classification, old_desired, live, new_desired, before(=live), after(=new_desired)}`. `no_change` 는 제외 | `src/domains/gitops/diffing.py :: compare_managed_fields` |
| `apply_field_policy` | `def apply_field_policy(fields: Mapping[str, Any] | None, managed_fields: Iterable[str] | None = None, ignored_fields: Iterable[str] | None = None) -> JsonObject | None` — `managed_fields`가 None 이면 전체 허용, `ignored_fields` 는 항상 제거. 입력 None 이면 None | `src/domains/gitops/diffing.py :: apply_field_policy` |
| `build_adoption_required_changes` | `def build_adoption_required_changes(*, live: Mapping[str, Any], new_desired: Mapping[str, Any], unknown_fields: Iterable[str]) -> list[JsonObject]` — 미지 필드마다 `classification="adoption_required"` change 생성(live·new 둘 다 MISSING 이면 생략) | `src/domains/gitops/diffing.py :: build_adoption_required_changes` |
| `classify_field_change` | `def classify_field_change(old_desired: Any, live: Any, new_desired: Any) -> str` — 아래 분류표 | `src/domains/gitops/diffing.py :: classify_field_change` |
| `summarize_status` | `def summarize_status(changes: list[JsonObject]) -> str` — 우선순위: `review_required`(conflict 존재) > `adoption_required` > `intended_change` > `drift` > `already_converged` > `no_change` | `src/domains/gitops/diffing.py :: summarize_status` |
| `build_diff_basis` | `def build_diff_basis(*, old_desired: ManagedFieldSnapshot | None, live: ManagedFieldSnapshot, new_desired: ManagedFieldSnapshot, declared_fields: Iterable[str] | None = None, policy_managed_fields: Iterable[str] | None = None, ignored_fields: Iterable[str] | None = None, unknown_fields: Iterable[str] | None = None, policy_source: str = "unset") -> JsonObject` — `Diff.basis` 용 메타(`comparison="managed-field-3way"`, 각 source, observed/declared/policy_managed/ignored/unknown fields 정렬 목록, policy_source) | `src/domains/gitops/diffing.py :: build_diff_basis` |

`classify_field_change` 분류표 (old_desired = 직전 승인된 원하는 값, live = 클러스터 실제 값, new_desired = 새로 렌더된 값):

| 조건 (순서대로 평가) | 분류 |
|---|---|
| `old_desired == MISSING` 이고 `live == new_desired` | `already_converged` |
| `old_desired == MISSING` (위 외) | `adoption_required` |
| `old_desired == live == new_desired` | `no_change` |
| `live == new_desired` | `already_converged` |
| `old_desired == live` | `intended_change` |
| `old_desired == new_desired` | `drift` |
| 그 외 | `conflict_or_manual_change` |

## 데이터 모델 (Data Model)

모든 테이블은 `packages/storage/base.py :: Base` 기반. 컬럼 헬퍼 의미: `text_column()` = `Text NOT NULL`, `jsonb_column()` = `JSONB NOT NULL`, `created_at_column()`/`updated_at_column()` = `TIMESTAMP(timezone=True) NOT NULL server_default=now()`.

### GitRepository — `src/domains/gitops/models.py :: GitRepository`

`__tablename__ = "git_repositories"`, `UniqueConstraint("workspace_id", "repo_ref")`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| repository_id | Text | PK | `derive_repository_id` 로 파생되는 결정적 ID (`repo-<sha256[:32]>`) |
| workspace_id | Text | FK → `workspaces.workspace_id`, NOT NULL | 소속 워크스페이스 |
| provider | Text | NOT NULL | `GitProvider` 값 (`github`) |
| repo_ref | Text | NOT NULL | `owner/name` 축약 저장소 참조 |
| default_branch | Text | NOT NULL | 기본 브랜치 (기본 `main`) |
| credential_ref | Text | nullable | 자격 증명 참조 |
| status | Text | NOT NULL | `RepositoryStatus`: `active` / `invalid_credential` / `disabled` |
| access_policy | JSONB | NOT NULL | 접근 정책 |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | |
| updated_at | TIMESTAMP(tz) | NOT NULL, default now() | |

### WorkspaceCredential — `src/domains/gitops/models.py :: WorkspaceCredential`

`__tablename__ = "workspace_credentials"`, `UniqueConstraint("workspace_id", "provider", "scope")`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| credential_id | Text | PK | `stable_credential_id`로 파생되는 결정적 ID (`cred-<sha256[:32]>`) |
| workspace_id | Text | FK → `workspaces.workspace_id`, NOT NULL | 소속 워크스페이스 |
| provider | Text | NOT NULL | 예: `github` |
| scope | Text | NOT NULL | 예: `github`; `(workspace_id, provider, scope)` 단위로 최신 암호문을 보존 |
| encrypted_value | Text | NOT NULL | `packages.security.credentials.encrypt_credential` 결과. 원문 token은 DB와 응답에 남기지 않는다. |
| status | Text | NOT NULL | 기본 `active` |
| metadata_ | JSONB | NOT NULL, DB 컬럼명 `metadata` | 파이썬 속성명은 `metadata_`(SQLAlchemy 예약어 회피). `/repos/validate`는 `credential_ref`를 담는다. |
| created_at / updated_at | TIMESTAMP(tz) | NOT NULL, default now() | |

### GitWatchTarget — `src/domains/gitops/models.py :: GitWatchTarget`

`__tablename__ = "git_watch_targets"`, `UniqueConstraint("workspace_id", "repository_id", "branch", "manifest_path")`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| watch_target_id | Text | PK | `watch-<sha256[:32]>` |
| workspace_id | Text | FK → `workspaces.workspace_id`, NOT NULL | |
| repository_id | Text | NOT NULL (FK 없음) | 대상 저장소 |
| branch | Text | NOT NULL | 감시 브랜치 |
| manifest_path | Text | NOT NULL | 감시 manifest 경로 |
| interval_seconds | BigInteger | NOT NULL | 폴링 주기(등록 기본 30) |
| last_seen_commit_sha | Text | nullable | 마지막 관측 커밋 |
| last_polled_at | TIMESTAMP(tz) | nullable | 마지막 폴링 시각 |
| status | Text | NOT NULL | `WatchTargetStatus`: `active` / `paused` |
| settings | JSONB | NOT NULL | watch target 설정. `/applications/connect`는 검증된 `source_type`을 `settings.source_type`에 저장해 poller/webhook/render-worker까지 같은 렌더러 선택을 보존한다. |
| created_at / updated_at | TIMESTAMP(tz) | NOT NULL, default now() | |

### DeploymentBinding — `src/domains/gitops/models.py :: DeploymentBinding`

`__tablename__ = "deployment_bindings"`, `UniqueConstraint("workspace_id", "repository_id", "cluster_id", "namespace", "app_name")`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| binding_id | Text | PK | `binding-<sha256[:32]>` |
| workspace_id | Text | FK → `workspaces.workspace_id`, NOT NULL | |
| repository_id | Text | NOT NULL | |
| watch_target_id | Text | nullable | 연결된 감시 대상 |
| cluster_id | Text | NOT NULL | 배포 대상 클러스터 |
| namespace | Text | NOT NULL | 배포 네임스페이스 |
| app_name | Text | NOT NULL | 앱 이름 |
| manifest_path | Text | NOT NULL | |
| environment | Text | NOT NULL | 등록 기본 `sandbox` |
| resource_class | Text | NOT NULL | `ResourceClass`: `application` / `platform` / `system` |
| status | Text | NOT NULL | `DeploymentBindingStatus`: `active` / `paused` / `invalid_config` |
| deploy_policy | JSONB | NOT NULL | 배포 정책(승인 필요 여부 등). workflow-controller 가 해석하는 키: `promotes_to_binding_id`(성공 시 대상 바인딩으로 같은 커밋 승격 재진입), `global: true`(글로벌 서비스 — webhook fan-out·신규 클러스터 자동 합류 대상) |
| access_policy | JSONB | NOT NULL | |
| created_at / updated_at | TIMESTAMP(tz) | NOT NULL, default now() | |

### Application — `src/domains/gitops/models.py :: Application`

`__tablename__ = "applications"`, `UniqueConstraint("workspace_id", "repository_id", "name")`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| application_id | Text | PK | `app-<sha256[:32]>` |
| workspace_id | Text | FK → `workspaces.workspace_id`, NOT NULL | |
| repository_id | Text | NOT NULL | |
| name | Text | NOT NULL | 앱 이름(동명 흡수 dedup 키) |
| manifest_path | Text | NOT NULL | |
| status | Text | NOT NULL | `ApplicationStatus`: `active` / `paused` / `archived` |
| metadata_ | JSONB | NOT NULL, DB 컬럼명 `metadata` | 파이썬 속성명은 `metadata_`(SQLAlchemy 예약어 회피) |
| created_at / updated_at | TIMESTAMP(tz) | NOT NULL, default now() | |

### WorkflowRun — `src/domains/gitops/models.py :: WorkflowRun`

`__tablename__ = "workflow_runs"`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| workflow_run_id | Text | PK | `workflow-<sha256[:32]>` |
| workspace_id | Text | FK → `workspaces.workspace_id`, NOT NULL | |
| application_id | Text | NOT NULL | |
| binding_id | Text | NOT NULL | |
| environment | Text | NOT NULL | |
| cluster_id | Text | NOT NULL | |
| commit_sha | Text | NOT NULL | |
| status | Text | NOT NULL | `WorkflowRunStatus` (아래 상태 머신) |
| current_step | Text | NOT NULL | `WorkflowStepName`: `git`/`render`/`diff`/`policy`/`approval`/`safe_pr`/`apply`/`health` |
| summary | Text | nullable | 종료 요약 |
| command_id | Text | nullable | 연결된 agent command |
| metadata_ | JSONB | NOT NULL, DB 컬럼명 `metadata` | |
| created_at / updated_at | TIMESTAMP(tz) | NOT NULL, default now() | |

### WorkflowRunStep — `src/domains/gitops/models.py :: WorkflowRunStep`

`__tablename__ = "workflow_run_steps"`, `UniqueConstraint("workflow_run_id", "name")`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| step_id | Text | PK | `step-<sha256[:32]>` |
| workflow_run_id | Text | NOT NULL | |
| workspace_id | Text | NOT NULL (FK 없음) | |
| application_id | Text | NOT NULL | |
| binding_id | Text | NOT NULL | |
| environment | Text | NOT NULL | |
| name | Text | NOT NULL | `WorkflowStepName` 값 |
| status | Text | NOT NULL | `WorkflowStepStatus`: `pending`/`running`/`succeeded`/`failed`/`skipped` |
| message | Text | nullable | |
| details | JSONB | NOT NULL | |
| created_at / updated_at | TIMESTAMP(tz) | NOT NULL, default now() | |

### Approval — `src/domains/gitops/models.py :: Approval`

`__tablename__ = "approvals"`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| approval_id | Text | PK | `approval-<sha256[:32]>` (`workflow_run_id|deploy-approval` 기반) |
| workflow_run_id | Text | NOT NULL | |
| workspace_id | Text | NOT NULL (FK 없음) | |
| application_id | Text | NOT NULL | |
| binding_id | Text | NOT NULL | |
| environment | Text | NOT NULL | |
| status | Text | NOT NULL | `ApprovalStatus`: `requested`/`granted`/`rejected`/`expired`/`not_required` |
| reason | Text | NOT NULL | 승인 요청 사유 |
| requested_role | Text | NOT NULL | 기본 `release_operator` |
| requested_by | Text | nullable | |
| decided_by | Text | nullable | 결정자 user_id |
| decision | Text | nullable | `granted` / `rejected` |
| details | JSONB | NOT NULL | `diff`(Diff body), `decision_reason`, `command_requested` 등 |
| expires_at | TIMESTAMP(tz) | nullable | |
| created_at / updated_at | TIMESTAMP(tz) | NOT NULL, default now() | |

### ManifestArtifact — `src/domains/gitops/models.py :: ManifestArtifact`

`__tablename__ = "manifest_artifacts"`, `UniqueConstraint("workspace_id", "binding_id", "commit_sha", "manifest_path", name="ux_manifest_artifacts_workspace_binding_commit_path")`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| artifact_id | Text | PK | `manifest-<sha256[:32]>` |
| workspace_id | Text | FK → `workspaces.workspace_id`, NOT NULL | |
| repository_id | Text | NOT NULL | |
| watch_target_id | Text | nullable | |
| binding_id | Text | NOT NULL | |
| commit_sha | Text | NOT NULL | 렌더 기준 커밋 |
| manifest_path | Text | NOT NULL | 멀티 문서는 `"{path}#<suffix>"` 형식 사용 |
| status | Text | NOT NULL | `ManifestArtifactStatus`: `rendered` / `invalid_config` |
| status_reason | Text | nullable | invalid 사유 |
| rendered_manifest | JSONB | nullable | 렌더 결과(RenderedManifest 직렬화) |
| source_summary | JSONB | NOT NULL | `renderer_version` 포함(캐시 검증 키) |
| created_at / updated_at | TIMESTAMP(tz) | NOT NULL, default now() | |

### RepoChange — `src/domains/gitops/models.py :: RepoChange`

`__tablename__ = "repo_changes"` (append-only 이력)

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | |
| workspace_id | Text | NOT NULL (FK 없음) | |
| correlation_id | Text | NOT NULL | 이벤트 correlation |
| commit_sha | Text | NOT NULL | |
| repository_id | Text | nullable | |
| watch_target_id | Text | nullable | |
| binding_id | Text | nullable | |
| manifest_path | Text | nullable | |
| manifest | JSONB | NOT NULL | 관측된 manifest 내용 |
| created_at | TIMESTAMP(tz) | NOT NULL, default now() | |

## 이벤트 (Events)

이벤트 body 는 전부 `src/domains/gitops/events.py` 에 정의되고 `packages/contracts/event_bus/registry.py :: event` 데코레이터로 subject 에 등록된다([contracts](../packages/contracts.md), [events](../packages/events.md)). 라우팅 키 = `EventSubject` 값 문자열. 기본값에 쓰이는 상수: `DEFAULT_WORKSPACE_ID = "default"`, `DEFAULT_REPOSITORY_ID`/`DEFAULT_WATCH_TARGET_ID`/`DEFAULT_DEPLOYMENT_BINDING_ID`/`DEFAULT_APPLICATION_ID`/`DEFAULT_WORKFLOW_RUN_ID`/`DEFAULT_REPO_REF` = `""`, `DEFAULT_ENVIRONMENT = "sandbox"`, `DEFAULT_REPO_BRANCH = "main"`, `DEFAULT_MANIFEST_PATH = "deploy.yaml"`, `Target.DEFAULT_CLUSTER_ID = "default-target-cluster"`.

### 값 객체 (이벤트 body 내포용, subject 없음)

- `src/domains/gitops/events.py :: Manifest` — sandbox 동기화용 배포 사양: `app: str`, `image: str`, `replicas: int`, `namespace: str`, `manifest_path: str = DEFAULT_MANIFEST_PATH`.
- `src/domains/gitops/events.py :: RenderedMetadata` — `name: str`, `namespace: str`.
- `src/domains/gitops/events.py :: RenderedSpec` — `replicas: int = 0`, `image: str = ""`.
- `src/domains/gitops/events.py :: RenderedManifest` — `api_version: str`(wire 이름 `apiVersion`, `payload_name` metadata), `kind: str`, `metadata: RenderedMetadata`, `spec: RenderedSpec`, `resource_class: str = "application"`, `manifest: JsonObject = {}`(전체 렌더 객체), `declared_fields: list[str] = []`, `managed_fields: list[str] = []`, `ignored_fields: list[str] = []`, `last_approved_snapshot: JsonObject = {}`, `artifact_digest: str = ""`.
- `src/domains/gitops/events.py :: Diff` — 필드: `resource: str`, `namespace: str`, `desired_image: str`, `actual_image: str`, `risk: RiskLevel`, `workspace_id: str = "default"`, `repository_id: str = ""`, `watch_target_id: str = ""`, `binding_id: str = ""`, `application_id: str = ""`, `workflow_run_id: str = ""`, `environment: str = "sandbox"`, `cluster_id: str = "default-target-cluster"`, `manifest_path: str = "deploy.yaml"`, `resource_class: str = "application"`, `desired_manifest: JsonObject = {}`, `status: str = "legacy_image_diff"`, `has_changes: bool = True`, `changes: list[dict[str, object]] = []`, `basis: JsonObject = {}`.
  - `__post_init__`: wire 재구성(from_body) 시 str 로 들어온 `risk`를 `RiskLevel` 로 강제 변환.
  - `def is_image_only_noop(self) -> bool` — `desired_image` 가 비어있지 않고 `desired_image == actual_image` 이며 `desired_manifest` 가 빈 경우 True(legacy image-only no-op 판정). 앵커: `src/domains/gitops/events.py :: Diff.is_image_only_noop`
  - `RiskLevel` 값(`packages/config/constants.py :: RiskLevel`): `sandbox-only` / `non-sandbox-namespace` / `review-required`.

### 등록 이벤트 (subject 별)

이 도메인이 body 를 정의하고, HTTP 라우터가 직접 발행하는 것은 3개(`git.webhook.received`, `approval.granted`, `approval.rejected`), 나머지는 `src/services/gitops/*` 워커들이 발행/구독한다.

| subject (라우팅 키) | body 클래스 | 필드 (타입, 기본값) | 앵커 |
|---|---|---|---|
| `git.webhook.received` | `GitWebhookReceivedBody` | `commit_sha: str`, `image: str`, `replicas: int`, `workspace_id: str = "default"`, `repository_id: str = ""`, `repo_ref: str = ""`, `branch: str = "main"`, `watch_target_id: str = ""`, `binding_id: str = ""`, `application_id: str = ""`, `workflow_run_id: str = ""`, `environment: str = "sandbox"`, `cluster_id: str = "default-target-cluster"`, `manifest_path: str = "deploy.yaml"`, `source_type: str = ""`, `force: bool = False` | `src/domains/gitops/events.py :: GitWebhookReceivedBody` |
| `git.changed` | `GitChangedBody` | `GitWebhookReceivedBody` 와 동일하되 `force` 없음: `commit_sha: str`, `image: str`, `replicas: int`, `workspace_id`, `repository_id`, `repo_ref`, `branch`, `watch_target_id`, `binding_id`, `application_id`, `workflow_run_id`, `environment`, `cluster_id`, `manifest_path`, `source_type` (기본값 동일) | `src/domains/gitops/events.py :: GitChangedBody` |
| `manifest.rendered` | `ManifestRenderedBody` | `rendered_manifest: RenderedManifest`, `workspace_id: str = "default"`, `repository_id: str = ""`, `watch_target_id: str = ""`, `binding_id: str = ""`, `application_id: str = ""`, `workflow_run_id: str = ""`, `environment: str = "sandbox"`, `cluster_id: str = "default-target-cluster"`, `commit_sha: str = ""`, `manifest_path: str = "deploy.yaml"` | `src/domains/gitops/events.py :: ManifestRenderedBody` |
| `manifest.invalid` | `ManifestInvalidBody` | `workspace_id: str`, `repository_id: str`, `watch_target_id: str`, `binding_id: str`, `commit_sha: str`, `manifest_path: str`, `reason: str` (전부 필수), `application_id: str = ""`, `workflow_run_id: str = ""`, `environment: str = "sandbox"`, `cluster_id: str = "default-target-cluster"` | `src/domains/gitops/events.py :: ManifestInvalidBody` |
| `desired.diff.detected` | `DesiredDesiredDiffDetectedBody` | `diff: Diff` | `src/domains/gitops/events.py :: DesiredDesiredDiffDetectedBody` |
| `diff.analyzed` | `DiffAnalyzedBody` | `diff: Diff`, `safe: bool`, `risk: str`, `reason: str` | `src/domains/gitops/events.py :: DiffAnalyzedBody` |
| `workflow.created` | `WorkflowCreatedBody` | `workspace_id: str = "default"`, `application_id: str = ""`, `workflow_run_id: str = ""`, `repository_id: str = ""`, `watch_target_id: str = ""`, `binding_id: str = ""`, `environment: str = "sandbox"`, `cluster_id: str = "default-target-cluster"`, `commit_sha: str = ""`, `manifest_path: str = "deploy.yaml"` | `src/domains/gitops/events.py :: WorkflowCreatedBody` |
| `workflow.run.started` | `WorkflowRunStartedBody` | `workflow_run_id: str`, `application_id: str` (필수), `workspace_id: str = "default"`, `repository_id: str = ""`, `watch_target_id: str = ""`, `binding_id: str = ""`, `environment: str = "sandbox"`, `cluster_id: str = "default-target-cluster"`, `commit_sha: str = ""`, `manifest_path: str = "deploy.yaml"`, `status: str = "started"`, `current_step: str = "git"` | `src/domains/gitops/events.py :: WorkflowRunStartedBody` |
| `workflow.step.recorded` | `WorkflowStepRecordedBody` | `workflow_run_id: str`, `application_id: str`, `step: str`, `status: str` (필수), `workspace_id: str = "default"`, `binding_id: str = ""`, `environment: str = "sandbox"`, `message: str | None = None`, `details: dict[str, object] = {}` | `src/domains/gitops/events.py :: WorkflowStepRecordedBody` |
| `approval.requested` | `ApprovalRequestedBody` | `approval_id: str`, `workflow_run_id: str`, `application_id: str`, `reason: str` (필수), `workspace_id: str = "default"`, `binding_id: str = ""`, `environment: str = "sandbox"`, `requested_role: str = "release_operator"`, `details: dict[str, object] = {}` | `src/domains/gitops/events.py :: ApprovalRequestedBody` |
| `approval.granted` | `ApprovalGrantedBody` | `approval_id: str`, `workflow_run_id: str`, `application_id: str` (필수), `workspace_id: str = "default"`, `binding_id: str = ""`, `environment: str = "sandbox"`, `decided_by: str | None = None`, `decision: str = "granted"`, `details: dict[str, object] = {}` | `src/domains/gitops/events.py :: ApprovalGrantedBody` |
| `approval.rejected` | `ApprovalRejectedBody` | `approval_id: str`, `workflow_run_id: str`, `application_id: str`, `reason: str` (필수), `workspace_id: str = "default"`, `binding_id: str = ""`, `environment: str = "sandbox"`, `decided_by: str | None = None`, `details: dict[str, object] = {}` | `src/domains/gitops/events.py :: ApprovalRejectedBody` |
| `workflow.run.completed` | `WorkflowRunCompletedBody` | `workflow_run_id: str`, `application_id: str` (필수), `workspace_id: str = "default"`, `binding_id: str = ""`, `environment: str = "sandbox"`, `summary: str = "workflow succeeded"`, `details: dict[str, object] = {}` | `src/domains/gitops/events.py :: WorkflowRunCompletedBody` |
| `workflow.run.failed` | `WorkflowRunFailedBody` | `workflow_run_id: str`, `application_id: str`, `reason: str` (필수), `workspace_id: str = "default"`, `binding_id: str = ""`, `environment: str = "sandbox"`, `details: dict[str, object] = {}` | `src/domains/gitops/events.py :: WorkflowRunFailedBody` |

### 발행 (Publishes) — 이 도메인의 라우터가 직접 발행

| 이벤트 | 발행 위치 | 조건 |
|---|---|---|
| `git.webhook.received` (`GitWebhookReceivedBody`) | `github_webhook` | HMAC 검증 통과 후 표준 body로 검증되거나, raw GitHub `push`/merge된 `pull_request`가 active poll target과 매칭될 때 `events.accept_body` |
| `approval.granted` (`ApprovalGrantedBody`) | `grant_approval` | 원자 UPDATE 성공 시에만, `Actor(current.user_id, tuple(current.roles))` 로 발행. `details` 에 `decision_reason`·`command_requested`(=`CommandRequestedBody.to_body()`) 포함 |
| `approval.rejected` (`ApprovalRejectedBody`) | `reject_approval` | 원자 UPDATE 성공 시에만, `details` 에 `decision_reason` 포함 |

### 구독 (Consumes)

도메인 계층은 이벤트를 직접 구독하지 않는다. 위 등록 이벤트들의 실제 발행/구독 주체는 `src/services/gitops/*` 워커·`src/services/target/drift-worker`·`src/services/gateway/api-gateway` (해당 서비스 스펙 참조).

## 동작 (Behavior)

### 1. GitHub webhook 수신 (`POST /github/webhook`)

1. 라우터 의존성 `verify_github_signature`: `GITHUB_WEBHOOK_SECRET` env 미설정 → 503 `"webhook secret not configured"`; 원시 body 에 대한 `sha256=<HMAC-SHA256(secret, body)>` 를 `x-hub-signature-256` 헤더와 `hmac.compare_digest` 비교, 불일치/누락 → 401 `"invalid webhook signature"`. fail-closed.
2. 본문이 `GitHubWebhookRequest` 로 바로 검증되면 `build_git_webhook_body` 로 `GitWebhookReceivedBody` 1개를 만든다. `source_type`을 포함한 요청 body 필드는 `payload.model_dump()` 그대로 보존한다.
3. 표준 body 검증이 실패하면 `x-github-event` 기준으로 raw GitHub payload를 해석한다. `push`는 `ref=refs/heads/<branch>`와 `after` commit을 사용하고, `pull_request`는 `action="closed"`, `merged=true`일 때 base branch와 `merge_commit_sha`를 사용한다.
4. raw payload는 `repository.full_name` + branch로 `db.list_active_github_poll_targets(limit=1000)` 결과를 매칭한다. 매칭 target마다 `body_for_poll_target`이 workspace/repository/watch/binding/application/environment/cluster/manifest/source_type 좌표를 복원하고 `replicas=DEFAULT_WEBHOOK_REPLICAS`, `image=GITOPS_WEBHOOK_IMAGE`로 `GitWebhookReceivedBody`를 만든다. raw GitHub payload는 `force`를 설정하지 않아 기본값 `False`를 사용하고, 명시적 typed internal payload만 요청 body로 `force=True`를 전달할 수 있다.
5. raw deployable change인데 `GITOPS_WEBHOOK_IMAGE`가 비어 있으면 503 `"gitops webhook image not configured"`로 fail-closed한다. deployable change가 아니거나 매칭 target이 없으면 이벤트를 만들지 않고 202 `{"accepted": true, "ignored": true, "reason": "no deployable git change"}`를 반환한다.
6. 생성된 body가 1개 이상이면 각각 `events.accept_body`로 스테이징하고, 첫 accepted event 기준 `AcceptedEventResponse(accepted=True, event_id, correlation_id, event=<이벤트 dict>)`를 반환한다.

### 2. 승인 grant/reject (`POST /approvals/{approval_id}/grant|reject`)

1. `require_session` 으로 현재 사용자 확인, `workspace_id = current.workspace_id` (없으면 `"default"`).
2. `approval_record_or_404` — `get_workflow_approval` 로 조회, 없으면 404.
3. `ensure_approval_is_open` — status ∉ {`requested`, `not_required`} 면 409.
4. `approval_diff` — `details["diff"]` 를 `Diff.from_body` 로 복원, Mapping 아니면 409 `"approval diff is missing"`.
5. `require_approval_deploy_access` — `diff.cluster_id`(빈 값이면 `default-target-cluster`)에 대한 `deploy.run` 권한 검사, 실패 시 `"approval access denied"`.
6. grant 의 경우 `approval_command_request` 로 `CommandRequestedBody` 구성: `cluster_id=diff.cluster_id or Target.DEFAULT_CLUSTER_ID`, `action=Command.APPLY_MANIFEST_ACTION("apply_manifest")`, `namespace=diff.namespace or Sandbox.NAMESPACE("sandbox")`, `reason=payload.reason or "approval granted"`, `approval_ref=approval_id`, `policy_decision_ref=f"approval:{approval_id}:granted"`.
7. `unit_of_work_or_null(db)` 트랜잭션 안에서:
   - `resolve_approval_or_409` → `resolve_workflow_approval_if_open` 원자 UPDATE(open 검사+갱신 단일 문장). 실패(이미 해결) 시 409 — 동시 grant/reject 중 첫 요청만 성공.
   - 성공 시에만 `ApprovalGrantedBody` / `ApprovalRejectedBody` 를 `events.accept_body` 로 스테이징. 스테이징 실패 시 해결도 롤백 → "해결됐지만 후속 이벤트 없는" 고아 승인 방지.
8. `AcceptedResponse` 반환.

### 3. 워크플로 상태 머신 (`WorkflowRunStatus`)

상태 전이 순위(`WORKFLOW_STATUS_RANKS`) — 같은 순위 재기록은 허용(멱등 재갱신), 순위 하락(회귀)은 차단:

| 상태 | 순위 | 비고 |
|---|---|---|
| `started` | 1 | 시작(current_step 기본 `git`) |
| `rendering` | 2 | manifest 렌더 중 |
| `diffing` | 3 | diff 계산 중 |
| `policy_checking` | 4 | 정책 검사 중 |
| `waiting_for_approval` | 5 | 승인 대기 |
| `applying` | 6 | 적용 중 |
| `rollout_waiting` | 7 | 롤아웃 대기 |
| `succeeded` | 8 | **종결** — 이후 어떤 갱신도 불가 |
| `failed` | 8 | **종결** — 어느 단계에서도 도달 가능(최고 순위) |

전이 규칙(`workflow_transition_guard`): `현재 status ∉ {succeeded, failed}` AND `rank(현재) <= rank(새 상태)`. 미등록 상태 문자열의 순위는 0. 이 가드는 `start_workflow_run`(upsert 갱신 분기), `update_workflow_run`, `update_workflow_run_for_command` 의 status 변경에 적용되어, 재배달·지연 이벤트가 `SUCCEEDED→APPLYING` 같은 회귀를 일으키지 못하게 한다.

### 4. 승인 레코드 상태 머신 (`ApprovalStatus`)

- 열린 상태: `requested`, `not_required` (`OPEN_APPROVAL_STATUSES`).
- 닫힌 상태: `granted`, `rejected`, `expired`.
- 전이: `requested|not_required → granted|rejected` 는 `resolve_workflow_approval_if_open` 원자 UPDATE 로만(동시 결정 중 하나만 성공). `request_workflow_approval` 의 upsert 도 `WHERE status IN OPEN` 가드로 닫힌 승인을 되돌리지 못한다. `expired` 로의 전이 로직은 이 도메인에는 없다(스키마·enum 만 존재).

### 5. 리소스 등록 및 소유권 부여

`register_repository` / `register_deployment_binding` / `upsert_application` 은 payload 에 `user_id` 가 있으면 `_grant_owner_if_present` 를 통해 해당 리소스(`AccessResourceType.REPOSITORY|DEPLOYMENT_BINDING|APPLICATION`)에 `ResourceRole.CLUSTER_STEWARD`(`"cluster_steward"`) 롤을 부여한다. 부여는 `self.grant_resource_access` 가 존재할 때만 수행(`getattr` duck-typing) — 이 메서드는 `RepoChangeRepository` 자체가 아니라 합성된 DB 파사드의 identity repository 가 제공한다([identity](./identity.md)).

### 6. managed-field 3-way diff

diff-worker 가 (a) 직전 승인 스냅샷(old_desired), (b) live 객체, (c) 새 렌더 결과(new_desired)를 각각 `snapshot_from_kubernetes_object`/`snapshot_from_rendered_manifest` 로 스냅샷 → `apply_field_policy` 로 정책(managed/ignored) 적용 → `compare_managed_fields` 로 필드별 분류 → `summarize_status` 로 전체 status 요약 → `build_diff_basis` 결과를 `Diff.basis` 에, changes 를 `Diff.changes` 에 실어 `desired.diff.detected` 를 만든다. 지원 kind 는 `Deployment`/`Service`/`ConfigMap` 이며 그 외 kind 의 관리 필드는 빈 dict(비교 대상 없음).

## 불변식·오류 (Invariants & Errors)

- **웹훅 fail-closed**: 시크릿 미설정(503)·서명 불일치/누락(401)이면 파이프라인이 절대 열리지 않는다. 서명 비교는 `hmac.compare_digest`(타이밍 안전).
- **웹훅 raw fast-path**: raw GitHub payload는 deployable `push`/merge된 `pull_request`이면서 repo+branch가 active poll target에 매칭될 때만 `git.webhook.received`로 변환된다. 단순 PR open/update, branch delete, target 미매칭은 202 ignored로 끝난다.
- **워크플로 상태 회귀 금지**: 종결 상태(`succeeded`/`failed`)는 어떤 값으로도 갱신 불가, 비종결 상태는 순위가 같거나 높은 상태로만 갱신. 위반 시도는 오류가 아니라 무시(UPDATE 0건)된다.
- **승인 단일 해결**: 열린 승인은 정확히 한 번만 해결된다(원자 UPDATE). 두 번째 이후 결정 요청은 409 `"approval already resolved"`. 라우터의 open 판정 집합(`{"requested", "not_required"}`)은 `OPEN_APPROVAL_STATUSES` 와 항상 동일해야 한다(코드 주석으로 강제되는 계약).
- **승인 해결과 이벤트의 원자성**: 해결 UPDATE 와 후속 이벤트 스테이징은 한 트랜잭션(`unit_of_work_or_null`) — 둘 중 하나만 반영되는 상태 없음.
- **결정적 ID**: 모든 `derive_*` ID 는 입력이 같으면 항상 같다. 명시 ID 는 기본값(`""`)이 아닐 때만 존중된다.
- **애플리케이션 dedup**: `(workspace_id, repository_id, name)` 이 같으면 다른 `application_id` 로 들어와도 기존 ID 로 흡수하고 `application_id_merged_by_name` 경고를 남긴다.
- **manifest 아티팩트 캐시 유효성**: `find_rendered_manifest_artifacts` 는 `source_summary.renderer_version` 이 요청된 버전과 일치하는 것만 반환 — 렌더러 버전이 바뀌면 캐시 미스.
- **Diff.risk 타입 강제**: wire 에서 str 로 역직렬화된 위험도는 `__post_init__` 에서 `RiskLevel` 로 변환된다. 유효하지 않은 값이면 `ValueError`.
- HTTP 오류 요약: 404 `"approval not found"` / 409 `"approval already resolved"`·`"approval diff is missing"` / 403(권한, `require_cluster_access` 내부) `"approval access denied"` / 401 `"invalid webhook signature"` / 503 `"webhook secret not configured"`.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `GITHUB_WEBHOOK_SECRET` (`WEBHOOK_SECRET_ENV`) | str | `""` (미설정 시 웹훅 503 거부) | GitHub webhook HMAC-SHA256 서명 검증 시크릿. `packages/config/settings.py :: env` 로 조회 ([config](../packages/config.md)) |
| `GITOPS_WEBHOOK_IMAGE` (`GITOPS_WEBHOOK_IMAGE_ENV`) | str | `""` | raw GitHub payload fast-path에서 `GitWebhookReceivedBody.image`에 넣는 배포 이미지. deployable raw change가 들어왔는데 비어 있으면 503. |
