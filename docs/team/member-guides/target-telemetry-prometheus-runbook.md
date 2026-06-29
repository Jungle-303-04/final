# Target / Telemetry: Prometheus 실전 Runbook

## 목적

이 문서는 Target/Telemetry 작업자가 실제로 무엇부터 만들고, 어떤 파일을 수정하고, 어떤 테스트를 돌릴지 한 단계씩 따라 할 수 있게 만든 작업서다.

현재 Management Gateway 계약은 아직 고정하지 않는다. 먼저 Prometheus 폐쇄 루프를 만든다.

```text
node-collector /metrics
  -> real Prometheus scrape
  -> Prometheus query API
  -> Python query client
  -> Agent debug query API
  -> MetricEvidence summary
```

## 현재 프로젝트 상태

아래를 먼저 구분한다.

| 파일 | 현재 상태 | 작업자가 알아야 할 점 |
| --- | --- | --- |
| `src/services/target/cluster-agent/fake_prometheus.py` | fake server 실행 파일 | 실제 Prometheus가 아니다. scrape도 저장도 PromQL도 없다. |
| `src/services/target/cluster-agent/agent.py` | Gateway client와 fake evidence loop가 있음 | Gateway 계약은 나중에 바뀔 수 있으므로 지금은 debug query API를 별도로 만든다. |
| `src/services/target/node-collector/node_collector.py` | `/snapshot`, `/metrics`가 이미 있음 | real Prometheus의 첫 scrape target으로 사용한다. |
| `deploy/target/target.yaml` | fake telemetry, node collector, target agent 배포가 있음 | real Prometheus Helm 설치 경로는 아직 없다. |
| `tests/test_node_collector.py` | node collector 단위 테스트가 있음 | 새 metric 변경은 여기 테스트를 확장한다. |
| `Makefile` | `make check`, `make up`, `make smoke`가 있음 | 단위 테스트 후 전체 점검에 사용한다. |

## 전체 작업 순서

한 PR에 모두 넣지 않는다. 아래 순서대로 작게 나눈다.

```text
PR 1. Prometheus 설치 경로와 Helm values 초안
PR 2. Helm template/dry-run 문서와 검증 스크립트
PR 3. node-collector /metrics 테스트 강화
PR 4. Prometheus scrape target 연결
PR 5. Prometheus query client 추가
PR 6. Agent debug query API 추가
PR 7. MetricEvidence summary 추가
PR 8. Kubernetes pod/event reader fake adapter
PR 9. Kubernetes + Prometheus evidence 결합
PR 10. Gateway 계약 연결 준비
```

## PR 1. Prometheus 설치 경로와 Helm values 초안

### 목표

real Prometheus 설치물을 둘 위치를 만든다. 이 PR에서는 아직 실제 설치 성공까지 요구하지 않는다.

### 수정 파일

새로 만든다.

```text
deploy/target/observability/prometheus/README.md
deploy/target/observability/prometheus/values.yaml
```

### 구현 내용

`README.md`에는 아래 내용을 반드시 적는다.

```text
이 Prometheus는 platform internal observability 용도다.
사용자 workload GitOps diff 대상이 아니다.
namespace는 observability-system을 사용한다.
Helm chart version은 설치 전에 확인하고 고정한다.
values.yaml에는 secret을 넣지 않는다.
```

`values.yaml`에는 처음부터 많은 설정을 넣지 않는다. 최소 설정만 둔다.

예시 방향:

```yaml
fullnameOverride: prometheus-platform

server:
  persistentVolume:
    enabled: false
```

실제 chart 구조에 따라 values key는 달라질 수 있다. 그래서 작업자는 반드시 chart README와 `helm show values`를 확인한 뒤 최소값을 확정한다.

### 확인 명령

```bash
helm version
helm repo list
helm search repo prometheus
```

Helm이 없다면 설치부터 한다. 설치 여부 확인은 문서에 남긴다.

### 테스트

이 PR은 코드 테스트보다 문서/경로 검증이 중심이다.

```bash
git diff --check -- deploy/target/observability/prometheus/README.md deploy/target/observability/prometheus/values.yaml
```

### 완료 기준

- Prometheus 설치 경로가 생겼다.
- platform용 Prometheus와 사용자 workload GitOps diff가 다르다는 설명이 있다.
- values 파일에 secret이 없다.

## PR 2. Helm template/dry-run 문서와 검증 스크립트

### 목표

Prometheus 설치 전에 어떤 Kubernetes YAML이 생성되는지 확인하는 절차를 만든다.

### 수정 파일

```text
deploy/target/observability/prometheus/README.md
scripts/telemetry/README.md
scripts/telemetry/prometheus-template.sh
```

`scripts/telemetry` 폴더가 없으면 만든다.

### 구현 내용

`prometheus-template.sh`는 destructive command가 아니어야 한다. 실제 install이 아니라 template 또는 dry-run만 한다.

예시 흐름:

```bash
#!/usr/bin/env bash
set -euo pipefail

helm template prometheus-platform <CHART_NAME> \
  --namespace observability-system \
  -f deploy/target/observability/prometheus/values.yaml
```

