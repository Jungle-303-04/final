# Telemetry Evidence Micro Demo

## 목적

이 데모는 Target/Telemetry 작업자가 구현 전에 직접 확인하기 위한 격리된 Docker Compose 예제다.

이 데모에서 확인하는 것:

- Prometheus는 `/metrics`를 scrape한다.
- Loki는 log를 ingest한다.
- OpenTelemetry Collector는 log 파일을 읽어 debug exporter로 출력한다.
- raw telemetry는 그대로 쓰지 않고 작은 EvidenceDraft로 줄인다.

이 데모는 Management Gateway, NATS, event bus와 연결하지 않는다.

## 먼저 알아야 하는 말

Prometheus, Loki, OpenTelemetry Collector는 모두 관측 도구다. 하지만 하는 일이 다르다.

Prometheus:

```text
숫자를 모은다.
예: 5xx 비율, restart count, CPU 사용률
```

Prometheus는 보통 pull 방식이다.

```text
Prometheus
  -> 주기적으로 /metrics를 HTTP로 읽음
  -> 읽은 숫자를 시간순으로 저장
```

Loki:

```text
로그 문자열을 모은다.
예: readiness probe failed, database timeout, OOMKilled log
```

Loki는 ingest 방식이 강하다.

```text
app 또는 log collector
  -> Loki API로 log를 보냄
  -> Loki가 label과 log line을 저장
```

OpenTelemetry Collector:

```text
metric, log, trace를 받아서 다른 곳으로 전달하는 중간 수집기다.
```

이 데모에서는 OTel Collector가 shared log file을 읽고 stdout에 출력한다. 아직 우리 시스템 event bus로 보내지는 않는다.

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

## 파일 구조

```text
examples/telemetry-evidence-demo/
  docker-compose.yml
    데모 컨테이너 전체 실행 정의

  prometheus/prometheus.yml
    Prometheus가 demo-metrics를 scrape하도록 설정

  otel/otel-collector.yaml
    OTel Collector가 shared log file을 읽도록 설정

  app/metrics_server.py
    /metrics endpoint를 제공하는 작은 Python 서버

  app/write_logs.py
    Loki에 샘플 로그를 보내고 shared log file에도 기록

  app/evidence_demo.py
    Prometheus/Loki를 query하고 EvidenceDraft 형태로 줄임
```

## 포트

| 도구 | URL | 의미 |
| --- | --- | --- |
| demo-metrics | `http://localhost:18001/metrics` | Prometheus가 읽는 metric 원문 |
| Prometheus | `http://localhost:19090` | metric query API |
| Loki | `http://localhost:13100` | log query API |

## 실행 전 준비

### 1. Docker Desktop 실행

먼저 Docker Desktop이 실행 중이어야 한다.

확인:

```bash
docker info
```

성공하면 Docker 정보가 출력된다.

실패 예시:

```text
Cannot connect to the Docker daemon
```

이 메시지가 나오면 Docker Desktop을 켠 뒤 다시 실행한다.

### 2. 현재 위치 확인

source repo root에서 실행한다.

```bash
pwd
```

예상 위치:

```text
/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final
```

## 1단계: 설정 파일만 검증

먼저 컨테이너를 띄우지 않고 compose 설정이 올바른지 확인한다.

```bash
docker compose -f examples/telemetry-evidence-demo/docker-compose.yml config
```

성공 기준:

```text
services:
  demo-metrics:
  prometheus:
  loki:
  otel-collector:
  evidence-demo:
```

이 단계는 “문법이 맞는지”만 본다. Prometheus나 Loki가 실제로 실행된 것은 아니다.

## 2단계: 데모 실행

source repo root에서 실행한다.

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

의미:

```text
RAW PROMETHEUS SAMPLE
  Prometheus가 준 원본 JSON이다.

EVIDENCE DRAFTS
  우리 코드가 raw data를 작게 줄인 결과다.
```

## 3단계: metric 원문 확인

새 터미널에서 실행한다.

```bash
curl http://localhost:18001/metrics
```

봐야 할 것:

```text
demo_http_5xx_rate{service="checkout-api",namespace="sandbox"} 0.19
demo_pod_restart_total{pod="checkout-api",namespace="sandbox"} 4
demo_node_cpu_usage_ratio{node="worker-1"} 0.82
```

의미:

```text
이 출력이 Prometheus가 scrape하는 원문이다.
아직 Evidence가 아니다.
```

나중에 내부 코드로 옮길 부분:

```text
Prometheus adapter가 이 metric을 query한다.
Evidence builder가 query 결과를 EvidenceDraft로 줄인다.
```

## 4단계: Prometheus query 확인

Prometheus query:

