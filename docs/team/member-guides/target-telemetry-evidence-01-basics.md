# Target / Telemetry Evidence 01: 쉬운 해설

## 목표

이 문서는 Evidence가 뭔지 아주 쉬운 말로 설명한다.

처음 기억할 문장은 이것이다.

```text
Evidence는 장애를 설명하는 데 쓸 작은 증거 조각이다.
```

## Evidence가 왜 필요한가?

관측 도구는 데이터를 아주 많이 준다.

예를 들어 장애가 났을 때 실제로 볼 수 있는 데이터는 이렇다.

```text
Kubernetes pod 상태 수십 줄
Kubernetes event 수십 개
Prometheus metric sample 수백 개
Loki log line 수천 줄
OpenTelemetry trace span 수백 개
```

이걸 전부 Gateway나 RCA Worker로 보내면 안 된다.

이유:

- 너무 크다.
- 읽기 어렵다.
- 도구마다 모양이 다르다.
- token, password, cookie 같은 민감정보가 섞일 수 있다.
- RCA Worker가 Prometheus/Loki/Kubernetes/OTel raw format을 모두 알아야 한다.

그래서 Target Agent가 먼저 줄인다.

```text
raw data 많이 있음
  -> 중요한 것만 고름
  -> 사람이 읽는 summary 작성
  -> 숫자는 signals에 넣음
  -> 원본을 다시 찾을 힌트는 source_ref에 넣음
  -> EvidenceDraft 완성
```

## Raw Data란?

Raw data는 도구가 원래 주는 데이터다.

Prometheus raw data 예시:

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

처음 보는 사람은 이 JSON만 보고 “그래서 장애인가?”를 바로 알기 어렵다.

## EvidenceDraft란?

EvidenceDraft는 raw data를 우리 시스템이 이해하기 쉽게 줄인 중간 모델이다.

예시:

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

이제 의미가 훨씬 쉽다.

```text
checkout-api의 5xx 비율이 0.19다.
이 값은 Prometheus query로 얻었다.
5분 window를 봤다.
```

## Raw Data와 EvidenceDraft 차이

| 질문 | Raw Data | EvidenceDraft |
| --- | --- | --- |
| 누가 주나 | Prometheus, Loki, Kubernetes, OTel | 우리 Target Agent |
| 사람이 바로 읽기 쉬운가 | 어렵다 | 쉬워야 한다 |
| 크기 | 크다 | 작다 |
| 민감정보 위험 | 높다 | 줄여야 한다 |
| 최종 이벤트 계약인가 | 아니다 | 아직 아니다 |
| 테스트하기 쉬운가 | 어렵다 | 쉬워야 한다 |

## 지금은 이벤트 계약이 아니다

EvidenceDraft는 최종 이벤트 payload가 아니다.

지금은 아래 파일을 확정하지 않는다.

```text
packages/contracts/event_bus/bodies/
```

지금은 Target Agent 내부에서 raw data를 줄이는 연습을 먼저 한다.

처음 위치 후보:

```text
services/target/target-cluster-agent/evidence.py
```

나중 흐름:

```text
EvidenceDraft
  -> Gateway request DTO
  -> cluster.evidence.received event payload
  -> RCA Worker input
```

## EvidenceDraft의 기본 모양

처음에는 이 정도면 충분하다.

```json
{
  "kind": "metric | pod | kubernetes_event | log | trace",
  "summary": "사람이 읽을 수 있는 한 문장",
  "signals": {},
  "source_ref": {},
  "observed_at": "2026-06-27T12:00:00Z"
}
```

## 절대 넣지 말 것

EvidenceDraft에도 아래 값은 넣지 않는다.

- token
- password
- kubeconfig
- Authorization header
- cookie
- 전체 log file
- 전체 trace
- Prometheus raw response 전체

## 마이크로 데모로 확인하기

직접 보려면 아래 데모를 실행한다.

```bash
cd examples/telemetry-evidence-demo
docker compose up --build
```

성공하면 `evidence-demo` 컨테이너가 raw Prometheus response와 EvidenceDraft를 같이 출력한다.
