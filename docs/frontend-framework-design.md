# Frontend Framework Design Plan

이 문서는 우리 운영 콘솔 frontend를 만들 때 지켜야 하는 보안, API, realtime, 배포 기준이다.

핵심 목표는 browser가 위험한 token과 내부 시스템을 직접 들고 다니지 않게 하고, 모든 권한 판단을 backend Gateway에 남기는 것이다.
Frontend는 사용자가 상태를 이해하고 올바른 요청을 보내도록 돕지만, 보안의 최종 판단자는 아니다.

## 설계 결론

Frontend는 `cookie-session BFF` 스타일로 붙인다.

```text
Browser React App
  -> same-origin fetch(credentials: "include")
  -> API Gateway
  -> require_session / require_cluster_access / accessible_resource_ids
  -> read model / command / approval / realtime
```

Browser JavaScript는 session token 원문을 읽지 않는다.
Login 이후 session은 `service_session` httpOnly cookie로 유지된다.
API 호출은 token header를 조립하지 않고 browser cookie jar를 사용한다.

관련 backend 기준:

- `src/domains/identity/router.py`: login, verify email, logout에서 session cookie를 설정/삭제한다.
- `src/services/gateway/api-gateway/auth.py`: request에서 Bearer, `x-session-token`, `service_session` cookie 순서로 session token을 추출한다.
- `src/domains/identity/dependencies.py`: browser session과 cluster/resource 권한을 검사한다.
- `src/domains/dashboard/router.py`: dashboard query에서 workspace와 cluster 권한 필터를 적용한다.
- `src/services/realtime/realtime-gateway/app.py`: browser websocket session과 workspace 일치를 검사한다.

## 절대 기준

### 1. Frontend는 token을 저장하지 않는다

금지:

- `localStorage.setItem("token", ...)`
- `sessionStorage.setItem("token", ...)`
- Zustand, Redux, React Query cache 등에 session token 저장
- URL query string에 session token 저장
- browser에 `x-agent-token`, provider token, kubeconfig, DB/NATS connection 정보 전달

허용:

- `/auth/session` response의 `user_id`, `roles`, `workspace_id`를 memory 상태나 query cache에 저장
- CSRF 방어용 nonce/token을 memory에 저장
- UI preference, theme, sidebar 상태 같은 비보안 값 저장

이 기준의 이유는 XSS 방어다.
Frontend JavaScript가 token 원문을 읽을 수 없으면 악성 script가 session token 자체를 훔치기 어렵다.

### 2. 모든 API 호출은 credentials를 포함한다

공통 fetch wrapper는 `credentials: "include"`를 기본값으로 둔다.
개별 feature 코드에서 fetch를 직접 부르면 안 된다.

권장 wrapper:

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API request failed: ${status}`)
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  })

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const body = text ? JSON.parse(text) : null

  if (!response.ok) throw new ApiError(response.status, body)
  return body as T
}
```

`Authorization` header는 기본값으로 넣지 않는다.
우리 browser app의 기본 인증 경로는 cookie다.

### 3. 운영 배포는 같은 origin을 우선한다

운영 기본 구조:

```text
https://console.example.com/
  -> frontend static assets

https://console.example.com/auth/*
https://console.example.com/dashboard/*
https://console.example.com/commands
https://console.example.com/approvals/*
https://console.example.com/providers/*
https://console.example.com/ai/*
https://console.example.com/live/*
  -> backend services
```

같은 origin 배포의 장점:

- browser가 cookie를 자연스럽게 보낸다.
- CORS 설정 표면이 줄어든다.
- CSRF 방어를 `SameSite=lax`와 Origin 검사 중심으로 단순하게 가져갈 수 있다.
- WebSocket도 token query 없이 cookie 기반으로 붙일 수 있다.

Reverse proxy는 frontend asset과 backend API를 같은 host 아래에 둔다.
SPA route fallback은 frontend asset 서버에서 처리하고, API prefix는 backend로 먼저 라우팅한다.

현재 실제 배포 파일은 아래 기준으로 고정한다.

- `frontend/Dockerfile`: Vite build를 수행한 뒤 nginx-unprivileged 이미지에 `dist/`를 복사한다.
- `frontend/nginx.conf`: `/api/`는 `api-gateway`, `/api/live/`는 `realtime-gateway`로 프록시한다.
- `deploy/management/console.yaml`: `console` Deployment와 LoadBalancer Service를 만든다.
- `scripts/aws-up.sh`: `CONSOLE_ECR_REPO` 이미지를 빌드하고 `kubeheal-console` 이미지를 실제 ECR image로 치환한다.

