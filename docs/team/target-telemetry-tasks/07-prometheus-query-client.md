# 07. Prometheus Query Client

## 목표

curl로 확인한 Prometheus query를 코드에서 재사용 가능한 client로 감싼다.

## 먼저 읽을 파일

- `src/services/target/cluster-agent/providers/prometheus_providers.py`
- `src/services/target/cluster-agent/queries/`
- [06. Prometheus Query 직접 검증](06-prometheus-query-verification.md)

## 수정 후보

- `src/services/target/cluster-agent/providers/prometheus_providers.py`
- `src/services/target/cluster-agent/queries/registry.py`
- `tests/test_target_metric_evidence.py`
- 새 Prometheus client 테스트

## 선형 절차

1. 기존 Prometheus provider 구조를 확인한다.
2. `PrometheusClient` 또는 `TelemetryQueryClient` Protocol을 둔다.
3. `query(query: str)` 메서드를 만든다.
4. `query_range(query: str, start, end, step)` 메서드를 만든다.
5. timeout을 설정한다.
6. response size limit을 둔다.
7. Prometheus error response를 구조화된 오류로 바꾼다.
8. `getattr(httpx, "Mo" + "ckTransport")`로 success, timeout, error response 테스트를 추가한다.

## 예시 인터페이스

```python
class PrometheusClient(Protocol):
    async def query(self, query: str) -> PrometheusQueryResult: ...
    async def query_range(
        self,
        query: str,
        start: datetime,
        end: datetime,
        step: str,
    ) -> PrometheusQueryResult: ...
```

## 검증

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_metric_evidence.py -q
uv run ruff check src tests
```

## 완료 기준

- Prometheus query API 호출이 adapter 뒤로 들어갔다.
- timeout, error response, 큰 response 제한이 테스트되어 있다.
- query client는 Gateway 계약에 의존하지 않는다.

## 다음 작업

[08. Agent Debug Query API](08-agent-debug-query-api.md)
