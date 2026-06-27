# Telemetry Evidence Micro Demo

## 목적

이 데모는 Target/Telemetry 작업자가 구현 전에 직접 확인하기 위한 격리된 Docker Compose 예제다.

이 데모에서 확인하는 것:

- Prometheus는 `/metrics`를 scrape한다.
- Loki는 log를 ingest한다.
- OpenTelemetry Collector는 log 파일을 읽어 debug exporter로 출력한다.
- raw telemetry는 그대로 쓰지 않고 작은 EvidenceDraft로 줄인다.

이 데모는 Management Gateway, NATS, event bus와 연결하지 않는다.

## 구성

```text
demo-metrics
  Python HTTP server
  GET /metrics 제공

prometheus
  demo-metrics:8000/metrics scrape

loki
  demo-log-writer가 push한 로그 저장

demo-log-writer
  Loki push API로 error log 전송
  같은 로그를 shared file에도 기록

otel-collector
  shared log file을 filelog receiver로 읽음
  debug exporter로 stdout 출력

evidence-demo
  Prometheus와 Loki를 query
  raw response를 EvidenceDraft JSON으로 축약
```

## 실행

먼저 Docker Desktop이 실행 중이어야 한다.

```bash
cd examples/telemetry-evidence-demo
docker compose up --build
```

`evidence-demo` 컨테이너가 아래 두 섹션을 출력하면 성공이다.

```text
=== RAW PROMETHEUS SAMPLE ===
...

=== EVIDENCE DRAFTS ===
...
```

## 직접 확인

Prometheus query:

```bash
curl "http://localhost:19090/api/v1/query?query=demo_http_5xx_rate"
curl "http://localhost:19090/api/v1/query?query=demo_pod_restart_total"
curl "http://localhost:19090/api/v1/query?query=demo_node_cpu_usage_ratio"
```

Loki query:

```bash
curl -G "http://localhost:13100/loki/api/v1/query" \
  --data-urlencode 'query={service="checkout-api"} |= "readiness"'
```

OTel Collector debug output:

```bash
docker compose logs otel-collector
```

Metrics endpoint:

```bash
curl http://localhost:18001/metrics
```

## 종료

```bash
docker compose down -v
```

## 이 데모에서 배워야 하는 것

Raw Prometheus response는 도구가 쓰는 원본 형식이다.

```json
{
  "status": "success",
  "data": {
    "result": [...]
  }
}
```

EvidenceDraft는 우리 시스템이 RCA/Gateway/Event로 넘기기 전에 만든 작은 요약이다.

```json
{
  "kind": "metric",
  "summary": "checkout-api 5xx rate latest value is 0.19",
  "signals": {
    "latest": 0.19
  },
  "source_ref": {
    "source": "prometheus",
    "query": "demo_http_5xx_rate"
  }
}
```

중요한 차이:

- raw data는 크고 복잡하다.
- EvidenceDraft는 작고 읽기 쉽다.
- EvidenceDraft는 아직 최종 event payload가 아니다.
