---
source_commit: c16954c64
status: synced
---

# diff-worker — 렌더된 manifest와 실제 상태의 managed-field 3-way diff 산출

> 소스: `src/services/gitops/diff-worker/app.py` · 테스트: `tests/test_diff_worker.py`, `tests/test_gitops_agent_boundary.py`

## 책임 (Responsibility)

- `manifest.rendered`를 구독해 렌더된 manifest(new desired) · live 상태 · 이전 승인 상태(old desired)를 managed-field 기준 3-way 비교하고, 결과 `Diff`를 `desired.diff.detected`로 발행한다.
- diff의 위험도(`RiskLevel`)를 namespace·비교 상태로 결정한다.
- 하지 않는 것: 정책 판정·승인·PR 생성(→ [diff-analyze-worker](gitops-diff-analyze-worker.md)), manifest 렌더링(→ [manifest-render-worker](gitops-manifest-render-worker.md)), target 클러스터 조회·변경. SSA dry-run을 포함한 Kubernetes API 실행은 cluster-agent만 담당한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.gitops` | [../../domains/gitops.md](../domains/gitops.md) | diffing 헬퍼(`ManagedFieldSnapshot`, `compare_managed_fields`, `build_adoption_required_changes`, `build_diff_basis`, `extract_declared_field_paths`, `rendered_manifest_to_object`, `resource_ref`, `snapshot_from_kubernetes_object`, `snapshot_from_rendered_manifest`, `summarize_status`), events(`DesiredDesiredDiffDetectedBody`, `Diff`, `ManifestRenderedBody`, `RenderedManifest`) |
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `RiskLevel`, `Sandbox` 상수 |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `EventBody` |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext` |
| 구독 | `manifest.rendered` | [./manifest-render-worker.md](gitops-manifest-render-worker.md) | 입력 이벤트 |
| 발행 | `desired.diff.detected` | [./diff-analyze-worker.md](gitops-diff-analyze-worker.md) | 출력 이벤트 |

## 공개 인터페이스 (Public API)

### app.py

| 심볼 | 값/시그니처 | 앵커 |
|---|---|---|
| `app` | `App("diff-worker")` | `src/services/gitops/diff-worker/app.py :: app` |
| `UNKNOWN_ACTUAL_IMAGE` | `"unknown"` | `src/services/gitops/diff-worker/app.py :: UNKNOWN_ACTUAL_IMAGE` |
| `RESOURCE_NOT_INSPECTED` | `"resource-not-inspected"` | `src/services/gitops/diff-worker/app.py :: RESOURCE_NOT_INSPECTED` |
| `REQUIRE_APPROVED_SNAPSHOT_ENV` | `"GITOPS_REQUIRE_APPROVED_SNAPSHOT"` | `src/services/gitops/diff-worker/app.py :: REQUIRE_APPROVED_SNAPSHOT_ENV` |
| `SSA_EXECUTION_BOUNDARY` | `"cluster_agent"` | SSA 실행 주체 불변식 |
| `SSA_EVIDENCE_UNAVAILABLE` | `"unavailable"` | agent 관측 snapshot 미연결 상태 |
| `REVIEW_REQUIRED_RISK` | `RiskLevel.REVIEW_REQUIRED` (기존 소비자 호환 별칭) | `src/services/gitops/diff-worker/app.py :: REVIEW_REQUIRED_RISK` |

```python
@dataclass(frozen=True)
class FieldPolicy:
    declared_fields: list[str]
    managed_fields: list[str]
    ignored_fields: list[str]
    unknown_fields: list[str]
    last_approved_snapshot: dict[str, object]
    source: str
```
`src/services/gitops/diff-worker/app.py :: FieldPolicy`

```python
async def load_actual_resource_image(evt: ManifestRenderedBody, ctx: EventContext[Any]) -> str
```
`src/services/gitops/diff-worker/app.py :: load_actual_resource_image`

