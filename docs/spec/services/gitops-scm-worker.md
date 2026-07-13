---
source_commit: 9af57b639
status: synced
---

# scm-worker — `safe_pr.ready_for_creation`을 받아 GitHub REST로 실제 PR을 만들고 `safe_pr.created` / `safe_pr.failed`를 발행하는 outbound 워커

> 소스: `src/services/gitops/scm-worker/` (`app.py`, `github_provider.py`)

## 책임 (Responsibility)

- `safe_pr.ready_for_creation` 이벤트 1종을 구독해, 내장된 원 요청(`SafePrRequestedBody`)을 정규화·preflight 재검증한 뒤 GitHub REST API로 브랜치 생성 → 변경 문서/패치 커밋 → PR 생성을 수행한다.
- 성공 시 `pull_request` 저장 + `safe_pr.created` 발행, 요청에 `next_alert`가 있으면 이어서 `alert.requested`도 발행한다.
- 실패 시 `safe_pr.failed`(stage=`scm`) 발행.
- 같은 `workflow_run_id` 이벤트 재전달(redelivery)에 멱등: 브랜치/파일/PR 생성 422 충돌 시 기존 리소스를 재사용한다.
- `.gitops/safe-pr/patches/*.yaml` structured plan은 workflow/diff/provenance와 다시 대조하고,
  exact base SHA에서 읽은 원문의 허용 scalar span만 수정한다. forward의 exact inverse
  rollback plan은 변경 문서에 함께 보존한다.
