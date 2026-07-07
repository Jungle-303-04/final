# 뷰: 인증 (로그인/가입/검증/승인 대기)

[← 지도](../README.md) · 요구사항 [R1](../01-requirements.md#r1-로그인) · 라우트 [05](../05-routes-ia.md)

## 화면 구성

4개 라우트가 같은 `AuthLayout`(중앙 카드 480px, 배경 surface-0 + 은은한 그라디언트) 공유.

```text
┌─────────────────────────────┐
│  로고                        │
│  ┌───────────────────────┐  │
│  │  제목/부제              │  │
│  │  Form (Input×n)        │  │
│  │  Button primary 풀폭   │  │
│  │  하단 전환 링크         │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

## /login — LoginView

| 항목 | 내용 |
|---|---|
| 폼 | email(형식 검증), password(min 8) — zod 스키마는 백엔드 `LoginRequest` 제약과 동일 |
| API | `POST /auth/login` → 성공: `['session']` invalidate 후 returnTo 또는 / |
| 에러 | 401 "이메일 또는 비밀번호가 올바르지 않습니다" / 429(rate limit) "잠시 후 다시 시도" + 남은 시간 / **403 detail 분기**(백엔드 실측): 검증 필요 → 재발송 안내, 승인 대기 → /pending?email= 이동 |
| 모션 | 카드 FadeSlideIn, 에러 시 카드 x축 shake 1회(모션 프리미티브 외 유일한 예외 — PressScale 변형으로 구현) |

## /signup — SignupView

| 항목 | 내용 |
|---|---|
| 폼 | email, password, password_confirm(일치 검증) — `SignupRequest` 제약 동일 |
| API | `POST /auth/signup` → 성공 화면 전환: "검증 메일을 보냈습니다" + 재발송 버튼(`POST /auth/resend-verification`, 60s 쿨다운) |
| 에러 | 409 중복 "이미 가입된 이메일" · 422 필드별 표시 |

## /verify-email — VerifyEmailResult

메일 링크 랜딩. 쿼리 token 으로 `GET /auth/verify-email?token=&redirect=` 호출 결과 표시.
성공(303 redirect 수신): "검증 완료 — 관리자 승인을 기다려주세요" → /login 버튼.
실패: "링크가 만료되었거나 잘못되었습니다" → 재발송 안내.

## /pending — PendingApprovalView

**세션 없는 게스트 화면**(백엔드 실측: 승인 대기 계정은 로그인 자체가 403 거부 —
`ACCOUNT_APPROVAL_REQUIRED`. 세션 기반 대기 상태는 존재하지 않음).
로그인 403(approval) 응답 시 이 화면으로 이동, 쿼리 `?email=` 표시용.
EmptyState(icon: Hourglass, "관리자 승인 대기 중 — 승인 후 로그인할 수 있습니다")
+ [로그인 다시 시도] 버튼(자동 폴링 없음 — 자격증명 보관 금지).

## 관리자 승인 동선

승인 행위 자체는 [org-admin § 멤버](org-admin.md#멤버-membersview-g3) 화면에서 수행
(`POST /auth/users/{user_id}/approve`). 이 문서 범위는 대기자 경험까지.

## 세션 수명 주기 (전역 — 여기가 정본)

1. 앱 부팅: `GET /auth/session` (QueryBoundary 전면 로딩)
2. authenticated=false → RequireSession 이 /login
3. 임의 API 401 수신 → api.ts 인터셉터가 `['session']` invalidate → 가드가 리다이렉트
4. 로그아웃: `POST /auth/logout` → 캐시 전체 clear → /login

## 수용 기준 (AC)

- [ ] 잘못된 비밀번호 반복 시 rate limit 응답의 재시도 시간 표기
- [ ] 새로고침해도 세션 유지(쿠키), returnTo 동작
- [ ] 403 detail 두 종류(검증 필요/승인 대기)가 서로 다른 안내로 분기
- [ ] 모든 폼 오류가 필드 인라인 + 스크린리더(aria) 로 노출