```python
def build_desired_diff(evt: ManifestRenderedBody, actual_image: str) -> Diff
```
`src/services/gitops/diff-worker/app.py :: build_desired_diff`

```python
def load_field_policy(rendered: RenderedManifest) -> FieldPolicy
```
`src/services/gitops/diff-worker/app.py :: load_field_policy`

```python
def load_new_desired_snapshot(
    rendered: RenderedManifest,
) -> tuple[ManagedFieldSnapshot, dict[str, object]]
```
`src/services/gitops/diff-worker/app.py :: load_new_desired_snapshot`

```python
def load_live_snapshot(
    rendered: RenderedManifest, actual_image: str
) -> ManagedFieldSnapshot
```
`src/services/gitops/diff-worker/app.py :: load_live_snapshot`

```python
def load_previous_desired_snapshot(
    live: ManagedFieldSnapshot, policy: FieldPolicy
) -> ManagedFieldSnapshot
```
`src/services/gitops/diff-worker/app.py :: load_previous_desired_snapshot`

```python
def managed_image_path(rendered: RenderedManifest) -> str
```
`src/services/gitops/diff-worker/app.py :: managed_image_path` — `f"spec.template.spec.containers[name={rendered.metadata.name}].image"`.

```python
def env_enabled(name: str, default: str = "") -> bool
```
`src/services/gitops/diff-worker/app.py :: env_enabled` — `getenv(name, default).lower() in {"1", "true", "yes", "on"}`.

```python
def approved_snapshot_required() -> bool
```
`src/services/gitops/diff-worker/app.py :: approved_snapshot_required` — `env_enabled(REQUIRE_APPROVED_SNAPSHOT_ENV)`.

```python
def risk_for_diff(namespace: str, status: str) -> RiskLevel
```
`src/services/gitops/diff-worker/app.py :: risk_for_diff`

```python
def has_actionable_changes(changes: list[dict[str, object]]) -> bool
```
`src/services/gitops/diff-worker/app.py :: has_actionable_changes` — `classification != "already_converged"` 인 change가 하나라도 있으면 True.

```python
@app.on(ManifestRenderedBody)
async def on_manifest_rendered(
    evt: ManifestRenderedBody, ctx: EventContext
) -> AsyncIterator[EventBody]
```
`src/services/gitops/diff-worker/app.py :: on_manifest_rendered`

진입점: `if __name__ == "__main__": app.run()`.

## 데이터 모델 (Data Model)

자체 테이블 없음. 발행하는 `Diff` 값 객체(`src/domains/gitops/events.py :: Diff`)의 필드를 이 워커가 채우는 방식:

| 필드 | 타입 | 채우는 값 |
|---|---|---|
| resource | str | `new_desired.resource` 또는 `resource_ref(rendered.kind, rendered.metadata.name)` (`"<kind소문자>/<name>"`) |
| namespace | str | `rendered.metadata.namespace` 또는 `Sandbox.NAMESPACE`(`"sandbox"`) |
| desired_image | str | `new_desired.fields[managed_image_path]` 없으면 `rendered.spec.image` |
| actual_image | str | `live.fields[managed_image_path]` 없으면 인자 `actual_image` |
| risk | `RiskLevel` | `risk_for_diff(namespace, status)` |
| workspace_id, repository_id, watch_target_id, binding_id, application_id, workflow_run_id, environment, cluster_id, manifest_path | str | `evt`의 동일 필드 |
| resource_class | str | `rendered.resource_class` |
| desired_manifest | JsonObject | `rendered.manifest` |
| status | str | `summarize_status(changes)` — `review_required / adoption_required / intended_change / drift / already_converged / no_change` |
| has_changes | bool | `has_actionable_changes(changes)` |
| changes | `list[dict]` | `compare_managed_fields(...)` + `build_adoption_required_changes(...)` 결과. 각 항목: `field_path, classification, old_desired, live, new_desired, before, after` |
| basis | JsonObject | `build_diff_basis(...)` 결과 + `ssa_execution_boundary="cluster_agent"` + `ssa_evidence="unavailable"` + `rendered.artifact_digest`가 있으면 `artifact_digest` |

