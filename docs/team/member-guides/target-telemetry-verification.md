# Target Telemetry Verification

이 문서는 Target/Telemetry MVP를 AWS EKS에서 확인하는 runbook이다.
로컬 cluster context를 기준으로 보지 않는다. management cluster는 `kubernetes-ops`,
target cluster는 기본 `cluster-1`을 기준으로 설명한다.

## 준비

```bash
export AWS_REGION="${AWS_REGION:-ap-northeast-2}"
export MGMT_CLUSTER="${MGMT_CLUSTER:-kubernetes-ops}"
export TARGET_CLUSTER="${TARGET_CLUSTER:-cluster-1}"

aws eks update-kubeconfig \
  --region "$AWS_REGION" \
  --name "$MGMT_CLUSTER" \
  --alias "$MGMT_CLUSTER"

aws eks update-kubeconfig \
  --region "$AWS_REGION" \
  --name "$TARGET_CLUSTER" \
  --alias "$TARGET_CLUSTER"
```

이 문서의 목적은 다섯 가지를 확인하는 것이다.

- Prometheus가 설치되어 metric query에 응답한다.
- Loki가 설치되어 log query에 응답한다.
- Tempo가 설치되어 trace search query에 응답한다.
- optional-node-collector가 node-scoped metric을 노출한다.
- target-cluster-agent가 management plane으로 evidence를 보낸다.

## 1. Target Telemetry Pod 확인

```bash
kubectl --context "$TARGET_CLUSTER" -n target get pods
```

기대값:

- `prometheus-*` pod가 `Running`.
- `loki-*` pod가 `Running`.
- `tempo-*` pod가 `Running`.
- `opentelemetry-collector-*` pod가 `Running`.
- `optional-node-collector-*` pod가 `Running`.
- `target-cluster-agent-*` pod가 `Running`.

## 2. optional-node-collector /metrics 확인

```bash
POD="$(kubectl --context "$TARGET_CLUSTER" -n target get pod \
  -l app=optional-node-collector \
  -o jsonpath='{.items[0].metadata.name}')"

kubectl --context "$TARGET_CLUSTER" -n target exec "$POD" -- \
  python -c 'import urllib.request; print(urllib.request.urlopen("http://127.0.0.1:9100/metrics").read().decode())'
```

기대 metric:

```text
node_collector_scrape_error{...collector="pod"} 0
node_collector_node_pod_count{...} ...
node_collector_node_not_ready_pod_count{...} ...
```

## 3. Prometheus Query 확인

PromQL quoting이 깨지지 않게 stdin으로 실행한다.

```bash
cat <<'PY' | kubectl --context "$TARGET_CLUSTER" -n target exec -i deploy/target-cluster-agent -- python -
import httpx

query = 'node_collector_scrape_error{collector="pod"}'
r = httpx.get(
    "http://prometheus.target.svc:9090/api/v1/query",
    params={"query": query},
    timeout=5,
)
p = r.json()
print("http:", r.status_code)
print("status:", p.get("status"))
print("result count:", len(p.get("data", {}).get("result", [])))
print(p.get("data", {}).get("result", [])[:1])
PY
```

기대값:

- `http: 200`
- `status: success`
- result label에 `collector: pod`
- node-collector가 Kubernetes API를 읽을 수 있으면 result value가 `0`

## 4. Kubernetes 원본 로그 확인

```bash
POD="$(kubectl --context "$TARGET_CLUSTER" -n target get pod \
  -l app=optional-node-collector \
  -o jsonpath='{.items[0].metadata.name}')"

kubectl --context "$TARGET_CLUSTER" -n target logs "$POD" --tail=5
```

기대 로그:

```json
{"service": "node-collector", "kind": "node_runtime_sample", "sample": {"node_name": "..."}}
```

## 5. Loki Query 확인

