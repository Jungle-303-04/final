---
source_commit: 1616d295
status: synced
---

# mail — 인증/알림 메일 이벤트 계약 도메인

> 소스: `src/domains/mail/`

## 책임 (Responsibility)

- 이메일 인증(verification) 흐름에 쓰이는 **이벤트 body 계약만 정의**한다.
- **하지 않는 것**: 메일 발송 자체(SMTP/외부 발송은 services 계층 워커 담당), DB 모델·리포지토리·HTTP 라우터 없음. 이 도메인은 `events.py` 하나로 구성된 순수 계약 모듈이다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.contracts.event_bus.bodies.base` | [contracts](../packages/contracts.md) | `EventBody` 베이스 |
| import | `packages.contracts.event_bus.registry` | [contracts](../packages/contracts.md) | `@event` subject 레지스트리 데코레이터 |
| import | `packages.contracts.event_bus.subjects` | [contracts](../packages/contracts.md) | `EventSubject` 라우팅 키 |
| 계약 정의 | `mail.email_verification.*` 이벤트 3종 | — | identity 도메인의 인증 흐름([identity](./identity.md))과 메일 발송 워커가 사용 |

## 공개 인터페이스 (Public API)

- `src/domains/mail/__init__.py` — 도메인 패키지 선언(심볼 없음).
- `src/domains/mail/events.py` — 이벤트 body dataclass 3개. 모두 `@event(EventSubject.…)` 등록, `frozen=True`, `packages.contracts.event_bus.bodies.base :: EventBody` 상속.

| 심볼 | 앵커 |
|---|---|
| `EmailVerificationRequestedBody` | `src/domains/mail/events.py :: EmailVerificationRequestedBody` |
| `EmailVerificationSentBody` | `src/domains/mail/events.py :: EmailVerificationSentBody` |
| `EmailVerificationFailedBody` | `src/domains/mail/events.py :: EmailVerificationFailedBody` |

## 이벤트 (Events)

이 도메인은 이벤트 body 계약만 정의하며, 실제 발행/구독 주체는 services 계층이다(요청은 identity 흐름에서 발행, sent/failed는 메일 발송 워커가 발행). 라우팅 키는 `packages.contracts.event_bus.subjects :: EventSubject` 값이다([contracts](../packages/contracts.md)).

### 계약 정의 (Defines)

#### `mail.email_verification.requested` — `src/domains/mail/events.py :: EmailVerificationRequestedBody`

이메일 인증 발송 요청.

| 필드 | 타입 | 설명 |
|---|---|---|
| `email` | `str` | 수신자 이메일 주소 |
| `verification_url` | `str` | 인증 링크 URL |
| `expires_in_seconds` | `int` | 인증 링크 유효 시간(초) |

#### `mail.email_verification.sent` — `src/domains/mail/events.py :: EmailVerificationSentBody`

이메일 인증 발송 완료.

| 필드 | 타입 | 설명 |
|---|---|---|
| `email` | `str` | 수신자 이메일 주소 |
| `mode` | `str` | 발송 모드(발송 워커가 사용한 전송 방식 식별자) |

#### `mail.email_verification.failed` — `src/domains/mail/events.py :: EmailVerificationFailedBody`

이메일 인증 발송 실패.

| 필드 | 타입 | 설명 |
|---|---|---|
| `email` | `str` | 수신자 이메일 주소 |
| `reason` | `str` | 실패 사유(사람이 읽는 메시지) |
| `reason_code` | `str` | 실패 사유 코드(기계 판독용) |
| `mode` | `str` | 발송 모드 |

## 동작 (Behavior)

인증 메일 발송 흐름의 계약 상 순서:

1. `mail.email_verification.requested` — 인증 메일 발송이 필요해짐(수신자·인증 URL·만료 시간 포함).
2. 발송 워커가 처리 후 결과를 발행:
   - 성공 → `mail.email_verification.sent`
   - 실패 → `mail.email_verification.failed` (`reason`, `reason_code` 포함)

이 도메인 코드 자체는 상태를 갖지 않는다(상태 머신·영속 없음).

## 불변식·오류 (Invariants & Errors)

- 모든 body는 `frozen=True` dataclass — 생성 후 불변.
- `requested` 1건은 `sent` 또는 `failed` 중 정확히 하나의 결과 이벤트로 종결되는 것이 계약 의도다(강제는 발송 워커 책임).
- 도메인 모듈 자체는 예외를 정의하지 않는다.

## 설정 (Settings)

없음.
