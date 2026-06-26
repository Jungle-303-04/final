# 멤버 가이드: GitOps / Command

## 미션

Git 변경을 받아 manifest render, desired diff, command 생성까지 이어지는 흐름을 담당한다.

## 담당 영역

- `services/gitops-sync-worker`
- `services/command-worker`
- manifest render
- desired state diff
- command 생성과 dispatch 준비
- 관련 worker test

## 현재 책임

- Git webhook event를 `git.changed`, `manifest.rendered`, `desired.diff.detected` 흐름으로 정리한다.
- diff 결과가 안전한 command payload로 변환되게 만든다.
- command는 production write가 아니라 `sandbox` 또는 demo namespace 기준으로 제한한다.
- command 생성과 dispatch 준비 event에 대한 테스트를 추가한다.

## 코드 규칙

- Worker는 `EventHandlerSpec`으로 구독한다.
- Worker는 `EventClient`로 발행한다.
- `correlation_id`를 유지한다.
- handler write는 idempotent하거나 conflict-safe해야 한다.
- workflow code에서 직접 ack/nak하지 않는다. ack/nak는 runtime 책임이다.

## PR 체크리스트

- 새 event subject가 `EventSubject`와 `docs/events.md`에 있음
- manifest/diff/command 흐름 테스트 존재
- raw NATS 사용 없음
- command payload 변경 시 Gateway/Auth와 Target/Telemetry에 공유
- audit/dashboard 영향이 있으면 문서화

## Codex 지시문

이 영역을 작업할 때는 `docs/events.md`, `packages/worker_runtime/runtime.py`, `services/gitops-sync-worker`, `services/command-worker`를 먼저 읽어라. handler는 작게 유지하고 event contract를 깨지 마라.
