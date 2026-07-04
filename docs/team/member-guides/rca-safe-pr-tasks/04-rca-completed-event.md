# 04. RCA Completed Event

## 목표

RCA 결과를 event body로 발행해서 audit, dashboard, Safe PR 단계가 같은 계약을 보게 한다.

## 먼저 읽을 파일

- `src/packages/contracts/event_bus/subjects.py`
- `src/packages/contracts/event_bus/bodies/`
- `src/services/ai/rca-worker/app.py`
- `docs/events.md`
- [03. RCA Result와 Fake Analyzer](03-rca-result-fake-analyzer.md)

## 수정 후보

- `src/packages/contracts/event_bus/subjects.py`
- `src/packages/contracts/event_bus/bodies/`
- `src/services/ai/rca-worker/app.py`
- `docs/events.md`
- `tests/test_event_registry.py`
- RCA worker 테스트

## 선형 절차

1. 현재 `rca.completed` subject/body가 있는지 확인한다.
2. 없으면 subject와 body를 추가한다.
3. 현재 body의 최상위 필드는 `root_cause`, `action`, `evidence_ref`, `workspace_id`라는 점을 확인한다.
4. confidence와 상세 근거는 `RcaReportDetail`에 넣는다.
5. insufficient evidence는 `RcaCompletedBody.status` 같은 새 필드를 만들기 전에, 현재 구조의 `RcaActionRequiredBody`, `RcaRuleMissingBody`, `RcaAiFallbackRequestedBody`로 표현할 수 있는지 먼저 판단한다.
6. RCA worker handler가 `RcaResult`를 받아 현재 계약에 맞는 body DTO를 `yield`하게 한다.
7. raw AI response, token, provider detail은 event에 넣지 않는다.
8. `docs/events.md`에 completed와 insufficient/action_required 예시를 추가한다.
9. envelope `correlation_id` 유지 테스트를 추가한다.

## 예시 event shape

```json
{
  "root_cause": "container crash loop",
  "action": "plan_recovery",
  "evidence_ref": "object://evidence/corr-123.json",
  "workspace_id": "workspace-1",
  "rca_detail": {
    "root_cause": "container crash loop",
    "confidence": 0.72,
    "selected_candidate_id": "crashloop",
    "supporting_evidence": ["kubernetes", "logs"],
    "missing_evidence": [],
    "reason": "CrashLoopBackOff and restart count were observed"
  }
}
```

## 검증

```bash
uv run pytest tests/test_event_registry.py tests/test_rca_evidence.py
uv run ruff check src tests
```

## 완료 기준

- RCA 결과가 typed event body로 발행된다.
- insufficient evidence가 retry 대상 오류와 구분된다.
- envelope `correlation_id`가 입력 evidence에서 RCA output까지 유지된다.
- event payload에 raw token, raw provider response가 없다.

## 다음 작업

[05. Safe PR Proposal](05-safe-pr-proposal.md)
