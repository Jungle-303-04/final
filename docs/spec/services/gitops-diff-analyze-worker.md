---
source_commit: 664925a6
status: synced
---

# diff-analyze-worker — diff 위험도 분석·정책 판정 후 Safe PR 경로 분기

> 소스: `src/services/gitops/diff-analyze-worker/` (`app.py` 단일 모듈) · 테스트: `tests/test_diff_analyze_worker.py`

## 책임 (Responsibility)

- `desired.diff.detected`를 구독해 diff의 위험도를 정책으로 판정하고, 그 결과를 `diff.analyzed`로 발행한다.
- 안전(`sandbox-only`) 판정 시에만 `safe_pr.requested`를 추가 발행해 PR 준비/생성 흐름([safe-pr-worker](gitops-safe-pr-worker.md) → [scm-worker](gitops-scm-worker.md))으로 넘긴다. diff를 실행 명령(`command.requested`)으로 직접 발행하지 않는다 — apply 명령은 `safe_pr.requested`의 `next_alert.next_command`에 payload로만 실어 보낸다.
- 정책 판정 결과를 승인(Approval) 레코드로 영속화한다(`request_workflow_approval` / safe 경로는 `resolve_workflow_approval`로 자동 승인).
- 모듈 docstring 명시: 원본 `GitOpsSyncWorkflow.handle()`의 COMMAND_REQUESTED 직접 발행 블록을 대체한 워커다.
- 하지 않는 것: manifest 렌더링, diff 계산(→ [diff-worker](gitops-diff-worker.md)), PR 생성 자체, 클러스터 적용.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.alert` | [../../domains/alert.md](../domains/alert.md) | `AlertRequestedBody` — pre-deploy alert 게이트 payload |
| import | `domains.command` | [../../domains/command.md](../domains/command.md) | `CommandRequestedBody` — apply 명령 payload |
| import | `domains.gitops` | [../../domains/gitops.md](../domains/gitops.md) | `MISSING`(diffing), `DesiredDesiredDiffDetectedBody`, `Diff`, `DiffAnalyzedBody`(events), `derive_approval_id`(repository) |
| import | `domains.scm` | [../../domains/scm.md](../domains/scm.md) | `SafePrFilePatch`, `SafePrRequestedBody` |
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `Command`, `GitHub`, `RiskLevel`, `Sandbox`, `Target` 상수 |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `EventBody`, `ApprovalStatus`, `ResourceRole`, `PolicyDecisionStore` |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext` |
| import (외부) | `yaml` (PyYAML) | — | manifest/rollback patch를 YAML 문자열로 직렬화 |
| 구독 | `desired.diff.detected` | [./diff-worker.md](gitops-diff-worker.md) | 입력 이벤트 |
| 발행 | `diff.analyzed`, `safe_pr.requested` | [./workflow-controller.md](gitops-workflow-controller.md), [./safe-pr-worker.md](gitops-safe-pr-worker.md) | 출력 이벤트 |

## 공개 인터페이스 (Public API)

### 앱 인스턴스·상수

