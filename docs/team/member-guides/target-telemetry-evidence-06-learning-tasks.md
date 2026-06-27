# Target / Telemetry Evidence 06: 학습 Task 보드

## 목적

이 문서는 작업자가 아주 작은 단계로 직접 실행하고 확인하면서 Evidence 모델을 이해하게 만드는 Task 보드다.

한 Task는 가능한 한 10~30분 안에 끝난다.

각 Task는 네 가지를 반드시 가진다.

```text
목표
  이번에 무엇을 이해하거나 만들지

직접 확인
  눈으로 어떤 결과를 보면 성공인지

산출물
  어떤 파일, 명령, 스크린샷, 테스트가 남는지

나중에 옮길 위치
  이 학습 결과가 실제 내부 모듈 어디로 들어갈지
```

## Stage 0. 준비

### Task 0-1. 현재 repo 상태 확인

목표:

```text
내가 지금 어떤 파일을 기준으로 작업하는지 확인한다.
```

실행:

```bash
pwd
git status --short
find services/target-cluster-agent services/node-collector -maxdepth 2 -type f | sort
```

직접 확인:

- `services/target-cluster-agent/agent.py`가 보인다.
- `services/target-cluster-agent/fake_prometheus.py`가 보인다.
- `services/node-collector/node_collector.py`가 보인다.

산출물:

- 없음. 눈으로 확인하면 된다.

나중에 옮길 위치:

- 해당 없음.

성취 기준:

```text
현재 Target/Telemetry 관련 파일이 어디 있는지 말할 수 있다.
```

### Task 0-2. fake-prometheus가 진짜 Prometheus가 아님을 확인

목표:

```text
fake_prometheus.py는 실제 Prometheus가 아니라는 점을 이해한다.
```

확인할 파일:

```bash
sed -n '1,220p' services/target-cluster-agent/fake_prometheus.py
sed -n '1,260p' services/target-cluster-agent/agent.py
```

직접 확인:

- `fake_prometheus.py`는 `run_fake_telemetry(...)`만 호출한다.
- `agent.py`의 `create_fake_telemetry_app("prometheus")`는 fixed JSON을 반환한다.
- scrape 저장소, PromQL engine, time-series DB가 없다.

산출물:

- 작업 메모에 `fake-prometheus != real Prometheus`라고 적는다.

나중에 옮길 위치:

- 문서와 이슈 설명에 반영되어야 한다.

성취 기준:

```text
fake-prometheus와 real Prometheus의 차이를 설명할 수 있다.
```

## Stage 1. Raw data 직접 보기

### Task 1-1. node-collector `/metrics` 확인

목표:

```text
Prometheus가 scrape할 수 있는 metric 원문을 직접 본다.
```

실행:

```bash
uv run pytest tests/test_node_collector.py
```

선택 실행:

```bash
python services/node-collector/runner.py
```

다른 터미널:

```bash
curl http://localhost:9100/metrics
```

직접 확인:

- `node_collector_cpu_usage_ratio`가 보인다.
- `node_collector_memory_working_set_bytes`가 보인다.
- `node_collector_filesystem_usage_ratio`가 보인다.

산출물:

- `tests/test_node_collector.py` 통과.
- `/metrics` 출력 캡처 또는 메모.

나중에 옮길 위치:

- 이 metric들은 Prometheus scrape target이 된다.

성취 기준:

```text
Prometheus가 왜 /metrics를 읽는지 눈으로 확인했다.
```

### Task 1-2. Docker micro demo 실행

목표:

```text
Prometheus/Loki/OTel Collector가 따로 어떤 역할을 하는지 직접 본다.
```

준비:

```text
Docker Desktop을 먼저 실행한다.
Docker가 꺼져 있으면 docker compose가 이미지를 받을 수 없다.
```

실행:

```bash
cd examples/telemetry-evidence-demo
docker compose up --build
```

직접 확인:

- `evidence-demo` 로그에 `RAW PROMETHEUS SAMPLE`이 보인다.
- `evidence-demo` 로그에 `EVIDENCE DRAFTS`가 보인다.
- `otel-collector` 로그에 filelog를 읽은 debug output이 보인다.

산출물:

- Docker compose가 실행됨.
- raw response와 EvidenceDraft 출력 확인.

나중에 옮길 위치:

- `examples/telemetry-evidence-demo/app/evidence_demo.py`의 변환 아이디어를 `services/target-cluster-agent/evidence.py`로 옮긴다.

성취 기준:

```text
raw telemetry와 EvidenceDraft 차이를 실제 출력으로 봤다.
```

### Task 1-3. Prometheus raw query 직접 실행

목표:

```text
Prometheus raw JSON이 어떤 모양인지 직접 본다.
```

실행:

```bash
curl "http://localhost:19090/api/v1/query?query=demo_http_5xx_rate"
curl "http://localhost:19090/api/v1/query?query=demo_pod_restart_total"
```

직접 확인:

- JSON 안에 `status`, `data`, `result`가 있다.
- 실제 값은 `value` 배열 안에 들어 있다.

산출물:

- raw Prometheus JSON 샘플.

나중에 옮길 위치:

- `latest_from_prometheus_vector(raw)` 테스트 fixture.

성취 기준:

```text
Prometheus raw response에서 숫자 값이 어디 있는지 찾을 수 있다.
```

### Task 1-4. Loki raw query 직접 실행

목표:

```text
Loki raw log query 결과가 어떤 모양인지 직접 본다.
```

실행:

