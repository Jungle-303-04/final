# 00. 현재 코드 지도와 테스트 기준

이 페이지는 Target / Telemetry 작업을 시작하기 전에 현재 코드가 어디까지 구현되어 있는지 확인하는 지도다.

1번 작업부터 바로 코드를 바꾸기 전에 이 페이지의 파일과 테스트를 먼저 확인한다.

## 현재 HTTP flow

Target Agent는 Management Gateway와 HTTP로만 통신한다.

```text
POST /agent/connect
POST /agent/evidence
GET  /agent/commands/poll
POST /agent/commands/{command_id}/start
POST /agent/commands/{command_id}/heartbeat
POST /agent/commands/{command_id}/result
POST /agent/evidence/jobs
GET  /agent/evidence/jobs/poll
POST /agent/evidence/jobs/{job_id}/result
```

이 route 이름의 기준 파일은 `src/packages/contracts/gateway/routes.py`다.

## 현재 코드 파일

| 목적 | 파일 |
| --- | --- |
| Gateway route constants | `src/packages/contracts/gateway/routes.py` |
| Gateway request/response schema | `src/packages/contracts/gateway/requests.py`, `src/packages/contracts/gateway/responses.py` |
| Target Agent main loop/client | `src/services/target/cluster-agent/agent.py` |
| cluster-agent entrypoint | `src/services/target/cluster-agent/app.py` |
| telemetry provider adapter | `src/services/target/cluster-agent/providers/` |
| evidence collector/job | `src/services/target/cluster-agent/evidence/` |
| query registry/payload | `src/services/target/cluster-agent/queries/` |
| node collector app | `src/services/target/node-collector/node_collector.py` |
| node collector metrics | `src/services/target/node-collector/metric_collectors.py`, `src/services/target/node-collector/prometheus_metrics.py` |
| target manifest | `deploy/target/target.yaml` |

## 현재 request shape

`AgentEvidenceRequest`는 provider별 bucket을 받는다.

```python
AgentEvidenceRequest(
    cluster_id="target-cluster",
    workspace_id="workspace-1",
    agent_id="agent-1",
    source_id="cluster-snapshot",
    window_start="2026-07-04T09:00:00Z",
    evidence_key="workspace-1:target-cluster:cluster-snapshot:2026-07-04T09:00:00Z",
    kubernetes={},
    metrics={},
    logs=[],
    traces={},
)
```

주의:

- request에는 `correlation_id`가 optional로 있을 수 있다.
- event body로 변환된 뒤의 `ClusterEvidenceReceivedBody`에는 현재 `correlation_id` 필드가 없다.
- trusted agent identity가 body의 workspace/cluster보다 우선해야 한다.

## 먼저 돌릴 테스트

Target Agent HTTP client를 바꾸면 실행한다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_agent_client.py -q
```

Node Collector를 바꾸면 실행한다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_node_collector.py -q
```

Evidence provider나 summary를 바꾸면 실행한다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_metric_evidence.py tests/test_target_telemetry_evidence.py -q
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_kubernetes_evidence.py tests/test_agent_evidence_ingest.py -q
```

Command 실행 경로를 바꾸면 실행한다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_target_agent_commands.py tests/test_command_worker.py -q
```

## 코드 읽는 순서

1. `src/packages/contracts/gateway/routes.py`에서 HTTP route 이름을 확인한다.
2. `tests/test_target_agent_client.py`에서 agent client가 어떤 요청을 보내는지 확인한다.
3. `src/services/target/cluster-agent/agent.py`에서 management client와 command loop를 본다.
4. `tests/test_node_collector.py`에서 `/metrics` 기대값을 확인한다.
5. telemetry provider를 바꿀 때만 `providers/`, `queries/`, `evidence/`를 본다.

## 모순 방지 규칙

- Target Agent가 NATS, JetStream, DB session을 직접 import하면 안 된다.
- Prometheus provider와 target Prometheus manifest를 같은 것으로 설명하지 않는다.
- Prometheus query path와 scrape path를 섞지 않는다.
- command result body에 없는 `correlation_id`를 agent가 되돌려야 한다고 쓰지 않는다. 현재는 `command_id`와 `lease_id`가 핵심이다.
- raw telemetry 전체를 Gateway로 보내지 않는다. summary evidence로 줄인다.
- 작업 후에는 [팀 간 구현 연결과 테스트 가이드](../cross-role-implementation-test-guide.md)의 Target/Telemetry 섹션과 맞는지 확인한다.

## 다음 작업

[01. Telemetry Provider 경계](01-telemetry-provider-boundary.md)
