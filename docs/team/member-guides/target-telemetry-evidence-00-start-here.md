# Target / Telemetry Evidence 00: 처음부터 따라하기

## 이 문서를 먼저 읽는다

이 문서는 Target / Telemetry 담당자가 아무것도 모르는 상태에서 시작할 수 있게 만든 시작 문서다.

목표는 거창하지 않다.

```text
1. 데모를 켠다.
2. Prometheus/Loki/OTel이 각각 무엇을 하는지 눈으로 본다.
3. raw data가 어떻게 생겼는지 본다.
4. raw data를 작은 EvidenceDraft로 줄이는 이유를 이해한다.
5. 나중에 services/target-cluster-agent/evidence.py로 옮길 코드를 찾는다.
```

지금 당장 Gateway API, NATS event, RCA Worker까지 연결하지 않는다. 그 계약은 아직 움직일 수 있기 때문이다.

## 전체 그림

먼저 아래 그림만 이해하면 된다.

```text
demo-metrics
  /metrics 숫자 제공
      |
      v
Prometheus
  숫자를 주기적으로 읽고 저장
      |
      v
evidence-demo
  Prometheus를 query해서 raw JSON을 받음
  raw JSON을 EvidenceDraft로 줄임

demo-log-writer
  더미 log 생성
      |
      v
Loki
  log 저장
      |
      v
evidence-demo
  Loki를 query해서 raw log JSON을 받음
  raw log JSON을 EvidenceDraft로 줄임

demo-log-writer
  같은 log를 file에도 기록
      |
      v
OpenTelemetry Collector
  file을 읽어서 stdout에 출력
```

여기서 중요한 점은 하나다.

```text
Prometheus/Loki/OTel은 원본 데이터를 보여준다.
우리 코드는 그 원본을 바로 쓰지 않고 EvidenceDraft로 줄인다.
```

## 용어 먼저 정리

### Raw data

도구가 원래 주는 데이터다.

예:

- Prometheus raw JSON
- Loki raw log query response
- Kubernetes pod status
- Kubernetes event list
- OTel trace span

raw data는 보통 크고 복잡하다. 사람이 바로 읽기 어렵고, 민감정보가 섞일 수도 있다.

### Evidence

장애를 설명하는 데 도움이 되는 작은 증거다.

예:

```text
checkout-api의 5xx 비율이 0.19다.
checkout-api pod가 4번 재시작했다.
readiness probe failed 로그가 최근에 여러 번 발생했다.
```

### EvidenceDraft

아직 최종 event payload는 아니지만, Target Agent 내부에서 쓰기 좋은 중간 모델이다.

처음에는 이렇게 생각하면 된다.

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

필드 뜻:

| 필드 | 뜻 |
| --- | --- |
| `kind` | 증거 종류. 예: metric, log, pod, kubernetes_event |
| `summary` | 사람이 읽는 한 줄 설명 |
| `signals` | 판단에 필요한 작은 값 |
| `source_ref` | 이 증거가 어디서 왔는지 추적하는 정보 |

## 0단계. 내 컴퓨터 준비 확인

source repo root에서 시작한다.

```bash
cd /Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final
pwd
```

예상 출력:

```text
/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final
```

도구 확인:

```bash
python --version
docker --version
docker compose version
docker info
```

`docker info`에서 아래 오류가 나오면 Docker Desktop이 꺼져 있는 것이다.

```text
Cannot connect to the Docker daemon
```

해결:

```text
Docker Desktop을 실행한다.
docker info를 다시 실행한다.
```

## 1단계. 데모 파일 위치 확인

```bash
find examples/telemetry-evidence-demo -maxdepth 3 -type f | sort
```

봐야 할 파일:

```text
examples/telemetry-evidence-demo/docker-compose.yml
examples/telemetry-evidence-demo/prometheus/prometheus.yml
examples/telemetry-evidence-demo/otel/otel-collector.yaml
examples/telemetry-evidence-demo/app/metrics_server.py
examples/telemetry-evidence-demo/app/write_logs.py
examples/telemetry-evidence-demo/app/evidence_demo.py
examples/telemetry-evidence-demo/README.md
```