| 심볼 | 값 | 앵커 |
|---|---|---|
| `app` | `App("diff-analyze-worker")` | `src/services/gitops/diff-analyze-worker/app.py :: app` |
| `SAFE_REASON` | `"sandbox 한정 변경이라 안전"` | `src/services/gitops/diff-analyze-worker/app.py :: SAFE_REASON` |
| `UNSAFE_REASON` | `"프로덕션 영향 가능 — 검토 필요"` | `src/services/gitops/diff-analyze-worker/app.py :: UNSAFE_REASON` |
| `NO_ACTIONABLE_CHANGE_REASON` | `"managed field 기준 적용할 변경 없음"` | `src/services/gitops/diff-analyze-worker/app.py :: NO_ACTIONABLE_CHANGE_REASON` |
| `PR_TITLE` | `"Apply sandbox manifest"` | `src/services/gitops/diff-analyze-worker/app.py :: PR_TITLE` |
| `PRE_DEPLOY_ALERT_SEVERITY` | `"info"` | `src/services/gitops/diff-analyze-worker/app.py :: PRE_DEPLOY_ALERT_SEVERITY` |
| `MANIFEST_PATCH_DESCRIPTION` | `"rendered Kubernetes manifest"` | `src/services/gitops/diff-analyze-worker/app.py :: MANIFEST_PATCH_DESCRIPTION` |
| `ROLLBACK_PATCH_DESCRIPTION` | `"rollback manifest generated from live/previous values"` | `src/services/gitops/diff-analyze-worker/app.py :: ROLLBACK_PATCH_DESCRIPTION` |
| `ROLLBACK_PATCH_DIR` | `".gitops/rollback"` | `src/services/gitops/diff-analyze-worker/app.py :: ROLLBACK_PATCH_DIR` |
| `POLICY_ROUTE_NOOP` | `"noop"` | `src/services/gitops/diff-analyze-worker/app.py :: POLICY_ROUTE_NOOP` |
| `POLICY_ROUTE_SAFE_PR` | `"safe_pr"` | `src/services/gitops/diff-analyze-worker/app.py :: POLICY_ROUTE_SAFE_PR` |
| `POLICY_ROUTE_APPROVAL_REQUIRED` | `"approval_required"` | `src/services/gitops/diff-analyze-worker/app.py :: POLICY_ROUTE_APPROVAL_REQUIRED` |
| `POLICY_DECISION_REF_PREFIX` | `"policy-decision"` | `src/services/gitops/diff-analyze-worker/app.py :: POLICY_DECISION_REF_PREFIX` |
| `SYSTEM_POLICY_APPROVER` | `"system-policy"` | `src/services/gitops/diff-analyze-worker/app.py :: SYSTEM_POLICY_APPROVER` |

### 클래스·함수

```python
@dataclass(frozen=True)
class PolicyDecision:
    route: str
    safe: bool
    reason: str
    approval_ref: str | None = None
    policy_decision_ref: str | None = None

    def details(self, diff: Diff) -> dict[str, object]: ...
```
`src/services/gitops/diff-analyze-worker/app.py :: PolicyDecision`
— `details()`는 `{"policy_route", "policy_decision_ref", "approval_ref", "safe", "risk"(str(diff.risk)), "diff"(diff.to_body()), "rollback_patches"([patch.to_body() ...])}`를 반환한다.

```python
def evaluate_safe_pr_policy(diff: Diff) -> PolicyDecision
```
`src/services/gitops/diff-analyze-worker/app.py :: evaluate_safe_pr_policy`

```python
def policy_decision_ref(approval_ref: str, route: str) -> str
```
`src/services/gitops/diff-analyze-worker/app.py :: policy_decision_ref` — `f"policy-decision:{approval_ref}:{route}"`.

```python
async def persist_policy_decision(
    db: PolicyDecisionStore | Any, diff: Diff, decision: PolicyDecision
) -> None
```
`src/services/gitops/diff-analyze-worker/app.py :: persist_policy_decision`

```python
def build_safe_pr_request_body(
    diff: Diff, decision: PolicyDecision | None = None
) -> SafePrRequestedBody
```
`src/services/gitops/diff-analyze-worker/app.py :: build_safe_pr_request_body`

```python
def safe_pr_body(summary: str, diff: Diff, decision: PolicyDecision) -> str
```
`src/services/gitops/diff-analyze-worker/app.py :: safe_pr_body`

```python
def build_manifest_patches(diff: Diff) -> list[SafePrFilePatch]
```
`src/services/gitops/diff-analyze-worker/app.py :: build_manifest_patches`

```python
def build_rollback_patches(diff: Diff) -> list[SafePrFilePatch]
```
`src/services/gitops/diff-analyze-worker/app.py :: build_rollback_patches`

```python
def rollback_patch_path(diff: Diff) -> str
```
`src/services/gitops/diff-analyze-worker/app.py :: rollback_patch_path`

```python
def build_rollback_manifest(diff: Diff) -> dict[str, Any]
```
`src/services/gitops/diff-analyze-worker/app.py :: build_rollback_manifest`

```python
def apply_rollback_value(manifest: dict[str, Any], field_path: str, value: Any) -> bool
```
`src/services/gitops/diff-analyze-worker/app.py :: apply_rollback_value`

```python
def split_field_path(field_path: str) -> list[str]
```
`src/services/gitops/diff-analyze-worker/app.py :: split_field_path`

```python
def descend_manifest_path(parent: Any, part: str) -> Any
```
`src/services/gitops/diff-analyze-worker/app.py :: descend_manifest_path`

