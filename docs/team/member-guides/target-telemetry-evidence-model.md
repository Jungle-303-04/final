# Target / Telemetry: Evidence 모델

## 이 문서의 역할

이 문서는 최종 이벤트 계약을 정하는 문서가 아니다.

아직 Gateway API, RCA Worker payload, Event payload가 모두 완전히 고정된 상태가 아니다. 그래서 지금 여기서 `cluster.evidence.received`의 최종 JSON 모양을 확정하면 나중에 다시 크게 바꿔야 한다.

지금 이 문서가 정하는 것은 이것이다.

```text
raw telemetry를 어떻게 읽고
무엇을 버리고
무엇을 남기고
어떤 작은 내부 요약 모델로 만들지
```

즉 현재 단계의 Evidence 모델은 final event contract가 아니라 Target Agent 내부 중간 모델이다.

이 문서에서는 이 중간 모델을 `EvidenceDraft`라고 부른다.

```text
Raw Data
  Prometheus raw JSON
  Loki raw log lines
  Kubernetes pod status
  OTel trace spans

EvidenceDraft
  Target Agent 내부에서 만든 작은 요약 정보
  사람이 읽을 수 있고 RCA가 판단하기 쉬운 형태
  아직 최종 event payload는 아님

Final Event Body
  Gateway/RCA/Event 계약이 확정된 뒤
  EvidenceDraft를 변환해서 보낼 최종 payload
```

## Evidence가 뭔가?

Evidence는 한국어로 “증거”다.

여기서 evidence는 장애를 설명하거나 판단하는 데 도움이 되는 작은 정보다.

예를 들어 raw data가 이렇게 많다고 해보자.

```text
pod status 50줄
pod event 100개
Prometheus sample 300개
Loki log line 1000개
trace span 200개
```

이걸 전부 RCA Worker나 Gateway에 보내면 안 된다.

너무 크고, 복잡하고, 민감정보가 섞일 수 있고, RCA 담당자가 provider별 raw format을 모두 알아야 하기 때문이다.

대신 이렇게 줄인다.

```text
"sandbox/api pod가 최근 10분 동안 4번 재시작했다."
"checkout-api의 5xx 비율이 0.19까지 올라갔다."
"최근 5분 동안 readiness probe failed 로그가 24번 발생했다."
"node worker-1에 MemoryPressure가 있다."
```

이렇게 줄인 작은 판단 재료가 EvidenceDraft다.

## Raw Data와 EvidenceDraft 차이

Raw data는 도구가 원래 주는 데이터다.

예시:

```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {
          "pod": "checkout-api",
          "namespace": "sandbox"
        },
        "value": [1710000000, "0.19"]
      }
    ]
  }
}
```

이건 Prometheus raw response다. Prometheus를 모르는 사람은 이걸 보고 바로 의미를 알기 어렵다.

EvidenceDraft는 이렇게 바꾼다.

```json
{
  "kind": "metric",
  "summary": "checkout-api 5xx rate is 0.19",
  "signals": {
    "namespace": "sandbox",
    "pod": "checkout-api",
    "metric": "http_5xx_rate",
    "latest": 0.19
  },
  "source_ref": {
    "source": "prometheus",
    "query": "http_5xx_rate{pod=\"checkout-api\"}",
    "window": "5m"
  }
}
```

차이는 이렇다.

| 구분 | Raw Data | EvidenceDraft |
| --- | --- | --- |
| 누가 만드나 | Prometheus, Loki, Kubernetes, OTel | 우리 Target Agent |
| 크기 | 크고 복잡함 | 작고 요약됨 |
| 목적 | 도구 내부 표현 | RCA/Gateway로 넘기기 전 판단 재료 |
| 민감정보 위험 | 높음 | redaction 후 낮아야 함 |
| 최종 이벤트 계약인가 | 아님 | 아직 아님 |

## 지금은 이벤트 계약이 아니다

중요하다.

현재 EvidenceDraft는 아래 파일에 바로 넣을 최종 계약이 아니다.

```text
packages/contracts/event_bus/bodies/
```

아직은 Target Agent 내부에서만 쓰는 중간 모델로 시작한다.

처음 구현 위치 후보:

```text
services/target/target-cluster-agent/evidence.py
```

나중에 Gateway/RCA/Event 계약이 확정되면 그때 변환한다.

```text
MetricEvidenceDraft
  -> AgentEvidenceRequest 또는 Gateway request
  -> cluster.evidence.received payload
  -> RCA Worker input
```

이렇게 해야 지금 작업자가 마음 편하게 구현할 수 있다.

- 지금은 raw data를 줄이는 방법에 집중한다.
- 최종 event field 이름은 나중에 맞춘다.
- Gateway 계약이 바뀌어도 EvidenceDraft 테스트는 살아남는다.

## Source별로 어떤 데이터를 볼 수 있나?

### Kubernetes Pod

Kubernetes Pod에서는 “앱이 어떤 상태인가”를 본다.

볼 수 있는 raw data:

- pod name
- namespace
- phase
- container status
- restart count
- waiting reason
- terminated reason
- image
- node name

의미 있는 EvidenceDraft:

```text
pod가 CrashLoopBackOff 상태다.
pod가 ImagePullBackOff 상태다.
container가 OOMKilled로 종료됐다.
restart count가 짧은 시간에 증가했다.
pod가 Pending 상태로 오래 있다.
```

예시:

```json
{
  "kind": "pod",
  "summary": "sandbox/checkout-api is CrashLoopBackOff with 4 restarts",
  "signals": {
    "namespace": "sandbox",
    "pod": "checkout-api",
    "phase": "Running",
    "reason": "CrashLoopBackOff",
    "restart_count": 4
  },
  "source_ref": {
    "source": "kubernetes_api",
    "resource": "pod/sandbox/checkout-api"
  }
}
```

### Kubernetes Event

Kubernetes Event에서는 “클러스터가 왜 그렇게 판단했는가”를 본다.

볼 수 있는 raw data:

- event type
- reason
- message
- count
- involved object
- first timestamp
- last timestamp

의미 있는 EvidenceDraft:

```text
scheduler가 pod를 배치하지 못했다.
readiness probe가 계속 실패했다.
image pull이 실패했다.
volume mount가 실패했다.
```

예시:

```json
{
  "kind": "kubernetes_event",
  "summary": "readiness probe failed 12 times for checkout-api",
  "signals": {
    "namespace": "sandbox",
    "object": "pod/checkout-api",
    "reason": "Unhealthy",
    "count": 12
  },
  "source_ref": {
    "source": "kubernetes_api",
    "resource": "events",
    "window": "10m"
  }
}
```

### Prometheus Metric

Prometheus에서는 숫자 변화를 본다.

볼 수 있는 raw data:

- metric name
- labels
- timestamp
- value
- range samples

의미 있는 EvidenceDraft:

```text
CPU 사용률이 높다.
memory 사용량이 증가하고 있다.
5xx rate가 증가했다.
pod restart metric이 증가했다.
node filesystem 사용률이 높다.
```

예시:

```json
{
  "kind": "metric",
  "summary": "node worker-1 cpu usage is 0.83",
  "signals": {
    "node": "worker-1",
    "metric": "node_collector_cpu_usage_ratio",
    "latest": 0.83,
    "threshold": 0.8,
    "above_threshold": true
  },
  "source_ref": {
    "source": "prometheus",
    "query": "node_collector_cpu_usage_ratio",
    "window": "5m"
  }
}
```

### Loki Log

Loki에서는 로그 문장을 본다.

볼 수 있는 raw data:

- timestamp
- labels
- log line
- stream

의미 있는 EvidenceDraft:

```text
같은 error log가 짧은 시간에 많이 발생했다.
readiness check failed가 반복된다.
database timeout 로그가 증가했다.
특정 pod에서만 warning이 반복된다.
```

주의:

- 전체 로그를 보내면 안 된다.
- token, cookie, password, Authorization header는 반드시 제거한다.
- stacktrace 전체를 무제한으로 넣지 않는다.

예시:

```json
{
  "kind": "log",
  "summary": "readiness check failed appeared 24 times in 5m",
  "signals": {
    "namespace": "sandbox",
    "pod": "checkout-api",
    "level": "error",
    "count": 24,
    "message_snippet": "readiness check failed: downstream timeout"
  },
  "source_ref": {
    "source": "loki",
    "query": "{pod=\"checkout-api\"} |= \"readiness\"",
    "window": "5m"
  }
}
```

### OpenTelemetry Trace

OpenTelemetry trace에서는 요청 흐름과 느린 구간을 본다.

볼 수 있는 raw data:

- trace id
- span id
- service name
- operation name
- duration
- status
- error attribute
- downstream service

의미 있는 EvidenceDraft:

```text
checkout-api에서 payment-api 호출이 느리다.
특정 span에서 error status가 반복된다.
DB query span 시간이 기준보다 길다.
```

예시:

```json
{
  "kind": "trace",
  "summary": "checkout-api -> payment-api span is slow",
  "signals": {
    "service": "checkout-api",
    "downstream_service": "payment-api",
    "duration_ms": 2300,
    "status": "error"
  },
  "source_ref": {
    "source": "otel",
    "trace_id": "trace-123"
  }
}
```

## 어떤 신호를 뽑으면 의미 있는가?

처음에는 어려운 분석을 하지 않는다. 아래 신호만 먼저 만든다.

| 신호 | 뜻 | 처음 구현 난이도 |
| --- | --- | --- |
| `restart_count` | pod가 몇 번 재시작했는지 | 낮음 |
| `waiting_reason` | container가 왜 기다리는지 | 낮음 |
| `event_reason` | Kubernetes event reason | 낮음 |
| `metric_latest` | Prometheus 최신 값 | 낮음 |
| `metric_max` | 조회 기간 최대값 | 중간 |
| `above_threshold` | 기준값보다 높은지 | 낮음 |
| `log_error_count` | error log 개수 | 중간 |
| `message_snippet` | 짧은 로그 요약 | 낮음 |
| `trace_duration_ms` | span 소요 시간 | 중간 |