### 4. 다른 origin을 쓰면 CORS를 정확히 제한한다

개발 중 `http://localhost:5173` frontend가 `http://localhost:8000` Gateway를 호출하는 경우처럼 origin이 갈라질 수 있다.
이 경우 backend CORS는 아래 기준을 지킨다.

필수:

- `allow_credentials=True`
- `allow_origins`는 명시적 origin 목록만 허용
- wildcard origin 금지
- 허용 method/header는 필요한 값만 둔다
- production origin과 local dev origin을 env로 분리한다

FastAPI 예시:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://console.example.com",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["content-type", "x-csrf-token"],
)
```

주의:

- credential 포함 CORS에서 wildcard origin은 쓰지 않는다.
- `SameSite=lax` cookie는 cross-site subrequest에 항상 붙는 것이 아니다.
- cross-site cookie가 꼭 필요하면 `SameSite=None; Secure`와 CSRF token 방어를 같이 설계한다.

### 5. 상태 변경 API는 CSRF 방어를 갖춘다

현재 `SameSite=lax`는 좋은 기본값이다.
하지만 상태 변경 요청이 cookie 기반이면 CSRF를 계속 고려해야 한다.

기본 방어:

- `POST`, `PUT`, `PATCH`, `DELETE`는 `Origin` 또는 `Referer`를 검사한다.
- 허용 origin은 배포 설정에서 명시한다.
- content type은 `application/json`만 허용한다.
- GET route는 상태를 바꾸지 않는다.

cross-origin cookie가 필요한 경우 추가 방어:

- `GET /auth/csrf` 같은 route로 per-session CSRF token을 발급한다.
- frontend는 token을 memory에만 들고 `x-csrf-token` header로 보낸다.
- backend는 Redis session 또는 별도 CSRF store에서 token을 검증한다.
- CSRF token은 인증 token이 아니다. 노출되어도 session cookie 없이는 권한이 없다.

Frontend 규칙:

- write API wrapper는 `x-csrf-token`이 준비되기 전 요청을 보내지 않는다.
- CSRF 실패는 login 실패와 다르게 보여준다.
- CSRF token은 localStorage에 저장하지 않는다.

### 6. Browser에는 agent/internal credential을 전달하지 않는다

Browser가 절대 받으면 안 되는 값:

- `x-agent-token`
- provider token
- GitHub token
- kubeconfig
- Kubernetes ServiceAccount token
- DB URL
- NATS URL
- Redis URL
- secret vault ref의 실제 값

Target agent 전용 API는 browser 기능이 아니다.
Browser는 target cluster에 직접 명령하지 않고 Gateway에 command/approval 요청만 보낸다.
Gateway와 worker가 event, queue, policy를 거쳐 target agent에 전달한다.

### 7. Backend가 항상 권한을 최종 판단한다

Frontend가 버튼을 숨기거나 disabled 처리하는 것은 UX다.
보안은 backend가 한다.

Backend 기준:

- `require_session`: 로그인 session이 있어야 한다.
- `require_cluster_access`: 특정 cluster에 대한 action 권한이 있어야 한다.
- `accessible_resource_ids`: 목록 query에서 사용자가 볼 수 있는 resource만 내려준다.

Frontend 기준:

- `/auth/session`을 먼저 읽고 화면을 초기화한다.
- session의 role은 표시와 UX 힌트에만 쓴다.
- write 요청은 403, 404, 409를 정상적인 제품 상태로 처리한다.
- 사용자가 임의 `workspace_id`를 선택해 tenant를 바꾸게 하지 않는다.
- backend가 내려주지 않은 row를 frontend에서 합성해 보여주지 않는다.

## 현재 frontend stack

현재 frontend app은 `frontend/` 아래에 있다.
`frontend/package.json` 기준으로 먼저 익혀야 하는 구성은 아래와 같다.

- Vite
- React
- TypeScript
- TanStack Query
- React Router
- Motion for React
- React Flow
- Nivo line/treemap
- Zustand
- ESLint

OpenAPI 타입 생성은 production 완성 단계에서 `generated/api`로 고정한다.
그 전까지는 `src/packages/contracts/gateway/routes.py`, `requests.py`, `responses.py`와 `frontend/src/shared/lib/types.ts`를 같이 보고 DTO를 맞춘다.

GraphQL client는 기본 선택이 아니다.
우리 backend 계약은 FastAPI REST/Pydantic DTO와 WebSocket 계약으로 이미 나뉘어 있다.
따라서 `/openapi.json`에서 TypeScript 타입을 생성하고, REST wrapper를 얇게 유지한다.

## Dynamic UI 방향

우리는 정적인 table 중심 console보다, 상태와 데이터에 따라 UI가 생성되고 바뀌는 느낌의 운영 화면을 지향한다.
단, dynamic UI는 임의 코드를 실행한다는 뜻이 아니다.
Backend가 JSX, script, raw HTML, CSS 문자열을 내려주고 frontend가 실행하는 방식은 금지한다.

허용되는 dynamic UI:

- frontend에 미리 등록된 안전한 React component를 데이터로 선택한다.
- backend DTO와 read model을 frontend view model로 변환한다.
- layout, chart type, severity, status, enabled action 같은 제한된 값으로 화면을 조립한다.
- realtime message가 들어오면 card, chart, timeline, node graph가 부드럽게 변경된다.
- 사용자의 filter, sort, grouping, saved view가 화면 구성을 바꾼다.

금지되는 dynamic UI:

- backend가 보낸 JSX 실행
- `eval`, `new Function`, remote script 실행
- backend가 보낸 임의 CSS를 style tag로 삽입
- chart config에 함수를 문자열로 넣고 실행
- permission 우회용 hidden action을 client manifest에 심기

권장 구조:

```text
backend DTO
  -> feature api wrapper
  -> view model mapper
  -> component registry
  -> animated layout / chart / graph component
