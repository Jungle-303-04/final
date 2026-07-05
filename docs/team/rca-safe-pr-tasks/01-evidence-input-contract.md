# 01. Evidence 입력 계약

## 목표

`cluster.evidence.received`를 RCA가 안정적으로 받을 수 있는 입력 계약으로 고정한다.

이 작업이 끝나면 Target/Telemetry 담당자는 어떤 evidence를 보내야 하는지 알고, RCA 담당자는 입력을 추측하지 않는다.

## 먼저 읽을 파일

- `src/packages/contracts/event_bus/bodies/`
- `src/packages/contracts/event_bus/subjects.py`
- `src/services/ai/rca-worker/app.py`
- `docs/events.md`

## 수정 후보

- `src/packages/contracts/event_bus/bodies/`
- `src/services/ai/rca-worker/app.py`
- `tests/test_rca_evidence.py` 또는 관련 RCA 테스트
- `docs/events.md`

## 선형 절차

1. 현재 `ClusterEvidenceReceivedBody` 또는 같은 역할의 body 이름을 찾는다.
2. RCA가 허용할 evidence kind를 정한다.
   - `pod`
   - `metric`
   - `log`
   - `trace`
   - `node`
3. 필수 필드를 명확히 한다.
   - `cluster_id`
   - `kubernetes`
   - `metrics`
   - `logs`
   - `traces`
   - `workspace_id`
   - `agent_id`
   - `source_id`
   - `window_start`
   - `evidence_key`
4. `correlation_id`는 body 필드가 아니라 envelope 메타데이터라는 점을 문서에 명시한다. HTTP `AgentEvidenceRequest.correlation_id`는 Gateway가 envelope correlation으로 연결할 수 있다.
5. 필수 필드가 없으면 RCA를 진행하지 않고 명확한 reject 또는 insufficient 상태로 끝내는 기준을 정한다.
6. secret처럼 보이는 값이 payload에 있으면 마스킹하거나 거부한다.
7. `docs/events.md`에 정상 예시와 거부 예시를 추가한다.
8. 정상 payload, 필드 누락, secret-like value 테스트를 추가한다.

## 예시 payload

```json
{
  "cluster_id": "target-dev",
  "workspace_id": "workspace-1",
  "agent_id": "agent-1",
  "source_id": "cluster-snapshot",
  "window_start": "2026-07-04T09:00:00Z",
  "evidence_key": "workspace-1:target-dev:cluster-snapshot:2026-07-04T09:00:00Z",
  "kubernetes": {
    "resource": {
      "kind": "deployment",
      "name": "checkout-api",
      "namespace": "sandbox"
    },
    "pods": [
      {
        "name": "checkout-api-5d9c",
        "status": "CrashLoopBackOff"
      }
    ],
    "symptom": "CrashLoopBackOff",
    "severity": "high"
  },
  "metrics": {
    "memory": "near-limit"
  },
  "logs": [
    {
      "line": "OOMKilled"
    }
  ],
  "traces": {}
}
```

Envelope 예시:

```json
{
  "subject": "cluster.evidence.received",
  "correlation_id": "corr-123",
  "payload": "<위 body>"
}
```

## 검증

```bash
uv run pytest tests/test_rca_evidence.py
uv run ruff check src tests
```

관련 테스트 파일명이 다르면 RCA evidence 계약을 검증하는 가장 좁은 테스트를 실행한다.

## 완료 기준

- RCA 입력 evidence kind와 필수 필드가 문서화되어 있다.
- 필수 필드 누락 시 RCA가 추측으로 진행하지 않는다.
- body 필드와 envelope `correlation_id`가 구분되어 있다.
- secret-like value 처리 기준이 테스트로 고정되어 있다.
- 새 계약이 `docs/events.md`와 코드 테스트에 같이 반영되어 있다.

## 다음 작업

[02. Evidence Builder](02-evidence-builder.md)
