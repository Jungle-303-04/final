# Target Telemetry Verification

This runbook checks the current Target/Telemetry MVP from the terminal.

It verifies four things:

- Prometheus is installed and can answer metric queries.
- Loki is installed and can answer log queries.
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

## 6. Check Evidence Shipping

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

## 7. Check Latest Evidence in Management DB

```powershell
kubectl --context kind-management -n management exec postgresql-0 -- psql -U service -d service -At -c "select payload->>'cluster_id', payload ? 'metrics', payload ? 'logs', payload->'metrics'->>'source', (payload->'metrics'->'results') ? 'node_collector_node_pod_count', (payload->'metrics'->'results') ? 'node_collector_scrape_error', jsonb_array_length(payload->'logs') from evidence order by created_at desc limit 1;"
```

Expected columns:

```text
target-cluster-01|t|t|prometheus|t|t|...
```

Meaning:

- evidence belongs to `target-cluster-01`
- `metrics` exists
- `logs` exists
- metrics source is `prometheus`
- node collector pod count query exists
- node collector scrape error query exists
- logs array has at least one query result

## 8. Run Unit Tests

```powershell
uv run pytest tests/test_target_metric_evidence.py tests/test_target_log_evidence.py tests/test_target_pod_evidence.py tests/test_node_collector.py
```

These tests do not call the real cluster. They use fake Prometheus, Loki, and Kubernetes API responses to verify evidence shaping logic.

## Current OpenTelemetry Gap

OpenTelemetry Collector is installed and exposes OTLP ports `4317` and `4318`.

Current state:

- OTel Collector receives OTLP data.
- OTel Collector exports to `debug`.
- `target-cluster-agent` does not yet replace `evidence["traces"]` with real trace data.
- A real trace evidence path still needs a trace backend such as Tempo, or a deliberate MVP shortcut through Loki/debug logs.
