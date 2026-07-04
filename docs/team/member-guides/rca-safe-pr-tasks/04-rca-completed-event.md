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
3. body에는 `correlation_id`, `cluster_id`, `status`, `summary`, `root_cause`, `confidence`, `evidence_refs`, `recommended_fix`를 넣는다.
4. insufficient evidence도 같은 body의 `status`로 표현할지, 별도 subject로 둘지 결정하고 문서화한다.
5. RCA worker handler가 `RcaResult`를 받아 body DTO를 `yield`하게 한다.
6. raw AI response, token, provider detail은 event에 넣지 않는다.
7. `docs/events.md`에 completed와 insufficient 예시를 추가한다.
8. `correlation_id` 유지 테스트를 추가한다.

## 예시 event shape

```json
{
  "correlation_id": "corr-123",
  "cluster_id": "target-dev",
  "status": "completed",
  "summary": "pod restart loop detected",
  "root_cause": "container crash loop",
  "confidence": 0.72,
  "evidence_refs": ["evidence-123"],
  "recommended_fix": "inspect deployment env and rollout restart after fix"
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
- `correlation_id`가 입력 evidence에서 RCA output까지 유지된다.
- event payload에 raw token, raw provider response가 없다.

## 다음 작업

[05. Safe PR Proposal](05-safe-pr-proposal.md)
