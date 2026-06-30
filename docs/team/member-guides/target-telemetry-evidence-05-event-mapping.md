# Target / Telemetry Evidence 05: Event payload 연결 방식

## 목표

이 문서는 나중에 EvidenceDraft를 Gateway/Event/RCA 계약과 어떻게 연결할지 설명한다.

지금 당장 최종 event payload를 만들지 않는다.

## 왜 바로 event payload로 만들면 안 되나?

아직 아래 계약이 확정되지 않았다.

```text
Gateway /agent/evidence request
cluster.evidence.received event payload
RCA Worker input DTO
Dashboard read model
Audit timeline payload
```

이 상태에서 Target Agent가 최종 event payload를 먼저 정하면 나중에 Gateway/RCA가 바뀔 때 Target Agent 코드도 크게 바뀐다.

그래서 중간에 변환 계층을 둔다.

```text
EvidenceDraft
  -> GatewayEvidenceRequest
  -> EventBody
  -> RcaEvidenceInput
```

## 권장 구조

Target Agent 내부:

```text
Prometheus raw JSON
  -> MetricEvidenceDraft
  -> EvidenceDraft
```

Gateway 계약 준비 후:

```text
EvidenceDraft
  -> to_gateway_payload(...)
  -> POST /agent/evidence
```

Event 계약 준비 후:

```text
Gateway request
  -> cluster.evidence.received event payload
```

RCA 계약 준비 후:

```text
cluster.evidence.received payload
  -> RCA Worker input DTO
```

## 변환 함수 후보

나중에 이런 식으로 만든다.

```python
def evidence_draft_to_gateway_payload(
    cluster_id: str,
    draft: EvidenceDraft,
) -> dict[str, object]:
    return {
        "cluster_id": cluster_id,
        "kind": draft.kind,
        "summary": draft.summary,
        "signals": draft.signals,
        "source_ref": draft.source_ref,
        "observed_at": draft.observed_at,
    }
```

이 함수는 지금 바로 확정하지 않아도 된다. Gateway 담당자와 계약이 맞춰진 뒤 만든다.

## 지켜야 할 규칙

- EvidenceDraft를 그대로 event contract로 승격하지 않는다.
- 변환 함수를 둔다.
- 변환 함수에서 field 이름을 Gateway 계약에 맞춘다.
- Target Agent 내부 테스트는 EvidenceDraft 기준으로 유지한다.
- Gateway/Event/RCA 테스트는 변환 함수 기준으로 추가한다.

## 좋은 구조의 장점

Gateway 계약이 바뀌어도:

```text
EvidenceDraft 생성 코드 유지
변환 함수만 수정
```

RCA input이 바뀌어도:

```text
Target Agent raw telemetry 요약 코드 유지
Gateway/RCA mapping만 수정
```

## 처음에는 무엇만 하면 되나?

지금은 이것만 한다.

```text
EvidenceDraft 생성
EvidenceDraft 테스트
raw telemetry redaction
source_ref 남기기
```

나중에 한다.

```text
GatewayEvidenceRequest 확정
cluster.evidence.received payload 확정
RCA Worker input DTO 확정
Dashboard/Audit projection 확정
```
