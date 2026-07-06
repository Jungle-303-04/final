---
source_commit: 20945a70
status: synced
---

# target-drift-worker — 드리프트 감지 이벤트를 sync 명령 요청과 운영자 알림으로 변환하는 워커

> 소스: `src/services/target/drift-worker/` (app.py, events.py)

## 책임 (Responsibility)

- `cluster.drift.detected` 이벤트를 구독하여, 이벤트에 담긴 **각 드리프트 항목마다**:
  1. 해당 컴포넌트를 목표 상태로 되돌리기 위한 `command.requested`(action=`"sync"`) 이벤트를 발행하고,
  2. 운영자에게 알리기 위한 `alert.requested`(severity=`"warning"`) 이벤트를 발행한다.
- 드리프트를 **판정하지 않는다** — 판정은 [reconcile-worker](target-reconcile-worker.md)의 책임이다.
- 명령 실행·알림 전송도 하지 않는다 — 각각 command 도메인 워커와 alert 도메인 워커의 책임이다.
- DB 접근 없음(핸들러가 `ctx.db`를 사용하지 않음).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.target.events` | [target 도메인](../domains/target.md) | 구독 이벤트 `ClusterDriftDetectedBody`, 값 객체 `TargetDrift` |
| import | `domains.command.events` | [command 도메인](../domains/command.md) | 발행 이벤트 `CommandRequestedBody` |
| import | `domains.alert.events` | [alert 도메인](../domains/alert.md) | 발행 이벤트 `AlertRequestedBody` |
| import | `domains.gitops.events` | [gitops 도메인](../domains/gitops.md) | 값 객체 `Diff` (CommandRequestedBody.diff 필드 타입) |
| import | `packages.config.constants` | [config 패키지](../packages/config.md) | `RiskLevel.REVIEW_REQUIRED` |
| import | `packages.contracts.event_bus.bodies` | [contracts 패키지](../packages/contracts.md) | `EventBody` (핸들러 반환 타입) |
| import | `packages.runtime.app` | [runtime 패키지](../packages/runtime.md) | `App`, `EventContext` |
| 이벤트 | NATS JetStream | [events 패키지](../packages/events.md) | 구독/발행 (App 런타임이 은닉) |

관련 서비스: 드리프트 이벤트의 생산자는 [reconcile-worker](target-reconcile-worker.md).

## 공개 인터페이스 (Public API)

`app.py`의 `__all__ = ["app", "on_drift_detected"]`.

### app

```python
app = App("target-drift-worker")
app.on(ClusterDriftDetectedBody)(on_drift_detected)
```

- 앵커: `src/services/target/drift-worker/app.py :: app`
- 서비스 이름은 `"target-drift-worker"`. `ClusterDriftDetectedBody` 단일 구독.
- `if __name__ == "__main__": app.run()` 으로 실행.

### on_drift_detected

```python
async def on_drift_detected(
    evt: ClusterDriftDetectedBody, ctx: EventContext
) -> AsyncIterator[EventBody]
```

- 앵커: `src/services/target/drift-worker/events.py :: on_drift_detected`
- 드리프트 감지 시 각 항목에 대해 sync 명령을 요청하고 운영자에게 알림을 발행한다.

### 상수

```python
DRIFT_ALERT_SEVERITY = "warning"
DRIFT_SYNC_ACTION = "sync"
```

- 앵커: `src/services/target/drift-worker/events.py :: DRIFT_ALERT_SEVERITY`, `src/services/target/drift-worker/events.py :: DRIFT_SYNC_ACTION`

### 내부 헬퍼 (비공개)

```python
def _diff_from_drift(drift: TargetDrift, evt: ClusterDriftDetectedBody) -> Diff
```

- 앵커: `src/services/target/drift-worker/events.py :: _diff_from_drift`
- `TargetDrift` 값 객체를 `CommandRequestedBody`가 요구하는 `Diff`로 변환한다(밑줄 시작 — public 커버리지 대상 아님, 동작 명세를 위해 기재).

## 이벤트 (Events)

라우팅 키 = NATS subject = `EventSubject` 값 문자열 그대로(프리픽스 없음).

### 구독 (Consumes)

| 이벤트명(라우팅 키) | body | 정의 앵커 |
|---|---|---|
| `cluster.drift.detected` | `ClusterDriftDetectedBody` | `src/domains/target/events.py :: ClusterDriftDetectedBody` |

`ClusterDriftDetectedBody` 필드:

| 필드 | 타입 | 기본값 |
|---|---|---|
| `cluster_id` | `str` | (필수) |
| `desired_state_version` | `str` | (필수) |
| `drifts` | `list[TargetDrift]` | (필수) |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` (`"default"`) |