```python
def set_manifest_value(parent: Any, part: str, value: Any) -> bool
```
`src/services/gitops/diff-analyze-worker/app.py :: set_manifest_value`

```python
def parse_list_selector(part: str) -> tuple[str | None, tuple[str, str]]
```
`src/services/gitops/diff-analyze-worker/app.py :: parse_list_selector`

```python
def build_auto_command_request_body(
    diff: Diff, decision: PolicyDecision | None = None
) -> CommandRequestedBody
```
`src/services/gitops/diff-analyze-worker/app.py :: build_auto_command_request_body`

```python
def build_pre_deploy_alert_request_body(
    diff: Diff, decision: PolicyDecision | None = None
) -> AlertRequestedBody
```
`src/services/gitops/diff-analyze-worker/app.py :: build_pre_deploy_alert_request_body`

```python
@app.on(DesiredDesiredDiffDetectedBody)
async def on_desired_diff(
    evt: DesiredDesiredDiffDetectedBody, ctx: EventContext
) -> AsyncIterator[EventBody]
```
`src/services/gitops/diff-analyze-worker/app.py :: on_desired_diff`

진입점: `if __name__ == "__main__": app.run()`.

## 데이터 모델 (Data Model)

이 워커는 자체 테이블을 소유하지 않는다. `ctx.db`를 통해 gitops 도메인의 Approval 테이블에 쓴다(아래 동작 3단계, [gitops 도메인](../domains/gitops.md) `RepoChangeRepository.request_workflow_approval` / `resolve_workflow_approval`).

## 이벤트 (Events)

라우팅 키(subject) = 이벤트명 문자열(NATS JetStream stream `SERVICE_EVENTS`, `packages/contracts/event_bus/subjects.py :: EventSubject`).

### 구독 (Consumes)

**`desired.diff.detected`** (`EventSubject.DESIRED_DIFF_DETECTED`) — body `src/domains/gitops/events.py :: DesiredDesiredDiffDetectedBody`

