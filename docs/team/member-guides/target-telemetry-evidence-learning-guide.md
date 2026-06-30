# Target / Telemetry: Evidence 학습 가이드

이 문서는 기존 `target-telemetry-evidence-00`부터 `06`까지의 분할 문서를 하나로 합친
학습용 가이드다. 처음 읽는 문서 수를 줄이기 위해 source repo도 WIKI처럼 이 문서 하나를
기준으로 유지한다.

## 목표

Target/Telemetry 담당자가 아래 흐름을 직접 확인하고, 실제 구현으로 옮길 수 있게 한다.

```text
Prometheus / Loki / OTel / Kubernetes raw data
  -> 중요한 값만 추출
  -> EvidenceDraft로 축약
  -> Gateway evidence payload로 변환
  -> RCA가 판단 가능한 입력으로 전달
```

지금 중요한 원칙은 하나다.

```text
raw telemetry를 그대로 Gateway/RCA로 보내지 않는다.
작고 설명 가능한 EvidenceDraft로 줄인다.
```

## 용어

| 용어 | 의미 |
| --- | --- |
| Raw data | Prometheus, Loki, Kubernetes, OTel이 원래 주는 큰 응답 |
| Signal | 판단에 바로 쓸 수 있는 숫자나 짧은 문자열 |
| EvidenceDraft | Target Agent 내부에서 만든 작은 중간 증거 모델 |
| Final event body | Gateway/Event/RCA 계약이 확정된 뒤 발행되는 최종 payload |

EvidenceDraft 예시:

```json
{
  "kind": "metric",
  "summary": "checkout-api 5xx rate is 0.19",
  "signals": {
    "namespace": "sandbox",
    "service": "checkout-api",
    "metric": "http_5xx_rate",
    "latest": 0.19,
    "above_threshold": true
  },
  "source_ref": {
    "source": "prometheus",
    "query": "http_5xx_rate{service=\"checkout-api\"}",
    "window": "5m"
  }
}
```

## Source별로 볼 것

| Source | 볼 질문 | 처음 뽑을 signal |
| --- | --- | --- |
| Kubernetes Pod | 떠 있는가, 재시작했는가, 어떤 reason인가 | `phase`, `restart_count`, `waiting_reason`, `node_name` |
| Kubernetes Event | 스케줄링/이미지/프로브/볼륨 실패가 있었는가 | `reason`, `message`, `count`, `involved_object` |
| Prometheus | CPU/메모리/5xx/restart/노드 지표가 이상한가 | `latest`, `max_value`, `threshold`, `above_threshold` |
| Loki | 에러/경고 로그가 반복되는가 | `error_count`, `message_snippet`, `pod`, `namespace` |
| OpenTelemetry | 특정 operation이 느리거나 실패했는가 | `span_name`, `duration_ms`, `status_code`, `service_name` |

## 좋은 signal 기준

- 숫자나 짧은 문자열로 표현된다.
- RCA가 판단에 바로 쓸 수 있다.
- 사람이 봐도 의미가 분명하다.
- raw data 전체를 몰라도 이해된다.
- 테스트 fixture로 만들기 쉽다.
- token, password, cookie, kubeconfig 같은 민감정보를 포함하지 않는다.

## 구현 시작점

처음부터 Prometheus/Loki/Kubernetes client를 크게 만들지 않는다. 먼저 raw dict 하나를
작은 EvidenceDraft 하나로 바꾸는 순수 함수를 만든다.

추천 파일:

```text
src/services/target/cluster-agent/agent.py
src/services/target/cluster-agent/fake_telemetry.py
src/services/target/cluster-agent/settings.py
```

추후 분리 후보:

```text
src/services/target/cluster-agent/evidence.py
src/services/target/cluster-agent/telemetry_clients.py
```

테스트 후보:

```text
tests/test_target_agent_client.py
tests/test_rca_evidence.py
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

## Prometheus vector 변환 예시

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

## Event payload 연결 방식

EvidenceDraft를 그대로 event contract로 승격하지 않는다. 계약 변화를 감당할 수 있게 변환 함수를 둔다.

```text
EvidenceDraft
  -> Gateway evidence request
  -> cluster.evidence.received body
  -> RCA input DTO
```

변환 함수 후보:

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

## 작은 학습 Task

| Task | 목표 | 확인 |
| --- | --- | --- |
| 1 | 현재 Target 파일 위치 확인 | `find src/services/target -maxdepth 3 -type f` |
| 2 | fake Prometheus 응답 확인 | `FAKE_TELEMETRY_KIND=prometheus` 흐름 이해 |
| 3 | Prometheus raw JSON fixture 작성 | vector response fixture 하나 |
| 4 | `latest_from_prometheus_vector` 테스트 | latest 값 하나가 나온다 |
| 5 | EvidenceDraft 변환 테스트 | summary, signals, source_ref가 작게 나온다 |
| 6 | 민감정보 제거 테스트 | token/password가 결과에 없다 |
| 7 | Gateway payload 변환 테스트 | `cluster_id`, `kind`, `signals`가 유지된다 |

## PR 단위

한 PR에 전부 넣지 않는다.

1. raw Prometheus fixture + latest 값 추출
2. EvidenceDraft dataclass + metric summary
3. Kubernetes pod/event summary
4. Loki log summary
5. Gateway payload 변환
6. RCA worker 입력 연결

## 완료 기준

- raw telemetry response 전체를 event/log/response에 싣지 않는다.
- EvidenceDraft는 사람이 읽을 summary와 작은 signals를 가진다.
- source_ref는 원본을 다시 찾을 힌트만 가진다.
- 민감정보 제거 테스트가 있다.
- Gateway/RCA 계약 변경 시 변환 함수만 고치면 된다.
