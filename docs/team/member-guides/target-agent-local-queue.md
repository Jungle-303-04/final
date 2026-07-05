# Target Agent Local Queue / Spool

이 문서는 Target Agent가 command 처리와 telemetry/evidence 수집을 동시에 할 때 어떤 순서로 처리하고, 네트워크 장애 때 무엇을 로컬에 남길지 정하는 기준이다.

Target/Telemetry 선형 작업의 기본 폐쇄 루프가 끝난 뒤 적용한다.

## 목표

Target Agent는 Management Gateway와 outbound HTTP로만 통신한다. Gateway가 느리거나 일시적으로 끊겨도 command result와 evidence를 잃지 않고, command 처리를 telemetry 수집보다 우선한다.

## 우선순위

| 우선순위 | 작업 | 이유 |
| --- | --- | --- |
| 1 | command poll/result | 사용자가 승인한 조치와 상태 보고가 먼저다. |
| 2 | command 실행 로그 요약 | 실패 원인을 잃으면 재시도 판단이 어렵다. |
| 3 | incident evidence | RCA 입력이므로 지연은 가능하지만 유실은 줄인다. |
| 4 | periodic telemetry evidence | 최신성이 중요하고 오래된 샘플은 버릴 수 있다. |

## Queue 기준

처음부터 복잡한 queue 시스템을 만들지 않는다. 아래 순서로 확장한다.

1. in-memory bounded queue
2. local durable spool
3. retry backoff와 max age
4. priority별 drop policy

## Bounded Queue 규칙

- queue 크기는 env로 조정 가능하게 둔다.
- command result queue가 꽉 차면 error를 크게 남기고 telemetry enqueue를 막는다.
- telemetry queue가 꽉 차면 오래된 periodic sample부터 버린다.
- command result는 같은 `command_id`와 `attempt` 기준으로 idempotent하게 처리한다.

## Local Spool 규칙

로컬 spool은 Gateway 전송이 실패했을 때만 사용한다.

저장해도 되는 것:

- command id
- correlation id
- action name
- status
- stdout/stderr summary
- evidence summary
- retry count
- next retry time

저장하면 안 되는 것:

- bearer token
- kubeconfig
- service account token
- raw secret
- provider credential
- 대용량 raw telemetry 전체

## 파일 형식 예시

```json
{
  "kind": "command_result",
  "command_id": "cmd-123",
  "correlation_id": "corr-123",
  "status": "failed",
  "summary": "kubectl rollout restart failed: deployment not found",
  "attempt": 2,
  "next_retry_at": "2026-07-04T09:05:00Z"
}
```

## 전송 루프

```text
poll command
  -> execute command
  -> enqueue command result
  -> send command result to Gateway
  -> on failure: spool safe summary

collect telemetry
  -> summarize evidence
  -> enqueue evidence
  -> send evidence to Gateway
  -> on failure: spool only bounded summary
```

## 검증

```bash
uv run pytest tests/test_target_agent_client.py tests/test_agent_evidence_ingest.py
uv run ruff check src tests
```

## 완료 기준

- command result가 telemetry evidence보다 먼저 처리된다.
- Gateway 장애 시 command result summary가 로컬 spool에 남는다.
- spool에는 token, kubeconfig, raw secret이 없다.
- retry backoff와 max age 기준이 테스트로 고정되어 있다.
- Target Agent는 여전히 NATS/DB를 직접 import하지 않는다.
