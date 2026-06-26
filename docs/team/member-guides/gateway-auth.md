# 멤버 가이드: Gateway / Auth

## 미션

외부 HTTP 경계를 담당하고, 모든 외부 요청이 인증과 정책 검사를 거쳐 event-driven 흐름으로 들어가게 만든다.

## 담당 영역

- `services/management-api-gateway`
- `packages/contracts/schemas.py`
- OAuth/session/token vault 흐름
- command/dashboard/dead-letter HTTP route

## 현재 책임

- fake GitHub OAuth를 실제 provider token exchange로 교체한다.
- session은 Redis에 저장하고 provider token reference는 Token Vault record로 관리한다.
- UI command 요청이 유효한 session을 요구하도록 유지한다.
- 외부 입력은 Pydantic schema로 검증한다.

## 코드 규칙

- Gateway는 유일한 외부 HTTP 경계다.
- UI가 DB, JetStream, worker를 직접 호출하지 않게 한다.
- provider access token을 event payload에 넣지 않는다.
- route handler는 input validation, auth/policy, event publish 순서로 작성한다.
- request payload field를 추가하기 전에 schema를 먼저 추가한다.

## PR 체크리스트

- 새 endpoint의 auth 동작이 문서화됨
- 새 request schema가 알 수 없거나 위험한 field를 거부함
- `make check` 통과
- Gateway smoke path 유지
- UI에 보이는 route가 바뀌면 WIKI/API docs 수정

## Codex 지시문

이 영역을 작업할 때는 `services/management-api-gateway/gateway.py`, `services/management-api-gateway/auth.py`, `packages/contracts/schemas.py`, `docs/team/conventions.md`를 먼저 읽어라.
