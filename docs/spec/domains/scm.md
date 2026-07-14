---
source_commit: 1616d295
status: synced
---

# scm — Safe PR 생성 도메인 (유일 outbound writer)

> 소스: `src/domains/scm/` · 테스트: `tests/test_repo_gateway_worker.py`, `tests/test_ai_diff_worker.py`, `tests/test_event_golden_path.py`

## 책임 (Responsibility)

- **한다**:
  - Safe PR(자동 생성 Pull Request) 파이프라인의 이벤트 body 정의 (`safe_pr.requested` / `safe_pr.ready_for_creation` / `safe_pr.created` / `safe_pr.failed`).
  - Safe PR preflight·diff 위험 정책 정의 및 기본 구현 — 준비(prepare)/설명(diff)/SCM worker가 **같은 정책을 공유**해, 어떤 consumer를 경유하든 게이트 우회를 차단한다.
  - Safe PR 요청의 gitops 식별자(repository_id/binding_id/application_id/workflow_run_id) 정규화와 `safe_pr.patch_prepared` body 변환 헬퍼(파이프라인 헬퍼).
  - 생성된 Pull Request의 영속(`pull_requests` 테이블).
- **하지 않는다**:
  - 실제 PR 생성(git push, GitHub API 호출) — `src/services/gitops/scm-worker/`가 수행 (`ScmProvider` 전략, [contracts](../packages/contracts.md) 참조).
  - 이벤트 발행/구독 실행 — 각 서비스 워커(safe-pr-worker, diff-worker, scm-worker)가 수행. 이 도메인은 body·정책·헬퍼만 제공한다.
  - diff 위험도의 AI 분석 — `src/services/ai/diff-worker/` 담당.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.alert.events` | [alert](./alert.md) | `SafePrRequestedBody.next_alert` 체이닝용 `AlertRequestedBody` |
| import | `domains.rca.events` | [rca](./rca.md) | `patch_prepared_body()`가 반환하는 `SafePrPatchPreparedBody` |
| import | `domains.gitops.repository` | [gitops](./gitops.md) | `derive_repository_id` / `derive_deployment_binding_id` / `derive_application_id` / `derive_workflow_run_id` |
| import | `packages.contracts.event_bus` (bodies.base / registry / subjects) | [contracts](../packages/contracts.md) | `EventBody` 베이스, `@event` 등록, `EventSubject` |
| import | `packages.contracts.gitops` | [contracts](../packages/contracts.md) | `DEFAULT_REPOSITORY_ID` 등 gitops 기본값 상수 |
| import | `packages.contracts.identity` | [contracts](../packages/contracts.md) | `DEFAULT_WORKSPACE_ID` |
| import | `packages.storage` (base / engine) | [storage](../packages/storage.md) | `Base`, 컬럼 헬퍼, `DatabaseConnection` |
| 소비자 | `services/gitops/safe-pr-worker`, `services/gitops/scm-worker`, `services/gitops/diff-analyze-worker`, `services/gitops/workflow-controller`, `services/ai/diff-worker`, `services/ai/agent` | (services 스펙) | 이벤트 body·정책·파이프라인 헬퍼 사용 |

## 공개 인터페이스 (Public API)

### 모듈

- `src/domains/scm/__init__.py` — 도메인 선언("Safe PR 생성(유일 outbound writer)"). 심볼 없음.

### 이벤트 body — `src/domains/scm/events.py`

- `src/domains/scm/events.py :: SafePrFilePatch`
  ```python
  @dataclass(frozen=True)
  class SafePrFilePatch(EventBody):
      path: str
      content: str
      description: str = ""
  ```
- `src/domains/scm/events.py :: SafePrRequestedBody` — `@event(EventSubject.SAFE_PR_REQUESTED)` (스키마는 [이벤트](#이벤트-events) 참조)
- `src/domains/scm/events.py :: SafePrCreatedBody` — `@event(EventSubject.SAFE_PR_CREATED)`
- `src/domains/scm/events.py :: SafePrReadyForCreationBody` — `@event(EventSubject.SAFE_PR_READY_FOR_CREATION)`
- `src/domains/scm/events.py :: SafePrFailedBody` — `@event(EventSubject.SAFE_PR_FAILED)`

### 정책 — `src/domains/scm/policy.py`

상수:

| 앵커 | 값 | 의미 |
|---|---|---|
| `src/domains/scm/policy.py :: STAGE_PREPARE` | `"prepare"` | 실패 stage: safe-pr-worker 준비 단계 |
| `src/domains/scm/policy.py :: STAGE_DIFF` | `"diff"` | 실패 stage: diff 설명 단계 |
| `src/domains/scm/policy.py :: STAGE_SCM` | `"scm"` | 실패 stage: scm-worker PR 생성 단계 |
| `src/domains/scm/policy.py :: RISK_BLOCKED` | `"blocked"` | 정책 거부 위험 등급 |
| `src/domains/scm/policy.py :: RISK_REVIEW_REQUIRED` | `"review_required"` | 승인/정책 참조가 있는 요청 위험 등급 |
| `src/domains/scm/policy.py :: RISK_LOW` | `"low"` | 기본 위험 등급 |
| `src/domains/scm/policy.py :: REASON_MISSING_PATCHES` | `"missing_patches"` | 거부 사유 코드: 패치 없음 |
| `src/domains/scm/policy.py :: REASON_UNSAFE_PATH` | `"unsafe_repository_path"` | 거부 사유 코드: 위험 경로 |
| `src/domains/scm/policy.py :: REASON_PROVIDER_MISMATCH` | `"provider_mismatch"` | 거부 사유 코드: worker provider 불일치 (scm-worker에서 사용) |
| `src/domains/scm/policy.py :: REASON_PROVIDER_ERROR` | `"provider_error"` | 거부 사유 코드: provider 실행 실패 (scm-worker에서 사용) |
| `src/domains/scm/policy.py :: CHANGE_DOCUMENT_DIR` | `".gitops/safe-pr"` | 변경 문서가 커밋되는 저장소 내 디렉터리 |
| `src/domains/scm/policy.py :: MESSAGE_MISSING_PATCHES` | `"safe pr requires at least one file patch"` | 거부 메시지 |
| `src/domains/scm/policy.py :: MESSAGE_UNSAFE_PATH` | `"safe pr contains an unsafe repository path"` | 거부 메시지 |
| `src/domains/scm/policy.py :: MESSAGE_PROVIDER_MISMATCH` | `"safe pr provider does not match worker provider"` | 거부 메시지 |
| `src/domains/scm/policy.py :: MESSAGE_PROVIDER_ERROR` | `"safe pr provider failed before PR creation completed"` | 거부 메시지 |

클래스·프로토콜:

- `src/domains/scm/policy.py :: SafePrPolicyResult`
  ```python
  @dataclass(frozen=True)
  class SafePrPolicyResult:
      allowed: bool
      reason_code: str = ""
      message: str = ""
      risk: str = RISK_LOW
      details: dict[str, object] = field(default_factory=dict)
  ```
  - `src/domains/scm/policy.py :: SafePrPolicyResult.allow`
    ```python
    @classmethod
    def allow(cls, *, risk: str = RISK_LOW, details: dict[str, object] | None = None) -> SafePrPolicyResult
    ```
    `allowed=True`, `risk`·`details`(None이면 `{}`)로 생성.
  - `src/domains/scm/policy.py :: SafePrPolicyResult.reject`
    ```python
    @classmethod
    def reject(cls, *, reason_code: str, message: str, details: dict[str, object] | None = None) -> SafePrPolicyResult
    ```
    `allowed=False`, `risk=RISK_BLOCKED` 고정.
- `src/domains/scm/policy.py :: SafePrPreflightPolicy` — `typing.Protocol`
  ```python
  def evaluate(self, request: SafePrRequestedBody) -> SafePrPolicyResult: ...
  ```
- `src/domains/scm/policy.py :: SafePrDiffPolicy` — `typing.Protocol`
  ```python
  def explain(self, request: SafePrRequestedBody) -> SafePrPolicyResult: ...
  ```
- `src/domains/scm/policy.py :: DefaultSafePrPreflightPolicy` — 구체적인 저장소 변경을 만들 수 없는 요청 거부.
  - `src/domains/scm/policy.py :: DefaultSafePrPreflightPolicy.evaluate`
    ```python
    def evaluate(self, request: SafePrRequestedBody) -> SafePrPolicyResult
    ```
- `src/domains/scm/policy.py :: DefaultSafePrDiffPolicy` — 준비된 Safe PR 요청 설명·게이트.
  ```python
  def __init__(self, preflight: SafePrPreflightPolicy | None = None) -> None
  ```
  `preflight`가 None이면 `DefaultSafePrPreflightPolicy()` 사용.
  - `src/domains/scm/policy.py :: DefaultSafePrDiffPolicy.explain`
    ```python
    def explain(self, request: SafePrRequestedBody) -> SafePrPolicyResult
    ```

함수:

- `src/domains/scm/policy.py :: normalize_repo_path`
  ```python
  def normalize_repo_path(path: str) -> str
  ```
  저장소 상대 경로 정규화. 위반 시 `ValueError(f"unsafe repository path: {path}")`.
- `src/domains/scm/policy.py :: validate_request_paths`
  ```python
  def validate_request_paths(request: SafePrRequestedBody) -> None
  ```
  `f"{CHANGE_DOCUMENT_DIR}/{request.workflow_run_id}.md"`, `request.manifest_path`, 모든 `patch.path`를 `normalize_repo_path`로 검증(실패 시 `ValueError` 전파).
- `src/domains/scm/policy.py :: safe_pr_failed_body`
  ```python
  def safe_pr_failed_body(request: SafePrRequestedBody, result: SafePrPolicyResult, *, stage: str) -> SafePrFailedBody
  ```
  거부된 정책 결과를 `SafePrFailedBody`로 변환: `provider/title/workspace_id/repository_id/binding_id/application_id/workflow_run_id/environment`은 request에서, `reason=result.message`, `reason_code=result.reason_code`, `details=result.details`, `stage`는 인자값.

### 파이프라인 헬퍼 — `src/domains/scm/pipeline.py`

- `src/domains/scm/pipeline.py :: normalize_safe_pr_request`
  ```python
  def normalize_safe_pr_request(evt: SafePrRequestedBody) -> SafePrRequestedBody
  ```
  `evt.to_body()` payload에 대해 [gitops](./gitops.md)의 파생 함수를 **순서대로 누적 적용**해 결정적 식별자를 채운 사본(`dataclasses.replace`)을 반환:
  1. `repository_id = derive_repository_id(payload)`
  2. `binding_id = derive_deployment_binding_id({**payload, "repository_id": repository_id})`
  3. `application_id = derive_application_id({**payload, "repository_id": ..., "binding_id": ...})`
  4. `workflow_run_id = derive_workflow_run_id({**payload, "repository_id": ..., "binding_id": ..., "application_id": ...})`
- `src/domains/scm/pipeline.py :: patch_prepared_body`
  ```python
  def patch_prepared_body(request: SafePrRequestedBody) -> SafePrPatchPreparedBody
  ```
  요청을 `safe_pr.patch_prepared` body([rca](./rca.md) 정의)로 변환. 필드 매핑:
  - `title`, `body`, `provider`, `workspace_id`, `repository_id`, `binding_id`, `application_id`, `workflow_run_id`, `environment`, `manifest_path`, `approval_ref`, `policy_decision_ref`: request에서 그대로.
  - `patch`: `{"provider", "repository_id", "manifest_path", "approval_ref", "policy_decision_ref", "patches": [patch.to_body() ...]}`.
  - `request`: `request.to_body()` 전체.
  - `next_alert`: `request.next_alert.to_body()` (None이면 None).

### 리포지토리 — `src/domains/scm/repository.py`

- `src/domains/scm/repository.py :: PullRequestRepository` — `packages.storage.engine.DatabaseConnection` 상속 mixin.
  - `src/domains/scm/repository.py :: PullRequestRepository.save_pull_request`
    ```python
    def save_pull_request(self, correlation_id: str, pr_url: str, title: str, body: str, status: str) -> None
    ```
    `pull_requests` 테이블에 PostgreSQL `INSERT` 1행 (`pg_insert`, conflict 처리 없음, `id`/`created_at`은 DB 기본값).

## 데이터 모델 (Data Model)

### `pull_requests` — `src/domains/scm/models.py :: PullRequest`

`__tablename__ = "pull_requests"`

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 대리 키 |
| correlation_id | Text | NOT NULL | PR을 유발한 이벤트 correlation id |
| pr_url | Text | NOT NULL | 생성된 PR URL |
| title | Text | NOT NULL | PR 제목 |
| body | Text | NOT NULL | PR 본문 |
| status | Text | NOT NULL | PR 상태 문자열(도메인 코드에 enum 없음, 호출자가 지정) |
| created_at | TIMESTAMP(timezone=True) | NOT NULL, server_default=now() | 저장 시각 |

컬럼 헬퍼(`text_column`/`created_at_column`)는 [storage](../packages/storage.md) 참조.

## 이벤트 (Events)

이 도메인은 body **계약을 정의**한다. 실제 발행/구독은 gitops·ai 서비스 워커가 수행하며, 아래 표의 발행/구독 주체는 참고용이다. 라우팅 키(subject)는 `packages.contracts.event_bus.subjects.EventSubject` 값이다.

### 발행 (Publishes — 이 도메인이 body를 정의하는 이벤트)

**`safe_pr.requested`** (`EventSubject.SAFE_PR_REQUESTED`) — `src/domains/scm/events.py :: SafePrRequestedBody`
발행: `services/ai/agent`(recovery dispatch) 등 PR 생성 요청자. 구독: safe-pr-worker.

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| title | str | (필수) | PR 제목 |
| body | str | (필수) | PR 본문 |
| provider | str | (필수) | SCM 공급자 식별자 (예: github) |
| patches | list[SafePrFilePatch] | `[]` | 커밋할 파일 변경 목록 |
| pr_kind | str | `safe_pr_patch` | `safe_pr_patch`는 실제 설정 변경 PR, `safe_pr_review_doc`은 RCA 검토 문서 PR |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` (`"default"`) | 워크스페이스 |
| repository_id | str | `DEFAULT_REPOSITORY_ID` (`""`) | 저장소 id (빈 값이면 파생) |
| binding_id | str | `DEFAULT_DEPLOYMENT_BINDING_ID` (`""`) | 배포 바인딩 id |
| application_id | str | `DEFAULT_APPLICATION_ID` (`""`) | 애플리케이션 id |
| workflow_run_id | str | `DEFAULT_WORKFLOW_RUN_ID` (`""`) | 워크플로 실행 id |
| environment | str | `DEFAULT_ENVIRONMENT` (`"sandbox"`) | 환경 |
| manifest_path | str | `DEFAULT_MANIFEST_PATH` (`"deploy.yaml"`) | 매니페스트 경로 |
| approval_ref | str \| None | None | 승인 참조 |
| policy_decision_ref | str \| None | None | 정책 결정 참조 |
| next_alert | AlertRequestedBody \| None | None | PR 생성 후 연결할 알림([alert](./alert.md)) |

