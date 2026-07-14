---
source_commit: 664925a6
status: synced
---

# safe-pr-worker — `safe_pr.requested`를 preflight 검증해 `safe_pr.patch_prepared` 또는 `safe_pr.failed`로 라우팅하는 게이트 워커

> 소스: `src/services/gitops/safe-pr-worker/` (`app.py`)

## 책임 (Responsibility)

- `safe_pr.requested` 이벤트 1종을 구독해 요청을 정규화(식별자 파생)하고, provider 일치 여부와 preflight 정책(패치 존재·경로 안전)을 검사한다.
- 통과 시 `safe_pr.patch_prepared`(패치 초안) 발행 — 이후 diff 설명 단계(`diff.explained`)와 `safe_pr.ready_for_creation`을 거쳐 [scm-worker](gitops-scm-worker.md)가 실제 PR을 만든다.
- 거부 시 `safe_pr.failed`(stage=`prepare`) 발행.
- 하지 않는 것: GitHub API 호출, PR 생성, DB 저장(핸들러는 `ctx`를 받지 않음). 실제 SCM 호출은 [scm-worker](gitops-scm-worker.md) 담당.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.scm.events` | [scm 도메인](../domains/scm.md) | `SafePrRequestedBody`, `SafePrFailedBody` |
| import | `domains.scm.pipeline` | [scm 도메인](../domains/scm.md) | `normalize_safe_pr_request`, `patch_prepared_body` |
| import | `domains.scm.policy` | [scm 도메인](../domains/scm.md) | `DefaultSafePrPreflightPolicy`, `SafePrPolicyResult`, `safe_pr_failed_body`, `STAGE_PREPARE`, `REASON_PROVIDER_MISMATCH`, `MESSAGE_PROVIDER_MISMATCH` |
| import | `packages.config.settings` | [config 패키지](../packages/config.md) | `env` |
| import | `packages.contracts.event_bus.bodies` | [contracts 패키지](../packages/contracts.md) | `EventBody` |
| import | `packages.runtime.app` | [runtime 패키지](../packages/runtime.md) | `App` |
| 구독 | `safe_pr.requested` | — | 입력 이벤트 |
| 발행 | `safe_pr.patch_prepared` | [rca 도메인](../domains/rca.md) 정의, 후속 diff 설명 워커 소비 | 통과 출력 |
| 발행 | `safe_pr.failed` | [workflow-controller](gitops-workflow-controller.md) 소비 | 거부 출력 |

## 공개 인터페이스 (Public API)

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `app` | `App("safe-pr-worker")` | `src/services/gitops/safe-pr-worker/app.py :: app` |
| `SCM_PROVIDER_ENV` | `"SCM_PROVIDER"` | `src/services/gitops/safe-pr-worker/app.py :: SCM_PROVIDER_ENV` |
| `DEFAULT_SCM_PROVIDER` | `"github"` | `src/services/gitops/safe-pr-worker/app.py :: DEFAULT_SCM_PROVIDER` |
| `PREPARE_POLICY` | `DefaultSafePrPreflightPolicy()` (모듈 레벨 싱글턴) | `src/services/gitops/safe-pr-worker/app.py :: PREPARE_POLICY` |
| `active_scm_provider` | `def active_scm_provider() -> str` — `env("SCM_PROVIDER", "github").strip().lower() or "github"` | `src/services/gitops/safe-pr-worker/app.py :: active_scm_provider` |
| `provider_mismatch_body` | `def provider_mismatch_body(request: SafePrRequestedBody) -> SafePrFailedBody` | `src/services/gitops/safe-pr-worker/app.py :: provider_mismatch_body` |
| `on_safe_pr_requested` | `@app.on(SafePrRequestedBody)`<br>`async def on_safe_pr_requested(evt: SafePrRequestedBody) -> AsyncIterator[EventBody]` | `src/services/gitops/safe-pr-worker/app.py :: on_safe_pr_requested` |

`provider_mismatch_body`는 `safe_pr_failed_body(request, SafePrPolicyResult.reject(reason_code=REASON_PROVIDER_MISMATCH, message=MESSAGE_PROVIDER_MISMATCH, details={"event_provider": request.provider, "worker_provider": active_scm_provider()}), stage=STAGE_PREPARE)`를 반환한다.

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키(NATS subject) | body | 앵커 |
|---|---|---|---|
| `SafePrRequestedBody` | `safe_pr.requested` | `title: str`, `body: str`, `provider: str`, `patches: list[SafePrFilePatch] = []`, `pr_kind: str = "safe_pr_patch"`, `workspace_id: str = "default"`, `repository_id: str = ""`, `binding_id: str = ""`, `application_id: str = ""`, `workflow_run_id: str = ""`, `environment: str = "sandbox"`, `manifest_path: str = "deploy.yaml"`, `repo_ref: str = ""`, `base_branch: str = ""`, `commit_sha: str = ""`, `patch_sha256: str = ""`, `approval_ref: str \| None = None`, `policy_decision_ref: str \| None = None`, `next_alert: AlertRequestedBody \| None = None` | `src/domains/scm/events.py :: SafePrRequestedBody` |

`SafePrFilePatch`(`src/domains/scm/events.py :: SafePrFilePatch`): `path: str`, `content: str`, `description: str = ""`.

### 발행 (Publishes)

| 이벤트 | 라우팅 키(NATS subject) | body | 앵커 |
|---|---|---|---|
| `SafePrPatchPreparedBody` | `safe_pr.patch_prepared` | `title`, `body`, `patch: JsonObject`, `provider`, `request: JsonObject`(원 요청 `to_body()`), `workspace_id`, `repository_id`, `binding_id`, `application_id`, `workflow_run_id`, `environment`, `manifest_path`, `approval_ref`, `policy_decision_ref`, `next_alert: JsonObject \| None` | `src/domains/rca/events.py :: SafePrPatchPreparedBody` |
| `SafePrFailedBody` | `safe_pr.failed` | `provider`, `title`, `reason`, `workspace_id`, `repository_id`, `binding_id`, `application_id`, `workflow_run_id`, `environment`, `reason_code: str = "safe_pr_failed"`, `stage: str` (이 워커에서는 `"prepare"`), `details: dict[str, object]` | `src/domains/scm/events.py :: SafePrFailedBody` |

`patch_prepared_body`(`src/domains/scm/pipeline.py :: patch_prepared_body`)가 만드는 `patch` 필드: `{"provider", "repository_id", "manifest_path", "approval_ref", "policy_decision_ref", "patches": [patch.to_body(), ...]}`.

## 동작 (Behavior)

`on_safe_pr_requested(evt)` 처리 순서:

1. `request = normalize_safe_pr_request(evt)` — `repository_id`/`binding_id`/`application_id`/`workflow_run_id`가 기본값(빈 문자열)이면 payload 해시 기반으로 파생해 채움 (`src/domains/scm/pipeline.py :: normalize_safe_pr_request`, 파생 함수는 `src/domains/gitops/repository.py :: derive_repository_id` 등).
2. **provider 게이트**: `request.provider != active_scm_provider()`이면 `provider_mismatch_body(request)` yield 후 종료 — `safe_pr.failed` (reason_code=`provider_mismatch`, message=`"safe pr provider does not match worker provider"`, stage=`prepare`, details에 `event_provider`/`worker_provider`).
3. **preflight 게이트**: `PREPARE_POLICY.evaluate(request)` (`src/domains/scm/policy.py :: DefaultSafePrPreflightPolicy.evaluate`):
   - `patches`가 비어 있으면 reject — reason_code=`missing_patches`, message=`"safe pr requires at least one file patch"`, details에 `workflow_run_id`/`repository_id`.
   - `validate_request_paths(request)`가 `ValueError`를 던지면 reject — reason_code=`unsafe_repository_path`, message=`"safe pr contains an unsafe repository path"`, details에 `error`. (검사 대상: `.gitops/safe-pr/{workflow_run_id}.md`, `manifest_path`, 각 patch `path` — 절대경로, 백슬래시, `.`/`..` 세그먼트 거부, `src/domains/scm/policy.py :: normalize_repo_path`)
   - reject 시 `safe_pr_failed_body(request, preflight, stage="prepare")` yield 후 종료. 정책 reject의 `risk`는 항상 `"blocked"`.
4. **통과**: `patch_prepared_body(request)` yield — `safe_pr.patch_prepared`.

## 불변식·오류 (Invariants & Errors)

- 발행되는 `safe_pr.failed`의 `stage`는 항상 `STAGE_PREPARE`(`"prepare"`) — SCM 단계 실패(`"scm"`)와 구분된다.
- preflight 정책은 [scm-worker](gitops-scm-worker.md)와 동일 클래스(`DefaultSafePrPreflightPolicy`)를 공유해, 이 게이트를 우회한 consumer도 같은 규칙으로 걸러진다.
- 핸들러는 DB를 사용하지 않으며(`ctx` 미수신) 순수하게 이벤트 → 이벤트 변환만 수행한다. 예외 발생 시 런타임으로 전파.
- `normalize_safe_pr_request`는 명시된 식별자를 절대 덮어쓰지 않는다(기본값일 때만 파생).

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `SCM_PROVIDER` | str | `github` | 이 워커가 담당하는 SCM provider. 이벤트의 `provider`와 불일치 시 `safe_pr.failed`(provider_mismatch) |
