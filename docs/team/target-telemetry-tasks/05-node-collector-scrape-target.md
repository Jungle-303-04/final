# 05. Node Collector Scrape Target

## 목표

현재 node-collector `/metrics`를 real Prometheus가 scrape하게 만든다.

## 먼저 읽을 파일

- `src/services/target/node-collector/node_collector.py`
- `src/services/target/cluster-agent/node_collector_manager.py`
- `deploy/target/target.yaml`
- [04. Helm Template / Dry-run](04-helm-template-dry-run.md)

## 수정 후보

- `deploy/target/observability/prometheus/values.yaml`
- `deploy/target/observability/prometheus/README.md`
- `src/services/target/cluster-agent/node_collector_manager.py`
- `tests/test_node_collector.py`

## 선형 절차

1. node-collector가 노출하는 metric 이름을 확인한다.
2. `/metrics` 응답이 Prometheus text format에 맞는지 테스트한다.
3. cluster-agent가 생성하는 `optional-node-collector` DaemonSet annotation을 확인한다.
4. Prometheus values에서 annotation scrape 또는 scrape config를 선택한다.
5. namespace `target`의 node-collector pod 또는 service를 scrape 대상으로 둔다.
6. Service가 필요하면 최소 Service만 추가한다.
7. Prometheus target 목록에서 node-collector가 `UP`인지 확인하는 절차를 README에 적는다.

## 확인할 metric 예시

```text
node_collector_cpu_usage_ratio
node_collector_memory_working_set_bytes
node_collector_filesystem_usage_ratio
```

## 검증

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_node_collector.py -q
bash scripts/telemetry/prometheus-template.sh >/tmp/prometheus.yaml
rg "node-collector|optional-node-collector|prometheus.io/scrape" /tmp/prometheus.yaml deploy/target
```

## 완료 기준

- Prometheus가 node-collector `/metrics`를 scrape하도록 설정되어 있다.
- target 상태 `UP` 확인 방법이 문서화되어 있다.
- `/metrics` 형식 테스트가 있다.
- Node Collector를 정적 DaemonSet으로 되돌리지 않았다.

## 다음 작업

[06. Prometheus Query 직접 검증](06-prometheus-query-verification.md)
