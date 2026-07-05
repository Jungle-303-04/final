# 02. Evidence Builder

## 목표

raw evidence를 RCA가 바로 읽을 수 있는 `Evidence` 모델로 정규화한다.

이 작업이 끝나면 RCA analyzer는 provider별 raw payload를 직접 해석하지 않고, 정리된 symptoms와 evidence reference만 사용한다.

## 먼저 읽을 파일

- `src/services/ai/rca-worker/app.py`
- `src/domains/rca`
- `src/packages/contracts/event_bus/bodies/`
- [01. Evidence 입력 계약](01-evidence-input-contract.md)

## 수정 후보

- `src/domains/rca/models.py`
- `src/services/ai/rca-worker/app.py`
- `src/packages/contracts/event_bus/bodies/`
- `tests/test_rca_evidence.py`

## 선형 절차

1. RCA 내부에서 사용할 `Evidence` DTO 위치를 정한다.
2. `EvidenceBuilder` Protocol 또는 작은 builder 함수를 만든다.
3. `pod`, `metric`, `log`, `trace`, `node` kind별 최소 정규화 규칙을 둔다.
4. DTO에는 최소한 아래 필드를 둔다.
   - `evidence_id`
   - `kind`
   - `severity`
   - `affected_resource`
   - `symptoms`
   - `observed_at`
   - `source_ref`
5. unknown kind는 실패가 아니라 `unsupported` 또는 낮은 severity로 다루는지 결정한다.
6. 정규화 결과를 `evidence.built` event로 낼지, RCA worker 내부 입력으로만 둘지 현재 event 흐름과 맞춘다.
7. pod crash, metric spike, unknown kind 테스트를 추가한다.

## 예시 코드 모양

```python
class EvidenceBuilder(Protocol):
    def build(self, body: ClusterEvidenceReceivedBody) -> Evidence: ...


@dataclass(frozen=True)
class Evidence:
    evidence_id: str
    kind: str
    severity: str
    affected_resource: str
    symptoms: tuple[str, ...]
    observed_at: datetime
    source_ref: str
```

## 검증

```bash
uv run pytest tests/test_rca_evidence.py
uv run ruff check src tests
```

## 완료 기준

- RCA analyzer가 raw provider response 전체를 직접 읽지 않는다.
- pod crash와 metric spike가 같은 `Evidence` DTO 형태로 들어온다.
- unknown kind 처리 기준이 테스트로 고정되어 있다.
- builder는 GitHub PR 생성이나 AI 호출을 하지 않는다.

## 다음 작업

[03. RCA Result와 Deterministic Analyzer](03-rca-result-deterministic-analyzer.md)
