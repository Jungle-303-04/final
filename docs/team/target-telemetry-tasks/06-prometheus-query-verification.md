# 06. Prometheus Query 직접 검증

## 목표

Prometheus가 scrape한 node-collector metric을 HTTP query API로 다시 읽는다.

## 먼저 읽을 파일

- [05. Node Collector Scrape Target](05-node-collector-scrape-target.md)
- `deploy/target/observability/prometheus/README.md`

## 수정 후보

- `deploy/target/observability/prometheus/README.md`
- `docs/team/member-guides/target-telemetry-prometheus-runbook.md`

## 선형 절차

1. Prometheus UI 또는 port-forward 접근 방법을 정한다.
2. target 목록에서 node-collector가 `UP`인지 확인한다.
3. HTTP API로 `up` query를 실행한다.
4. HTTP API로 node-collector metric을 query한다.
5. query 실패 시 확인할 항목을 README에 남긴다.
   - scrape target 상태
   - namespace/service selector
   - metric name 오타
   - Prometheus values scrape config
6. 성공한 query와 응답 샘플을 너무 길지 않게 기록한다.

## query 예시

```text
up
node_collector_cpu_usage_ratio
node_collector_memory_working_set_bytes
node_collector_filesystem_usage_ratio
```

## 검증

```bash
curl -G "http://localhost:9090/api/v1/query" \
  --data-urlencode "query=node_collector_cpu_usage_ratio"
```

## 완료 기준

- Prometheus target 목록에서 node-collector가 `UP`이다.
- node-collector metric을 query API로 읽을 수 있다.
- 실패 시 확인 절차가 문서화되어 있다.

## 다음 작업

[07. Prometheus Query Client](07-prometheus-query-client.md)