처음 구현 우선순위:

```text
1. Prometheus vector latest 값 추출
2. Kubernetes pod restart_count 추출
3. Kubernetes event reason 추출
4. Prometheus 값 threshold 비교
5. Loki log count
6. OTel trace duration
```

## EvidenceDraft 공통 형태

처음에는 이 정도 공통 형태면 충분하다.

```json
{
  "kind": "metric | pod | kubernetes_event | log | trace",
  "summary": "사람이 읽을 수 있는 한 문장",
  "signals": {},
  "source_ref": {},
  "observed_at": "2026-06-27T12:00:00Z"
}
```

각 필드 의미:

- `kind`: 어떤 종류의 증거인지.
- `summary`: 사람이 보고 바로 이해할 수 있는 짧은 문장.
- `signals`: RCA가 판단할 수 있는 구조화된 값.
- `source_ref`: 나중에 raw data를 다시 찾기 위한 최소 정보.
- `observed_at`: 이 증거를 관측한 시간.

넣지 말 것:

- token
- password
- kubeconfig
- Authorization header
- cookie
- 전체 log file
- 전체 trace
- Prometheus raw response 전체

## 구현은 Draft부터 시작한다

처음 구현 후보 파일:

```text
services/target/target-cluster-agent/evidence.py
```

처음 만들 class 후보:

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

이건 최종 코드가 아니라 시작점이다. 나중에 field 이름은 바뀔 수 있다.

## 테스트는 무엇부터 하나?

처음 테스트 파일 후보:

```text
tests/test_target_metric_evidence.py
tests/test_target_pod_evidence.py
tests/test_target_log_evidence.py
```

처음 테스트할 것:

```text
Prometheus vector response -> latest 값 추출
Prometheus empty response -> latest None
Pod CrashLoopBackOff fixture -> PodEvidenceDraft
Kubernetes event fixture -> event reason 추출
Log line에 token이 있으면 redaction
EvidenceDraft에 raw response 전체가 들어가지 않음
```

명령:

```bash
uv run pytest tests/test_target_metric_evidence.py
uv run pytest tests/test_target_pod_evidence.py
uv run pytest tests/test_target_log_evidence.py
make test
```

## 나중에 Event payload와 연결하는 방법

Gateway/RCA/Event 계약이 확정되면 그때 변환 계층을 만든다.

```text
EvidenceDraft
  -> AgentEvidenceRequest
  -> cluster.evidence.received event payload
  -> RCA Worker input DTO
```

중요한 점:

- EvidenceDraft 자체를 바로 event contract로 승격하지 않는다.
- 변환 함수를 둔다.
- event payload에서 필요한 field가 추가되면 변환 함수에서 맞춘다.
- Target Agent 내부 테스트는 계속 EvidenceDraft 기준으로 유지한다.

## 이 문서의 결론

지금 해야 할 일:

```text
raw telemetry를 작고 안전한 EvidenceDraft로 줄이는 기준을 만든다.
```

지금 하지 말아야 할 일:

```text
최종 event payload를 확정하지 않는다.
Gateway/RCA 계약을 임의로 정하지 않는다.
raw telemetry 전체를 넘기지 않는다.
```

## 하위 문서와 데모

이 표는 source repo 기준이다. WIKI에서는 문서 수 예산 때문에 하위 문서를 하나의 `Evidence 학습 가이드` 페이지로 합쳐서 보여준다.

이 문서가 길게 느껴지면 source repo에서 아래 순서대로 읽는다.

| 순서 | 문서 | 무엇을 이해하는가 |
| --- | --- | --- |
| 0 | [처음부터 따라하기](target-telemetry-evidence-00-start-here.md) | 데모 실행부터 구현 후보까지 한 번에 따라가는 방법 |
| 1 | [Evidence 쉬운 해설](target-telemetry-evidence-01-basics.md) | Evidence가 뭔지, raw data와 무엇이 다른지 |
| 2 | [Source별 데이터 해석](target-telemetry-evidence-02-sources.md) | Kubernetes, Prometheus, Loki, OTel에서 뭘 볼 수 있는지 |
| 3 | [신호 추출 기준](target-telemetry-evidence-03-signals.md) | 어떤 값을 뽑으면 의미 있는지 |
| 4 | [구현과 테스트 시작점](target-telemetry-evidence-04-implementation.md) | `evidence.py`와 테스트를 어떻게 시작할지 |
| 5 | [Event payload 연결 방식](target-telemetry-evidence-05-event-mapping.md) | 나중에 Gateway/Event 계약과 어떻게 연결할지 |
| 6 | [Evidence 학습 Task 보드](target-telemetry-evidence-06-learning-tasks.md) | 아주 작은 단위로 실행하고 성취를 확인 |
| 7 | [Telemetry Evidence Micro Demo](../../../examples/telemetry-evidence-demo/README.md) | Docker로 Prometheus/Loki/OTel 더미 데이터를 직접 확인 |