중첩 `SafePrFilePatch` (`src/domains/scm/events.py :: SafePrFilePatch`):

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| path | str | (필수) | 저장소 상대 경로 |
| content | str | (필수) | 파일 전체 내용 |
| description | str | `""` | 변경 설명 |

**`safe_pr.ready_for_creation`** (`EventSubject.SAFE_PR_READY_FOR_CREATION`) — `src/domains/scm/events.py :: SafePrReadyForCreationBody`
발행: ai/diff-worker (diff 검증 통과 시). 구독: scm-worker.

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| request | SafePrRequestedBody | (필수) | 검증된 원본 요청 |
| summary | str | (필수) | diff 설명 요약 |
| risk | str | (필수) | 위험 등급 (`low` / `review_required` / `blocked`) |
| details | dict[str, object] | `{}` | 정책 상세 |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` | 워크스페이스 |

**`safe_pr.created`** (`EventSubject.SAFE_PR_CREATED`) — `src/domains/scm/events.py :: SafePrCreatedBody`
발행: scm-worker (PR 생성 완료). 구독: workflow-controller 등.

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| pr_url | str | (필수) | 생성된 PR URL |
| provider | str | (필수) | SCM 공급자 |
| mode | str | (필수) | 생성 모드 문자열 |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` | 워크스페이스 |
| repository_id | str | `DEFAULT_REPOSITORY_ID` | 저장소 id |
| binding_id | str | `DEFAULT_DEPLOYMENT_BINDING_ID` | 배포 바인딩 id |
| application_id | str | `DEFAULT_APPLICATION_ID` | 애플리케이션 id |
| workflow_run_id | str | `DEFAULT_WORKFLOW_RUN_ID` | 워크플로 실행 id |
| environment | str | `DEFAULT_ENVIRONMENT` | 환경 |

