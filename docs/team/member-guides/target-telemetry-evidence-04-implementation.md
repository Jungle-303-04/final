# Target / Telemetry Evidence 04: 구현과 테스트 시작점

## 목표

이 문서는 `src/services/target/cluster-agent/evidence.py`를 어떻게 시작할지 설명한다.

중요한 원칙:

```text
처음 구현은 내부 Draft 모델이다.
최종 Event payload가 아니다.
```

## 첫 파일

새 파일 후보:

```text
src/services/target/cluster-agent/evidence.py
```

테스트 파일 후보:

```text
tests/test_target_metric_evidence.py
tests/test_target_pod_evidence.py
tests/test_target_log_evidence.py
```

## 데모에서 구현으로 넘어가는 순서

데모를 실행한 뒤 바로 큰 구조를 만들려고 하면 어렵다.

아래 순서대로 아주 작게 옮긴다.

```text
1. examples/telemetry-evidence-demo/app/evidence_demo.py를 읽는다.
2. latest_value(...) 함수만 이해한다.
3. 같은 동작을 src/services/target/cluster-agent/evidence.py에 옮긴다.
4. tests/test_target_metric_evidence.py에 raw JSON fixture를 하나 넣는다.
5. pytest로 latest 값 하나가 나오는지 확인한다.
6. 그 다음에 EvidenceDraft dataclass를 만든다.
7. 마지막에 metric_evidence(...) 변환 함수를 만든다.
```

처음부터 Prometheus client, Loki client, Kubernetes client를 만들지 않는다.

처음 목표는 이것이다.

```text
raw dict 하나를 넣으면
작은 EvidenceDraft 하나가 나온다.
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

`tests/test_target_metric_evidence.py` 예시다.

처음에는 외부 Prometheus를 띄우지 않는다.

테스트 안에 raw JSON fixture를 직접 넣는다.

```python
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
EVIDENCE_PATH = ROOT_DIR / "services" / "cluster-agent" / "evidence.py"


def load_evidence_module():
    spec = importlib.util.spec_from_file_location(
        "test_target_evidence_module", EVIDENCE_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {EVIDENCE_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["test_target_evidence_module"] = module
    spec.loader.exec_module(module)
    return module


def test_latest_from_prometheus_vector() -> None:
    module = load_evidence_module()
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

    assert module.latest_from_prometheus_vector(raw) == 0.19
```

`src/services/target/cluster-agent`처럼 디렉터리 이름에 hyphen이 있으면 일반 import가 어렵다. 그래서 위 예시처럼 `importlib.util.spec_from_file_location`으로 파일 경로에서 직접 module을 읽는다.

참고할 파일:

```text
tests/test_node_collector.py
```

이 방식은 파일 경로로 직접 module을 로드하는 방식이다.

## 첫 구현 코드 후보

`src/services/target/cluster-agent/evidence.py`에 처음 넣을 수 있는 최소 코드다.

```python
from __future__ import annotations

from typing import Any


def latest_from_prometheus_vector(raw: dict[str, Any]) -> float | None:
    results = raw.get("data", {}).get("result", [])
    if not results:
        return None

    value = results[0].get("value", [])
    if len(value) < 2:
        return None

    try:
        return float(value[1])
    except (TypeError, ValueError):
        return None
```

처음 구현에서 중요한 점:

```text
잘못된 raw data가 와도 예외로 죽지 않는다.
값을 못 뽑으면 None을 반환한다.
```

이후에 `None`을 어떻게 처리할지는 정책을 정하면 된다.

예:

```text
EvidenceDraft를 만들지 않는다.
또는 summary에 "no data"를 넣는다.
```

## 두 번째 테스트

empty response도 테스트한다.

```python
def test_latest_from_prometheus_vector_returns_none_for_empty_result() -> None:
    module = load_evidence_module()
    raw = {"status": "success", "data": {"result": []}}

    assert module.latest_from_prometheus_vector(raw) is None
```

세 번째 테스트는 잘못된 숫자다.

```python
def test_latest_from_prometheus_vector_returns_none_for_invalid_number() -> None:
    module = load_evidence_module()
    raw = {
        "status": "success",
        "data": {
            "result": [
                {
                    "metric": {"pod": "checkout-api"},
                    "value": [1710000000, "not-a-number"],
                }
            ]
        },
    }

    assert module.latest_from_prometheus_vector(raw) is None
```

## 테스트 명령

```bash
uv run pytest tests/test_target_metric_evidence.py
uv run pytest tests/test_target_pod_evidence.py
uv run pytest tests/test_target_log_evidence.py
make test
```

## 구현 순서

1. `latest_from_prometheus_vector` 함수 추가.
2. vector response 테스트 추가.
3. empty response 테스트 추가.
4. invalid number 테스트 추가.
5. `EvidenceDraft` dataclass 추가.
6. `MetricEvidenceDraft.to_draft` 추가.
7. PodEvidenceDraft 추가.
8. LogEvidenceDraft 추가.

## 완료 기준

- raw Prometheus JSON 하나를 EvidenceDraft로 바꿀 수 있다.
- raw pod fixture 하나를 EvidenceDraft로 바꿀 수 있다.
- raw log line 하나를 EvidenceDraft로 바꿀 수 있다.
- 어떤 테스트도 Gateway/Event 계약에 의존하지 않는다.