```bash
curl "http://localhost:19090/api/v1/query?query=demo_http_5xx_rate"
curl "http://localhost:19090/api/v1/query?query=demo_pod_restart_total"
curl "http://localhost:19090/api/v1/query?query=demo_node_cpu_usage_ratio"
```

봐야 할 것:

```json
{
  "status": "success",
  "data": {
    "result": [
      {
        "metric": {},
        "value": [1234567890, "0.19"]
      }
    ]
  }
}
```

핵심:

```text
숫자 값은 data.result[0].value[1]에 문자열로 들어온다.
그래서 EvidenceDraft로 만들기 전에 float로 바꿔야 한다.
```

나중에 내부 코드로 옮길 부분:

```text
latest_value(raw)
metric_evidence(...)
```

후보 위치:

```text
services/target-cluster-agent/evidence.py
tests/test_target_metric_evidence.py
```

## 5단계: Loki query 확인

Loki query:

```bash
curl -G "http://localhost:13100/loki/api/v1/query" \
  --data-urlencode 'query={service="checkout-api"} |= "readiness"'
```

봐야 할 것:

```json
{
  "status": "success",
  "data": {
    "result": [
      {
        "stream": {
          "service": "checkout-api"
        },
        "values": [
          ["1234567890", "readiness probe failed ..."]
        ]
      }
    ]
  }
}
```

핵심:

```text
Loki는 숫자보다 log line을 준다.
EvidenceDraft에서는 전체 log를 다 보내지 말고 count, snippet, label만 남긴다.
```

나중에 내부 코드로 옮길 부분:

```text
log_evidence_from_loki(raw)
```

후보 위치:

```text
services/target-cluster-agent/evidence.py
tests/test_target_log_evidence.py
```

## 6단계: OTel Collector 로그 확인

OTel Collector debug output:

```bash
docker compose logs otel-collector
```

봐야 할 것:

```text
Body: readiness probe failed
Attributes 또는 Resource labels
```

의미:

```text
OTel Collector는 데이터를 받아서 다른 곳으로 보내는 중간 수집기다.
이 데모에서는 shared log file을 읽어 stdout으로 출력한다.
```

나중에 내부 코드로 옮길 부분:

```text
OTel은 바로 구현하지 않는다.
먼저 Prometheus metric, Kubernetes pod/event, Loki log부터 EvidenceDraft로 줄인다.
```

## 7단계: EvidenceDraft 출력 읽기

`evidence-demo` 로그에서 아래 구조를 본다.

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

각 필드 의미:

| 필드 | 의미 |
| --- | --- |
| `kind` | 증거 종류. metric/log/pod/event/trace 같은 값 |
| `summary` | 사람이 바로 읽는 한 줄 설명 |
| `signals` | 판단에 필요한 작은 값들 |
| `source_ref` | 이 증거가 어디에서 왔는지 추적하는 정보 |

중요:

```text
EvidenceDraft는 아직 final event payload가 아니다.
나중에 Gateway/Event 계약이 생기면 변환해서 보낸다.
```

## 8단계: 종료

```bash
docker compose down -v
```

`-v`는 demo volume을 지운다는 뜻이다. 다시 실행하면 깨끗한 상태에서 시작한다.

## 자주 막히는 문제

### Docker daemon 오류

증상:

```text
Cannot connect to the Docker daemon
```

해결:

```text
Docker Desktop을 실행한다.
docker info로 다시 확인한다.
```

### 포트 충돌

증상:

```text
port is already allocated
```

확인:

```bash
lsof -i :19090
lsof -i :13100
lsof -i :18001
```

해결:

```text
기존 프로세스를 종료하거나 docker-compose.yml의 published port를 바꾼다.
```

### Prometheus query가 빈 결과

증상:

```json
{"result":[]}
```

확인:

```bash
curl http://localhost:18001/metrics
docker compose logs prometheus
```

의미:

```text
Prometheus가 아직 scrape하지 않았거나 demo-metrics가 준비되기 전일 수 있다.
몇 초 기다린 뒤 다시 query한다.
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

## 작업자가 남겨야 하는 학습 기록

작업자는 아래를 이슈 코멘트나 작업 메모에 남긴다.

```text
1. /metrics에서 본 metric 이름 3개
2. Prometheus raw response에서 숫자가 들어 있던 JSON path
3. Loki raw response에서 log line이 들어 있던 JSON path
4. EvidenceDraft 필드 kind/summary/signals/source_ref 설명
5. services/target-cluster-agent/evidence.py로 옮길 함수 후보
```

이 기록이 있어야 다음 구현 단계에서 단순 복붙이 아니라 “왜 이렇게 줄이는지”를 이해한 상태로 넘어갈 수 있다.