`TargetDrift` (값 객체, `src/domains/target/events.py :: TargetDrift`):

| 필드 | 타입 | 기본값 |
|---|---|---|
| `component` | `str` | (필수) |
| `reason` | `str` | (필수) |
| `desired` | `JsonObject` | (필수) |
| `actual` | `JsonObject \| None` | `None` |

### 발행 (Publishes)

| 이벤트명(라우팅 키) | body | 정의 앵커 |
|---|---|---|
| `command.requested` | `CommandRequestedBody` | `src/domains/command/events.py :: CommandRequestedBody` |
| `alert.requested` | `AlertRequestedBody` | `src/domains/alert/events.py :: AlertRequestedBody` |

이 워커가 채우는 필드(나머지는 body 기본값):

`CommandRequestedBody`: `cluster_id=evt.cluster_id`, `action="sync"`, `namespace=drift.desired.get("namespace", "default")`, `reason=drift.reason`, `diff=<변환된 Diff>`.

`AlertRequestedBody`: `cluster_id=evt.cluster_id`, `namespace=diff.namespace`, `severity="warning"`, `message=f"drift detected on {drift.component}: {drift.reason}"`, `reason=drift.reason`, `next_command=<방금 만든 CommandRequestedBody>`.

## 동작 (Behavior)

`on_drift_detected` 는 `evt.drifts` 를 순회하며 드리프트 1건당 이벤트 2개를 순서대로 yield 한다.

1. **Diff 변환** — `_diff_from_drift(drift, evt)`:
   - `resource = drift.component`
   - `namespace = drift.desired.get("namespace", "default")`
   - `desired_image = drift.desired.get("image", "")`
   - `actual_image = (drift.actual or {}).get("image", "")` — `actual` 이 `None` 이면 빈 dict 취급
   - `risk = RiskLevel.REVIEW_REQUIRED` (wire 값 `"review-required"`) — 드리프트 복구는 항상 사람 검토 대상 위험도로 태깅
2. **sync 명령 요청** — 위 필드로 `CommandRequestedBody` 를 만들어 `yield`.
3. **알림 요청** — `AlertRequestedBody` 를 `yield`. `next_command` 에 2번에서 만든 명령 body 를 그대로 실어, 알림 게이트 통과 시 다음 실행으로 연결될 수 있게 한다.

`evt.drifts` 가 빈 리스트면 아무 이벤트도 발행하지 않는다.

yield 된 body 는 [runtime 패키지](../packages/runtime.md)의 dispatch 가 `EventEnvelope` 로 감싸(`correlation_id` 승계, `causation_id` = 구독 이벤트의 `event_id`) outbox 경유로 발행한다.

## 불변식·오류 (Invariants & Errors)

- 드리프트 1건당 정확히 `command.requested` 1개 + `alert.requested` 1개, 이 순서로 발행된다.
- `command.requested` 의 `namespace` 와 `alert.requested` 의 `namespace` 는 항상 같다(둘 다 `drift.desired` 의 `namespace`, 없으면 `"default"`).
- 발행하는 `Diff.risk` 는 항상 `RiskLevel.REVIEW_REQUIRED`.
- 핸들러 내부에 예외 처리 없음 — `drift.desired` / `drift.actual` 접근은 `.get()` 기반이라 키 부재로는 실패하지 않으며, 그 외 예외는 런타임(WorkerRuntime)으로 전파된다.

## 설정 (Settings)

이 서비스 고유의 환경변수·설정 키 없음. NATS 접속 등 공통 런타임 설정은 [runtime 패키지](../packages/runtime.md) 스펙을 따른다.