```

예시:

```ts
type WidgetKind = "status-card" | "timeline" | "line-chart" | "bar-chart" | "flow-map"

type WidgetManifest = {
  id: string
  kind: WidgetKind
  title: string
  dataRef: string
  status?: "ok" | "warning" | "critical" | "unknown"
}

const registry = {
  "status-card": StatusCardWidget,
  timeline: TimelineWidget,
  "line-chart": LineChartWidget,
  "bar-chart": BarChartWidget,
  "flow-map": FlowMapWidget,
} satisfies Record<WidgetKind, React.ComponentType<WidgetProps>>
```

이 manifest는 frontend 내부 view model이어야 한다.
초기 버전에서는 backend가 manifest를 내려주지 말고, frontend가 `RcaTimelineResponse`, realtime snapshot, command/approval response를 보고 manifest를 만든다.
나중에 backend가 화면 hint를 내려주더라도 `WidgetKind` enum처럼 제한된 schema만 허용한다.

## Dynamic Component Palette

초기 frontend는 아래 컴포넌트를 우선 만든다.

상태 카드:

- cluster health card
- RCA status card
- evidence completeness card
- command queue card
- Safe PR status card
- realtime connection card

차트:

- pod ready/total trend line chart
- restart delta bar chart
- evidence provider success/failure stacked bar
- RCA status distribution donut or bar chart
- command latency histogram
- approval grant/reject count chart

인터랙션:

- RCA timeline scrubber
- incident detail expandable evidence drawer
- command action confirmation sheet
- PR diff summary reveal
- cluster filter combobox
- saved dashboard view switcher

그래프/맵:

- cluster -> namespace -> workload flow map
- evidence -> RCA -> action -> command/PR pipeline graph
- approval dependency graph
- realtime resource delta map

애니메이션:

- card enter/exit
- status transition
- count-up number
- chart series transition
- timeline item expansion
- realtime pulse for recently updated rows
- drag/reorder for dashboard widgets

이 palette는 운영 console답게 정보 밀도를 유지한다.
큰 marketing hero, 장식 중심 배경, 의미 없는 효과는 만들지 않는다.
움직임은 상태 변화, attention, continuity를 설명할 때만 쓴다.

## Chart And Motion Library 기준

기본 선택:

- `Recharts`: 일반 dashboard chart를 빠르게 만든다.
- `Motion for React`: layout transition, enter/exit, gesture, status animation을 담당한다.
- `React Flow`: pipeline graph, resource dependency map, workflow graph에 사용한다.

검토 후보:

- `Nivo`: 더 완성도 높은 dataviz와 다양한 chart family가 필요할 때 검토한다.
- `visx`: chart를 낮은 수준에서 직접 구성해야 할 때 검토한다.

선택 기준:

- TypeScript와 React 18/19 호환성
- tree shaking과 bundle size
- accessibility 지원
- responsive layout 안정성
- server/client rendering 제약
- chart tooltip과 keyboard navigation 확장성
- theme token 적용 가능성
- 테스트에서 deterministic rendering이 가능한지

초기 구현은 Recharts + Motion + React Flow 조합으로 충분하다.
Nivo나 visx는 특정 chart 요구가 생긴 뒤 추가한다.

## Dynamic UI 상태 모델

동적 화면은 backend 상태를 과장하지 않는다.
화면이 화려해도 상태 이름은 실제 DTO와 event subject를 따른다.

권장 상태:

```ts
type VisualStatus =
  | "loading"
  | "empty"
  | "ready"
  | "partial"
  | "action-required"
  | "updating"
  | "stream-disconnected"
  | "forbidden"
  | "error"