- 하지 않는 것: 요청 준비 게이트(그건 [safe-pr-worker](gitops-safe-pr-worker.md)), diff 설명, 워크플로 상태 기록([workflow-controller](gitops-workflow-controller.md)).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.providers.catalog` | [providers 도메인](../domains/providers.md) | `ProviderCategory`, `require_available_provider` — provider registry 검증 |
| import | `domains.scm.events` | [scm 도메인](../domains/scm.md) | `SafePrCreatedBody`, `SafePrFailedBody`, `SafePrReadyForCreationBody`, `SafePrRequestedBody` |
| import | `domains.scm.pipeline` | [scm 도메인](../domains/scm.md) | `normalize_safe_pr_request` |
| import | `domains.scm.policy` | [scm 도메인](../domains/scm.md) | `DefaultSafePrPreflightPolicy`, `SafePrPolicyResult`, `safe_pr_failed_body`, `STAGE_SCM`, `REASON_PROVIDER_ERROR/MISMATCH`, `MESSAGE_PROVIDER_ERROR/MISMATCH`, `CHANGE_DOCUMENT_DIR`, `normalize_repo_path`, `validate_request_paths` |
| import | `packages.config.settings` | [config 패키지](../packages/config.md) | `env` |
| import | `packages.contracts.event_bus.bodies` | [contracts 패키지](../packages/contracts.md) | `EventBody` |
| import | `packages.contracts.scm.provider` | [contracts 패키지](../packages/contracts.md) | `ScmProvider` Protocol |
| import | `packages.contracts.gitops` | [contracts 패키지](../packages/contracts.md) | `DEFAULT_GITHUB_API_BASE`, `GITHUB_API_BASE_ENV`, `GITHUB_TOKEN_ENV`, `GITHUB_TOKEN_REF_ENV` |
| import | `packages.contracts.security`, `packages.security` | [security 패키지](../packages/security.md) | `SecretRef`, `TokenVaultPort`, `SecretNotFound`, `build_token_vault` |
| import | `packages.contracts.stores` | [contracts 패키지](../packages/contracts.md) | `PullRequestStore` (ctx.db 능력) |
| import | `packages.runtime.app`, `packages.runtime.outbound` | [runtime 패키지](../packages/runtime.md) | `App`, `EventContext`, `deliver` |
| import | `httpx` | — | GitHub REST 비동기 클라이언트 |
| 구독 | `safe_pr.ready_for_creation` | — | 입력 이벤트 |
| 발행 | `safe_pr.created`, `safe_pr.failed`, (조건부) `alert.requested` | [workflow-controller](gitops-workflow-controller.md) / [alert 도메인](../domains/alert.md) 소비 | 출력 이벤트 |
| 외부 | GitHub REST API | — | 아래 [외부 호출 명세](#외부-호출-github-rest) |

## 공개 인터페이스 (Public API)

### `src/services/gitops/scm-worker/app.py`

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `app` | `App("scm-worker")` | `src/services/gitops/scm-worker/app.py :: app` |
| `SCM_PROVIDER_ENV` | `"SCM_PROVIDER"` | `src/services/gitops/scm-worker/app.py :: SCM_PROVIDER_ENV` |
| `DEFAULT_SCM_PROVIDER` | `"github"` | `src/services/gitops/scm-worker/app.py :: DEFAULT_SCM_PROVIDER` |
| `SCM_CREATE_PR_DEADLINE_SECONDS_ENV` | `"SCM_CREATE_PR_DEADLINE_SECONDS"` | `src/services/gitops/scm-worker/app.py :: SCM_CREATE_PR_DEADLINE_SECONDS_ENV` |
| `DEFAULT_SCM_CREATE_PR_DEADLINE_SECONDS` | `"20"` | `src/services/gitops/scm-worker/app.py :: DEFAULT_SCM_CREATE_PR_DEADLINE_SECONDS` |
| `PR_MODE` | `"github_rest"` — `safe_pr.created.mode` 값 | `src/services/gitops/scm-worker/app.py :: PR_MODE` |
| `UNSUPPORTED_SCM_PROVIDER_MESSAGE` | `f"{SCM_PROVIDER_ENV} 값이 provider registry 지원 목록에 없음"` | `src/services/gitops/scm-worker/app.py :: UNSUPPORTED_SCM_PROVIDER_MESSAGE` |
| `build_scm_provider` | `def build_scm_provider(name: str \| None = None) -> ScmProvider` | `src/services/gitops/scm-worker/app.py :: build_scm_provider` |
| `ACTIVE_SCM_PROVIDER` | 모듈 로드 시 `env("SCM_PROVIDER", "github").strip().lower() or "github"` | `src/services/gitops/scm-worker/app.py :: ACTIVE_SCM_PROVIDER` |
| `SCM_PROVIDER` | `ScmProvider = build_scm_provider()` (모듈 로드 시 생성) | `src/services/gitops/scm-worker/app.py :: SCM_PROVIDER` |
| `PREFLIGHT_POLICY` | `DefaultSafePrPreflightPolicy()` | `src/services/gitops/scm-worker/app.py :: PREFLIGHT_POLICY` |
| `create_safe_pr` | `async def create_safe_pr(evt: SafePrRequestedBody, ctx: EventContext[PullRequestStore]) -> str` | `src/services/gitops/scm-worker/app.py :: create_safe_pr` |
| `create_pr_deadline_seconds` | `def create_pr_deadline_seconds() -> float` | `src/services/gitops/scm-worker/app.py :: create_pr_deadline_seconds` |
| `preflight_failure_body` | `def preflight_failure_body(request: SafePrRequestedBody) -> SafePrFailedBody \| None` | `src/services/gitops/scm-worker/app.py :: preflight_failure_body` |
| `provider_failure_body` | `def provider_failure_body(request: SafePrRequestedBody, exc: Exception) -> SafePrFailedBody` | `src/services/gitops/scm-worker/app.py :: provider_failure_body` |
| `on_safe_pr_ready_for_creation` | `@app.on(SafePrReadyForCreationBody)`<br>`async def on_safe_pr_ready_for_creation(evt: SafePrReadyForCreationBody, ctx: EventContext[PullRequestStore]) -> AsyncIterator[EventBody]` | `src/services/gitops/scm-worker/app.py :: on_safe_pr_ready_for_creation` |

`build_scm_provider` 규칙: `require_available_provider(ProviderCategory.SOURCE, provider)`로 registry 검증(`ValueError` 계열 `UnknownProvider`/`ProviderUnavailable`을 `RuntimeError`로 변환). `definition.key == "github"`이면 `GithubScmProvider()` 반환, 그 외 available provider는 `RuntimeError("... adapter binding is missing ...")`.

### `src/services/gitops/scm-worker/github_provider.py`

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `SCM_REPO_ENV` | `"SCM_REPO"` — PR 대상 저장소 `"owner/repo"` | `src/services/gitops/scm-worker/github_provider.py :: SCM_REPO_ENV` |
| `SCM_BASE_BRANCH_ENV` / `DEFAULT_SCM_BASE_BRANCH` | `"SCM_BASE_BRANCH"` / `"main"` | `src/services/gitops/scm-worker/github_provider.py :: SCM_BASE_BRANCH_ENV` |
| `SCM_HTTP_TIMEOUT_SECONDS_ENV` / `DEFAULT_SCM_HTTP_TIMEOUT_SECONDS` | `"SCM_HTTP_TIMEOUT_SECONDS"` / `"10"` | `src/services/gitops/scm-worker/github_provider.py :: SCM_HTTP_TIMEOUT_SECONDS_ENV` |
| `PR_STATUS_CREATED` | `"created"` — `save_pull_request` status | `src/services/gitops/scm-worker/github_provider.py :: PR_STATUS_CREATED` |
| `BRANCH_PREFIX` | `"gitops"` | `src/services/gitops/scm-worker/github_provider.py :: BRANCH_PREFIX` |
| `CONFLICT_STATUS` / `OK_STATUS` | `422` / `200` | `src/services/gitops/scm-worker/github_provider.py :: CONFLICT_STATUS` |
| `PATCH_COMMIT_MESSAGE_PREFIX` | `"Apply manifest patch"` | `src/services/gitops/scm-worker/github_provider.py :: PATCH_COMMIT_MESSAGE_PREFIX` |
| `MISSING_GITHUB_CONFIG_MESSAGE` | GitHub 자격 증명/저장소 미설정 안내 메시지 | `src/services/gitops/scm-worker/github_provider.py :: MISSING_GITHUB_CONFIG_MESSAGE` |
| `MISSING_EXISTING_PR_MESSAGE` | `"GitHub 가 PR 생성을 거부(422)했지만 head 브랜치의 기존 open PR 을 찾지 못함"` | `src/services/gitops/scm-worker/github_provider.py :: MISSING_EXISTING_PR_MESSAGE` |
| `branch_name` | `def branch_name(request: SafePrRequestedBody) -> str` — `f"gitops/{request.workflow_run_id}"` | `src/services/gitops/scm-worker/github_provider.py :: branch_name` |
| `change_document_path` | `def change_document_path(request: SafePrRequestedBody) -> str` — `f".gitops/safe-pr/{request.workflow_run_id}.md"` | `src/services/gitops/scm-worker/github_provider.py :: change_document_path` |
| `change_document` | `def change_document(request: SafePrRequestedBody) -> str` — 제목/본문/manifest_path/workflow_run_id/environment/Approval/Files 섹션 마크다운 | `src/services/gitops/scm-worker/github_provider.py :: change_document` |
| `contents_api_path` | `def contents_api_path(repo: str, path: str) -> str` — `f"/repos/{repo}/contents/{quote(normalize_repo_path(path), safe='/')}"` | `src/services/gitops/scm-worker/github_provider.py :: contents_api_path` |
| `GithubScmProvider` | 아래 참조 | `src/services/gitops/scm-worker/github_provider.py :: GithubScmProvider` |

```python
class GithubScmProvider:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None,
                 token_vault: TokenVaultPort | None = None) -> None
    async def create_pull_request(self, request: SafePrRequestedBody,
                                  ctx: EventContext[PullRequestStore]) -> str
    def github_token(self) -> str
    def client(self, token: str) -> httpx.AsyncClient
    async def base_branch_sha(self, client, repo: str, base_branch: str) -> str
    async def ensure_branch(self, client, repo: str, branch: str, base_sha: str) -> None
    async def put_change_document(self, client, repo: str, branch: str, request) -> None
    async def put_manifest_patches(self, client, repo: str, branch: str, request) -> None
    async def put_content_file(self, client, repo: str, branch: str, *, path: str, message: str, content: str) -> None
    async def create_or_reuse_pr(self, client, repo: str, branch: str, base_branch: str, request) -> str