## 이벤트 (Events)

라우팅 키(subject) = 이벤트명 문자열(stream `SERVICE_EVENTS`).

### 구독 (Consumes)

**`manifest.rendered`** (`EventSubject.MANIFEST_RENDERED`) — body `src/domains/gitops/events.py :: ManifestRenderedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| rendered_manifest | `RenderedManifest` | (필수) — `api_version`(payload명 `apiVersion`), `kind`, `metadata{name,namespace}`, `spec{replicas,image}`, `resource_class`, `manifest`, `declared_fields`, `managed_fields`, `ignored_fields`, `last_approved_snapshot`, `artifact_digest` |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` |
| repository_id / watch_target_id / binding_id / application_id / workflow_run_id | str | gitops 기본값(`""`) |
| environment | str | `"sandbox"` |
| cluster_id | str | `Target.DEFAULT_CLUSTER_ID` |
| commit_sha | str | `""` |
| manifest_path | str | `"deploy.yaml"` |

### 발행 (Publishes)

**`desired.diff.detected`** (`EventSubject.DESIRED_DIFF_DETECTED`) — body `src/domains/gitops/events.py :: DesiredDesiredDiffDetectedBody`

| 필드 | 타입 | 값 |
|---|---|---|
| diff | `Diff` | `build_desired_diff(evt, actual_image)` 결과 (위 데이터 모델) |

입력 1건당 무조건 1건 발행한다(변경 없음/no-op 판정은 downstream [diff-analyze-worker](gitops-diff-analyze-worker.md) 책임).

## 동작 (Behavior)

### 핸들러 `on_manifest_rendered`

1. `evt.rendered_manifest.spec.image`가 있으면 `actual_image = await load_actual_resource_image(evt, ctx)`, 없으면(image 없는 Service/ConfigMap 등) `actual_image = RESOURCE_NOT_INSPECTED`.
2. `diff = build_desired_diff(evt, actual_image)`.
3. `yield DesiredDesiredDiffDetectedBody(diff=diff)`.

### `load_actual_resource_image`

1. `reader = ctx.db.get_actual_resource_image` — `AttributeError`면 즉시 `UNKNOWN_ACTUAL_IMAGE`(`"unknown"`) 반환 (store에 이 능력이 없을 때의 fallback).
2. 있으면 `await reader(evt.workspace_id, evt.cluster_id, evt.rendered_manifest.metadata.namespace or Sandbox.NAMESPACE, resource_ref(kind, name))` 호출, truthy면 `str(actual)`, 아니면 `"unknown"`.

### `build_desired_diff` (3-way 비교 파이프라인)

1. `namespace = rendered.metadata.namespace or "sandbox"`.
2. `policy = load_field_policy(rendered)`:
   - `declared_fields` = `rendered.declared_fields`가 있으면 그것, 없으면 `extract_declared_field_paths(rendered_manifest_to_object(rendered))` — 정렬·중복 제거.
   - `ignored_fields` = `sorted(set(rendered.ignored_fields))`.
   - 명시 정책 존재 여부 = `rendered.managed_fields or rendered.ignored_fields or rendered.last_approved_snapshot`:
     - 있으면: `managed_fields = sorted(set(rendered.managed_fields))`; 비어 있고 `last_approved_snapshot`이 있으면 snapshot의 키들을 managed로 사용. `source="rendered_policy"`.
     - 없고 `approved_snapshot_required()`이면: `managed_fields=[]`, `source="missing_approved_policy"`.
     - 둘 다 아니면(dev fallback): `managed_fields = declared_fields`, `source="dev_declared_fields_fallback"`.
   - `unknown_fields = sorted(set(declared) - set(managed) - set(ignored))`.