**`safe_pr.failed`** (`EventSubject.SAFE_PR_FAILED`) — `src/domains/scm/events.py :: SafePrFailedBody`
발행: safe-pr-worker/diff-worker/scm-worker (각 stage 게이트 거부·실패 시). 구독: workflow-controller 등.

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| provider | str | (필수) | SCM 공급자 |
| title | str | (필수) | 실패한 요청의 PR 제목 |
| reason | str | (필수) | 사람이 읽는 실패 사유 |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` | 워크스페이스 |
| repository_id | str | `DEFAULT_REPOSITORY_ID` | 저장소 id |
| binding_id | str | `DEFAULT_DEPLOYMENT_BINDING_ID` | 배포 바인딩 id |
| application_id | str | `DEFAULT_APPLICATION_ID` | 애플리케이션 id |
| workflow_run_id | str | `DEFAULT_WORKFLOW_RUN_ID` | 워크플로 실행 id |
| environment | str | `DEFAULT_ENVIRONMENT` | 환경 |
| reason_code | str | `"safe_pr_failed"` | 기계 판독용 사유 코드 |
| stage | str | `"scm"` | 실패 단계 (`prepare` / `diff` / `scm`) |
| details | dict[str, object] | `{}` | 상세 정보 |

### 구독 (Consumes)

도메인 코드 자체는 이벤트를 구독하지 않는다. 파이프라인 중간 이벤트는 타 도메인 정의를 사용한다:

- `safe_pr.patch_prepared` (`EventSubject.SAFE_PR_PATCH_PREPARED`) — body는 [rca](./rca.md)의 `SafePrPatchPreparedBody`. `patch_prepared_body()`가 생성.
- `diff.explained` (`EventSubject.DIFF_EXPLAINED`) — body는 [rca](./rca.md)의 `DiffExplainedBody`. diff 단계 결과.

## 동작 (Behavior)

### Safe PR 3단계 게이트 파이프라인

`safe_pr.requested → safe_pr.patch_prepared → diff.explained → safe_pr.ready_for_creation → safe_pr.created | safe_pr.failed`

| 단계 | 수행 주체 | 사용 도메인 심볼 | 성공 시 | 실패 시 |
|---|---|---|---|---|
| 1. prepare | safe-pr-worker | `normalize_safe_pr_request` → `DefaultSafePrPreflightPolicy.evaluate` → `patch_prepared_body` | `safe_pr.patch_prepared` 발행 | `safe_pr_failed_body(stage=STAGE_PREPARE)` → `safe_pr.failed` |
| 2. diff | ai/diff-worker | `DefaultSafePrDiffPolicy.explain` | `safe_pr.ready_for_creation` 발행 (`summary`/`risk`/`details` 포함) | `safe_pr_failed_body(stage=STAGE_DIFF)` → `safe_pr.failed` |
| 3. scm | scm-worker | `normalize_safe_pr_request` + 정책 재검증 + `ScmProvider.create_pull_request` | PR 생성 → `safe_pr.created` 발행, `PullRequestRepository.save_pull_request` | `safe_pr_failed_body(stage=STAGE_SCM)` (사유: `provider_mismatch` / `provider_error` / 정책 거부) → `safe_pr.failed` |

### `DefaultSafePrPreflightPolicy.evaluate` 판정 순서

1. `request.patches`가 비어 있으면 → `reject(reason_code=REASON_MISSING_PATCHES, message=MESSAGE_MISSING_PATCHES, details={"workflow_run_id", "repository_id"})`.
2. `validate_request_paths(request)`가 `ValueError`를 던지면 → `reject(reason_code=REASON_UNSAFE_PATH, message=MESSAGE_UNSAFE_PATH, details={"error": str(exc)})`.
3. 통과 → `allow(details={"patch_count": len(patches), "paths": [각 patch.path]})` (risk=`low`).

### `DefaultSafePrDiffPolicy.explain` 판정 순서

1. `self.preflight.evaluate(request)` 실행. 거부면 그 결과를 그대로 반환 (risk=`blocked`).
2. `request.approval_ref` 또는 `request.policy_decision_ref`가 있으면 risk=`RISK_REVIEW_REQUIRED`, 둘 다 없으면 `RISK_LOW`.
3. `allow(risk=..., details={**preflight.details, "approval_ref", "policy_decision_ref", "manifest_path"})` 반환.

### `normalize_repo_path` 규칙

1. `path.strip()` 후 `/`로 시작하거나 `\`(백슬래시)를 포함하면 `ValueError`.
2. `PurePosixPath`로 정규화한 문자열이 비었거나 `"."`이거나, 경로 조각(parts)에 `""`/`"."`/`".."`가 하나라도 있으면 `ValueError`.
3. 통과하면 정규화된 POSIX 경로 문자열 반환.

### 위험 등급 상태(정책 결과 risk)

| risk | 조건 | 다음 단계 |
|---|---|---|
| `low` | preflight 통과 + 승인 참조 없음 | PR 생성 진행 |
| `review_required` | preflight 통과 + `approval_ref` 또는 `policy_decision_ref` 존재 | PR 생성 진행(검토 표기) |
| `blocked` | preflight 거부 | `safe_pr.failed` 발행, 파이프라인 중단 |

## 불변식·오류 (Invariants & Errors)

- **단일 outbound writer**: 저장소(원격 SCM)에 쓰는 경로는 scm 파이프라인이 유일하다. 다른 도메인/서비스는 `safe_pr.requested`를 발행할 뿐 직접 PR을 만들지 않는다.
- **게이트 공유 불변식**: prepare/diff/scm 세 워커 모두 이 도메인의 동일 정책(`DefaultSafePrPreflightPolicy`)을 사용해야 하며, 어떤 consumer를 경유해도 patch 없는 요청·위험 경로는 저장소에 도달할 수 없다.
- **경로 안전성**: 커밋 대상 경로는 절대경로·백슬래시·`..`·`.`·빈 조각을 금지한다 (`normalize_repo_path`). 변경 문서 경로(`CHANGE_DOCUMENT_DIR/{workflow_run_id}.md`)와 `manifest_path`도 동일 규칙 적용.
- **식별자 결정성**: `normalize_safe_pr_request`는 순수 함수이며 같은 입력에 항상 같은 파생 id를 채운다(sha256 기반, [gitops](./gitops.md) 파생 규칙).
- **거부 결과 불변식**: `SafePrPolicyResult.reject`는 항상 `allowed=False, risk=RISK_BLOCKED`이고 `reason_code`/`message`가 비어 있지 않다.
- 오류:
  - `normalize_repo_path` / `validate_request_paths` → `ValueError("unsafe repository path: ...")`. 정책 내부에서 잡아 `reject`로 변환(`DefaultSafePrPreflightPolicy.evaluate`), 직접 호출자는 전파에 대비해야 한다.
  - `PullRequestRepository.save_pull_request`는 예외를 처리하지 않는다 — DB 오류는 호출한 워커의 이벤트 처리 실패로 전파된다.

## 설정 (Settings)

이 도메인은 환경변수·설정 키를 직접 읽지 않는다. (provider 자격 증명 등은 `services/gitops/scm-worker` 설정 참조.)