```

Mapping 기준:

- `loading`: query가 아직 끝나지 않았다.
- `empty`: 권한이 적용된 결과가 비어 있다.
- `ready`: 정상 데이터가 있다.
- `partial`: 일부 provider/evidence가 실패했지만 표시 가능한 데이터가 있다.
- `action-required`: `rca.action_required`처럼 사람 판단이 필요하다.
- `updating`: realtime update 또는 refetch가 진행 중이다.
- `stream-disconnected`: 마지막 snapshot은 있지만 live connection이 끊겼다.
- `forbidden`: backend가 403을 반환했다.
- `error`: 복구 가능한 일반 오류다.

Animation은 이 상태 전이에 붙인다.
상태를 새로 invent하지 않고, DTO와 event subject에서 파생한다.

## Generated UI 안전장치

UI가 동적으로 생성되는 느낌을 주려면 manifest와 registry를 쓴다.
하지만 registry 밖 component는 렌더링하지 않는다.

안전장치:

- manifest schema는 Zod 같은 runtime validator로 검증한다.
- 알 수 없는 `kind`는 렌더링하지 않고 fallback card를 보여준다.
- action manifest는 backend 권한을 대체하지 않는다.
- destructive action은 confirmation과 backend permission check를 모두 통과해야 한다.
- saved dashboard layout은 user preference로만 취급한다.
- layout preference에는 credential, token, raw payload를 저장하지 않는다.

예시:

```ts
const widgetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["status-card", "timeline", "line-chart", "bar-chart", "flow-map"]),
  title: z.string().min(1).max(80),
  dataRef: z.string().min(1),
  status: z.enum(["ok", "warning", "critical", "unknown"]).optional(),
})
```

이 구조를 쓰면 화면은 데이터에 따라 계속 바뀌지만, 실행 가능한 코드는 frontend bundle 안의 검토된 component로 제한된다.

## 폴더 구조

현재 `frontend/` 구조와 확장 위치:

```text
frontend/
  package.json
  vite.config.ts
  nginx.conf
  Dockerfile
  src/
    app/
      router.tsx
      providers.tsx
      guards.tsx
    features/
      console/
        ui.tsx
        pages/HomePage.tsx
        console.css
    shared/
      lib/
        api.ts
        adapt.ts
        live.ts
        query.ts
        types.ts
        ui-store.ts
      ui/
        index.tsx
        charts.tsx
        status.ts
        app.css
      motion/
        index.tsx
      tokens.css
    features/
      auth/
      org/
      resources/
      fleet/
      cluster/
      repo/
      metrics/
      workflow/
      chat/
      notifications/
  tests/