`<CHART_NAME>`은 작업자가 선택한 chart 이름으로 바꾼다. 선택한 이유와 chart version을 README에 적는다.

### 확인 명령

```bash
bash scripts/telemetry/prometheus-template.sh > /tmp/prometheus.yaml
rg "kind: (Deployment|StatefulSet|Service|ServiceAccount|ClusterRole)" /tmp/prometheus.yaml
```

### 테스트

```bash
bash scripts/telemetry/prometheus-template.sh >/tmp/prometheus.yaml
test -s /tmp/prometheus.yaml
```

### 완료 기준

- dry-run 또는 template 명령이 성공한다.
- 생성된 YAML이 `deploy/target/observability` 경로에서 관리된다는 설명이 있다.
- 실제 cluster에 apply하지 않는다.

## PR 3. node-collector /metrics 테스트 강화

### 목표

Prometheus가 읽을 첫 target인 `node-collector /metrics`를 안정화한다.

### 현재 코드

`src/services/target/node-collector/node_collector.py`에는 이미 있다.

```text
GET /metrics
node_collector_cpu_usage_ratio
node_collector_memory_working_set_bytes
node_collector_filesystem_usage_ratio
```

### 수정 파일

```text
src/services/target/node-collector/node_collector.py
tests/test_node_collector.py
```

### 구현 내용

metric label이 너무 많아지지 않게 유지한다.

처음 허용 label:

```text
node
runtime
```

나중에 pod/namespace를 넣고 싶으면 cardinality를 고민한 뒤 추가한다.

테스트에 추가할 것:

- HELP 라인이 있다.
- TYPE 라인이 있다.
- metric 값이 숫자다.
- secret처럼 보이는 문자열이 없다.

### 테스트 명령

```bash
uv run pytest tests/test_node_collector.py
```

전체 확인:

```bash
make test
```

### 완료 기준

- `tests/test_node_collector.py` 통과.
- `/metrics`가 Prometheus text format으로 읽을 수 있다.

## PR 4. Prometheus scrape target 연결

### 목표

real Prometheus가 node-collector의 `/metrics`를 scrape하게 한다.

### 수정 파일

```text
deploy/target/observability/prometheus/values.yaml
deploy/target/observability/prometheus/README.md
deploy/target/target.yaml
```

### 현재 manifest 확인

`deploy/target/target.yaml`의 `optional-node-collector`에는 이미 annotation이 있다.

```yaml
prometheus.io/path: /metrics
prometheus.io/port: "9100"
prometheus.io/scrape: "true"
```

하지만 Prometheus chart가 이 annotation을 자동 scrape하는지는 chart 설정에 따라 다르다. 그래서 values에서 scrape config 또는 ServiceMonitor 방식을 명확히 정한다.

### 구현 선택지

선택 A: annotation scrape

- 간단하다.
- demo에 좋다.
- chart 설정에서 pod annotation scrape를 켜야 할 수 있다.

선택 B: ServiceMonitor

- Prometheus Operator 계열 chart에서 자연스럽다.
- CRD가 필요하다.
- 처음에는 다소 무겁다.

초기 추천:

```text
annotation scrape 또는 static scrape config로 시작한다.
ServiceMonitor는 chart가 kube-prometheus-stack이고 CRD가 준비된 경우에만 쓴다.
```

### 수동 검증

cluster가 떠 있는 상태에서:

```bash
make up
kubectl --context target -n target get pods
kubectl --context target -n target port-forward deploy/optional-node-collector 9100:9100
curl http://localhost:9100/metrics
```

Prometheus가 설치된 뒤:

```bash
kubectl --context target -n observability-system get pods
kubectl --context target -n observability-system port-forward svc/<PROMETHEUS_SERVICE> 9090:9090
curl "http://localhost:9090/api/v1/query?query=up"
```

### 완료 기준

- Prometheus target 목록에서 node-collector가 `UP`.
- `node_collector_cpu_usage_ratio` query가 값을 반환.

## PR 5. Prometheus query client 추가

### 목표

curl로 확인한 Prometheus query를 Python 코드로 옮긴다.

### 수정 파일

새 파일 후보:

```text
src/services/target/cluster-agent/prometheus_client.py
tests/test_target_prometheus_client.py
```

### 구현할 클래스

```python
class PrometheusClient:
    async def query(self, query: str) -> dict[str, object]:
        ...

    async def query_range(
        self,
        query: str,
        start: str,
        end: str,
        step: str,
    ) -> dict[str, object]:
        ...
```

처음부터 복잡한 DTO를 만들지 말고, raw response 검증과 timeout 처리부터 한다.

### 설정

`src/services/target/cluster-agent/app.py`의 설정 상수에 추가 후보:

```python
PROMETHEUS_URL_ENV = "PROMETHEUS_URL"
DEFAULT_PROMETHEUS_URL = "http://prometheus-platform.observability-system:9090"
PROMETHEUS_TIMEOUT_SECONDS = 5
```