```bash
cat <<'PY' | kubectl --context "$TARGET_CLUSTER" -n target exec -i deploy/target-cluster-agent -- python -
import httpx

query = '{k8s_namespace_name="target", k8s_container_name="node-collector"} |= "node_runtime_sample"'
r = httpx.get(
    "http://loki-gateway.target.svc/loki/api/v1/query_range",
    params={"query": query, "limit": 5, "direction": "backward"},
    timeout=10,
)
p = r.json()

print("http:", r.status_code)
print("status:", p.get("status"))
for stream in p.get("data", {}).get("result", []):
    print("stream:", stream.get("stream"))
    for ts, line in stream.get("values", []):
        print("timestamp:", ts)
        print("line:", line)
PY
```

기대값:

- `http: 200`
- `status: success`
- stream label에 namespace/app/pod/container 정보가 있다.
- `line`에 원본 stdout log line이 들어 있다.

## 6. Tempo Query 확인

target-cluster-agent는 evidence collection loop와 management API call에 span을 남긴다.

```bash
cat <<'PY' | kubectl --context "$TARGET_CLUSTER" -n target exec -i deploy/target-cluster-agent -- python -
import httpx

query = '{ resource.service.name = "target-cluster-agent" }'
r = httpx.get(
    "http://tempo.target.svc:3200/api/search",
    params={"q": query, "limit": 5},
    timeout=10,
)
p = r.json()

print("http:", r.status_code)
print("trace count:", len(p.get("traces", [])))
print(p)
PY
```

기대값:

- `http: 200`
- agent가 한 번 이상 evidence loop를 돈 뒤 `trace count`가 `0`보다 큼.

## 7. Evidence 전송 확인

```bash
kubectl --context "$TARGET_CLUSTER" -n target logs deploy/target-cluster-agent --tail=20
```

기대 로그:

```text
evidence shipped status=200
```

management API 로그도 같이 본다.

```bash
kubectl --context "$MGMT_CLUSTER" -n management logs deploy/api-gateway --tail=20
```

기대 로그:

```text
POST /agent/evidence HTTP/1.1" 200 OK
published cluster.evidence.received
```

## 8. Management DB의 최신 Evidence 확인

```bash
kubectl --context "$MGMT_CLUSTER" -n management exec postgresql-0 -- \
  psql -U service -d service -At -c \
  "select payload->>'cluster_id',
          payload ? 'metrics',
          payload ? 'logs',
          payload ? 'traces',
          payload->'metrics'->>'source',
          payload->'traces'->>'source',
          (payload->'metrics'->'results') ? 'node_collector_node_pod_count',
          (payload->'metrics'->'results') ? 'node_collector_scrape_error',
          payload->'traces'->'results'->'target_agent_recent_spans'->>'trace_count',
          jsonb_array_length(payload->'logs')
     from evidence
 order by created_at desc
    limit 1;"
```

기대값 예시:

```text
cluster-1|t|t|t|prometheus|tempo|t|t|20|...
```

의미:

- evidence가 target cluster에 속한다.
- `metrics`, `logs`, `traces` bucket이 있다.
- metrics source는 `prometheus`, traces source는 `tempo`다.
- node collector pod count와 scrape error query가 있다.
- target-agent trace count가 `0`보다 크다.
- logs array에 적어도 하나의 query result가 있다.

## 9. 코드 단위 테스트

```bash
uv run pytest \
  tests/test_target_metric_evidence.py \
  tests/test_target_log_evidence.py \
  tests/test_target_trace_evidence.py \
  tests/test_target_kubernetes_evidence.py \
  tests/test_target_pod_evidence.py \
  tests/test_node_collector.py \
  -q
```

이 테스트는 실제 cluster를 호출하지 않는다. query function을 주입하거나 test payload를 써서 evidence shaping logic을 검증한다.

## OpenTelemetry / Tempo 상태

- OTel Collector는 OTLP `4317`, `4318`을 연다.
- OTel Collector는 trace를 Tempo로 보낸다.
- Tempo는 trace를 저장하고 `/api/search`를 제공한다.
- `target-cluster-agent`는 Tempo query 결과를 `evidence["traces"]`로 축약한다.
- `target-cluster-agent`는 evidence collection과 management API call에 span을 남긴다.