```

역할:

- `shared/lib/api.ts`: 유일한 HTTP 호출 경계. `/api` prefix와 cookie 포함 fetch를 처리한다.
- `shared/lib/live.ts`: `/api/live/browser` WebSocket 연결과 reconnect 처리를 맡는다.
- `shared/lib/types.ts`: Gateway response를 frontend view model로 읽기 위한 현재 타입 경계다.
- `features/notifications/api.ts`: `/dashboard/rca/timeline`을 소비하는 실제 예시다.
- `features/workflow/WorkflowGraphView.tsx`: @xyflow/react 노드 그래프 실제 구현 위치다.
- `shared/ui/charts.tsx`: Nivo chart wrapper 위치다.
- `shared/motion/index.tsx`: 공통 transition과 reduced motion 처리 위치다.
- feature component는 backend URL 문자열을 직접 만들지 않는다

## API 계약 생성

Frontend 타입은 backend DTO에서 생성한다.

권장 흐름:

```bash
curl -s http://localhost:8000/openapi.json > frontend/openapi.json
npx openapi-typescript frontend/openapi.json -o frontend/src/shared/api/generated.ts
```

생성 파일은 사람이 직접 수정하지 않는다.
route path literal은 가능하면 생성 타입 또는 `shared/api/paths.ts`에 모은다.

Backend에서 route, request, response를 바꾸는 경우 같이 확인할 파일:

- `src/packages/contracts/gateway/routes.py`
- `src/packages/contracts/gateway/requests.py`
- `src/packages/contracts/gateway/responses.py`
- route 구현 파일
- frontend generated type
- Bruno request
- 관련 pytest

## 인증 화면 흐름

초기 boot:

```text
App mounted
  -> GET /auth/session with credentials
  -> 200: authenticated shell
  -> 401: login screen
  -> 429: rate limit state
  -> 5xx: service unavailable state
```

로그인:

```text
Login form
  -> POST /auth/login with email/password and credentials
  -> backend Set-Cookie: service_session=...; HttpOnly
  -> frontend invalidates session query
  -> GET /auth/session
  -> dashboard route
```

로그아웃:

```text
Logout click
  -> POST /auth/logout with credentials
  -> backend deletes service_session
  -> frontend clears query cache
  -> login route
```

Frontend는 login response에서 token을 찾지 않는다.
성공 여부는 `/auth/session` 재조회로 확인한다.

## Dashboard 연결 순서

1. `/auth/session`을 붙인다.
2. `/dashboard/rca/timeline`을 붙인다.
3. `/dashboard/rca/incidents/{incident_id}`를 붙인다.
4. `cluster_id` filter는 query parameter로만 보낸다.
5. response DTO의 `status`와 `current_subject` 기준으로 UI 상태를 만든다.
6. `safe_pr.requested`와 `safe_pr.created`를 구분한다.
7. `command.queued_for_agent`와 `command.completed`를 구분한다.
8. 403은 권한 없음, 404는 볼 수 있는 read model 없음, 409는 이미 처리된 action으로 표시한다.

Dashboard는 raw event payload를 직접 파싱하지 않는다.
`RcaTimelineResponse`와 `RcaIncidentResponse`만 렌더링한다.

## Realtime 연결 순서

Browser WebSocket은 custom `Authorization` header를 안정적으로 붙일 수 없다.
따라서 browser realtime은 cookie session 기준으로 붙인다.

연결:

```text
GET /auth/session
  -> workspace_id 확보
  -> WebSocket /live/browser?workspace_id=<session.workspace_id>
  -> hello
  -> snapshot
  -> live.summary / resource.delta / ping