각 파일 역할:

| 파일 | 역할 |
| --- | --- |
| `docker-compose.yml` | Prometheus/Loki/OTel/더미 앱을 한 번에 실행 |
| `prometheus.yml` | Prometheus가 어디를 scrape할지 설정 |
| `otel-collector.yaml` | OTel Collector가 어떤 file을 읽을지 설정 |
| `metrics_server.py` | `/metrics`를 제공하는 더미 서버 |
| `write_logs.py` | Loki와 file에 더미 log를 넣는 코드 |
| `evidence_demo.py` | raw response를 EvidenceDraft로 줄이는 예제 |

## 2단계. compose 설정만 먼저 확인

아직 컨테이너를 실행하지 않고 설정 문법만 본다.

```bash
docker compose -f examples/telemetry-evidence-demo/docker-compose.yml config
```

성공하면 아래 서비스들이 보인다.

```text
demo-metrics
prometheus
loki
demo-log-writer
otel-collector
evidence-demo
```

이 단계에서 성공했다는 뜻:

```text
docker-compose.yml 문법은 맞다.
```

이 단계에서 아직 안 된 것:

```text
Prometheus가 실행된 것은 아니다.
Loki가 실행된 것은 아니다.
EvidenceDraft가 만들어진 것도 아니다.
```

## 3단계. 데모 실행

```bash
cd examples/telemetry-evidence-demo
docker compose up --build
```

처음 실행하면 Docker image를 내려받아서 시간이 걸릴 수 있다.

성공하면 `evidence-demo` 로그에 아래 문구가 나온다.

```text
=== RAW PROMETHEUS SAMPLE ===
=== EVIDENCE DRAFTS ===
```

이 두 줄의 의미:

| 출력 | 의미 |
| --- | --- |
| `RAW PROMETHEUS SAMPLE` | Prometheus가 준 원본 JSON |
| `EVIDENCE DRAFTS` | 우리 코드가 원본을 줄인 결과 |

## 4단계. metric 원문 보기

새 터미널에서 source repo root로 이동한 뒤 실행한다.

```bash
curl http://localhost:18001/metrics
```

봐야 할 예시:

```text
demo_http_5xx_rate{service="checkout-api",namespace="sandbox"} 0.19
demo_pod_restart_total{pod="checkout-api",namespace="sandbox"} 4
demo_node_cpu_usage_ratio{node="worker-1"} 0.82
```

이것이 Prometheus가 읽는 원문이다.

아직 Evidence가 아니다.

## 5단계. Prometheus raw query 보기

```bash
curl "http://localhost:19090/api/v1/query?query=demo_http_5xx_rate"
```

봐야 할 구조:

```json
{
  "status": "success",
  "data": {
    "result": [
      {
        "metric": {
          "namespace": "sandbox",
          "service": "checkout-api"
        },
        "value": [1710000000, "0.19"]
      }
    ]
  }
}
```

중요:

```text
숫자는 data.result[0].value[1]에 있다.
Prometheus 값은 문자열로 오기 때문에 float로 바꿔야 한다.
```

나중에 코드로 옮길 생각:

```text
latest_value(raw) 함수가 이 값을 뽑는다.
```

후보 위치:

```text
services/target-cluster-agent/evidence.py
```

## 6단계. Loki raw query 보기

```bash
curl -G "http://localhost:13100/loki/api/v1/query" \
  --data-urlencode 'query={service="checkout-api"} |= "readiness"'
```

