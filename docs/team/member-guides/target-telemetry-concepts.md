# Target / Telemetry: 기본 개념

## 목적

이 문서는 Prometheus, Loki, OpenTelemetry를 처음 접하는 담당자가 연결 방향을 헷갈리지 않도록 기본 개념을 설명한다.

핵심은 하나다.

```text
Prometheus는 주로 pull/scrape 모델이다.
Loki와 OpenTelemetry는 push/ingest 모델도 강하다.
```

## Pull/Scrape와 Push/Ingest 차이

관측 시스템을 연결할 때 가장 먼저 구분해야 하는 개념이다.

```text
Pull / Scrape
  관측 플랫폼이 주기적으로 target에 찾아가서 데이터를 읽는다.

Push / Ingest
  app, agent, collector가 관측 플랫폼의 수집 endpoint로 데이터를 보낸다.
```

## Pull / Scrape

Pull 모델에서는 데이터를 가진 쪽이 “여기서 읽어가세요”라는 endpoint를 열어둔다. 관측 플랫폼이 일정 주기로 그 endpoint를 호출해서 데이터를 가져간다.

Prometheus가 대표적이다.

```text
Node Collector
  GET /metrics 제공

Prometheus
  15초마다 Node Collector의 /metrics 호출
  metric sample 저장
```

이때 Node Collector가 Prometheus에게 데이터를 보내는 것이 아니다. Node Collector는 `/metrics`를 열어두고, Prometheus가 와서 긁어간다. 그래서 이 방식을 scrape라고 부른다.

예시:

```text
Prometheus -> GET http://node-collector:9100/metrics

node_collector_runtime_ready{node="worker-1"} 1
node_collector_pod_restart_total{namespace="sandbox",pod="api"} 3
```

장점:

- target이 단순하다. `/metrics`만 제공하면 된다.
- Prometheus가 수집 주기, 실패, 재시도를 통제한다.
- 어떤 target이 죽었는지 Prometheus가 쉽게 알 수 있다.

주의할 점:

- Prometheus가 target에 네트워크로 접근할 수 있어야 한다.
- metric label을 너무 많이 만들면 저장 비용이 커진다.
- log line 같은 긴 문자열을 metric label에 넣으면 안 된다.

## Push / Ingest

Push 모델에서는 데이터를 가진 쪽이 관측 플랫폼 또는 collector로 데이터를 직접 보낸다. 이때 관측 플랫폼의 수집 endpoint로 데이터를 넣는 과정을 ingest라고 부른다.

Loki와 OpenTelemetry는 push/ingest 흐름이 자연스럽다.

```text
Application / Agent / Collector
  -> log, trace, metric batch 생성
  -> Loki 또는 OpenTelemetry Collector endpoint로 전송
```

예시:

```text
Pod stdout
  -> fluent-bit 또는 promtail
  -> Loki ingest API

Application trace
  -> OpenTelemetry SDK
  -> OpenTelemetry Collector OTLP endpoint
  -> trace backend
```

장점:

- target에 inbound endpoint를 열기 어려운 환경에서도 데이터를 보낼 수 있다.
- log/traces처럼 이벤트성 데이터나 batch 전송에 잘 맞는다.
- Collector를 두면 여러 backend로 라우팅하거나 redaction/filtering을 적용하기 좋다.

주의할 점:

- 전송 실패 시 buffering/retry를 설계해야 한다.
- token이나 log의 민감정보를 보내기 전에 redaction해야 한다.
- 수집 endpoint credential을 event나 log에 남기면 안 된다.

## Prometheus에 API로 데이터를 넣으면 안 되는가?

일반적인 Prometheus 사용법은 “API로 insert”가 아니라 “Prometheus가 scrape”이다.

그래서 Kubernetes API에서 읽은 정보를 Prometheus에 넣고 싶다면 보통 이렇게 한다.

```text
Kubernetes API
  -> exporter가 읽음
  -> exporter가 /metrics 제공
  -> Prometheus가 scrape
```

대표 예시는 `kube-state-metrics`다. `kube-state-metrics`는 Kubernetes API를 읽고 pod/deployment/node 상태를 metric으로 바꿔 `/metrics`에 노출한다. Prometheus는 그 endpoint를 scrape한다.

예외적으로 Pushgateway가 있지만, 이것은 짧게 실행되고 사라지는 batch job metric을 임시로 받기 위한 용도에 가깝다. node/pod 상태를 계속 수집하는 기본 구조로 먼저 선택하지 않는다.

## Prometheus, Loki, OpenTelemetry의 역할

| 도구 | 주로 다루는 데이터 | 기본 연결 방식 | 우리 시스템에서의 역할 |
| --- | --- | --- | --- |
| Prometheus | numeric time-series metrics | target의 `/metrics`를 scrape | CPU, memory, restart count, request rate 같은 수치 조회 |
| Loki | logs | promtail/fluent-bit/OTel Collector가 push | pod log, error burst, exception message 조회 |
| OpenTelemetry | traces, metrics, logs | app/collector가 OTLP로 push | request trace, span error, service dependency 분석 |
| Kubernetes API | object state/events | client가 API 조회 | pod phase, deployment rollout, event reason 조회 |
| kubelet/cAdvisor | node/container runtime metrics | scrape 또는 kubelet API | container CPU/memory, filesystem, network 기초 정보 |

## 우리 프로젝트에서의 해석

```text
Prometheus 연결
  1. Node Collector가 /metrics 제공
  2. Prometheus가 scrape
  3. Agent 또는 Gateway adapter가 Prometheus query API로 필요한 window 조회
  4. 조회 결과를 MetricEvidence로 축약
  5. Gateway로 POST /agent/evidence

Loki 연결
  1. promtail/fluent-bit/OTel Collector가 pod log를 Loki로 push
  2. Agent 또는 Gateway adapter가 Loki query API로 최근 error log 조회
  3. log를 redaction하고 LogEvidence로 축약
  4. Gateway로 POST /agent/evidence

OpenTelemetry 연결
  1. app 또는 collector가 OTLP로 trace/metric/log push
  2. trace backend에서 느린 span/error span 조회
  3. TraceEvidence로 축약
  4. Gateway로 POST /agent/evidence
```

처음 구현해야 할 핵심:

- Prometheus용: `/metrics` exporter와 query adapter.
- Loki용: log ingest 경로는 collector/promtail에 맡기고, query adapter와 redaction.
- OTel용: OTLP ingest는 collector에 맡기고, trace summary adapter.
- Gateway 전송용: 어떤 backend에서 가져오든 최종적으로는 작고 안전한 evidence payload.
