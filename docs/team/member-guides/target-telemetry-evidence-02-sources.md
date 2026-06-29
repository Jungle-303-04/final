# Target / Telemetry Evidence 02: Source별 데이터 해석

## 목표

이 문서는 각 도구에서 무엇을 볼 수 있는지 설명한다.

여기서 source는 데이터를 주는 곳이다.

```text
Kubernetes Pod
Kubernetes Event
Prometheus
Loki
OpenTelemetry
```

## Kubernetes Pod

Pod는 Kubernetes에서 앱 컨테이너를 실행하는 단위다.

Pod에서 보고 싶은 질문:

```text
앱이 떠 있는가?
재시작했는가?
왜 대기 중인가?
어떤 node에서 돌고 있는가?
container가 죽었는가?
```

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

EvidenceDraft로 줄이면:

```json
{
  "kind": "pod",
  "summary": "sandbox/checkout-api is CrashLoopBackOff with 4 restarts",
  "signals": {
    "namespace": "sandbox",
    "pod": "checkout-api",
    "reason": "CrashLoopBackOff",
    "restart_count": 4
  },
  "source_ref": {
    "source": "kubernetes_api",
    "resource": "pod/sandbox/checkout-api"
  }
}
```

## Kubernetes Event

Kubernetes Event는 Kubernetes가 남긴 설명 로그에 가깝다.

Event에서 보고 싶은 질문:

```text
스케줄링에 실패했는가?
이미지 pull에 실패했는가?
readiness probe가 실패했는가?
volume mount가 실패했는가?
```

볼 수 있는 raw data:

- event type
- reason
- message
- count
- involved object
- first timestamp
- last timestamp

EvidenceDraft 예시:

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

## Prometheus

Prometheus는 숫자 metric을 본다.

Prometheus에서 보고 싶은 질문:

```text
CPU가 높은가?
memory가 증가하는가?
5xx 비율이 높아졌는가?
restart count가 증가했는가?
node에 pressure가 있는가?
```

볼 수 있는 raw data:

- metric name
- labels
- timestamp
- value
- range samples

EvidenceDraft 예시:

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

## Loki

Loki는 log를 본다.

Loki에서 보고 싶은 질문:

```text
같은 error가 반복되는가?
readiness check failed가 많이 나오는가?
timeout 로그가 증가했는가?
특정 pod에서만 에러가 나는가?
```

볼 수 있는 raw data:

- timestamp
- labels
- log line
- stream

EvidenceDraft 예시:

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

주의:

- 전체 로그를 보내지 않는다.
- token, cookie, password, Authorization header를 제거한다.
- stacktrace 전체를 무제한으로 넣지 않는다.

## OpenTelemetry

OpenTelemetry는 trace, metric, log를 표준 방식으로 수집하는 생태계다.

Trace에서 보고 싶은 질문:

```text
어떤 요청이 느렸는가?
어느 서비스 호출에서 에러가 났는가?
DB query가 오래 걸렸는가?
downstream service가 실패했는가?
```

볼 수 있는 raw data:

- trace id
- span id
- service name
- operation name
- duration
- status
- error attribute
- downstream service

EvidenceDraft 예시:

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

## 처음 구현 우선순위

처음부터 모든 source를 구현하지 않는다.

순서:

```text
1. Prometheus metric
2. Kubernetes Pod
3. Kubernetes Event
4. Loki log
5. OpenTelemetry trace
```

이유:

- Prometheus metric은 Docker demo로 바로 확인할 수 있다.
- Kubernetes Pod/Event는 target cluster 연결 후 확인한다.
- Loki/OTel은 ingest 경로가 추가로 필요해서 뒤로 둔다.