봐야 할 구조:

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
          ["1710000000", "readiness probe failed for checkout-api"]
        ]
      }
    ]
  }
}
```

중요:

```text
Loki는 숫자가 아니라 log line을 준다.
log line 전체를 event payload에 넣으면 너무 크고 위험할 수 있다.
그래서 count, snippet, labels 정도로 줄인다.
```

나중에 코드로 옮길 생각:

```text
log_evidence_from_loki(raw) 함수가 log 개수와 짧은 snippet을 만든다.
```

## 7단계. OTel Collector 출력 보기

```bash
docker compose logs otel-collector
```

봐야 할 것:

```text
readiness probe failed
```

이번 데모에서 OTel은 “구현 대상”이 아니라 “이런 수집기도 있다”를 눈으로 보는 수준이다.

처음 구현 우선순위는 아래 순서다.

```text
1. Prometheus metric
2. Kubernetes pod/event
3. Loki log
4. OTel trace/log/metric
```

## 8단계. EvidenceDraft가 어떻게 만들어지는지 보기

파일을 연다.

```bash
sed -n '1,260p' examples/telemetry-evidence-demo/app/evidence_demo.py
```

먼저 볼 함수:

```text
latest_value(...)
```

이 함수가 하는 일:

```text
Prometheus raw JSON에서 최신 숫자 하나를 꺼낸다.
```

다음에 볼 함수:

```text
metric_evidence(...)
```

이 함수가 하는 일:

```text
숫자 하나를 kind/summary/signals/source_ref 구조로 만든다.
```

## 9단계. 실제 내부 모듈로 옮길 때의 목표

처음 만들 파일 후보:

```text
services/target-cluster-agent/evidence.py
```

처음 만들 테스트 후보:

```text
tests/test_target_metric_evidence.py
tests/test_target_log_evidence.py
tests/test_target_pod_evidence.py
```

처음 구현할 함수 후보:

```text
latest_value(raw: dict) -> float | None
metric_evidence(name: str, raw: dict) -> dict
log_evidence_from_loki(raw: dict) -> dict
```

처음에는 class를 크게 만들지 않아도 된다.

먼저 해야 하는 것은 이것이다.

```text
raw JSON fixture 하나를 넣으면
작은 EvidenceDraft dict 하나가 나오는지 테스트한다.
```

## 10단계. 첫 테스트는 이렇게 생각한다

테스트 목표:

```text
Prometheus raw JSON에서 0.19를 뽑아서 EvidenceDraft로 만든다.
```

테스트 입력:

```json
{
  "status": "success",
  "data": {
    "result": [
      {
        "metric": {
          "namespace": "sandbox",
          "service": "checkout-api"
        },
        "value": [1710000000, "0.19"]
      }
    ]
  }
}
```

기대 결과:

```json
{
  "kind": "metric",
  "summary": "checkout-api 5xx rate latest value is 0.19",
  "signals": {
    "latest": 0.19
  },
  "source_ref": {
    "source": "prometheus"
  }
}
```

## 11단계. 최종 Event payload와 연결하지 않는 이유

지금 바로 아래 파일에 계약을 추가하지 않는다.

```text
packages/contracts/event_bus/payloads.py
```

이유:

```text
Gateway API가 아직 바뀔 수 있다.
RCA Worker가 어떤 input을 원하는지 아직 바뀔 수 있다.
Event subject와 payload가 아직 조정될 수 있다.
```

그래서 지금은 내부 모델만 만든다.

```text
EvidenceDraft
  -> 나중에 GatewayEvidenceRequest
  -> 나중에 cluster.evidence.received event payload
  -> 나중에 RCA Worker input
```

## 작업자가 남길 체크리스트

이 문서를 끝까지 따라 했으면 이슈 코멘트에 아래를 남긴다.

```text
1. docker compose config 성공 여부
2. docker compose up 성공 여부
3. /metrics에서 본 metric 이름 3개
4. Prometheus raw JSON에서 숫자가 있던 위치
5. Loki raw JSON에서 log line이 있던 위치
6. EvidenceDraft 필드 4개 설명
7. evidence.py로 옮길 함수 후보
```

이 체크리스트가 있어야 다음 구현 단계로 넘어간다.
