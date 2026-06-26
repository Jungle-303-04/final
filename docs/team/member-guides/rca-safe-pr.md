# 멤버 가이드: RCA / Safe PR

## 미션

수집된 evidence를 RCA로 정리하고, 안전한 GitHub PR 제안과 audit timeline으로 이어지는 흐름을 담당한다.

## 담당 영역

- `services/rca-worker`
- `services/audit-timeline-service`
- Evidence Builder logic
- AI RCA Service logic
- Safe PR logic
- RCA/audit 관련 worker test

## 현재 책임

- fake Safe PR event를 실제 GitHub branch/commit/PR client로 교체한다.
- RCA 결과는 evidence 기반으로만 생성한다.
- Safe PR side effect는 token/ref 확인과 feature flag로 보호한다.
- audit timeline이 command, RCA, PR 상태를 추적하게 한다.

## 코드 규칙

- Worker runner는 `WorkerService`로 구독한다.
- Worker는 `EventClient`로 발행한다.
- `correlation_id`를 유지한다.
- RCA output은 근거 없는 추론보다 확인된 evidence를 우선한다.
- GitHub PR 생성에는 provider token을 event에 넣지 말고 Token Vault reference를 사용한다.

## PR 체크리스트

- 새 event subject가 `EventSubject`와 `docs/events.md`에 있음
- RCA/Safe PR 동작 테스트 존재
- raw NATS 사용 없음
- 실제 GitHub write는 feature flag 또는 policy guard로 보호
- audit/dashboard 영향이 문서화됨

## Codex 지시문

이 영역을 작업할 때는 `services/rca-worker`, `services/audit-timeline-service`, `packages/runtime/worker.py`, `packages/runtime/service.py`, `docs/events.md`를 먼저 읽어라. 외부 write는 항상 안전장치를 먼저 확인하라.
