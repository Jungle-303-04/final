---
source_commit: 1616d295
status: synced
---

# target-reconcile-worker — desired/actual 상태 비교(reconcile)를 실행하고 판정 결과를 기록·발행하는 워커

> 소스: `src/services/target/reconcile-worker/` (app.py, events.py) · 테스트: `tests/test_target_reconciler.py`

## 책임 (Responsibility)

- `cluster.desired_state.changed` 를 받아 즉시 `cluster.reconcile.requested` 로 변환한다(목표 상태 변경 → reconcile 트리거).
- `cluster.reconcile.requested` 를 받아:
  - DB에서 해당 클러스터의 desired state 목록을 읽고,
  - 이벤트에 실린 `actual_state` 스냅샷과 비교(`TargetReconciler.evaluate`)해 드리프트를 판정하고,
  - 판정 결과를 DB(`record_target_reconcile_result`)에 기록하고 `cluster.reconcile.started` / `cluster.drift.detected` / `cluster.reconcile.completed` / `cluster.reconcile.failed` 를 발행한다.
- 드리프트 **복구 조치는 하지 않는다**(`applied` 는 항상 `False`) — sync 명령 요청은 [drift-worker](target-drift-worker.md)의 책임이다.
- actual state 를 직접 수집하지 않는다 — `evt.actual_state` 로 전달받은 스냅샷만 사용한다(수집은 [cluster-agent](target-cluster-agent.md) 계열의 책임).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.target.events` | [target 도메인](../domains/target.md) | 구독/발행 이벤트 body 전부, `TargetDesiredComponent` |
| import | `domains.target.reconciler` | [target 도메인](../domains/target.md) | `TargetReconciler`, `ActualStateSnapshot` (비교 로직) |
| import | `packages.contracts.event_bus.bodies` | [contracts 패키지](../packages/contracts.md) | `EventBody` |
| import | `packages.contracts.event_bus.interfaces` | [contracts 패키지](../packages/contracts.md) | `JsonObject` |
| import | `packages.contracts.stores` | [contracts 패키지](../packages/contracts.md) | `TargetReconcileStore` (DB 포트) |
| import | `packages.contracts.target` | [contracts 패키지](../packages/contracts.md) | `TargetReconcileStatus` |
| import | `packages.runtime.app` | [runtime 패키지](../packages/runtime.md) | `App`, `EventContext` |
| 이벤트 | NATS JetStream | [events 패키지](../packages/events.md) | 구독/발행 (App 런타임이 은닉) |
| 외부 | DB (`ctx.db`) | [contracts 패키지](../packages/contracts.md) | `TargetReconcileStore` 프로토콜 구현체를 통해 접근 |

## 공개 인터페이스 (Public API)

`app.py`의 `__all__ = ["actual_components", "app", "component_from_row", "on_desired_state_changed", "on_reconcile_requested", "record_reconcile"]`.

### app

```python
app = App("target-reconcile-worker")
app.on(ClusterDesiredStateChangedBody)(on_desired_state_changed)
app.on(ClusterReconcileRequestedBody)(on_reconcile_requested)
```

- 앵커: `src/services/target/reconcile-worker/app.py :: app`
- 서비스 이름은 `"target-reconcile-worker"`. subject 2종 구독.
- `if __name__ == "__main__": app.run()` 으로 실행.

### on_desired_state_changed

```python
async def on_desired_state_changed(
    evt: ClusterDesiredStateChangedBody, ctx: EventContext
) -> AsyncIterator[EventBody]
```

- 앵커: `src/services/target/reconcile-worker/events.py :: on_desired_state_changed`

### on_reconcile_requested

```python
async def on_reconcile_requested(
    evt: ClusterReconcileRequestedBody, ctx: EventContext[TargetReconcileStore]
) -> AsyncIterator[EventBody]
```

- 앵커: `src/services/target/reconcile-worker/events.py :: on_reconcile_requested`

### component_from_row

```python
def component_from_row(row: JsonObject) -> TargetDesiredComponent
```

- 앵커: `src/services/target/reconcile-worker/events.py :: component_from_row`
- DB row → `TargetDesiredComponent(component=str(row["component"]), namespace=str(row["namespace"]), version=str(row["version"]), spec=dict(row.get("spec", {})))`.
- `component`/`namespace`/`version` 키 부재 시 `KeyError` 발생(호출부의 try 블록이 잡음).

### actual_components

```python
def actual_components(actual_state: JsonObject) -> dict[str, JsonObject]
```

- 앵커: `src/services/target/reconcile-worker/events.py :: actual_components`
- `actual_state["components"]` 가 dict 면 그 복사본을, 아니면(부재 포함) 빈 dict 를 반환.

### record_reconcile

```python
async def record_reconcile(
    ctx: EventContext[TargetReconcileStore],
    completed: ClusterReconcileCompletedBody,
    desired_components: list[TargetDesiredComponent],
    actual_state: JsonObject | None,
) -> None
```

- 앵커: `src/services/target/reconcile-worker/events.py :: record_reconcile`

### record_reconcile_failure

```python
async def record_reconcile_failure(
    ctx: EventContext[TargetReconcileStore],
    failed: ClusterReconcileFailedBody,
    actual_state: JsonObject | None,
) -> None
```

- 앵커: `src/services/target/reconcile-worker/events.py :: record_reconcile_failure`
- public 심볼이지만 `app.py` 의 `__all__` 에는 포함되지 않는다(재노출 대상 아님).

### 상수

```python
ACTUAL_STATE_PENDING_MESSAGE = "actual state snapshot is not available yet"
```

- 앵커: `src/services/target/reconcile-worker/events.py :: ACTUAL_STATE_PENDING_MESSAGE`

## 데이터 모델 (Data Model)

### TargetReconcileStore (DB 포트)

앵커: `src/packages/contracts/stores.py :: TargetReconcileStore`

```python
class TargetReconcileStore(Protocol):
    async def list_target_desired_states(
        self, workspace_id: str, cluster_id: str
    ) -> list[JsonObject]: ...

    async def record_target_reconcile_result(self, payload: JsonObject) -> JsonObject: ...
