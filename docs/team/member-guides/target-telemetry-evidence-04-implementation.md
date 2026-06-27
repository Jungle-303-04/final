# Target / Telemetry Evidence 04: 구현과 테스트 시작점

## 목표

이 문서는 `services/target-cluster-agent/evidence.py`를 어떻게 시작할지 설명한다.

중요한 원칙:

```text
처음 구현은 내부 Draft 모델이다.
최종 Event payload가 아니다.
```

## 첫 파일

새 파일 후보:

```text
services/target-cluster-agent/evidence.py
```

테스트 파일 후보:

```text
tests/test_target_metric_evidence.py
tests/test_target_pod_evidence.py
tests/test_target_log_evidence.py
```

## 첫 dataclass 후보

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class EvidenceDraft:
    kind: str
    summary: str
    signals: dict[str, Any]
    source_ref: dict[str, Any]
    observed_at: str
```

이 모델은 아주 단순하다.

- `kind`: metric인지 pod인지 log인지.
- `summary`: 사람이 읽는 한 문장.
- `signals`: 판단에 필요한 값.
- `source_ref`: 원본을 다시 찾을 힌트.
- `observed_at`: 관측 시각.

## MetricEvidenceDraft 후보

```python
@dataclass(frozen=True)
class MetricEvidenceDraft:
    query: str
    latest: float | None
    max_value: float | None
    summary: str

    def to_draft(self, observed_at: str) -> EvidenceDraft:
        return EvidenceDraft(
            kind="metric",
            summary=self.summary,
            signals={
                "latest": self.latest,
                "max_value": self.max_value,
            },
            source_ref={
                "source": "prometheus",
                "query": self.query,
            },
            observed_at=observed_at,
        )
```

## Prometheus raw response 변환 함수 후보

처음에는 vector response만 처리해도 된다.

```python
def latest_from_prometheus_vector(raw: dict[str, Any]) -> float | None:
    results = raw.get("data", {}).get("result", [])
    if not results:
        return None
    value = results[0].get("value", [])
    if len(value) < 2:
        return None
    return float(value[1])
```

나중에 matrix response를 처리한다.

```python
def max_from_prometheus_matrix(raw: dict[str, Any]) -> float | None:
    ...
```

## 첫 테스트

`tests/test_target_metric_evidence.py` 예시:

```python
from __future__ import annotations


def test_latest_from_prometheus_vector() -> None:
    raw = {
        "status": "success",
        "data": {
            "result": [
                {
                    "metric": {"pod": "checkout-api"},
                    "value": [1710000000, "0.19"],
                }
            ]
        },
    }

    assert latest_from_prometheus_vector(raw) == 0.19
```

실제 테스트에서는 import path를 현재 repo 테스트 스타일에 맞춘다. `tests/test_node_collector.py`처럼 `importlib.util.spec_from_file_location`을 사용해도 된다.

## 테스트 명령

```bash
uv run pytest tests/test_target_metric_evidence.py
uv run pytest tests/test_target_pod_evidence.py
uv run pytest tests/test_target_log_evidence.py
make test
```

## 구현 순서

1. `EvidenceDraft` dataclass 추가.
2. `latest_from_prometheus_vector` 함수 추가.
3. vector response 테스트 추가.
4. `MetricEvidenceDraft.to_draft` 추가.
5. empty response 테스트 추가.
6. invalid number 테스트 추가.
7. PodEvidenceDraft 추가.
8. LogEvidenceDraft 추가.

## 완료 기준

- raw Prometheus JSON 하나를 EvidenceDraft로 바꿀 수 있다.
- raw pod fixture 하나를 EvidenceDraft로 바꿀 수 있다.
- raw log line 하나를 EvidenceDraft로 바꿀 수 있다.
- 어떤 테스트도 Gateway/Event 계약에 의존하지 않는다.
