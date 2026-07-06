---
source_commit: 1616d295
status: synced
---

# rca-feedback-worker — RCA blocked/action/fallback → 후속 조치 정규화

> 소스: `src/services/ai/rca-feedback-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- RCA 파이프라인의 4가지 "자동 진행 불가" 이벤트를 단일 후속 조치 계약
  `rca.followup.required` (`RcaFollowupRequiredBody`) 로 정규화한다.
- `next_actions` 가 비어 있으면 missing evidence 기반 수집 액션 또는 수동 검토 액션을 합성한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `RcaActionRequiredBody`, `RcaAiFallbackRequestedBody`, `RcaAnalysisBlockedBody`, `RcaFollowupRequiredBody` |
| import | `packages.contracts.event_bus.bodies.platform` | [../../packages/contracts.md](../packages/contracts.md) | `PipelineContractFailedBody` |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App` |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/rca-feedback-worker/app.py :: app` | `App("rca-feedback-worker")` |
| `SEVERITY_WARNING` | `src/services/ai/rca-feedback-worker/app.py :: SEVERITY_WARNING` | `"warning"` |
| `collect_actions_for_missing(missing_evidence)` | `src/services/ai/rca-feedback-worker/app.py :: collect_actions_for_missing` | source별 `{"action_type": "collect_evidence", "source", "query_id": f"collect_{source}", "description": "{source} 근거를 수집한 뒤 RCA 평가를 재실행합니다."}` |
| `normalize_next_actions(next_actions, missing_evidence)` | `src/services/ai/rca-feedback-worker/app.py :: normalize_next_actions` | 있으면 그대로 → missing 있으면 수집 액션 → 아니면 `{"action_type": "manual_review", "description": "자동 후속 조치를 결정할 정보가 부족해 운영자 검토가 필요합니다."}` |
| `on_rca_analysis_blocked(evt)` | `src/services/ai/rca-feedback-worker/app.py :: on_rca_analysis_blocked` | 핸들러 |
| `on_rca_action_required(evt)` | `src/services/ai/rca-feedback-worker/app.py :: on_rca_action_required` | 핸들러 |
| `on_pipeline_contract_failed(evt)` | `src/services/ai/rca-feedback-worker/app.py :: on_pipeline_contract_failed` | 핸들러 |
| `on_ai_fallback_requested(evt)` | `src/services/ai/rca-feedback-worker/app.py :: on_ai_fallback_requested` | 핸들러 |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 |
|---|---|
| `RcaAnalysisBlockedBody` | `rca.analysis_blocked` |
| `RcaActionRequiredBody` | `rca.action_required` |
| `PipelineContractFailedBody` | `pipeline.contract_failed` |
| `RcaAiFallbackRequestedBody` | `rca.ai_fallback.requested` |

### 발행 (Publishes)

모든 핸들러가 `RcaFollowupRequiredBody` (`rca.followup.required`) 1건을 yield. 매핑:

| 입력 | reason_code | summary | next_actions | diagnostics 추가 키 |
|---|---|---|---|---|
| analysis_blocked | `evt.reason_code` | `evt.reason` | `normalize_next_actions(evt.next_actions, evt.missing_evidence)` | `**evt.diagnostics, source_event, agent_safe=True` (+ `incident`, `missing_evidence`, `severity=evt.severity` 필드 전달) |
| action_required | `evt.reason_code`(기본 `"action_required"`) | `evt.reason` | 위와 동일 | `**evt.diagnostics, source_event, agent_safe=True` (incident 없음) |
| contract_failed | `diagnostics["reason_code"] or "context_missing"` | `evt.reason` | 고정 1건: `{"action_type": "fix_pipeline_contract", "contract", "consumer", "description": "upstream 이벤트 payload가 consumer 계약을 만족하도록 수정합니다."}` | `**diagnostics, contract, consumer, source_event, agent_safe=True` (`evidence_ref=evt.evidence_ref or "unknown"`) |
| ai_fallback.requested | `"ai_fallback_required"` | `f"AI fallback required: {evt.reason}"` | 고정 1건: `{"action_type": "run_llm_rca_agent", "description": "LLM RCA agent가 evidence bundle과 missing evidence를 검토합니다."}` | `source_event, evidence_bundle(=evt.evidence_bundle.to_body()), agent_safe=True` (`severity="warning"` 고정) |

`source_event` 는 입력 body 클래스의 `__subject__` (와이어 subject 문자열).

## 동작 (Behavior)

각 핸들러는 입력 필드를 위 표대로 옮기고 `next_actions` 만 정규화한다. 상태 없음, 저장 없음.

## 불변식·오류 (Invariants & Errors)

- 발행되는 모든 followup 의 `diagnostics.agent_safe` 는 `True`.
- `next_actions` 는 절대 빈 리스트로 발행되지 않는다(정규화 보장).
- 한 워커가 4개 subject 를 구독 — durable consumer 는 subject 별 네임스페이스.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=rca-feedback-worker`).