```

`list_target_desired_states` 가 반환하는 row 는 최소 `component`, `namespace`, `version` 키(필수)와 선택적 `spec` 키를 가진다(`component_from_row` 가 소비).

`record_target_reconcile_result` 에 전달하는 payload (성공/판정 경로, `record_reconcile`):

| 키 | 값 |
|---|---|
| `workspace_id` | `completed.workspace_id` |
| `cluster_id` | `completed.cluster_id` |
| `desired_state_version` | `completed.desired_state_version` |
| `status` | `completed.status` |
| `drifted` | `completed.drifted` |
| `applied` | `completed.applied` |
| `message` | `completed.message` |
| `details.desired_components` | `[component.to_body() for component in desired_components]` |
| `details.actual_state` | `actual_state` (그대로, `None` 가능) |
| `details.drifts` | `[drift.to_body() for drift in completed.drifts]` |

실패 경로(`record_reconcile_failure`):

| 키 | 값 |
|---|---|
| `workspace_id` / `cluster_id` / `desired_state_version` | `failed.*` |
| `status` | `failed.status` (기본 `"failed"`) |
| `drifted` | `False` |
| `applied` | `False` |
| `message` | `failed.message` |
| `details.error_type` | `failed.error_type` |
| `details.actual_state` | `actual_state` |

### TargetReconcileStatus

앵커: `src/packages/contracts/target.py :: TargetReconcileStatus`

| 값 | 의미 |
|---|---|
| `"requested"` | actual state 미도착으로 판정 보류 |
| `"in_sync"` | 드리프트 없음 |
| `"drifted"` | 드리프트 존재 |
| `"failed"` | 처리 실패 |

## 이벤트 (Events)

라우팅 키 = NATS subject = `EventSubject` 값 문자열 그대로. body 정의는 모두 `src/domains/target/events.py`.

### 구독 (Consumes)

**`cluster.desired_state.changed`** — `ClusterDesiredStateChangedBody` (`src/domains/target/events.py :: ClusterDesiredStateChangedBody`)

| 필드 | 타입 | 기본값 |
|---|---|---|
| `cluster_id` | `str` | (필수) |
| `desired_state_version` | `str` | (필수) |
| `components` | `list[TargetDesiredComponent]` | (필수) |
| `reason` | `str` | (필수) |
| `workspace_id` | `str` | `"default"` |
| `requested_by` | `str \| None` | `None` |

**`cluster.reconcile.requested`** — `ClusterReconcileRequestedBody` (`src/domains/target/events.py :: ClusterReconcileRequestedBody`)

| 필드 | 타입 | 기본값 |
|---|---|---|
| `cluster_id` | `str` | (필수) |
| `desired_state_version` | `str` | (필수) |
| `reason` | `str` | (필수) |
| `workspace_id` | `str` | `"default"` |
| `requested_by` | `str \| None` | `None` |
| `actual_state` | `JsonObject \| None` | `None` |

### 발행 (Publishes)

| 이벤트명(라우팅 키) | body | 발행 시점 |
|---|---|---|
| `cluster.reconcile.requested` | `ClusterReconcileRequestedBody` | `on_desired_state_changed` — 항상 1건 (`actual_state` 미포함=`None`) |
| `cluster.reconcile.started` | `ClusterReconcileStartedBody` | `on_reconcile_requested` — desired 목록 변환 성공 직후 |
| `cluster.drift.detected` | `ClusterDriftDetectedBody` | `on_reconcile_requested` — 판정 결과 `drifted=True` 일 때만 |
| `cluster.reconcile.completed` | `ClusterReconcileCompletedBody` | `on_reconcile_requested` — 판정 보류 또는 판정 완료 시 |
| `cluster.reconcile.failed` | `ClusterReconcileFailedBody` | `on_reconcile_requested` — try 블록 내 예외 시 |

발행 body 필드:

`ClusterReconcileStartedBody` (`src/domains/target/events.py :: ClusterReconcileStartedBody`): `cluster_id`, `desired_state_version`, `component_count: int`, `workspace_id`.

`ClusterDriftDetectedBody` (`src/domains/target/events.py :: ClusterDriftDetectedBody`): `cluster_id`, `desired_state_version`, `drifts: list[TargetDrift]`, `workspace_id` — 소비자는 [drift-worker](target-drift-worker.md).

`ClusterReconcileCompletedBody` (`src/domains/target/events.py :: ClusterReconcileCompletedBody`): `cluster_id`, `desired_state_version`, `status: str`, `drifted: bool`, `applied: bool`, `message: str`, `drifts: list[TargetDrift] = []`, `workspace_id`.

`ClusterReconcileFailedBody` (`src/domains/target/events.py :: ClusterReconcileFailedBody`): `cluster_id`, `desired_state_version`, `error_type: str`, `message: str`, `status: str = "failed"`, `workspace_id`.

## 동작 (Behavior)

### on_desired_state_changed

1. 입력 이벤트의 `workspace_id`, `cluster_id`, `desired_state_version`, `reason`, `requested_by` 를 그대로 복사해 `ClusterReconcileRequestedBody` 1건을 yield 한다. (`evt.components` 는 사용하지 않고, `actual_state` 는 기본값 `None` 으로 남는다.)

### on_reconcile_requested

1. `rows = await ctx.db.list_target_desired_states(evt.workspace_id, evt.cluster_id)` — **try 블록 밖**에서 desired state 목록 조회.
2. try 블록 진입:
   1. `components = [component_from_row(row) for row in rows]` 로 변환.
   2. `ClusterReconcileStartedBody(component_count=len(components), ...)` yield.
   3. **분기: `evt.actual_state is None`** (actual 스냅샷 미도착):
      - `ClusterReconcileCompletedBody(status="requested", drifted=False, applied=False, message=ACTUAL_STATE_PENDING_MESSAGE)` 생성.
      - `record_reconcile(ctx, completed, components, evt.actual_state)` 로 DB 기록.
      - completed yield 후 **return** (판정 보류).
   4. actual 스냅샷이 있으면 `TargetReconciler().evaluate(components, ActualStateSnapshot(components=actual_components(evt.actual_state)))` 실행. 비교 규칙(`src/domains/target/reconciler.py :: TargetReconciler.evaluate`) — desired 컴포넌트별로 순서대로 검사, 첫 매칭 사유 1건만 기록:
      - actual 에 `desired.component` 키 없음 → drift(reason=`"component missing from actual state"`, actual=`None`)
      - `str(actual_component.get("version", "")) != desired.version` → drift(reason=`"component version differs"`)
      - `dict(actual_component.get("spec", {})) != desired.spec` → drift(reason=`"component spec differs"`)
      - drift 의 `desired` 필드는 `desired.to_body()`, `actual` 필드는 actual_component 그대로 (`src/domains/target/reconciler.py :: component_drift`).
      - 판정: drift 1건 이상 → `ReconcileDecision(status="drifted", drifted=True, message="desired and actual state differ")`; 없음 → `(status="in_sync", drifted=False, message="desired and actual state are in sync")`.
   5. **분기: `decision.drifted`** → `ClusterDriftDetectedBody(drifts=decision.drifts)` yield.
   6. `ClusterReconcileCompletedBody(status=decision.status, drifted=decision.drifted, applied=False, message=decision.message, drifts=decision.drifts)` 생성 → `record_reconcile` 로 DB 기록 → yield.
3. **except Exception** (try 블록 내 어떤 예외든):
   - `ClusterReconcileFailedBody(error_type=type(exc).__name__, message=str(exc) or type(exc).__name__)` 생성.
   - `record_reconcile_failure(ctx, failed, evt.actual_state)` 로 DB 기록.
   - failed yield.

## 불변식·오류 (Invariants & Errors)

- `applied` 는 이 워커가 발행하는 모든 `cluster.reconcile.completed` 에서 항상 `False` (복구 미수행).
- `cluster.drift.detected` 는 `decision.drifted=True` 일 때만, `cluster.reconcile.completed` 보다 먼저 발행된다.
- completed/failed 를 yield 하기 **전에** 반드시 DB 기록(`record_target_reconcile_result`)이 선행된다.
- actual 스냅샷 부재(판정 보류) 시 status 는 `"requested"`, `drifted=False`, drift 이벤트 없음.
- desired 컴포넌트 1개당 drift 는 최대 1건(missing > version > spec 순으로 첫 사유만).
- `list_target_desired_states` 호출은 try 밖이므로 이 호출이 실패하면 `cluster.reconcile.failed` 가 발행되지 않고 예외가 런타임으로 전파된다.
- `record_reconcile` / `record_reconcile_failure` 내부 예외: 전자는 try 블록 안이라 failed 경로로 전환되고, 후자는 런타임으로 전파된다.
- 예외 메시지가 빈 문자열이면 `message` 에 예외 타입명을 대신 넣는다.

## 설정 (Settings)

이 서비스 고유의 환경변수·설정 키 없음. NATS·DB 접속 등 공통 런타임 설정은 [runtime 패키지](../packages/runtime.md) 스펙을 따른다.
