# Target / Telemetry Evidence 03: 신호 추출 기준

## 목표

이 문서는 raw data에서 어떤 값을 뽑으면 의미 있는지 정리한다.

여기서 signal은 EvidenceDraft 안에 들어가는 구조화된 값이다.

```json
{
  "signals": {
    "latest": 0.19,
    "restart_count": 4,
    "above_threshold": true
  }
}
```

## 좋은 signal이란?

좋은 signal은 이런 조건을 가진다.

- 숫자나 짧은 문자열로 표현된다.
- RCA가 판단에 바로 쓸 수 있다.
- 사람이 봐도 의미가 분명하다.
- raw data 전체를 몰라도 이해된다.
- 테스트 fixture로 만들기 쉽다.

## 처음 뽑을 신호

| 신호 | 뜻 | source | 난이도 |
| --- | --- | --- | --- |
| `metric_latest` | metric 최신 값 | Prometheus | 낮음 |
| `metric_max` | 기간 내 최대값 | Prometheus | 중간 |
| `above_threshold` | 기준값보다 높은지 | Prometheus | 낮음 |
| `restart_count` | pod 재시작 횟수 | Kubernetes Pod | 낮음 |
| `waiting_reason` | container 대기 이유 | Kubernetes Pod | 낮음 |
| `event_reason` | Kubernetes event reason | Kubernetes Event | 낮음 |
| `event_count` | 같은 event 반복 횟수 | Kubernetes Event | 낮음 |
| `log_error_count` | error log 개수 | Loki | 중간 |
| `message_snippet` | 짧은 로그 조각 | Loki | 낮음 |
| `trace_duration_ms` | span 소요 시간 | OTel | 중간 |

## Prometheus signal

처음에는 두 가지만 한다.

```text
latest
max_value
```

예시:

```json
{
  "signals": {
    "metric": "demo_http_5xx_rate",
    "latest": 0.19,
    "threshold": 0.1,
    "above_threshold": true
  }
}
```

summary:

```text
checkout-api 5xx rate is 0.19
```

하지 말 것:

- Prometheus raw response 전체를 넣지 않는다.
- sample 수백 개를 그대로 넣지 않는다.
- label을 무제한으로 넣지 않는다.

## Kubernetes Pod signal

처음에는 재시작과 상태 reason을 본다.

예시:

```json
{
  "signals": {
    "namespace": "sandbox",
    "pod": "checkout-api",
    "restart_count": 4,
    "reason": "CrashLoopBackOff"
  }
}
```

summary:

```text
sandbox/checkout-api is CrashLoopBackOff with 4 restarts
```

## Kubernetes Event signal

처음에는 reason과 count를 본다.

예시:

```json
{
  "signals": {
    "object": "pod/checkout-api",
    "reason": "Unhealthy",
    "count": 12
  }
}
```

summary:

```text
readiness probe failed 12 times for checkout-api
```

## Loki signal

처음에는 error log 개수와 짧은 snippet만 본다.

예시:

```json
{
  "signals": {
    "count": 24,
    "level": "error",
    "message_snippet": "readiness check failed: downstream timeout"
  }
}
```

하지 말 것:

- 전체 로그를 넣지 않는다.
- token이 포함된 줄을 그대로 넣지 않는다.
- 너무 긴 stacktrace를 넣지 않는다.

## OTel signal

처음에는 느린 span과 error span만 본다.

예시:

```json
{
  "signals": {
    "service": "checkout-api",
    "downstream_service": "payment-api",
    "duration_ms": 2300,
    "status": "error"
  }
}
```

## threshold는 어디서 정하나?

처음에는 코드에 아주 단순한 demo threshold를 둬도 된다.

예시:

```text
http_5xx_rate > 0.1 이면 above_threshold true
cpu_usage_ratio > 0.8 이면 above_threshold true
restart_count > 3 이면 suspicious true
```

하지만 이 값들은 최종 정책이 아니다. 나중에 project 설정이나 policy로 빠질 수 있다.

## 테스트 기준

처음 테스트는 어렵게 만들지 않는다.

테스트해야 할 것:

- Prometheus vector response에서 latest 추출.
- Prometheus matrix response에서 max_value 계산.
- Pod fixture에서 restart_count 추출.
- Event fixture에서 reason/count 추출.
- Log line에서 message_snippet 생성.
- secret-like 문자열 제거.