```

앵커: `src/services/gitops/scm-worker/github_provider.py :: GithubScmProvider.create_pull_request` 등 각 메서드명 동일.

`github_token()`: `env("GITHUB_TOKEN_REF", "GITHUB_TOKEN").strip() or "GITHUB_TOKEN"`을 `SecretRef`로 만들어 `token_vault.read_token` (기본 vault는 `build_token_vault()`).

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키(NATS subject) | body | 앵커 |
|---|---|---|---|
| `SafePrReadyForCreationBody` | `safe_pr.ready_for_creation` | `request: SafePrRequestedBody`(원 요청), `summary: str`, `risk: str`, `details: dict[str, object] = {}`, `workspace_id: str = "default"` | `src/domains/scm/events.py :: SafePrReadyForCreationBody` |

### 발행 (Publishes)

| 이벤트 | 라우팅 키(NATS subject) | body | 앵커 |
|---|---|---|---|
| `SafePrCreatedBody` | `safe_pr.created` | `pr_url: str`, `provider: str`, `mode: str = "github_rest"`, `workspace_id`, `repository_id`, `binding_id`, `application_id`, `workflow_run_id`, `environment` | `src/domains/scm/events.py :: SafePrCreatedBody` |
| `SafePrFailedBody` | `safe_pr.failed` | `provider`, `title`, `reason`, `workspace_id`, `repository_id`, `binding_id`, `application_id`, `workflow_run_id`, `environment`, `reason_code`, `stage`(이 워커에서는 `"scm"`), `details` | `src/domains/scm/events.py :: SafePrFailedBody` |
| `AlertRequestedBody` (조건부) | `alert.requested` | `request.next_alert` 그대로 — PR 생성 성공 직후에만 발행 | `src/domains/alert/events.py :: AlertRequestedBody` |

## 데이터 모델 (Data Model)

`ctx.db`는 `PullRequestStore`(`src/packages/contracts/stores.py :: PullRequestStore`):

```python
async def save_pull_request(self, correlation_id: str, pr_url: str, title: str, body: str, status: str) -> None
```

PR 생성 성공 시 `save_pull_request(ctx.correlation_id, pr_url, request.title, request.body, "created")` 1회 호출.

## 동작 (Behavior)

`on_safe_pr_ready_for_creation(evt, ctx)` 처리 순서:

1. `request = normalize_safe_pr_request(evt.request)` — 식별자 파생 채움 (`src/domains/scm/pipeline.py :: normalize_safe_pr_request`).
2. **preflight**: `preflight_failure_body(request)` —
   - `request.provider != ACTIVE_SCM_PROVIDER` → `safe_pr.failed` (reason_code=`provider_mismatch`, stage=`scm`, details에 `event_provider`/`worker_provider`) yield 후 종료.
   - `PREFLIGHT_POLICY.evaluate(request)` 불통과([safe-pr-worker](gitops-safe-pr-worker.md)와 동일 규칙: `missing_patches` / `unsafe_repository_path`) → `safe_pr_failed_body(request, preflight, stage="scm")` yield 후 종료.
3. **외부 호출**: `deliver(call, ok, fail)` (`src/packages/runtime/outbound.py :: deliver`) 패턴 —
   - `call`: `asyncio.wait_for(create_safe_pr(request, ctx), create_pr_deadline_seconds())` — 전체 데드라인 기본 20초 (worker handler timeout보다 짧게 유지).
   - `create_safe_pr`: provider 불일치면 `RuntimeError`(방어적 재확인), 아니면 `SCM_PROVIDER.create_pull_request(evt, ctx)`.
   - `ok(pr_url)`: `SafePrCreatedBody(pr_url=pr_url, provider=request.provider, mode="github_rest", ...)`.
   - `fail(exc)`: `provider_failure_body(request, exc)` — reason_code=`provider_error`, message=`"safe pr provider failed before PR creation completed"`, details=`{"exception_type": type(exc).__name__}`, stage=`scm`.
4. `deliver`의 출력 body를 yield. 출력이 `SafePrCreatedBody`이고 `request.next_alert`가 None이 아니면 `request.next_alert`(`alert.requested`)도 이어서 yield.

### GithubScmProvider.create_pull_request 내부 흐름

1. `DefaultSafePrPreflightPolicy().evaluate(request)` 재검증 — 불통과 시 `ValueError(preflight.message)`.
2. `SCM_REPO` 미설정 → `RuntimeError(MISSING_GITHUB_CONFIG_MESSAGE)`. 토큰 로드 실패(`SecretNotFound`) → 동일 `RuntimeError`. (자격 증명 부재는 부팅 실패가 아니라 요청 시점 실패 — 워커는 뜨고 각 요청이 `safe_pr.failed`로 흐름)
3. `base_branch = env("SCM_BASE_BRANCH", "main").strip() or "main"`, `branch = f"gitops/{workflow_run_id}"`, `validate_request_paths(request)` (실패 시 `ValueError`).
4. httpx 클라이언트(base_url=`GITHUB_API_BASE`, 헤더 `Authorization: Bearer <token>` + `Accept: application/vnd.github+json`, timeout=`SCM_HTTP_TIMEOUT_SECONDS`)로:

### 외부 호출 (GitHub REST)

| 순서 | 호출 | 멱등 처리(422) |
|---|---|---|
| 1 | `GET /repos/{repo}/git/ref/heads/{base_branch}` → `object.sha` | — (`raise_for_status`) |
| 2 | `POST /repos/{repo}/git/refs` body `{"ref": "refs/heads/{branch}", "sha": base_sha}` | 422 → 기존 브랜치 재사용(무시) |
| 3 | `PUT /repos/{repo}/contents/{change_document_path}` body `{"message": request.title, "content": base64, "branch": branch}` | 422 → `GET (ref=branch)`로 기존 blob `sha` 획득 후 `sha` 포함 재PUT |
| 4 | 각 patch마다 `PUT /repos/{repo}/contents/{patch.path}` body `{"message": "Apply manifest patch: {path}", "content": base64, "branch": branch}` | 3과 동일 |
| 5 | `POST /repos/{repo}/pulls` body `{"title", "body", "head": branch, "base": base_branch}` → `html_url` | 422 → `GET /repos/{repo}/pulls?head={owner}:{branch}&state=open` 첫 항목의 `html_url` 재사용; 없으면 `RuntimeError(MISSING_EXISTING_PR_MESSAGE)` |

5. `ctx.db.save_pull_request(..., status="created")` 후 `pr_url` 반환.

## 불변식·오류 (Invariants & Errors)

- **멱등성**: 브랜치 이름과 변경 문서 경로가 `workflow_run_id`로 결정되므로 같은 요청 재전달은 같은 브랜치/문서/PR로 수렴. 모든 422 충돌은 재사용 경로로 처리.
- **preflight 이중 방어**: worker 레벨(`preflight_failure_body`)과 provider 레벨(`create_pull_request` 첫 줄)에서 같은 정책을 각각 평가 — 다른 경로로 provider가 직접 호출돼도 게이트 유지.
- **경로 안전**: 커밋되는 모든 경로는 `normalize_repo_path` 검증(절대경로·백슬래시·`.`/`..` 거부).
- **실패 이벤트 계약**: 외부 호출 중 발생한 모든 예외(`ValueError`, `RuntimeError`, `httpx.HTTPStatusError`, `asyncio.TimeoutError` 포함)는 `deliver`가 잡아 `safe_pr.failed`(reason_code=`provider_error`, stage=`scm`)로 변환 — 예외 타입명만 details에 남기고 메시지(토큰 포함 가능성)는 싣지 않음.
- **부팅 실패 조건**: `SCM_PROVIDER`가 registry에 없거나(unavailable 포함) github 이외의 available provider면 모듈 로드 시 `RuntimeError` — 워커가 뜨지 않음. 반면 토큰/`SCM_REPO` 부재는 요청 시점 실패.
- `next_alert`는 PR 생성 성공시에만 발행(실패 시 후속 알람 체인 차단).

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `SCM_PROVIDER` | str | `github` | 사용할 SCM provider. registry(`domains.providers.catalog`) 검증 |
| `SCM_CREATE_PR_DEADLINE_SECONDS` | float(str) | `"20"` | PR 생성 외부 호출 전체 데드라인 |
| `SCM_REPO` | str | `""` (필수, 미설정 시 요청 실패) | PR 대상 저장소 `"owner/repo"` |
| `SCM_BASE_BRANCH` | str | `main` | PR base 브랜치 |
| `SCM_HTTP_TIMEOUT_SECONDS` | float(str) | `"10"` | GitHub API 요청별 타임아웃 |
| `GITHUB_TOKEN_REF` | str(secret ref) | `"GITHUB_TOKEN"` (env ref로 해석) | GitHub 토큰 secret ref |
| `GITHUB_TOKEN` | str | — | env fallback 토큰 |
| `GITHUB_API_BASE` | str | `https://api.github.com` | GitHub REST base URL |
