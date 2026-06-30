# Target Telemetry Verification

This runbook checks the current Target/Telemetry MVP from the terminal.

It verifies five things:

- Prometheus is installed and can answer metric queries.
- Loki is installed and can answer log queries.
- Tempo is installed and can answer trace search queries.
- optional-node-collector exposes node-scoped metrics.
- target-cluster-agent sends evidence to the management plane.

The commands below assume PowerShell from the repository root.

## 1. Check Target Telemetry Pods

```powershell
kubectl --context kind-target -n target get pods
```

Expected:

- `prometheus-*` Pods are `Running`.
- `loki-*` Pods are `Running`.
- `alloy-*` is `Running`.
- `tempo-*` is `Running`.
- `opentelemetry-collector-*` is `Running`.
- `optional-node-collector-*` is `Running`.
- `target-cluster-agent-*` is `Running`.

## 2. Check optional-node-collector /metrics

```powershell
$POD = kubectl --context kind-target -n target get pod -l app=optional-node-collector -o jsonpath="{.items[0].metadata.name}"
kubectl --context kind-target -n target exec $POD -- python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:9100/metrics').read().decode())"
```

Expected metrics include:

```text
node_collector_scrape_error{node="target-control-plane",runtime="containerd",collector="pod"} 0
node_collector_node_pod_count{node="target-control-plane",runtime="containerd"} ...
node_collector_node_not_ready_pod_count{node="target-control-plane",runtime="containerd"} ...
```

## 3. Check Prometheus Query

Use stdin so PowerShell quoting does not break PromQL.

```powershell
@'
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
'@ | kubectl --context kind-target -n target exec -i deploy/target-cluster-agent -- python -
```

Expected:

- `http: 200`
- `status: success`
- result has `collector: pod`
- result value is `0` when node-collector can read the Kubernetes API

## 4. Check Kubernetes Original Logs

This is the raw Pod stdout before Loki stores it.

```powershell
$POD = kubectl --context kind-target -n target get pod -l app=optional-node-collector -o jsonpath="{.items[0].metadata.name}"
kubectl --context kind-target -n target logs $POD --tail=5
```

Expected log lines include JSON like:

```json
{"service": "node-collector", "kind": "node_runtime_sample", "sample": {"node_name": "..."}}
```

## 5. Check Loki Query

Use stdin so PowerShell quoting does not break LogQL.

```powershell
@'
import httpx

query = '{namespace="target", app="optional-node-collector"} |= "node_runtime_sample"'
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
'@ | kubectl --context kind-target -n target exec -i deploy/target-cluster-agent -- python -
```

Expected:

- `http: 200`
- `status: success`
- stream labels include `namespace`, `app`, `pod`, and `container`
- each `line` is the original stdout log line stored in Loki

## 6. Check Tempo Query

Tempo stores traces forwarded by OpenTelemetry Collector.

The target-cluster-agent emits spans for its evidence collection loop, so this
query should return traces after the agent has run for at least one interval.

```powershell
@'
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
'@ | kubectl --context kind-target -n target exec -i deploy/target-cluster-agent -- python -
```

Expected:

- `http: 200`
- `trace count` is greater than `0` after target-cluster-agent emits spans.

## 7. Check Evidence Shipping

```powershell
kubectl --context kind-target -n target logs deploy/target-cluster-agent --tail=20
```

Expected:

```text
evidence shipped status=200
```

Then check the management API logs:

```powershell
kubectl --context kind-management -n management logs deploy/api-gateway --tail=20
```

Expected:

```text
POST /agent/evidence HTTP/1.1" 200 OK
published cluster.evidence.received
```

## 8. Check Latest Evidence in Management DB

```powershell
kubectl --context kind-management -n management exec postgresql-0 -- psql -U service -d service -At -c "select payload->>'cluster_id', payload ? 'metrics', payload ? 'logs', payload ? 'traces', payload->'metrics'->>'source', payload->'traces'->>'source', (payload->'metrics'->'results') ? 'node_collector_node_pod_count', (payload->'metrics'->'results') ? 'node_collector_scrape_error', payload->'traces'->'results'->'target_agent_recent_spans'->>'trace_count', jsonb_array_length(payload->'logs') from evidence order by created_at desc limit 1;"
```

Expected columns:

```text
target-cluster-01|t|t|t|prometheus|tempo|t|t|20|...
```

Meaning:

- evidence belongs to `target-cluster-01`
- `metrics` exists
- `logs` exists
- `traces` exists
- metrics source is `prometheus`
- traces source is `tempo`
- node collector pod count query exists
- node collector scrape error query exists
- target-agent trace count is greater than `0`
- logs array has at least one query result

## 9. Run Unit Tests

```powershell
uv run pytest tests/test_target_metric_evidence.py tests/test_target_log_evidence.py tests/test_target_trace_evidence.py tests/test_target_pod_evidence.py tests/test_node_collector.py
```

These tests do not call the real cluster. They use fake Prometheus, Loki, Tempo, and Kubernetes API responses to verify evidence shaping logic.

## OpenTelemetry And Tempo State

OpenTelemetry Collector exposes OTLP ports `4317` and `4318`.

Current state:

- OTel Collector receives OTLP data.
- OTel Collector forwards traces to Tempo.
- Tempo stores traces and exposes `/api/search`.
- `target-cluster-agent` queries Tempo and replaces `evidence["traces"]`.
- `target-cluster-agent` emits spans for evidence collection and management API calls.
