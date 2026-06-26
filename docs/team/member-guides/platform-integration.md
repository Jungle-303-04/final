# 멤버 가이드: Platform / Integration

## 미션

전체 시스템이 merge 가능하고, 테스트 가능하고, demo 가능한 상태를 유지한다.

## 담당 영역

- `packages/config`
- `packages/contracts`
- `packages/events`
- `packages/storage`
- `packages/runtime`
- `.github`
- `deploy`
- `scripts`
- `docs/events.md`
- `docs/team/conventions.md`

## 현재 책임

- `packages/contracts/event_bus`, `EventClient`, `WorkerService`, retry, DLQ, replay 계약을 유지한다.
- CI가 실패한 PR이 merge되지 않도록 GitHub Actions와 branch protection 기준을 관리한다.
- 배포 스크립트와 수요일 demo 검증 흐름을 유지한다.
- DB/event 원자성이 필요해지는 시점에 outbox relay 도입 여부를 결정한다.
- dashboard projection은 별도 UI 담당이 생기기 전까지 read model 계약만 관리한다.

## 코드 규칙

- 교체 가능한 infrastructure는 `Protocol` interface로 표현한다.
- runtime error handling은 runtime/process edge code에 모은다.
- service workflow가 raw NATS client를 import하지 않게 한다.
- 상수는 의미 있는 이름으로 명시한다.
- 클래스는 바뀌는 이유가 하나가 되도록 작게 유지한다.

## PR 체크리스트

- `make check` 통과
- CI workflow가 required check로 유지됨
- 새 공통 contract에 최소 1개 테스트 존재
- architecture/runtime 변경이 문서에 설명됨
- 다른 service owner 동작을 바꾼 경우 사전 조율 기록 존재

## Codex 지시문

이 영역을 작업할 때는 `packages/contracts`, `packages/events`, `packages/storage`, `packages/runtime`, `docs/events.md`, `.github`를 먼저 읽어라. 변경 범위를 좁게 유지하고 각 service의 공개 계약을 깨지 마라.
