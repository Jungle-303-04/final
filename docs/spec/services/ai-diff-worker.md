---
source_commit: 1616d295
status: synced
---

# diff-worker — Safe PR 패치 초안 설명·게이트

> 소스: `src/services/ai/diff-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `safe_pr.patch_prepared` 를 받아 공유 Safe PR diff 정책으로 패치를 설명·게이트하고
  `diff.explained` 를 발행한 뒤, 통과 시 `safe_pr.ready_for_creation`,
  차단 시 `safe_pr.failed` 를 발행한다.
- 정책 로직은 [scm 도메인 정책](../domains/scm.md)(`DefaultSafePrDiffPolicy`)을 공유해
  다른 consumer 경유의 게이트 우회를 차단한다.
- 서비스 이름은 `ai-diff-worker` (폴더명은 diff-worker).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `SafePrPatchPreparedBody`, `DiffExplainedBody` |
| import | `domains.scm.events` | [../../domains/scm.md](../domains/scm.md) | `SafePrRequestedBody`, `SafePrReadyForCreationBody` |
| import | `domains.scm.policy` | [../../domains/scm.md](../domains/scm.md) | `STAGE_DIFF`, `DefaultSafePrDiffPolicy`, `safe_pr_failed_body` |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App` |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/diff-worker/app.py :: app` | `App("ai-diff-worker")` |
| `DIFF_POLICY` | `src/services/ai/diff-worker/app.py :: DIFF_POLICY` | `DefaultSafePrDiffPolicy()` (preflight: 패치 존재 + 경로 안전성 → 위험도 산정) |
| `prepared_request(evt)` | `src/services/ai/diff-worker/app.py :: prepared_request` | `evt.request` 가 truthy면 `SafePrRequestedBody.from_body(evt.request)`, 아니면 evt 필드(`title, body, provider, workspace_id, repository_id, binding_id, application_id, workflow_run_id, environment, manifest_path, approval_ref, policy_decision_ref`)로 재구성 — **이 경로는 `patches` 를 싣지 않음** |
| `on_safe_pr_patch_prepared(evt)` | `src/services/ai/diff-worker/app.py :: on_safe_pr_patch_prepared` | 유일한 핸들러 |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `SafePrPatchPreparedBody` | `safe_pr.patch_prepared` | `title, body, patch: JsonObject, provider, request: JsonObject={}, workspace_id, repository_id, binding_id, application_id, workflow_run_id, environment, manifest_path, approval_ref?, policy_decision_ref?, next_alert?` |

### 발행 (Publishes)

핸들러 1회당 2건(설명 + 결과):

| 순서 | 이벤트 | 라우팅 키 | 조건/구성 |
|---|---|---|---|
| 1 | `DiffExplainedBody` | `diff.explained` | 항상. `summary = f"{evt.title} 패치 초안은 PR 생성 게이트를 통과했습니다."`(통과) / `"...차단되었습니다."`(차단), `risk=assessment.risk`(`low`/`review_required`/`blocked`), `details={"provider", "patch_keys": sorted(evt.patch.keys()), "body_length": len(evt.body), "approval_ref", "policy_decision_ref", **assessment.details}`, `ready_for_creation=assessment.allowed`, `reason=assessment.message` |
| 2a | `SafePrReadyForCreationBody(request, summary, risk, details, workspace_id)` | `safe_pr.ready_for_creation` | `assessment.allowed=True` |
| 2b | `safe_pr_failed_body(request, assessment, stage="diff")` → `SafePrFailedBody` | `safe_pr.failed` | `assessment.allowed=False` (reason_code: `missing_patches` 또는 `unsafe_repository_path`) |

## 동작 (Behavior)

1. `request = prepared_request(evt)` — 원본 요청 우선 복원.
2. `assessment = DIFF_POLICY.explain(request)`:
   - preflight: `request.patches` 비면 거부(`missing_patches`);
     change document 경로·`manifest_path`·각 patch path 의 안전성 검증 실패 시 거부(`unsafe_repository_path`).
   - 통과 시 `approval_ref or policy_decision_ref` 있으면 `risk="review_required"`, 없으면 `"low"`.
3. 발행 표 순서대로 yield.

## 불변식·오류 (Invariants & Errors)

- `diff.explained` 는 통과/차단 무관하게 항상 발행된다(감사 가능성).
- `evt.request` 없이 개별 필드로 재구성된 요청은 patches 가 비므로 정책상 반드시 차단된다 —
  Safe PR 생성은 원본 `SafePrRequestedBody`(patches 포함)가 실려온 경우에만 진행 가능.
- 차단 body의 `stage` 는 `"diff"` 고정.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=ai-diff-worker`).
