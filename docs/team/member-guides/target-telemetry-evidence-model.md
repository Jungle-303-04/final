# Target / Telemetry: Evidence 모델

## 목적

이 문서는 Target/Telemetry가 어떤 데이터를 취급하고, 어떤 형태로 Management Gateway와 RCA Worker에 전달해야 하는지 정의한다.

핵심 원칙:

```text
raw telemetry를 그대로 보내지 않는다.
작고 안전한 evidence로 축약해서 보낸다.
```

## 취급할 데이터와 의미 있는 가공 결과

| 원천 | raw 데이터 | evidence로 보낼 필드 | 만들 수 있는 의미 |
| --- | --- | --- | --- |
| Kubernetes Pod | phase, reason, container status | namespace, pod, phase, reason, restart_count | CrashLoopBackOff, ImagePullBackOff, Pending 원인 |
| Kubernetes Event | type, reason, message | involved_object, reason, message, count | scheduling 실패, probe 실패, mount 실패 |
| Node | condition, allocatable, pressure | node, condition, cpu/memory pressure | node resource pressure, disk pressure |
| Prometheus | time-series samples | query, window, latest, max, rate | CPU spike, memory growth, error rate 증가 |
| Loki | log lines | timestamp, pod, level, message snippet | 특정 시간대 error burst, exception pattern |
| OTel Trace | spans, duration, status | trace_id, service, slow_span, error_span | latency bottleneck, downstream failure |
| Command Result | status, stdout/stderr snippet | command_id, action, status, reason | rollout success/failure, policy rejection |

## Evidence 공통 형태

권장 공통 형태:

```text
Evidence
  cluster_id
  kind
  observed_at
  summary
  signals
  source_ref
```

필드 의미:

- `cluster_id`: 어느 대상 클러스터에서 나온 정보인지.
- `kind`: `pod`, `metric`, `log`, `trace`, `node`, `command_result`.
- `observed_at`: 관측 시각.
- `summary`: 사람이 읽을 수 있는 짧은 요약.
- `signals`: RCA가 판단에 쓸 구조화된 신호.
- `source_ref`: raw 데이터를 다시 추적할 최소 정보. token이나 raw payload가 아니라 query, window, pod name 같은 reference만 넣는다.

## Derived signal 예시

RCA에 유의미한 derived signal:

- `pod_restart_rate`: 최근 10분 재시작 증가량.
- `oom_killed_detected`: container last state가 OOMKilled인지.
- `rollout_stuck`: desired replicas와 available replicas가 오래 불일치하는지.
- `node_pressure`: MemoryPressure/DiskPressure/NotReady 여부.
- `error_log_burst`: 짧은 시간에 error log가 급증했는지.
- `latency_regression`: p95 latency가 기준선보다 증가했는지.
- `dependency_failure`: trace에서 특정 downstream span이 반복 실패하는지.

## MetricEvidence

Prometheus query 결과를 축약한 evidence다.

예시 필드:

- `query`: 실행한 PromQL.
- `window`: 조회 기간.
- `latest`: 가장 최근 값.
- `max`: 기간 내 최대값.
- `rate`: 증가율 또는 초당 변화량.
- `labels`: 필요한 최소 label.

하지 말 것:

- 전체 time-series sample을 모두 보내지 않는다.
- label에 log line, user input, secret을 넣지 않는다.
- 너무 많은 pod/container label을 무제한으로 보내지 않는다.

## LogEvidence

Loki query 결과나 Kubernetes pod log 일부를 축약한 evidence다.

예시 필드:

- `query`: 실행한 LogQL 또는 source.
- `window`: 조회 기간.
- `level`: error, warn, info.
- `message_snippet`: 짧은 log snippet.
- `count`: 비슷한 log 발생 횟수.
- `redacted`: redaction 적용 여부.

하지 말 것:

- 전체 로그 파일을 보내지 않는다.
- Authorization header, cookie, token, password, kubeconfig를 보내지 않는다.
- stacktrace 전체를 무제한으로 넣지 않는다.

## PodEvidence

Kubernetes API에서 읽은 pod 상태를 축약한 evidence다.

예시 필드:

- `namespace`
- `pod`
- `phase`
- `reason`
- `message`
- `restart_count`
- `container_statuses`

의미 있는 상태:

- `CrashLoopBackOff`
- `ImagePullBackOff`
- `OOMKilled`
- `Pending`
- `FailedScheduling`
- `Readiness probe failed`
- `Liveness probe failed`

## TraceEvidence

OpenTelemetry trace backend에서 조회한 span 정보를 축약한 evidence다.

예시 필드:

- `trace_id`
- `service`
- `operation`
- `duration_ms`
- `status`
- `error_span`
- `downstream_service`

하지 말 것:

- trace 전체를 event payload에 넣지 않는다.
- HTTP header 전체를 보내지 않는다.
- user token이나 request body를 보내지 않는다.

## EvidenceSummarizer

raw 데이터를 evidence로 바꾸는 계층을 둔다.

```text
Prometheus samples
  -> EvidenceSummarizer
  -> MetricEvidence

Loki log lines
  -> EvidenceSummarizer
  -> LogEvidence

Kubernetes pod status
  -> EvidenceSummarizer
  -> PodEvidence
```

권장 interface:

```text
EvidenceSummarizer
  summarize_metric(...)
  summarize_log(...)
  summarize_pod(...)
  summarize_trace(...)
```

이 계층이 필요한 이유:

- RCA Worker가 provider별 API 응답 구조를 몰라도 된다.
- Gateway event payload가 커지지 않는다.
- redaction 위치가 명확해진다.
- 테스트 fixture를 만들기 쉬워진다.

## 테스트 기준

- Prometheus samples -> MetricEvidence.
- Loki lines -> LogEvidence.
- Kubernetes pod status -> PodEvidence.
- secret-like text redaction.
- evidence payload 크기 제한.
- 필수 field 누락 거부.
