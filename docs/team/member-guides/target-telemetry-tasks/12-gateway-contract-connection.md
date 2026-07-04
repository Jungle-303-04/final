# 12. Gateway 계약 연결

## 목표

Agent의 debug/evidence 흐름을 Management Gateway의 실제 HTTP 계약에 연결한다.

## 먼저 읽을 파일

- `src/services/target/cluster-agent/agent.py`
- `src/services/gateway/api-gateway/gateway.py`
- `src/packages/contracts/gateway/`
- `src/packages/contracts/event_bus/bodies/`
- [11. Kubernetes + Metric Evidence 결합](11-combined-kubernetes-metric-evidence.md)

## 수정 후보

- `src/services/target/cluster-agent/agent.py`
- `src/packages/contracts/gateway/requests.py`
- `src/packages/contracts/gateway/responses.py`
- `tests/test_target_agent_client.py`
- `tests/test_agent_evidence_ingest.py`

## 선형 절차

1. Gateway에 이미 있는 agent route를 확인한다.
2. Target Agent가 사용할 HTTP API를 고정한다.
   - `POST /agent/connect`
   - `POST /agent/evidence`
   - `GET /agent/commands/poll`
   - `POST /agent/commands/{command_id}/result`
3. evidence payload는 summary evidence만 보낸다.
4. command poll 결과에 `correlation_id`가 있으면 그대로 result에 되돌린다.
5. Agent는 DB/NATS를 직접 import하지 않는다.
6. credential, kubeconfig, bearer token을 response/event/log에 남기지 않는다.
7. fake Gateway client로 evidence 전송과 command result 보고를 테스트한다.

## 확인할 코드 냄새

```text
src/services/target/cluster-agent 안에 nats import가 있으면 안 된다.
src/services/target/cluster-agent 안에 DB session 직접 사용이 있으면 안 된다.
```

## 검증

```bash
rg -n "nats|JetStream|Session|sessionmaker" src/services/target/cluster-agent
uv run pytest tests/test_target_agent_client.py tests/test_agent_evidence_ingest.py
uv run ruff check src tests
```

`rg` 결과가 문서 문자열이나 타입명이 아니라 실제 runtime import면 제거한다.

## 완료 기준

- Agent가 Gateway HTTP API로만 management plane과 통신한다.
- evidence는 raw telemetry가 아니라 summary 형태다.
- command result에서 Gateway가 준 correlation을 유지한다.
- token/kubeconfig가 payload/log에 없다.

## 다음 작업

[13. Loki / OTel Ingest 경로](13-loki-otel-ingest-path.md)
