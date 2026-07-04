# 08. Agent Debug Query API

## 목표

Management Gateway 계약 없이도 Target Agent가 Prometheus query를 실행해 볼 수 있는 debug API를 만든다.

## 먼저 읽을 파일

- `src/services/target/cluster-agent/agent.py`
- `src/services/target/cluster-agent/app.py`
- [07. Prometheus Query Client](07-prometheus-query-client.md)

## 수정 후보

- `src/services/target/cluster-agent/agent.py`
- `src/services/target/cluster-agent/app.py`
- `tests/test_target_agent_client.py`
- 새 debug API 테스트

## 선형 절차

1. debug API가 필요한 demo/dev 조건을 정한다.
2. endpoint 예시는 `POST /debug/query`로 둔다.
3. request body는 query 문자열과 optional window만 받는다.
4. handler는 Prometheus client를 호출한다.
5. response는 raw provider response 전체가 아니라 제한된 결과만 반환한다.
6. 인증 없이 외부에 노출하지 않도록 dev/demo guard를 둔다.
7. Ingress로 열지 않는다는 주의사항을 문서화한다.
8. Agent API 테스트에서 query 요청과 client 호출을 검증한다.

## request 예시

```json
{
  "query": "node_collector_cpu_usage_ratio"
}
```

## 검증

```bash
uv run pytest tests/test_target_agent_client.py
uv run ruff check src tests
```

## 완료 기준

- Agent가 Prometheus query를 debug endpoint로 실행할 수 있다.
- debug API는 production 외부 노출 경로가 아니다.
- response size가 제한되어 있다.
- Gateway DTO를 임의로 고정하지 않는다.

## 다음 작업

[09. MetricEvidence Summary](09-metric-evidence-summary.md)