```bash
curl -G "http://localhost:13100/loki/api/v1/query" \
  --data-urlencode 'query={service="checkout-api"} |= "readiness"'
```

직접 확인:

- JSON 안에 `streams` 또는 `result`가 있다.
- log line은 values 안에 들어 있다.

산출물:

- raw Loki JSON 샘플.

나중에 옮길 위치:

- `log_evidence_from_loki(raw)` 테스트 fixture.

성취 기준:

```text
Loki raw response에서 log line이 어디 있는지 찾을 수 있다.
```

## Stage 2. Raw data 줄이기

### Task 2-1. Prometheus raw JSON에서 latest 값만 뽑기

목표:

```text
큰 Prometheus JSON에서 숫자 하나만 추출한다.
```

실험 파일:

```text
examples/telemetry-evidence-demo/app/evidence_demo.py
```

확인할 함수:

```text
latest_value(...)
```

직접 확인:

- `demo_http_5xx_rate` latest 값이 `0.19`로 나온다.

산출물:

- latest 추출 로직 이해.

나중에 옮길 위치:

```text
services/target-cluster-agent/evidence.py
tests/test_target_metric_evidence.py
```

성취 기준:

```text
Prometheus raw response를 받아 숫자 하나로 줄일 수 있다.
```

### Task 2-2. MetricEvidenceDraft JSON 만들기

목표:

```text
latest 숫자를 사람이 읽는 EvidenceDraft로 바꾼다.
```

실험 파일:

```text
examples/telemetry-evidence-demo/app/evidence_demo.py
```

확인할 함수:

```text
metric_evidence(...)
```

직접 확인:

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

산출물:

- MetricEvidenceDraft 예시.

나중에 옮길 위치:

```text
services/target-cluster-agent/evidence.py
```

성취 기준:

```text
숫자 하나를 summary/signals/source_ref 구조로 바꿀 수 있다.
```

### Task 2-3. Loki log count EvidenceDraft 만들기

목표:

```text
여러 log line을 count와 snippet으로 줄인다.
```

실험 파일:

```text
examples/telemetry-evidence-demo/app/evidence_demo.py
```

확인할 함수:

```text
log_evidence(...)
```

직접 확인:

- `count`가 0보다 크다.
- `message_snippet`이 짧은 문장이다.
- 전체 로그 파일이 들어가지 않는다.

산출물:

- LogEvidenceDraft 예시.

나중에 옮길 위치:

```text
services/target-cluster-agent/evidence.py
tests/test_target_log_evidence.py
```

성취 기준:

```text
로그 여러 줄을 count/snippet으로 줄일 수 있다.
```

## Stage 3. 내부 모듈로 가져오기

### Task 3-1. `evidence.py` 파일 만들기

목표:

```text
데모에서 배운 변환 로직을 실제 Target Agent 내부 모듈로 옮길 준비를 한다.
```

새 파일:

```text
services/target-cluster-agent/evidence.py
```

처음 넣을 것:

```python
EvidenceDraft
latest_from_prometheus_vector
MetricEvidenceDraft
```

직접 확인:

```bash
python -m py_compile services/target-cluster-agent/evidence.py
```

산출물:

- 내부 모듈 후보 파일.

성취 기준:

```text
데모 코드가 실제 서비스 코드로 옮겨갈 첫 위치가 생겼다.
```

### Task 3-2. 첫 단위 테스트 만들기

목표:

```text
EvidenceDraft 생성 로직을 Gateway/Event 없이 테스트한다.
```

새 파일:

```text
tests/test_target_metric_evidence.py
```

테스트:

```text
Prometheus vector response -> latest 0.19
empty response -> None
invalid value -> 안전 처리
```

실행:

```bash
uv run pytest tests/test_target_metric_evidence.py
```

성취 기준:

```text
Gateway/Event 계약 없이 EvidenceDraft 로직만 테스트할 수 있다.
```

### Task 3-3. PodEvidenceDraft 테스트 만들기

목표:

```text
Kubernetes pod 상태 fixture를 EvidenceDraft로 줄인다.
```

새 파일:

```text
tests/test_target_pod_evidence.py
```

테스트 fixture:

```text
namespace=sandbox
pod=checkout-api
reason=CrashLoopBackOff
restart_count=4
```

성취 기준:

```text
Kubernetes raw 상태를 작은 pod evidence로 바꿀 수 있다.
```

## Stage 4. 최종 계약과 연결 준비

### Task 4-1. 변환 경계 만들기

목표:

```text
EvidenceDraft를 나중에 Gateway/Event payload로 바꿀 위치를 정한다.
```

아직 하지 말 것:

- `packages/contracts/event_bus/payloads.py` 수정.
- `cluster.evidence.received` 최종 JSON 확정.
- Gateway endpoint DTO 확정.

지금 할 것:

```text
EvidenceDraft -> dict 변환 함수 후보만 작성
```

성취 기준:

```text
나중에 계약이 정해져도 EvidenceDraft 생성 코드를 버리지 않아도 된다.
```

## 학습 완료 기준

작업자가 아래를 할 수 있으면 Evidence 모델 학습 1단계는 완료다.

- Prometheus raw response에서 값을 찾을 수 있다.
- Loki raw response에서 log line을 찾을 수 있다.
- raw data와 EvidenceDraft 차이를 설명할 수 있다.
- `kind`, `summary`, `signals`, `source_ref` 의미를 설명할 수 있다.
- Docker demo를 실행해서 EvidenceDraft 출력을 볼 수 있다.
- `services/target-cluster-agent/evidence.py`로 옮길 함수 후보를 말할 수 있다.
