# 03. RCA Result와 Deterministic Analyzer

## 목표

외부 AI 없이도 RCA 결과 계약을 만들고 테스트할 수 있게 한다.

이 작업이 끝나면 downstream의 dashboard, audit, Safe PR 흐름이 실제 LLM 준비 여부와 상관없이 개발 가능하다.

## 먼저 읽을 파일

- `src/domains/rca`
- `src/services/ai/rca-worker/app.py`
- [02. Evidence Builder](02-evidence-builder.md)

## 수정 후보

- `src/domains/rca/models.py`
- `src/domains/rca/events.py`
- `src/services/ai/rca-worker/app.py`
- `tests/test_rca_evidence.py`
- `tests/test_rca_evidence.py`와 별도 RCA analyzer 테스트

## 선형 절차

1. `RcaAnalyzer` Protocol을 둔다.
2. `RcaResult` DTO를 만든다.
3. 동일 입력에 항상 같은 결과를 내는 deterministic analyzer를 만든다.
4. `RcaResult`에는 최소한 아래 필드를 둔다.
   - `status`
   - `summary`
   - `root_cause`
   - `confidence`
   - `evidence_refs`
   - `recommended_fix`
5. evidence signal이 부족하면 `completed`가 아니라 `insufficient`를 반환한다.
6. `evidence_refs`가 비어 있으면 confidence를 높게 주지 않는다.
7. deterministic analyzer가 같은 입력에 항상 같은 결과를 반환하는 테스트를 추가한다.

## 예시 코드 모양

```python
class RcaAnalyzer(Protocol):
    async def analyze(self, evidence: Evidence) -> RcaResult: ...


class DeterministicRcaAnalyzer:
    async def analyze(self, evidence: Evidence) -> RcaResult:
        if not evidence.symptoms:
            return RcaResult.insufficient("incident signal not found")
        return RcaResult.completed(
            summary="pod restart loop detected",
            root_cause="container crash loop",
            confidence=0.72,
            evidence_refs=(evidence.evidence_id,),
            recommended_fix="inspect deployment env and rollout restart after fix",
        )
```

## 검증

```bash
uv run pytest tests/test_rca_evidence.py
uv run ruff check src tests
```

테스트 파일이 분리되어 있으면 analyzer 테스트만 먼저 돌린 뒤 RCA 관련 테스트를 함께 돌린다.

## 완료 기준

- AI 호출 없이 RCA 결과 DTO를 만들 수 있다.
- insufficient evidence가 정상 상태로 표현된다.
- `evidence_refs` 없는 root cause가 높은 confidence로 나오지 않는다.
- recommended fix는 command 실행이나 PR write를 직접 일으키지 않는다.

## 다음 작업

[04. RCA Completed Event](04-rca-completed-event.md)