| 필드 | 타입 | 설명 |
|---|---|---|
| diff | `Diff` | [diff-worker](gitops-diff-worker.md)가 만든 diff 값 객체(필드 명세는 [gitops 도메인](../domains/gitops.md#diff) 참조) |

### 발행 (Publishes)

**`diff.analyzed`** (`EventSubject.DIFF_ANALYZED`) — body `src/domains/gitops/events.py :: DiffAnalyzedBody` — 항상 1회 발행.

| 필드 | 타입 | 값 |
|---|---|---|
| diff | `Diff` | 입력 diff 그대로 |
| safe | bool | `decision.safe` |
| risk | str | `diff.risk` (`RiskLevel` StrEnum — wire에는 값 문자열) |
| reason | str | `decision.reason` |

**`safe_pr.requested`** (`EventSubject.SAFE_PR_REQUESTED`) — body `src/domains/scm/events.py :: SafePrRequestedBody` — `decision.route == "safe_pr"`일 때만 발행.

| 필드 | 타입 | 값 |
|---|---|---|
| title | str | `PR_TITLE` (`"Apply sandbox manifest"`) |
| body | str | `safe_pr_body(summary, diff, decision)` 결과 |
| provider | str | `GitHub.PROVIDER` (`"github"`) |
| patches | `list[SafePrFilePatch]` | `build_manifest_patches(diff)` — manifest patch + rollback patch |
| workspace_id / repository_id / binding_id / application_id / workflow_run_id / environment / manifest_path | str | diff의 동일 필드 |
| approval_ref | str \| None | `decision.approval_ref` |
| policy_decision_ref | str \| None | `decision.policy_decision_ref` |
| next_alert | `AlertRequestedBody` | `build_pre_deploy_alert_request_body(diff, decision)` — PR 생성 성공 뒤 이어질 alert 게이트 payload(그 안의 `next_command`에 apply 명령 포함) |

## 동작 (Behavior)

### 핸들러 `on_desired_diff` (핵심 흐름)

1. `diff = evt.diff`.
2. `decision = evaluate_safe_pr_policy(diff)` — 정책 판정(아래).
3. `await persist_policy_decision(ctx.db, diff, decision)` — 승인 레코드 영속화(아래).
4. `yield DiffAnalyzedBody(diff=diff, safe=decision.safe, risk=diff.risk, reason=decision.reason)`.
5. `decision.route == POLICY_ROUTE_SAFE_PR`일 때만 `yield build_safe_pr_request_body(diff, decision)`. (코드 주석: "PR 생성 성공 뒤에만 alert/apply 흐름이 이어짐.")

### `evaluate_safe_pr_policy` 분기 (판정 순서 고정)

1. `diff.is_image_only_noop()` == True → `PolicyDecision(route="noop", safe=False, reason=Sandbox.NO_DIFF_REASON)` (= `"desired and actual images already match"`). approval_ref 없음.
2. `not diff.has_changes` → `PolicyDecision(route="noop", safe=False, reason=NO_ACTIONABLE_CHANGE_REASON)`. approval_ref 없음.
3. `approval_ref = derive_approval_id(diff.workflow_run_id)` (`src/domains/gitops/repository.py :: derive_approval_id`, `approval-<sha256(workflow_run_id|deploy-approval)[:32]>`).
   - `diff.risk == RiskLevel.SANDBOX_ONLY` → `route="safe_pr", safe=True, reason=SAFE_REASON, approval_ref, policy_decision_ref=policy_decision_ref(approval_ref, "safe_pr")`.
   - 그 외(`non-sandbox-namespace`, `review-required`) → `route="approval_required", safe=False, reason=UNSAFE_REASON, approval_ref, policy_decision_ref=policy_decision_ref(approval_ref, "approval_required")`.

### `persist_policy_decision`

1. `db is None` 이거나 `decision.approval_ref`가 없으면(noop 경로) 아무것도 하지 않음.
2. `getattr(db, "request_workflow_approval", None)` / `getattr(db, "resolve_workflow_approval", None)`로 duck-typing — `request`가 없으면 반환.
3. 승인 payload 구성: `approval_id=decision.approval_ref`, `workflow_run_id/workspace_id/application_id/binding_id/environment`는 diff에서, `status`는 route가 `safe_pr`이면 `ApprovalStatus.NOT_REQUIRED.value`("not_required") 아니면 `ApprovalStatus.REQUESTED.value`("requested"), `reason=decision.reason`, `requested_role=ResourceRole.RELEASE_OPERATOR.value`("release_operator"), `details=decision.details(diff)`(rollback_patches 포함).
4. `await request(approval_payload)`.
5. route가 `safe_pr`이고 `resolve`가 있으면 `await resolve({**approval_payload, "status": ApprovalStatus.GRANTED.value, "decided_by": "system-policy", "decision": "auto-approved"})` — 정책 자동 승인.

### PR 본문·patch 생성

- `build_safe_pr_request_body`: `decision` 미지정 시 재평가. summary는 `diff.desired_image`가 존재하고 `actual_image`와 다르면 `f"{diff.resource}: {diff.actual_image} → {diff.desired_image}"`, 아니면 `f"{diff.resource}: apply rendered manifest"`.
- `safe_pr_body`: summary 뒤에 `## GitOps Basis` 섹션 — `approval_ref`, `policy_decision_ref`, `diff_status`(=`diff.status`), `diff_basis`(=`diff.basis["comparison"]`, 없으면 `"unknown"`), `diff.basis["artifact_digest"]`가 있으면 `artifact_digest` 줄 추가, `rollback_patch`(rollback patch 경로들을 백틱·콤마로 나열, 없으면 `"없음"`).
- `build_manifest_patches`: `diff.desired_manifest`가 비어 있으면 `[]`. 아니면 `SafePrFilePatch(path=diff.manifest_path, content=yaml.safe_dump(diff.desired_manifest, sort_keys=False, allow_unicode=True), description=MANIFEST_PATCH_DESCRIPTION)` 1건 + `build_rollback_patches(diff)`를 이어 붙임.
- `build_rollback_patches`: `build_rollback_manifest(diff)`가 빈 dict이면 `[]`, 아니면 `SafePrFilePatch(path=rollback_patch_path(diff), content=yaml.safe_dump(rollback, ...), description=ROLLBACK_PATCH_DESCRIPTION)` 1건.
- `rollback_patch_path`: `manifest_name = PurePosixPath(diff.manifest_path).name`(빈 값이면 `"manifest.yaml"`), 파일명에 `.`이 없으면 `.yaml` 부여. `resource = diff.resource.replace("/", "-")`(빈 값이면 `"resource"`). 결과: `f".gitops/rollback/{diff.workflow_run_id}/{resource}-{manifest_name}"`.
- `build_rollback_manifest`: `desired_manifest`나 `changes`가 없으면 `{}`. `desired_manifest`를 deepcopy 후 각 change에 대해:
  - `classification == "already_converged"` → skip.
  - `field_path` 빈 값 → skip.
  - `before = change.get("before", change.get("live", MISSING))` — 롤백 값은 live/이전 값.
  - `apply_rollback_value(rollback, field_path, before)` 성공 시 applied 플래그. 하나도 적용 못 하면 `{}` 반환.

### field path 조작 유틸

- `split_field_path`: `[`...`]` 내부의 `.`은 무시하고 최상위 `.` 기준으로 분리(bracket depth 추적).
- `parse_list_selector`: `name[key=value]` 형태만 인정 — `[` 포함·`]`로 끝나고 name/`=`/key가 모두 있어야 `(name, (key, value))`, 아니면 `(None, ("", ""))`.
- `descend_manifest_path`: 일반 키는 dict에서 dict/list 자식만 통과. 리스트 셀렉터는 `parent[list_name]`(list)에서 `str(item[key]) == value`인 첫 dict 반환. 실패 시 `None`.
- `set_manifest_value`: 마지막 part가 리스트 셀렉터면 매칭된 dict의 `key`에 대입(값이 `MISSING`이면 `pop`), 일반 키면 parent dict에 대입/`pop`. 성공 여부 bool 반환.

### 후속 payload 빌더 (이 워커가 직접 발행하지 않음)

- `build_auto_command_request_body` → `CommandRequestedBody(cluster_id=diff.cluster_id or Target.DEFAULT_CLUSTER_ID, action=Command.APPLY_MANIFEST_ACTION("apply_manifest"), namespace=diff.namespace, reason="safe sandbox gitops apply", diff=diff, workspace_id/application_id/workflow_run_id/binding_id/environment=diff의 값, approval_ref/policy_decision_ref=decision의 값)`.
- `build_pre_deploy_alert_request_body` → `AlertRequestedBody(cluster_id=diff.cluster_id or Target.DEFAULT_CLUSTER_ID, namespace=diff.namespace, severity="info", message=f"pre-deploy check passed for {diff.resource}", reason="safe sandbox deploy will continue after alert gate", next_command=build_auto_command_request_body(diff, decision), ...)`.
- 이 둘은 `safe_pr.requested.next_alert`(및 그 안의 `next_command`)로 실려 가고, 실제 `alert.requested`/`command.requested` 발행은 downstream(PR 생성 성공 이후 체인)이 수행한다.

## 불변식·오류 (Invariants & Errors)

- `diff.analyzed`는 모든 입력에 대해 정확히 1회 발행된다. `safe_pr.requested`는 `route == "safe_pr"`(= `risk == sandbox-only`이고 실제 변경 존재)일 때만 발행된다.
- noop 경로(route `"noop"`)에서는 approval 레코드를 만들지 않는다(`approval_ref is None`).
- `approval_ref`/`policy_decision_ref`는 `workflow_run_id`에서 결정적으로 파생된다(재처리 시 동일 값 → upsert 멱등).
- `persist_policy_decision`은 store 능력을 `getattr`로 탐지한다 — `request_workflow_approval`이 없는 db가 주입되면 조용히 skip(예외 없음).
- rollback manifest는 `already_converged` 변경을 제외하고 live/이전 값을 되돌려 만든 것만 유효하다. 적용 가능한 필드가 없으면 rollback patch 자체가 생성되지 않는다.
- `DiffAnalyzedBody.risk`는 계약상 `str`이지만 코드에서는 `RiskLevel`(StrEnum)을 그대로 전달한다 — 직렬화 시 값 문자열이 실린다.
- 핸들러 내부에서 예외를 잡지 않는다 — DB/직렬화 실패 시 예외는 런타임([packages/runtime](../packages/runtime.md))의 재시도/DLQ 정책에 위임된다.

## 설정 (Settings)

없음 (환경변수를 직접 읽지 않는다).