```

Frontend 규칙:

- token query param을 만들지 않는다.
- `x-agent-token`을 쓰지 않는다.
- workspace_id는 session response에서 가져온다.
- close code `4400`은 잘못된 구독, `4401`은 session/workspace 실패, `1008`은 protocol 위반으로 분리한다.
- reconnect는 exponential backoff를 쓴다.
- reconnect 후에는 snapshot을 다시 권위 상태로 삼는다.
- 데이터가 없는 상태와 stream disconnected 상태를 구분한다.

## Write action 연결

Command:

- `POST /commands`
- session 필요
- backend에서 cluster `deploy.run` 권한 검사
- frontend는 command 버튼을 숨기거나 disabled 할 수 있지만, 실패 처리를 반드시 둔다.

Debug query:

- `POST /agent/debug/query`
- browser session 필요
- backend에서 cluster `evidence.read` 권한 검사
- 이름은 `/agent/...`이지만 browser가 agent token을 쓰는 route가 아니다.

Approval:

- `POST /approvals/{approval_id}/grant`
- `POST /approvals/{approval_id}/reject`
- session 필요
- backend에서 cluster `deploy.run` 권한 검사
- 409는 이미 처리된 approval로 보여준다.

Write action 공통:

- CSRF header를 붙인다.
- optimistic update는 보수적으로 사용한다.
- 실제 완료 상태는 read model 또는 refetch 결과를 따른다.
- 실패를 성공처럼 표시하지 않는다.

## HTTP 상태 처리 기준

Frontend 공통 error mapping:

- `401`: session 없음. login route로 보낸다.
- `403`: 권한 없음. 현재 user가 볼 수 없는 action이다.
- `404`: 존재하지 않거나 권한 필터 후 찾을 수 없는 resource다.
- `409`: 이미 해결된 approval, replay 충돌 같은 상태 충돌이다.
- `422`: request DTO 검증 실패다. form field나 요청 구성 문제로 본다.
- `429`: rate limit이다. 재시도 안내와 cool-down 표시를 둔다.
- `5xx`: backend 장애다. retry와 운영 상태 확인 링크를 둔다.

## 배포 계획

1단계: local dev

- Gateway는 `localhost:8000`
- Frontend는 Vite dev server
- CORS allow origin에 dev origin을 명시한다.
- local HTTP 개발은 `COOKIE_SECURE=0`만 사용한다.

2단계: preview

- preview host에서 frontend와 API를 같은 origin으로 묶는다.
- cookie `Secure`를 켠다.
- CORS dev origin을 preview 환경에 섞지 않는다.

3단계: production

- same-origin reverse proxy를 기본으로 한다.
- static asset은 CDN/cache 가능하지만 API prefix는 backend로 보낸다.
- `/live/browser`는 WebSocket upgrade를 보존한다.
- CSP, secure headers, Origin 검사, CSRF 검증을 켠다.
- agent route는 browser app에서 사용하지 않는다.

## 테스트 계획

Frontend unit test:

- API client가 항상 `credentials: "include"`를 넣는지 확인한다.
- token localStorage helper가 없는지 확인한다.
- session 401에서 login route로 가는지 확인한다.
- dashboard 403/404/409 상태가 구분되는지 확인한다.
- realtime close code별 UI 상태가 구분되는지 확인한다.

Frontend integration test:

- login 성공 후 `/auth/session`을 재조회한다.
- timeline empty state와 ready state를 확인한다.
- incident detail 404를 확인한다.
- command/approval action에서 403과 409를 확인한다.

Backend 연결 테스트:

- `tests/test_identity_auth_routes.py`
- `tests/test_auth_security.py`
- `tests/test_dashboard_router.py`
- `tests/test_realtime_gateway.py`
- `tests/test_gitops_approval_router.py`
- `tests/test_command_router.py`

문서/계약 변경 후 최소 확인:

```bash
uv run pytest tests/test_docs_index.py tests/test_auth_security.py tests/test_dashboard_router.py tests/test_realtime_gateway.py -q
```

## 완료 기준

Frontend framework가 준비됐다고 말하려면 아래를 모두 만족해야 한다.

- session token 원문이 frontend 코드, storage, URL, log에 남지 않는다.
- 모든 API 호출이 공통 client를 통하고 `credentials: "include"`를 사용한다.
- `/auth/session` 기반 SessionProvider가 있다.
- dashboard는 `RcaTimelineResponse`와 `RcaIncidentResponse`만 렌더링한다.
- browser websocket은 `/live/browser`에 cookie session으로 연결한다.
- `x-agent-token`은 browser bundle, env, response, localStorage 어디에도 없다.
- write API는 CSRF 방어를 통과해야 호출된다.
- backend 401/403/404/409/422/429/5xx가 서로 다른 UI 상태로 처리된다.
- production 배포는 same-origin reverse proxy를 기본값으로 둔다.
- frontend에서 버튼을 숨겨도 backend 권한 실패를 반드시 처리한다.

## 확장 원칙

새 화면을 추가할 때 순서:

1. backend route와 DTO가 있는지 확인한다.
2. 없으면 `src/packages/contracts/gateway`와 route test부터 만든다.
3. frontend generated type을 갱신한다.
4. feature API wrapper를 추가한다.
5. 화면 상태를 추가한다.
6. 401/403/404/409 처리를 확인한다.
7. 필요한 경우 realtime은 snapshot 우선으로 붙인다.

이 순서를 지키면 frontend가 backend 내부 event, DB, token, queue 구조에 묶이지 않는다.
결과적으로 화면은 단순해지고, 권한과 운영 위험은 Gateway와 worker 경계 안에 남는다.
