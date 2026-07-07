---
source_commit: 96ba52c8
status: synced
---

# features/auth — 세션·로그인·가입·이메일 검증·승인 대기

> 소스: `frontend/src/features/auth/`

## 책임 (Responsibility)

- 세션 조회/로그인/로그아웃/가입/검증 메일 재전송/사용자 승인 훅(`api.ts`)과 게스트 화면 4종(로그인·가입·승인 대기·이메일 검증)을 제공한다.
- `useSession`/`useIsAdmin` 은 [app 가드](app.md#가드--frontendsrcappguardstsx)와 [ConsoleLayout](app.md), 타 feature 의 권한 판정에 공용으로 쓰인다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`(`get/post/ApiError`), `@/shared/lib/types`(`Session`), `@/shared/ui`, `@/shared/ui/icons`, `@/shared/motion` | [shared](shared.md) | API·타입·UI |
| import ← | [app](app.md), [org](./org.md)(useApproveUser), [repo](./repo.md)·[chat](./chat.md)·[cluster](./cluster.md)·[notifications](./notifications.md)(useIsAdmin) | — | 소비자 |
| 백엔드 | `/auth/*` | [api-gateway](../services/gateway-api-gateway.md) | 인증 API |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | 시그니처 | API (메서드+경로) | 비고 |
|---|---|---|---|---|
| `sessionKey` | `frontend/src/features/auth/api.ts :: sessionKey` | `['session'] as const` | — | 세션 쿼리 키 |
| `useSession` | `frontend/src/features/auth/api.ts :: useSession` | `() => UseQueryResult<Session>` | GET `/auth/session` | `staleTime: 60_000`, `retry:false` — 401 세션 확인은 재시도하지 않고 가드가 즉시 로그인으로 보낸다 |
| `useLogin` | `frontend/src/features/auth/api.ts :: useLogin` | mutation `(b: {email; password}) => Session` | POST `/auth/login` | 성공 시 `sessionKey` invalidate |
| `useLogout` | `frontend/src/features/auth/api.ts :: useLogout` | mutation `() => void` | POST `/auth/logout` | 성공 시 `qc.clear()` (캐시 전체 삭제) |
| `useSignup` | `frontend/src/features/auth/api.ts :: useSignup` | mutation `(b: {email; password; password_confirm})` | POST `/auth/signup` | |
| `useApproveUser` | `frontend/src/features/auth/api.ts :: useApproveUser` | mutation `(userId: string)` | POST `/auth/users/${userId}/approve` | 성공 시 `['users']` invalidate — [org/MembersView](./org.md) 에서 사용 |
| `useIsAdmin` | `frontend/src/features/auth/api.ts :: useIsAdmin` | `() => boolean` | — | `session.roles.includes('service_admin') ?? false` |
| `useResendVerification` | `frontend/src/features/auth/api.ts :: useResendVerification` | mutation `(b: {email})` | POST `/auth/resend-verification` | |

## 컴포넌트

### `frontend/src/features/auth/AuthLayout.tsx :: AuthLayout`

`{ title: string; subtitle?: string; children: ReactNode }` — 전체 화면 중앙 정렬(라디얼 그라디언트 배경), `FadeSlideIn` 안에 `.card`(min(440px, 92vw), padding `--sp-8`): "◈" 로고 + h1 title + subtitle(옵션) + children.

### `frontend/src/features/auth/LoginView.tsx :: LoginView` (default export)

- 라우트: `/login` (가드 `RequireGuest`).
- state: `email`(초기값 `'admin.local@example.com'`), `password`. 훅: `useLogin`, `useNavigate`, `useSearchParams`.
- 트리: `AuthLayout(title='로그인', subtitle='운영 콘솔에 접속합니다')` → form(`Field` 이메일/비밀번호 + primary `Button` "로그인", 전체폭) → 하단 `/signup` 링크.
- submit: `login.mutate({email, password})`
  - 성공: `nav(sp.get('returnTo') ?? '/', { replace: true })`
  - 실패: `status === 403 && detail.includes('approval')` → `nav('/pending?email=<encoded>')`
- 비밀번호 필드 error 메시지: 401 → `'이메일 또는 비밀번호가 올바르지 않습니다'`; 429 → `'잠시 후 다시 시도해주세요'`; 403(approval 아님) → `'이메일 검증이 필요합니다'`.
- input 제약: email required, password `minLength={8}` required.

### `frontend/src/features/auth/SignupView.tsx :: SignupView` (default export)

- 라우트: `/signup` (가드 `RequireGuest`).
- state: `email`, `pw`, `pw2`. 파생 `mismatch = pw2 !== '' && pw !== pw2`.
- `signup.isSuccess` 이면 `AuthLayout('검증 메일 발송됨')` + `EmptyState(icon '✉️', '메일함을 확인해주세요', description에 email 포함)` + "로그인으로" 버튼으로 전환.
- 폼: 이메일(409 시 `'이미 가입된 이메일입니다'` error) / 비밀번호(8자 이상) / 비밀번호 확인(mismatch 시 error). submit 은 mismatch 아니면 `signup.mutate({email, password: pw, password_confirm: pw2})`. 제출 버튼은 mismatch 시 disabled.

### `frontend/src/features/auth/PendingView.tsx :: PendingView` (default export)

- 라우트: `/pending` (가드 `RequireGuest`). 쿼리스트링 `email`.
- `AuthLayout('승인 대기 중')` + `EmptyState(IconClock, '관리자 승인 대기 중', '"<email ?? 계정> 은(는) 승인 후 로그인할 수 있습니다.')` + "/login 로그인 다시 시도" primary 버튼.

### `frontend/src/features/auth/VerifyEmailView.tsx :: VerifyEmailView` (default export)

- 라우트: `/verify-email` (가드 `RequireGuest`). 쿼리스트링 `verified`.
- `ok = sp.get('verified') === '1'`:
  - true → `EmptyState(IconCheckCircle, '검증 완료', '관리자 승인 후 로그인할 수 있습니다.')` + 로그인 버튼.
  - false → `EmptyState(IconAlertTriangle, '링크가 만료되었거나 잘못되었습니다', …)` + 이메일 입력 폼(`useResendVerification` mutate). 전송 성공/실패 안내 문구, "로그인으로" ghost 버튼.
- state: `email`. 재전송 버튼은 `resend.isPending || !email` 시 disabled.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/login` | `LoginView` | `RequireGuest` | 로그인, `returnTo` 지원 |
| `/signup` | `SignupView` | `RequireGuest` | 가입(검증 메일 발송 안내) |
| `/pending` | `PendingView` | `RequireGuest` | 관리자 승인 대기 안내 |
| `/verify-email` | `VerifyEmailView` | `RequireGuest` | 검증 결과 표시·재전송 |

## 동작 (Behavior)

가입→로그인 상태 머신: 가입(POST /auth/signup) → 이메일 검증(`/verify-email?verified=1`) → 관리자 승인([org/MembersView](./org.md) 의 `useApproveUser`) → 로그인 가능. 승인 전 로그인 시도는 403 detail `'account approval required'` → `/pending` 이동.

## 불변식·오류 (Invariants & Errors)

- 로그아웃 성공 시 React Query 캐시 전체 clear — 이전 사용자 데이터 잔존 금지.
- 로그인 성공은 `sessionKey` invalidate 로 전파(가드가 자동으로 재평가).
- 오류 표시는 `ApiError.status`/`detail` 기반 — 상태코드별 한국어 메시지는 위 명세 그대로.