### 테스트

mock HTTP client 또는 fake transport를 사용한다.

테스트 케이스:

- query 성공 response를 반환한다.
- Prometheus가 `status=error`를 주면 예외 또는 실패 result로 바꾼다.
- timeout 설정을 사용한다.
- query string을 log에 남길 때 token은 없다.

명령:

```bash
uv run pytest tests/test_target_prometheus_client.py
```

## PR 6. Agent debug query API 추가

### 목표

Gateway 계약이 없어도 Agent가 query를 받아 Prometheus에 실행하는 임시 API를 만든다.

### 수정 파일

```text
src/services/target/cluster-agent/agent.py
src/services/target/cluster-agent/app.py
tests/test_target_agent_debug_query.py
```

### 구현 방향

`agent.py`에는 이미 `create_fake_telemetry_app`이 있다. 새 debug app 또는 target agent app factory를 분리하는 것이 좋다.

임시 endpoint:

```text
POST /debug/query
```

request 예시:

```json
{
  "query": "node_collector_cpu_usage_ratio"
}
```

response 예시:

```json
{
  "query": "node_collector_cpu_usage_ratio",
  "status": "success",
  "data": [...]
}
```

주의:

- 이 API는 demo/debug용이다.
- 외부 Ingress로 열지 않는다.
- Gateway 계약이 생기면 production API로 대체한다.

### 테스트

- fake PrometheusClient를 주입한다.
- `/debug/query`에 query를 보내면 fake client가 호출된다.
- query 누락 시 422 또는 명확한 오류.
- raw token이 response에 없다.

명령:

```bash
uv run pytest tests/test_target_agent_debug_query.py
```

## PR 7. MetricEvidence summary 추가

### 목표

Prometheus raw response를 그대로 반환하지 않고 작은 evidence 형태로 바꾼다.

### 수정 파일

```text
src/services/target/cluster-agent/evidence.py
tests/test_target_metric_evidence.py
```

### 구현할 것

```python
class MetricEvidence:
    cluster_id: str
    kind: str
    query: str
    latest: float | None
    max_value: float | None
    source: str
```

또는 dataclass로 시작한다.

처음 summary:

- vector response면 latest 값 추출.
- matrix response면 max 값 계산.
- 결과가 없으면 latest/max는 None.

### 테스트

- vector response -> latest 추출.
- matrix response -> max 계산.
- empty result -> None.
- 이상한 값 -> 안전하게 skip 또는 오류.

## PR 8. Kubernetes pod/event reader fake adapter

### 목표

실제 Kubernetes client를 붙이기 전에 interface와 fake adapter를 만든다.

### 수정 파일

```text
src/services/target/cluster-agent/kubernetes_reader.py
tests/test_target_kubernetes_reader.py
```

### 구현할 것

```python
class KubernetesReader:
    def list_pods(self, namespace: str) -> list[dict[str, object]]:
        ...

    def list_events(self, namespace: str) -> list[dict[str, object]]:
        ...
```

처음에는 fake adapter로 테스트한다.

수집할 필드:

- namespace
- pod name
- phase
- reason
- restart_count
- event reason
- event message

### 테스트

- CrashLoopBackOff fixture.
- OOMKilled fixture.
- Pending/FailedScheduling fixture.

## PR 9. Kubernetes + Prometheus evidence 결합

### 목표

pod 상태와 Prometheus metric을 같은 evidence 묶음으로 볼 수 있게 한다.

### 구현 예시

```text
PodEvidence
  namespace=sandbox
  pod=checkout-api
  phase=Running
  restart_count=4

MetricEvidence
  query=node_collector_cpu_usage_ratio
  latest=0.37

CombinedEvidence
  summary="checkout-api restarted 4 times; node cpu 0.37"
```

### 테스트

- pod fixture + metric fixture -> combined evidence.
- namespace/pod mismatch는 결합하지 않는다.
- summary가 너무 길지 않다.

## PR 10. Gateway 계약 연결 준비

### 목표

Gateway API가 준비되면 debug 흐름을 실제 `/agent/evidence`로 연결한다.

### 지금은 하지 말 것

- Gateway endpoint 이름을 임의로 확정하지 않는다.
- DTO를 Gateway 담당자와 상의 없이 고정하지 않는다.

### 준비할 것

- `ManagementPlaneClient`에 evidence 전송 adapter가 이미 있으므로 기존 구조를 보존한다.
- debug evidence response와 Gateway evidence payload 간 변환 함수를 둔다.
- Gateway 계약 확정 후 변환 함수만 연결한다.

## 이 작업에서 자주 하는 실수

- `fake_prometheus.py`를 실제 Prometheus라고 생각하는 것.
- Prometheus에 POST로 metric을 넣으려는 것.
- Gateway 계약이 없는데 `/agent/evidence` DTO를 먼저 고정하는 것.
- Helm values에 secret을 넣는 것.
- Prometheus 설치 YAML을 GitOps workload diff에 섞는 것.
- raw Prometheus response 전체를 evidence로 보내는 것.