3. `new_desired, ssa_meta = load_new_desired_snapshot(rendered)`: target API를 호출하지 않고 rendered manifest snapshot을 사용하며 `ssa_execution_boundary="cluster_agent"`, `ssa_evidence="unavailable"`를 기록한다.
4. `live = load_live_snapshot(rendered, actual_image)`: DB에 보존된 관측 이미지를 rendered manifest에 합성해 `source="observed_actual_image"` snapshot을 만든다. SSA 관측 결과가 필요하면 cluster-agent가 수집·저장한 계약을 통해서만 입력한다.
5. `old_desired = load_previous_desired_snapshot(live, policy)`:
   - `policy.last_approved_snapshot`이 있으면 그 필드들로 snapshot(`source="last_approved_snapshot"`).
   - 없고 `approved_snapshot_required()`이면 빈 필드 snapshot(`source="missing_last_approved_snapshot"`).
   - 둘 다 아니면 live 필드 복사(`source="dev_previous_live_fallback"`).
6. `changes = compare_managed_fields(old_desired=..., live=..., new_desired=..., managed_fields=policy.managed_fields, ignored_fields=policy.ignored_fields)` — 분류: `no_change`(제외) / `already_converged` / `intended_change` / `drift` / `conflict_or_manual_change` / `adoption_required` (`src/domains/gitops/diffing.py :: classify_field_change`).
7. `changes.extend(build_adoption_required_changes(live=..., new_desired=..., unknown_fields=policy.unknown_fields))` — 정책 미분류(unknown) 필드는 `adoption_required`로 추가.
8. `status = summarize_status(changes)` — 우선순위: `conflict_or_manual_change→review_required` > `adoption_required` > `intended_change` > `drift` > `already_converged` > `no_change`.
9. `basis = build_diff_basis(...)`(comparison=`"managed-field-3way"`, 각 스냅샷 source, observed/declared/policy_managed/ignored/unknown 필드 목록, policy_source) → `basis.update(ssa_meta)` → `rendered.artifact_digest` 있으면 `basis["artifact_digest"]` 추가.
10. 위 데이터 모델 표대로 `Diff` 구성·반환.

### `risk_for_diff`

1. `namespace != "sandbox"` → `RiskLevel.NON_SANDBOX_NAMESPACE`.
2. `status in {"review_required", "adoption_required"}` → `RiskLevel.REVIEW_REQUIRED`.
3. 그 외 → `RiskLevel.SANDBOX_ONLY`.

## 불변식·오류 (Invariants & Errors)

- 입력 `manifest.rendered` 1건당 `desired.diff.detected` 1건 — 이 워커는 필터링하지 않는다.
- diff-worker에는 target 클러스터 credential, `kubectl`, Kubernetes HTTP client가 없다. SSA dry-run 실행자는 `cluster-agent` 하나뿐이다.
- `GITOPS_REQUIRE_APPROVED_SNAPSHOT` 활성 + 명시 정책/snapshot 부재 시 `managed_fields=[]`가 되어 declared 필드 전부가 `unknown_fields` → `adoption_required` change → `status="adoption_required"` → `risk=review-required` (fail-closed).
- dev fallback(스냅샷 요구 off)에서는 old_desired=live라 `drift`가 감지되지 않고 `intended_change` 중심으로 분류된다(코드의 source 명칭 `dev_previous_live_fallback` 그대로).
- `ctx.db.get_actual_resource_image`는 `AttributeError`를 잡는 duck-typing이다. 현재 리포지토리의 어떤 store에도 이 메서드 구현이 없어 항상 `"unknown"` fallback이 동작한다(스펙 특이사항 — 코드 사실 그대로).
- 핸들러는 예외를 잡지 않는다 — 실패 시 런타임 재시도/DLQ 정책에 위임.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `GITOPS_REQUIRE_APPROVED_SNAPSHOT` | bool 문자열(`1/true/yes/on`) | 꺼짐(`""`) | 명시 정책/승인 snapshot 없을 때 dev fallback 금지(fail-closed) |
