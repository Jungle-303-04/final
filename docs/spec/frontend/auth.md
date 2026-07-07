---
source_commit: 1d7b4fbd
status: synced
---

# features/auth — 세션·로그인·가입·이메일 검증·승인 대기

> 소스: `frontend/src/features/auth/`

## 책임 (Responsibility)

- 세션 조회/로그인/로그아웃/가입/검증 메일 재전송/사용자 승인 훅(`api.ts`), 최근 세션 hint helper, 사용자 interaction 기반 세션 refresh helper 와 게스트 화면 4종(로그인·가입·승인 대기·이메일 검증)을 제공한다.
- `useSession`/`useIsAdmin` 은 [app 가드](app.md#가드--frontendsrcappguardstsx)와 [ConsoleLayout](app.md), 타 feature 의 권한 판정에 공용으로 쓰인다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`(`get/post/ApiError`), `@/shared/lib/types`(`Session`), `@/ui`, `@/ui/motion` | [shared](shared.md) | API·타입·UI |
| import ← | [app](app.md), [org](./org.md)(useApproveUser), [repo](./repo.md)·[chat](./chat.md)·[cluster](./cluster.md)·[notifications](./notifications.md)(useIsAdmin) | — | 소비자 |
| 백엔드 | `/auth/*` | [api-gateway](../services/gateway-api-gateway.md) | 인증 API |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | 시그니처 | API (메서드+경로) | 비고 |
|---|---|---|---|---|
| `sessionKey` | `frontend/src/features/auth/api.ts :: sessionKey` | `['session'] as const` | — | 세션 쿼리 키 |
| `markSessionSeen` | `frontend/src/features/auth/api.ts :: markSessionSeen` | `() => void` | — | `localStorage['k8s-console-session-seen-at'] = Date.now()` 저장. SSR/window 없음이면 no-op |
| `clearSessionHint` | `frontend/src/features/auth/api.ts :: clearSessionHint` | `() => void` | — | 최근 세션 hint 삭제. 401/logout 에서 호출 |
| `hasRecentSessionHint` | `frontend/src/features/auth/api.ts :: hasRecentSessionHint` | `() => boolean` | — | hint timestamp 가 현재 기준 2시간(`SESSION_HINT_TTL_MS`) 이내이면 true |
| `useSession` | `frontend/src/features/auth/api.ts :: useSession` | `() => UseQueryResult<Session>` | GET `/auth/session` via `get(..., { timeoutMs: 20_000 })` | `staleTime: 120_000`, `refetchOnWindowFocus:false`, `retry:false` — 401 세션 확인은 재시도하지 않고 가드가 즉시 로그인으로 보낸다. 20초 안에 응답이 없으면 API 클라이언트가 요청을 abort 하고 network 오류 detail 로 `'요청 시간이 초과되었습니다'`를 준다 |
| `refreshSession` | `frontend/src/features/auth/api.ts :: refreshSession` | `() => Promise<Session>` | POST `/auth/session/refresh` | 세션 리프레시 helper. 자동 호출은 `frontend/src/features/auth/sessionRefresh.ts` 소비자 책임 |
| `useLogin` | `frontend/src/features/auth/api.ts :: useLogin` | mutation `(b: {email; password}) => Session` | POST `/auth/login` | 성공 응답이 authenticated 면 `markSessionSeen()` 후 `queryClient.setQueryData(sessionKey, session)`로 즉시 반영 |
| `useLogout` | `frontend/src/features/auth/api.ts :: useLogout` | mutation `() => void` | POST `/auth/logout` | 성공 시 `clearSessionHint()` + `qc.clear()` (캐시 전체 삭제) |
| `useSignup` | `frontend/src/features/auth/api.ts :: useSignup` | mutation `(b: {email; password; password_confirm})` | POST `/auth/signup` | |
| `useApproveUser` | `frontend/src/features/auth/api.ts :: useApproveUser` | mutation `(userId: string)` | POST `/auth/users/${userId}/approve` | 성공/실패 `@/ui` toast, 성공·실패 모두 `['users']` invalidate — [org/MembersView](./org.md) 에서 사용 |
| `useIsAdmin` | `frontend/src/features/auth/api.ts :: useIsAdmin` | `() => boolean` | — | `session.roles.includes('service_admin') ?? false` |
| `useResendVerification` | `frontend/src/features/auth/api.ts :: useResendVerification` | mutation `(b: {email; password})` | POST `/auth/resend-verification` | |

## 컴포넌트

### `frontend/src/features/auth/AuthLayout.tsx :: AuthLayout`

`{ title: string; subtitle?: string; children: ReactNode }` — `bg-bg` 전체 화면 2열 레이아웃. 데스크톱 왼쪽은 `motion` list preset으로 브랜드/운영 흐름 설명을 보여주고, 오른쪽은 `@/ui Card` 안에 모바일 브랜드 마크 + h1 title + subtitle(옵션) + children을 배치한다.

### `frontend/src/features/auth/LoginView.tsx :: LoginView` (default export)

- 라우트: `/login` (가드 `RequireGuest`).
- state: `email`, `password`. 훅: `useLogin`, `useNavigate`, `useLocation`, `useSearchParams`, `useToast`.
- 트리: `AuthLayout(title='로그인')` → form(`Field` 이메일/비밀번호 + primary `Button` "로그인", 전체폭) → 하단 `/signup` 링크.
- submit: `login.mutate({email, password})`
  - 성공: success toast "로그인 완료" 후 query `returnTo` 또는 보호 경로에서 렌더된 현재 `pathname+search+hash` 를 `safeReturnTo` 로 검증한 뒤 `nav(..., { replace: true })`
  - 실패: `status === 403 && detail.includes('approval')` → warning toast "승인 대기" 후 `nav('/pending?email=<encoded>')`; 그 외는 danger toast + 필드 error
- 비밀번호 필드 error 메시지: 401 → `'이메일 또는 비밀번호가 올바르지 않습니다'`; 429 → `'잠시 후 다시 시도해주세요'`; 403(approval 아님) → `'이메일 검증이 필요합니다'`.
- input 제약: email required, password `minLength={8}` required.

### `frontend/src/features/auth/SignupView.tsx :: SignupView` (default export)

- 라우트: `/signup` (가드 `RequireGuest`).
- state: `email`, `pw`, `pw2`. 파생 `mismatch = pw2 !== '' && pw !== pw2`.
- `signup.isSuccess` 이면 `AuthLayout('검증 메일 발송됨')` + `EmptyState(MailGlyph, '메일함 확인', description에 email 포함)` + "로그인" 버튼으로 전환.
- 폼: 이메일(409 시 `'이미 가입된 이메일입니다'` error) / 비밀번호(8자 이상) / 비밀번호 확인(mismatch 시 error). submit 은 mismatch 아니면 `signup.mutate({email, password: pw, password_confirm: pw2})`. 성공은 success toast, 실패는 danger toast와 인라인 오류. 제출 버튼은 mismatch 시 disabled.

### `frontend/src/features/auth/PendingView.tsx :: PendingView` (default export)

- 라우트: `/pending` (가드 `RequireGuest`). 쿼리스트링 `email`.
- `AuthLayout('승인 대기 중')` + `EmptyState(ClockGlyph, '관리자 승인 대기', '"<email ?? 계정> 은(는) 승인 후 로그인할 수 있습니다.')` + `/login` "로그인 재시도" primary 버튼.

### `frontend/src/features/auth/VerifyEmailView.tsx :: VerifyEmailView` (default export)

- 라우트: `/verify-email` (가드 `RequireGuest`). 쿼리스트링 `verified`, `token`.
- `token` 이 있으면 클라이언트가 `/api/auth/verify-email?token=<token>` 으로 replace 이동하고, 이동 전 `AuthLayout('이메일 검증')` + `EmptyState(CheckGlyph, '검증 중')`을 표시한다.
- `ok = sp.get('verified') === '1'`:
  - true → `EmptyState(CheckGlyph, '검증 완료', '관리자 승인 후 로그인할 수 있습니다.')` + 로그인 버튼.
  - false → `EmptyState(AlertGlyph, '검증 링크 만료', '검증 메일을 다시 요청할 수 있습니다.')` + 이메일/비밀번호 입력 폼(`useResendVerification` mutate). 성공/실패 toast와 하단 안내 문구, "로그인" ghost 버튼.
- state: `email`, `password`. 재전송 버튼은 `resend.isPending || !email || password.length < 8` 시 disabled.

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
- 로그인 성공은 서버 응답 `Session`을 `sessionKey` 캐시에 직접 쓰고 최근 세션 hint 를 기록해 즉시 전파한다.
- 최근 세션 hint 는 `RequireSession` pending 상태에서만 기존 콘솔 화면을 유지하기 위한 최적화다. 401/unauthorized 및 logout 은 반드시 hint 를 삭제한다.
- 세션 확인 timeout 은 `useSession()`에만 20초로 적용한다. 다른 인증 mutation 에 새 timeout 정책을 강제하지 않는다.
- 오류 표시는 `ApiError.status`/`detail` 기반 — 상태코드별 한국어 메시지는 위 명세 그대로.
