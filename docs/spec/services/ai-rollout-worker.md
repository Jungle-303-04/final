---
source_commit: 1616d295
status: synced
---

# rollout-worker — 명령 실행 결과 → 롤아웃 진단

> 소스: `src/services/ai/rollout-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `command.completed` 의 실행 결과(JsonObject)를 결정적 규칙으로 진단해
  `rollout.diagnosed` 를 발행한다(→ [approval-worker](ai-approval-worker.md) 가 권고로 변환).
- ctx 미사용, DB 저장 없음, LLM 없음.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.command.events` | [../../domains/command.md](../domains/command.md) | `CommandCompletedBody` |
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `RolloutDiagnosedBody` |
| import | `packages.config.constants` | [../../packages/config.md](../packages/config.md) | `CommandStatus.COMPLETED` (= `"completed"`) |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App` |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/rollout-worker/app.py :: app` | `App("rollout-worker")` |
| `NEXT_OBSERVE` / `NEXT_RETRY` / `NEXT_MANUAL_REVIEW` | `src/services/ai/rollout-worker/app.py :: NEXT_OBSERVE` 등 | `"observe"` / `"retry"` / `"manual_review"` |
| `failed_resources(result)` | `src/services/ai/rollout-worker/app.py :: failed_resources` | `result["resources"]`(list 아닐 시 `[]`)에서 `applied is False` 또는 `status.lower()=="failed"` 인 Mapping만 dict로 수집 |
| `rollout_ready(result)` | `src/services/ai/rollout-worker/app.py :: rollout_ready` | `result["rollout"]` 이 Mapping이고 `ready is False` 면 False, 그 외 True |
| `rollout_applied(result)` | `src/services/ai/rollout-worker/app.py :: rollout_applied` | `status=="completed" and applied is True and not failed_resources and rollout_ready` |
| `next_action_for_result(result)` | `src/services/ai/rollout-worker/app.py :: next_action_for_result` | applied → `observe`; `retryable is True` → `retry`; 그 외 `manual_review` |
| `diagnosis_for_result(result)` | `src/services/ai/rollout-worker/app.py :: diagnosis_for_result` | applied → `"rollout command applied and reported healthy"`; 실패 리소스 있으면 `"rollout command reported {N} failed resource(s)"`; 그 외 `str(result["message"] or result["status"] or "rollout command failed")` |
| `on_command_completed(evt)` | `src/services/ai/rollout-worker/app.py :: on_command_completed` | 유일한 핸들러 |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `CommandCompletedBody` | `command.completed` | `command_id: str, result: JsonObject` |

### 발행 (Publishes)

| 이벤트 | 라우팅 키 | 구성 |
|---|---|---|
| `RolloutDiagnosedBody` | `rollout.diagnosed` | `diagnosis=diagnosis_for_result(result)`, `next_action=next_action_for_result(result)`, `details={**result, "command_id": evt.command_id, "failed_resources": failed_resources(result)}`, `workspace_id=str(result.get("workspace_id", "default"))` |

## 동작 (Behavior)

1. 결과 dict에서 실패 리소스·ready 상태·retryable 플래그를 결정적으로 판독.
2. 진단 문자열과 다음 행동(`observe`/`retry`/`manual_review`)을 계산해 1건 발행.

## 불변식·오류 (Invariants & Errors)

- `next_action` 값 집합은 `{observe, retry, manual_review}` 로 고정 —
  approval-worker 의 `recommendation` 으로 그대로 흐른다.
- `workspace_id` 는 result payload에서 취득(없으면 `"default"`).
- 핸들러 예외 시 공통 재시도/DLQ 정책.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=rollout-worker`).
