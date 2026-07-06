---
source_commit: 1616d295
status: synced
---

# mail-worker — mail.email_verification.requested → 인증 메일 전송

> 소스: `src/services/mail/mail-worker/app.py` · 테스트: `tests/test_mail_worker.py`

## 책임 (Responsibility)

- `mail.email_verification.requested` 를 받아 인증 메일을 SMTP 로 전송(또는 `log` 모드로 로그만)하고, 결과를 `mail.email_verification.sent` / `mail.email_verification.failed` 로 발행한다.
- 하지 않는 것: 인증 토큰 생성/검증(api-gateway + Redis), 템플릿 렌더링 엔진(고정 텍스트 본문 1종).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.mail` | [../../domains/mail.md](../domains/mail.md) | 이벤트 body 3종 |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `EventBody` |
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `env`, 로깅 |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext`, WorkerRuntime |
| 외부 | SMTP 서버 | — | `smtplib.SMTP`(STARTTLS 기본) |

## 공개 인터페이스 (Public API)

- `src/services/mail/mail-worker/app.py :: app` — `App("mail-worker")`.
- `src/services/mail/mail-worker/app.py :: MailDeliveryResult` — frozen dataclass `(sent: bool, mode: str, reason: str = "", reason_code: str = "")`.
- `src/services/mail/mail-worker/app.py :: build_email_message(evt, sender) -> EmailMessage` — `From=sender`, `To=evt.email`, `Subject="Verify your email"`, 본문(텍스트):
  ```
  Verify your email address to finish creating your account.

  <verification_url>

  This link expires in {expires_in_seconds // 60} minutes.
  ```
- `src/services/mail/mail-worker/app.py :: send_email_verification(evt) -> MailDeliveryResult` — 동기 전송 함수(핸들러에서 호출).
- `src/services/mail/mail-worker/app.py :: on_email_verification_requested(evt, ctx) -> AsyncIterator[EventBody]` — `@app.on(EmailVerificationRequestedBody)`.
- 상수: `SMTP_MODE="smtp"`, `LOG_MODE="log"`, `DEFAULT_SMTP_PORT="587"`, `DEFAULT_SMTP_TIMEOUT_SECONDS="10"`, `SMTP_CONFIG_MISSING_REASON="SMTP_HOST is required when MAIL_DELIVERY_MODE=smtp"` / `SMTP_CONFIG_MISSING_CODE="smtp_config_missing"`, `SMTP_FROM_MISSING_REASON="SMTP_FROM is required when MAIL_DELIVERY_MODE=smtp"` / `SMTP_FROM_MISSING_CODE="smtp_from_missing"`.

## 데이터 모델 (Data Model)

없음 (DB 미사용 — `EventContext[object]`).

## 이벤트 (Events)

body 는 `src/domains/mail/events.py` — [mail 도메인](../domains/mail.md) 참조.

| 구분 | subject | body | 조건 |
|---|---|---|---|
| 구독 | `mail.email_verification.requested` | `EmailVerificationRequestedBody(email, verification_url, expires_in_seconds)` | api-gateway signup/resend 가 발행 |
| 발행 | `mail.email_verification.sent` | `EmailVerificationSentBody(email, mode)` | 전송 성공(`mode`: `smtp`/`log`) |
| 발행 | `mail.email_verification.failed` | `EmailVerificationFailedBody(email, reason, reason_code, mode)` | 설정 누락으로 전송 불가 |

## 동작 (Behavior)

`send_email_verification`:

1. `MAIL_DELIVERY_MODE`(trim·소문자, 빈 값이면 `smtp`) 판정.
2. `log` 모드: `"email verification requested"` info 로그 후 `sent=True, mode="log"` — 실제 발송 없음(개발/테스트).
3. `smtp` 모드:
   - `SMTP_HOST` 없음 → error 로그 + `MailDeliveryResult(sent=False, reason=SMTP_CONFIG_MISSING_REASON, reason_code="smtp_config_missing")`.
   - `SMTP_FROM`(trim) 없음 → error 로그 + `reason_code="smtp_from_missing"`.
   - 메시지 빌드 → `smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT_SECONDS)` 컨텍스트에서: `SMTP_STARTTLS != "0"` 이면 `starttls()`, `SMTP_USERNAME` 있으면 `login(username, password)`, `send_message`.
4. 핸들러: `sent=True` → `EmailVerificationSentBody` yield, 아니면 `EmailVerificationFailedBody` yield.

## 불변식·오류 (Invariants & Errors)

- 설정 누락(호스트/발신자)은 **failed 이벤트로 종결**(예외 아님 — 재시도 무의미).
- SMTP 연결/전송 예외(`smtplib` 오류, 타임아웃 등)는 잡지 않는다 → WorkerRuntime 재시도(기본 3회) 후 DLQ. 일시 장애는 재시도로 흡수, 영구 장애는 DLQ + [dead-letter-monitor](projection-dead-letter-monitor.md) 알림.
- STARTTLS 는 opt-out 방식(`SMTP_STARTTLS=0` 일 때만 생략).
- env 는 이벤트 처리 시점마다 평가.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `MAIL_DELIVERY_MODE` | str | `smtp` | `smtp` \| `log` |
| `SMTP_HOST` | str | `""` | SMTP 호스트(smtp 모드 필수) |
| `SMTP_PORT` | int | `587` | SMTP 포트 |
| `SMTP_USERNAME` | str | `""` | 설정 시 login 수행 |
| `SMTP_PASSWORD` | str | `""` | login 패스워드 |
| `SMTP_FROM` | str | `""` | 발신자(smtp 모드 필수) |
| `SMTP_STARTTLS` | str | `1` | `0` 이면 STARTTLS 생략 |
| `SMTP_TIMEOUT_SECONDS` | int | `10` | 연결/전송 타임아웃 |

WorkerRuntime 공통 env 는 [../../packages/runtime.md](../packages/runtime.md) 참조.
