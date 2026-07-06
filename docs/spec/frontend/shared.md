---
source_commit: 664925a6
status: synced
---

# shared — API 클라이언트·타입·실시간 스토어·UI 프리미티브·모션·그래프·토큰

> 소스: `frontend/src/shared/`

## 책임 (Responsibility)

- **lib/**: API 접근 단일 지점(`api.ts`), React Query 클라이언트(`query.ts`), WS 실시간 스냅샷 스토어(`live.ts`), UI 전역 상태(`ui-store.ts`), 백엔드 계약 수기 타입(`types.ts`), 실백엔드 응답 정규화 어댑터(`adapt.ts`), 포맷터(`format.ts`), mock 라우터·픽스처(`mock/`).
- **ui/**: 공용 프리미티브 컴포넌트(`index.tsx`), 상태→색 매핑(`status.ts`), SVG 아이콘(`icons.tsx`), nivo 차트 래퍼(`charts.tsx`), 컴포넌트 스타일(`app.css`).
- **ui/plan-diff.tsx**: 워크플로 승인 전에 diff-worker의 3-way plan 변경 목록을 필드 단위로 보여주는 공용 미리보기 컴포넌트.
- **flow/**: ReactFlow 그래프 공통 모듈(dagre 자동 배치, 애니메이션 edge, 접기 그룹 노드, 캔버스 래퍼).
- **motion/**: 모션 프리미티브(뷰에서 인라인 `animate` 금지 — 여기서만).
- **tokens.css**: 디자인 토큰 정본(hex 직접 사용 금지).
- 뷰/피처는 직접 `fetch` 를 호출하지 않는다(D5) — 반드시 `lib/api.ts` 경유.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import ← | [app](./app.md), [features/*](auth.md) | — | 이 모듈의 소비자 (shared 는 features 를 import 하지 않는다) |
| 외부 | `@tanstack/react-query`, `zustand`, `motion/react`, `@nivo/line`, `@nivo/treemap`, `@xyflow/react`, `@dagrejs/dagre`, `react-router-dom` | — | 상태·모션·차트·그래프 |
| 백엔드 | HTTP `${VITE_API_BASE}/*` | [api-gateway](../services/gateway-api-gateway.md) | 모든 REST 호출 |
| 백엔드 | WS `/api/live/browser` | [realtime-gateway](../services/realtime-realtime-gateway.md) | `LiveSnapshot` 스트림 |

---

## API 클라이언트 (`lib/api.ts`)

| 심볼 | 앵커 | 시그니처/내용 |
|---|---|---|
| `ApiErrorKind` | `frontend/src/shared/lib/api.ts :: ApiErrorKind` | `'unauthorized' \| 'forbidden' \| 'not_found' \| 'invalid' \| 'rate_limited' \| 'server' \| 'network'` |
| `ApiError` | `frontend/src/shared/lib/api.ts :: ApiError` | `class extends Error { kind; status; detail; constructor(status: number, detail: string) }` — kind 매핑: 401→unauthorized, 403→forbidden, 404→not_found, 422/409→invalid, 429→rate_limited, ≥500→server, 그 외→network |
| `API_MODE` | `frontend/src/shared/lib/api.ts :: API_MODE` | `(import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'real')` — **기본 real**. mock 은 `VITE_API_MODE=mock` 을 명시한 빌드에서만(우발적 페이크 차단, dev 기본은 `frontend/.env.development`) |
| `setUnauthorizedHandler` | `frontend/src/shared/lib/api.ts :: setUnauthorizedHandler` | `(fn: () => void) => void` — 모듈 변수 `onUnauthorized` 등록 |
| `api` | `frontend/src/shared/lib/api.ts :: api` | `async <T>(method: string, path: string, body?: unknown): Promise<T>` |
| `get` / `post` / `put` / `del` | `frontend/src/shared/lib/api.ts :: get` 등 | `api` 의 메서드 커링 (`del` 은 DELETE) |

`api()` 동작:

1. `API_MODE === 'mock'` → `mockRequest<T>(method, path, body)` 로 위임(네트워크 없음).
2. real: `fetch(`${BASE}${path}`, { method, credentials: 'include', headers: body ? {'content-type':'application/json'} : undefined, body: JSON.stringify(body) })`. `BASE = import.meta.env.VITE_API_BASE ?? '/api'`.
3. fetch 예외 → `throw new ApiError(0, '네트워크 오류')`.
4. `!res.ok`: 401 이면 `onUnauthorized?.()` 먼저 호출. detail 은 `res.json().detail ?? res.statusText`(파싱 실패 시 statusText). `throw new ApiError(res.status, String(detail))`.
5. 204 → `undefined as T`, 그 외 → `res.json()`.

**인증 토큰 처리**: Authorization 헤더 없음 — 세션 쿠키 기반(`credentials: 'include'`). 401 처리는 핸들러 콜백([app/providers](./app.md#providers--frontendsrcappproviderstsx--providers)가 세션 쿼리 무효화)으로 위임한다.

## QueryClient (`lib/query.ts`)

`frontend/src/shared/lib/query.ts :: queryClient`

```ts
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: (n, err) => n < 1 && (err as {kind?:string}).kind === 'network' } },
});
```

— 기본 staleTime 10s, 재시도는 network 오류에 한해 1회.

## 실시간 (`lib/live.ts`)

| 심볼 | 앵커 | 내용 |
|---|---|---|
| `liveStore` | `frontend/src/shared/lib/live.ts :: liveStore` | zustand `create<LiveState>` |
| `startLive` | `frontend/src/shared/lib/live.ts :: startLive` | `() => void` — 모듈 플래그 `started` 로 1회만 실행 |

`LiveState` (비공개 interface):

```ts
{ status: 'connecting'|'open'|'closed';
  snapshot: LiveSnapshot | null;
  history: { at: number; restarts: number; running: number }[];   // 최대 900포인트 유지(slice(-899) + 신규)
  apply: (s: LiveSnapshot) => void;
  applyCounts: (restarts: number, running: number) => void;
  setStatus: (s: status) => void }
```

- `apply(snapshot)`: 전체 pods 를 flat 하여 `restarts` 합·`phase==='Running'` 수를 `history` 포인트(`at: Date.now()`)로 추가.
- `applyCounts(restarts, running)`: 스냅샷 없이 집계 숫자만 history 포인트로 추가 — 게이트웨이의 `live.summary` 경량 메시지용.
- `startLive()` 동작:
  - **mock**: status 'open', 1초 `setInterval` 로 `workloadsByCluster['target']` 기반 가짜 `LiveSnapshot` 생성 — pods 는 `{name, phase, hot: p.hot ?? false, restarts: p.restarts + (hot ? floor(tick/5) : 0)}`, `namespaces: [{namespace:'sandbox', pods}]`, `rollout` 은 `tick % 40 < 20` 일 때 `{ name:'checkout-api', progress: min(100, (tick%20)*10) }`.
  - **real**: 내부 `async connect(attempt)` — 먼저 비공개 `currentWorkspaceId()`(GET `/api/auth/session` 직접 fetch, 실패 시 `'default'`)로 워크스페이스를 알아낸 뒤 `new WebSocket(`${wss|ws}://${location.host}/api/live/browser?workspace_id=<id>`)` (https→wss). `onopen`→'open'; `onmessage`→`JSON.parse` 후 분기: `type === 'live.summary'` 면 `applyCounts(summary.restart_delta, summary.pods_ready)`, `namespaces` 필드가 있으면 전체 스냅샷으로 `apply`(그 외/파싱 실패는 무시); `onclose`→'closed' 후 `min(15000, 1000*2^attempt) * (0.7 + random*0.6)` ms 지터 백오프 재연결. 구독 채널은 이 단일 소켓 하나뿐이다 → [realtime-gateway](../services/realtime-realtime-gateway.md).

## UI 전역 상태 (`lib/ui-store.ts`)

`frontend/src/shared/lib/ui-store.ts :: uiStore` — zustand:

```ts
{ sidebarOpen: boolean (초기 true); toggleSidebar(): void;
  toasts: { id: number; tone: string; title: string }[];
  toast(tone, title): void;   // 모듈 seq 증가 id, 3500ms 후 자동 제거
  dismiss(id): void }
```

## 타입 (`lib/types.ts`)

백엔드 계약 수기 타입(백엔드 연동 시 openapi 코드젠 전환 예정). 모두 `frontend/src/shared/lib/types.ts :: <이름>` 앵커.

| 타입 | 필드 |
|---|---|
| `Tone` | `'ok' \| 'warn' \| 'danger' \| 'info' \| 'neutral'` |
| `Session` | `authenticated: boolean; user_id: string; email?: string; workspace_id: string; roles: string[]` |
| `Cluster` | `cluster_id; name; environment; connection_status: 'connected'\|'disconnected'\|'unknown'; node_count; pod_count; incident_count; registered_at` |
| `ClusterSummary` | `cluster_id; namespaces: string[]; nodes: NodeInfo[]; pod_phases: Record<string, number>; services: number` |
| `NodeInfo` | `name; ready: boolean; pod_count; version; cpu_ratio?; mem_ratio?` |
| `Workload` | `name; kind; namespace; ready: string; restarts: number; image; node?; phase; hot?; workload_name?` — `workload_name` 은 인벤토리 summary 의 owner_name(디플로이먼트 그룹핑 키) |
| `InventoryResource` | `kind; namespace: string \| null; name; status; age; raw?: unknown` |
| `ServiceInfo` | `name; namespace; type; cluster_ip; ports` |
| `K8sEvent` | `at; type; reason; target; message` |
| `Application` | `application_id; name; repo_ref; branch; cluster_id; manifest_path; last_run_status?; last_deployed_at?` |
| `WorkflowRun` | `run_id; application_id; commit_sha; status; current_step; started_at; steps: RunStep[]; approval_id?; safe_pr?: SafePr` |
| `RunStep` | `name; status; detail?; resource?; changes?: PlanChange[]` |
| `PlanChange` | `field_path; classification; before?; after?` — diff-worker 3-way 비교 결과를 워크플로 단계 미리보기에 표시할 때 사용 |
| `SafePr` | `status; pr_url?; explanation?; diff_before?; diff_after?; error?` |
| `Deployment` | `cluster_id; namespace; name; image; replicas: number; status` |
| `Conversation` | `conversation_id; title; status: 'idle'\|'waiting'; updated_at; messages: ChatMessage[]` |
| `ChatMessage` | `message_id; role: 'user'\|'assistant'; status?; content; created_at; tool_calls?: {name; args; status: Tone}[]; actions?: {plan_id; options: {action_id; label; risk: Tone; impact}[]; selected?}; approval_ref?: {approval_id; summary; resolved?: 'granted'\|'rejected'}` |
| `Incident` | `incident_id; cluster_id; summary; stage; at` |
| `DeadLetter` | `id: number; original_subject; consumer; error; status; created_at` |
| `Org` | `org_id; name; description; member_count; group_count; created_at` |
| `Group` | `group_id; org_id; name; member_count` |
| `User` | `user_id; email; role; status: 'active'\|'pending_verification'\|'pending_approval'; groups: string[]; created_at` |
| `AccessGrant` | `access_id; subject_type: 'user'\|'group'; subject_label; resource_type; resource_id; role; granted_at` |
| `Notice` | `id; kind: 'approval'\|'incident'\|'dlq'\|'cluster'; tone: Tone; title; at; link; read: boolean` |
| `IncidentDetail` | `incident_id; cluster_id; status; current_subject; summary; root_cause: string\|null; confidence: number\|null; supporting_evidence: string[]; missing_evidence: string[]; action_route: string\|null; command_id: string\|null; pr_url: string\|null; error_reason: string\|null; updated_at` |
| `LiveSnapshot` | `at; connected: boolean; namespaces: { namespace; pods: {name; phase; restarts; hot: boolean}[] }[]; rollout?: {name; progress: number}` |
| `CatalogItem` | `item_id; name; description; category` |

## 어댑터 (`lib/adapt.ts`)

실백엔드 응답 → 프론트 타입 정규화. 누락 필드는 안전 기본값으로 채워 렌더 크래시를 방지한다. mock 은 이미 프론트 형태라 그대로 통과.

| 심볼 | 앵커 | 규칙 |
|---|---|---|
| `adaptCluster` | `frontend/src/shared/lib/adapt.ts :: adaptCluster` | `(raw: Record<string,unknown>) => Cluster`. `name ?? cluster_id`, `environment ?? 'unknown'`, `connection_status ?? 'unknown'`, 수치 기본 0, `registered_at ?? created_at ?? now` |
| `adaptInventorySummary` | `frontend/src/shared/lib/adapt.ts :: adaptInventorySummary` | `=> ClusterSummary`. `raw.latest_snapshot.summary`(이중 중첩 `summary.summary` 도 허용)에서 namespaces/nodes/pod_phases/services 추출. 노드는 비공개 `adaptNodeSummary` 로 필드별 안전 변환 |
| `adaptWorkloadResource` | `frontend/src/shared/lib/adapt.ts :: adaptWorkloadResource` | 인벤토리 pod 리소스(`summary` 포함) `=> Workload`. `kind = summary.owner_kind ?? kind ?? 'Pod'`, `restarts = summary.restart_total`, `image = summary.image ?? containers[].image`, `workload_name = summary.owner_name ?? name`, `hot = (health === 'degraded')` |
| `adaptServiceResource` | `frontend/src/shared/lib/adapt.ts :: adaptServiceResource` | `=> ServiceInfo`. `summary.ports[]` 를 `'<port>/<protocol>'` join, `type = summary.type ?? status`, `cluster_ip = summary.cluster_ip` |
| `adaptK8sEventResource` | `frontend/src/shared/lib/adapt.ts :: adaptK8sEventResource` | `=> K8sEvent`. `at = last_timestamp ?? first_timestamp ?? observed_at ?? created_at`, `target = '<involved_kind>/<involved_name>'` |
| `adaptInventoryResource` | `frontend/src/shared/lib/adapt.ts :: adaptInventoryResource` | `=> InventoryResource`. `status ?? health ?? 'unknown'`, `age = observed_at ?? created_at`, `raw = raw ?? summary` |
| `adaptApplication` | `frontend/src/shared/lib/adapt.ts :: adaptApplication` | `=> Application`. `name ?? application_id`, `repo_ref ?? metadata.repo_ref`, `branch ?? default_branch ?? metadata.branch ?? 'main'` |
| `adaptDeployment` | `frontend/src/shared/lib/adapt.ts :: adaptDeployment` | `=> Deployment`. `namespace ?? 'sandbox'`, `name ?? app_name`, 수치 기본 0, `status ?? 'unknown'` |
| `adaptRun` | `frontend/src/shared/lib/adapt.ts :: adaptRun` | `=> WorkflowRun`. `run_id ?? workflow_run_id`, `status` 는 `?? 'unknown'` 후 **대문자화**, `started_at ?? created_at`, `steps` 배열 아니면 `[]`, `approval_id ?? metadata.approval_id`. 각 step 은 `adaptRunStep`으로 정규화한다. mock 형태(`detail`이 있거나 `message/details`가 없음)는 그대로 통과하고, 실백엔드 형태(`name/status/message/details`)는 비공개 `STEP_NAME_MAP` 으로 콘솔 단계 이름에 매핑한다(git→STARTED, render→RENDERING, diff→DIFFING, policy→POLICY_CHECKING, approval/safe_pr→WAITING_FOR_APPROVAL, apply→APPLYING, health→ROLLOUT_WAITING, 미등록 이름은 대문자화). `details.resource`(+`details.namespace` 접미)는 `resource`, `details.changes[]`는 `changes`로 옮긴다. |
| `adaptIncident` | `frontend/src/shared/lib/adapt.ts :: adaptIncident` | `=> Incident`. summary 우선순위: `root_cause`(단 `'unknown'` 제외) → `error_reason` → `current_subject` → `'인시던트'`. `incident_id ?? correlation_id`, `stage = current_subject ?? status`, `at = at ?? updated_at` |
| `adaptIncidentDetail` | `frontend/src/shared/lib/adapt.ts :: adaptIncidentDetail` | `=> IncidentDetail`. `adaptIncident` 기반 + `status ?? stage ?? 'open'`, null 정규화(`''`→null), `confidence` 는 number 일 때만, evidence 배열은 `Array.isArray` 검사 후 `map(String)` |
| `adaptConversationSummary` | `frontend/src/shared/lib/adapt.ts :: adaptConversationSummary` | `=> Omit<Conversation,'messages'>`. `title ?? '대화'`, `status` 는 `'waiting'` 만 인정, 아니면 `'idle'` |

## 포맷터 (`lib/format.ts`)

| 심볼 | 앵커 | 시그니처 |
|---|---|---|
| `timeAgo` | `frontend/src/shared/lib/format.ts :: timeAgo` | `(iso: string) => string` — `N초 전`/`N분 전`/`N시간 전`/`N일 전` (음수는 0 클램프) |
| `shortSha` | `frontend/src/shared/lib/format.ts :: shortSha` | `(sha: string) => string` — 앞 7자 |

## Mock 라우터 (`lib/mock/router.ts`)

`frontend/src/shared/lib/mock/router.ts :: mockRequest`

```ts
export async function mockRequest<T>(method: string, pathWithQuery: string, body?: unknown): Promise<T>
```

- 180ms 지연 후 `(method, 경로 패턴)` 테이블 매칭. 패턴 세그먼트 `:name` → params. 미매칭 시 `ApiError(404, 'mock 경로 없음: …')`.
- GET 결과는 `structuredClone` 으로 깊은 복사(React Query 변경 감지 보장, 실백엔드 직렬화와 동형).
- mock 세션은 `localStorage['mock:session']` 지속(새로고침/딥링크에서 로그인 유지).
- 상태(`state`): fixtures 를 `structuredClone` 한 `conversations/users/orgs/groups/grants/runsByApp/deadLetters` + `session` + `commands`(Map — 발행된 debug query 명령의 `cluster_id/correlation_id/queued_at`).

라우트 테이블(실제 계약 docs/fd/06 과 동일 경로, [api-gateway](../services/gateway-api-gateway.md) 참조):

| 메서드 | 경로 | 특이 동작 |
|---|---|---|
| GET | `/auth/session` | `state.session ?? { authenticated:false }` |
| POST | `/auth/login` | `teammate@example.com` → 403 `'account approval required'`; `password.length < 8` → 401; 성공 시 `roles: email.startsWith('admin') ? ['service_admin'] : ['user']`, localStorage 저장 |
| POST | `/auth/logout` | 세션 제거, `{accepted:true}` |
| POST | `/auth/signup` | `{accepted:true, verification_required:true}` |
| POST | `/auth/resend-verification` | `{accepted:true, verification_required:true}` |
| POST | `/auth/users/:userId/approve` | 유저 status→'active' (없으면 404) |
| GET | `/clusters` · `/clusters/:id` · `/clusters/:id/connection-status` | fixtures. connection-status 는 항상 `'connected'` |
| GET | `/clusters/:id/inventory/summary` | **실 backend 계약과 동형** envelope `{cluster_id, latest_snapshot: {snapshot_id, status, summary: summaryOf(id)}, counts}` — adapt.ts 는 실 계약만 해석하므로 mock 이 프론트 최종 형태를 직접 주면 화면이 빈 값으로 붕괴한다 |
| GET | `/clusters/:id/usage` | 실 계약과 동형 — 30s 간격 24개 `{sampled_at, usage: {pod_total/pod_running/pod_pending/pod_failed/restart_total/node_total/node_ready}}` 샘플 생성 |
| GET | `/clusters/:id/inventory/workloads` | fixtures 그대로(레거시 경로 — 콘솔 훅은 이제 `resources?resource_type=pod` 를 사용) |
| GET | `/clusters/:id/inventory/resources` | `?resource_type=` 필터. `pod` 면 workloads 픽스처를 pod 리소스 형태(`summary: {phase, ready, restart_total, image, node_name, owner_kind, owner_name}`)로 변환, 그 외는 `fx.resources` 를 `{resource_type, kind, namespace, name, status, observed_at}` 로 변환 |
| GET | `/clusters/:id/inventory/services` · `/events` | `resources[]` + `summary` 실 계약 형태(서비스: type/cluster_ip/ports[], 이벤트: type/reason/message/involved_kind/involved_name/last_timestamp) |
| POST | `/clusters/:id/namespaces/:ns/deployments/:name/scale` · `/restart` | `{accepted:true}` |
| PUT | `/clusters/:id/policy` | `{accepted:true}` |
| POST | `/targets` | `{registered, applied:false, agent_token:'agt_…', install_command:'curl -fsSL <origin>/api/install/<token> \| kubectl apply -f -', install_manifest:'…'}` |
| GET | `/providers/catalog` | 실백엔드와 동형 category별 객체 `{providers: {cloud:[existing-k8s], deploy:[manual-manifest], source:[github], secret:[env]}}` (각 항목 `status:'available'`) |
| POST | `/providers/validate` | `{valid:true, errors:[], warnings:[]}` |
| GET/POST | `/applications`, GET `/applications/:id` `/deployments` `/runs` | fixtures/state |
| GET | `/catalog/items` · POST `/catalog/items/:id/installs` | fixtures / `{accepted:true}` |
| POST | `/approvals/:id/grant` · `/reject` | `resolveApproval` — `WAITING_FOR_APPROVAL` run 을 APPLYING/FAILED 로 전이, steps 갱신, chat `approval_ref.resolved` 세팅 |
| GET/POST | `/ai/conversations`(목록은 messages 제외) · `/ai/conversations/:id` · `:id/messages` | 유저 메시지 추가 후 `scheduleAssistant`: 2.5s 뒤 assistant 응답(+`tool_calls`) 추가, status idle |
| POST | `/rca/recovery-plans/:planId/actions/:actionId/select` | 해당 plan 의 `actions.selected` 세팅 |
| GET | `/dashboard/rca/timeline` · `/dashboard/rca/incidents/:id` | fixtures `incidents` |
| GET | `/dead-letters` · POST `/dead-letters/:id/replay` | status→'replayed' |
| POST | `/agent/debug/query` | `state.commands` 에 명령 저장 후 `{accepted, command_id:'cmd-…', correlation_id}` |
| GET | `/commands/:id` | 실 계약과 동일한 명령 상태 폴링 — 발행 후 1.5s 미만이면 `running`, 이후 `completed` + prometheus matrix 형태 데모 result(`result.results.console_promql.series[]`). 미발행 id 는 404 |
| GET/POST/DELETE | `/orgs`(DELETE 는 그룹 존재 시 422 `'groups_exist'`) · `/groups` · `/groups/:id/members(/:userId)` · `/users`(`?status`) · `/access`(`?resource_id`) · `/access/:id` | 갭 API G1~G5·G10 계약 초안 |

## Mock 픽스처 (`lib/mock/fixtures.ts`)

모두 `frontend/src/shared/lib/mock/fixtures.ts :: <이름>` 앵커. 데모 전용(`VITE_API_MODE=mock`).

| 심볼 | 내용 |
|---|---|
| `clusters` | 3개: `target`(sandbox, connected, node 3/pod 24/incident 1), `cluster-1`(prod-seoul, production), `cluster-2`(staging, disconnected) |
| `workloadsByCluster` | 클러스터별 `mkPods(node, n, ns)` 생성 팟 — `i%7===3` 이면 CrashLoopBackOff·ready '0/1'·restarts 6·hot, `i%11===5` 이면 Pending. target: node-1×9(sandbox)+node-2×8(target)+node-3×7(kube-system) |
| `summaryOf` | `(clusterId: string) => ClusterSummary` — 팟에서 노드/네임스페이스/phase 집계. cluster-2 는 노드 not ready. cpu_ratio `0.35+i*0.18`, mem_ratio `0.5+i*0.1`, version 'v1.31.2', services 6 |
| `resources` / `services` / `events` | 인벤토리 샘플 (Deployment/ConfigMap/Node, checkout-api·prometheus 서비스, BackOff·ScalingReplicaSet 이벤트) |
| `applications` | `app-checkout`(WAITING_FOR_APPROVAL), `app-cart`(SUCCEEDED) |
| `runsByApp` | `mkRun` 생성 — STEPS `['STARTED','RENDERING','DIFFING','POLICY_CHECKING','WAITING_FOR_APPROVAL','APPLYING','ROLLOUT_WAITING','SUCCEEDED']` 기준 step status 계산. DIFFING 스텝에는 실백엔드 diff-worker 3-way plan 산출물과 동형인 `resource`(`'deployment/checkout-api · sandbox'`)와 `changes[]`(intended_change/adoption_required/drift/already_converged 4건 — PlanDiff 미리보기용) 포함. run-1(WAITING_FOR_APPROVAL, approval_id 'apr-1'), run-3(SUCCEEDED + `safe_pr`: pr_url·explanation·diff before/after), run-2(FAILED — index 3 스텝 FAILED) |
| `deploymentsByApp` | 앱별 Deployment 1건씩 |
| `conversations` | conv-1: 유저 질문 + tool_calls 포함 assistant 분석 + `actions`(plan-1: act-1 memory 상향/act-2 rollout restart) |
| `incidents` | inc-1: `sandbox-pod-13 CrashLoopBackOff`, stage 'recovery.planned' |
| `deadLetters` | id 1: manifest.rendered / diff-worker / open |
| `orgs` / `groups` / `users` / `grants` | org-1 Platform; grp-1 sre·grp-2 dev; u-1 admin(service_admin)·u-2 일반·u-3 pending_approval(teammate@example.com); cluster/application 권한 2건 |
| `catalogItems` | nginx-ingress(networking), sample-web(app) |
| `nowIso` | `() => new Date().toISOString()` |

---

## UI 프리미티브 (`ui/index.tsx`)

뷰는 이 모듈과 [motion](#모션-motionindextsx) 만 사용한다. 모두 `frontend/src/shared/ui/index.tsx :: <이름>` 앵커.

| 컴포넌트 | Props | 비고 |
|---|---|---|
| `Button` | `{ variant?: 'primary'\|'secondary'\|'ghost'\|'danger'; size?: 'sm'; loading?: boolean } & ButtonHTMLAttributes` | loading 시 disabled + `'…'` 표시. 기본 variant 'secondary' |
| `Badge` | `{ status?: string; tone?: Tone; children?: ReactNode }` | `tone ?? toneOf(status)` 로 색 결정, `.dot` 포함. children 없으면 status 표시 |
| `Card` | `{ title?: ReactNode; actions?: ReactNode; children; style? }` | title/actions 있으면 헤더 행 렌더 |
| `StatBox` | `{ label: string; value: number; tone?: Tone }` | 값은 `CountUp` 애니메이션 |
| `Column<T>` (interface) | `{ key: string; label: string; render: (row: T) => ReactNode; width?: string }` | `ResourceTable` 열 정의 |
| `ResourceTable<T>` | `{ columns: Column<T>[]; rows: T[]; rowKey: (r) => string; onRowClick?; empty?: ReactNode }` | rows 비면 `empty ?? EmptyState(IconFile)`. 바디는 `AnimatePresence` + `AnimatedRow`(키 기반 layout 애니메이션). onRowClick 있으면 `.clickable` |
| `Tabs` | `{ items: {key; label; badge?: number}[]; current: string; onChange: (k) => void }` | `role="tablist"`, badge 는 `(n)` 접미 |
| `Modal` | `{ open: boolean; title: string; onClose; children; size?: 'lg' }` | Escape 로 닫기, 백드롭 클릭 닫기, 내부 클릭 stopPropagation. open false 면 null |
| `Drawer` | `{ open; title: ReactNode; onClose; children }` | 우측 고정 aside + 반투명 백드롭 |
| `EmptyState` | `{ icon: ReactNode; title: string; description?: string; action?: ReactNode }` | |
| `Skeleton` | `{ lines?: number }` (기본 3) | 줄별 width `90 - i*12`% |
| `QueryBoundary<T>` | `{ query: UseQueryResult<T>; children: (data: T) => ReactNode; skeletonLines?: number }` | isPending→Skeleton(기본 4줄); isError→`EmptyState`(kind 별 메시지: forbidden '접근 권한이 없습니다' / unauthorized '다시 로그인해주세요' / network '네트워크 오류' / 기타 `detail`) + "다시 시도" refetch 버튼 |
| `Field` | `{ label: string; error?: string; children }` | error 는 `role="alert"` |
| `KeyValue` | `{ pairs: [string, ReactNode][] }` | `dl.kv` 그리드 |
| `CodeBlock` | `{ code: string }` | 우상단 "복사"(clipboard.writeText) |
| `Avatar` | `{ name: string }` | 문자코드 합 % 360 → `oklch(75% 0.14 hue)` 배경, 앞 2자 대문자 |
| `Breadcrumbs` | `{ items: { label: string; to?: string }[] }` | to 있으면 Link |
| `Stepper` | `{ steps: string[]; current: number }` | `i < current` done / `i === current` now |
| `Toasts` | (없음) | `uiStore.toasts` 구독, `aria-live="polite"`, 좌측 보더 `toneColor(tone)` |
| `SearchInput` | `{ value: string; onChange: (v) => void; placeholder? }` | `/` 키(포커스가 body 일 때)로 포커스. 기본 placeholder `'검색 ( / )'`, maxWidth 320 |
| `useSearchFilter<T>` (훅) | `(rows: T[], pick: (r) => string) => [T[], string, (v) => void]` | 소문자 includes 필터 |

## PlanDiff (`ui/plan-diff.tsx`)

`frontend/src/shared/ui/plan-diff.tsx :: PlanDiff`

```tsx
export function PlanDiff({ changes, resource }: { changes: PlanChange[]; resource?: string })
```

- 입력은 `RunStep.changes` 그대로 사용한다. 프론트에서 임의로 diff를 만들지 않는다.
- `classification === 'already_converged'` 항목은 적용 대상이 아니므로 목록에서 접고, 하단에 "이미 일치 N건"으로 표시한다.
- 나머지는 `field_path`, `before`, `after`를 한 줄씩 보여준다.
- 표시 기호: `adoption_required`는 `+`, `intended_change`는 `~`, `drift`는 `!`, `conflict_or_manual_change`는 경고 기호, 그 외는 `~`.
- 사용 위치: [repo](./repo.md)의 run 승인 카드 아래, [workflow](./workflow.md)의 승인 카드와 단계 상세 패널.

## 상태 어휘 (`ui/status.ts`)

| 심볼 | 앵커 | 내용 |
|---|---|---|
| `toneOf` | `frontend/src/shared/ui/status.ts :: toneOf` | `(status: string) => Tone` — 미등록 상태는 `'neutral'` |
| `toneColor` | `frontend/src/shared/ui/status.ts :: toneColor` | `(tone: Tone) => string` — `` `var(--${tone})` `` |

상태→tone 매핑(단일 출처):

- **ok**: `SUCCEEDED, healthy, Running, granted, completed, connected, active, ready, created, done`
- **info**: `STARTED, RENDERING, DIFFING, APPLYING, ROLLOUT_WAITING, progressing, running, leased, waiting, patch_prepared`
- **warn**: `POLICY_CHECKING, WAITING_FOR_APPROVAL, degraded, Pending, requested, queued, pending_approval, pending_verification, disconnected`
- **danger**: `FAILED, unhealthy, CrashLoopBackOff, rejected, failed, open`

## 아이콘 (`ui/icons.tsx`)

이모지 금지 원칙에 따른 공용 SVG 아이콘. 공통 props `IconProps = SVGProps<SVGSVGElement> & { size?: number }` (기본 size 20, viewBox 24, `stroke: currentColor`, strokeWidth 1.8, `aria-hidden`).

export: `IconCheckCircle`, `IconAlertTriangle`, `IconClock`, `IconBell`, `IconFlame`, `IconFile`, `IconChevronRight`, `IconCheck`, `IconLock` — 각각 `frontend/src/shared/ui/icons.tsx :: Icon<이름>`.

## 차트 (`ui/charts.tsx`)

nivo 를 이 파일 밖으로 노출하지 않는다(교체 용이).

| 심볼 | 앵커 | 시그니처/내용 |
|---|---|---|
| `HeatNode` | `frontend/src/shared/ui/charts.tsx :: HeatNode` | `{ id: string; label: string; value: number; score: number }` |
| `heatColor` | `frontend/src/shared/ui/charts.tsx :: heatColor` | `(score: number) => string` — 0(위험)~1(건강)을 `color-mix(in oklab, …)` 로 `--heat-bad → --heat-mid → --heat-good` 보간(0.5 기준 2구간) |
| `TreemapChart` | `frontend/src/shared/ui/charts.tsx :: TreemapChart` | `{ nodes: HeatNode[]; onTileClick?: (id: string) => void }` — `ResponsiveTreeMap`, `leavesOnly`, 타일색 `heatColor(score)`, 커스텀 tooltip `"{label} · 건강도 N%"`, 컨테이너 `data-testid="treemap"` minHeight 320 |
| `Series` | `frontend/src/shared/ui/charts.tsx :: Series` | `{ id: string; data: { x: number\|string; y: number }[] }` |
| `TimeSeriesChart` | `frontend/src/shared/ui/charts.tsx :: TimeSeriesChart` | `{ series: Series[]; height?: number }` (기본 220) — `ResponsiveLine`, point scale, 색 `[--info, --ok, --warn]`, `animate={false}`, useMesh |
| `Sparkline` | `frontend/src/shared/ui/charts.tsx :: Sparkline` | `{ points: number[] }` — 100×30 SVG path, stroke `--info` |

## 모션 (`motion/index.tsx`)

모든 컴포넌트는 `useReducedMotion()` 존중(reduce 시 애니메이션 없이 children 그대로). `AnimatePresence` 를 re-export 한다.

| 심볼 | 앵커 | Props/동작 |
|---|---|---|
| `FadeSlideIn` | `frontend/src/shared/motion/index.tsx :: FadeSlideIn` | `{ children; delay?: number; dir?: 'up'\|'left' }` — opacity 0→1 + 8px 슬라이드, 0.2s ease `[0.16,1,0.3,1]` |
| `Stagger` | `frontend/src/shared/motion/index.tsx :: Stagger` | `{ children: ReactNode[] }` — 항목별 `min(i,8) * 0.04s` 지연 FadeSlideIn |
| `CountUp` | `frontend/src/shared/motion/index.tsx :: CountUp` | `{ value: number }` — rAF 350ms cubic ease-out 카운트, `toLocaleString()` |
| `PressScale` | `frontend/src/shared/motion/index.tsx :: PressScale` | tap 0.97 / hover 1.01, `display: contents` |
| `LayoutMorph` | `frontend/src/shared/motion/index.tsx :: LayoutMorph` | `{ id: string; children }` — `layoutId` morph 0.35s |
| `AnimatedList<T>` | `frontend/src/shared/motion/index.tsx :: AnimatedList` | `{ items: T[]; getKey: (item) => string; children: (item) => ReactNode }` — 키 기반 layout + enter(y 6)/exit(scale 0.98) |
| `AnimatedRow` | `frontend/src/shared/motion/index.tsx :: AnimatedRow` | `{ children; className?; onClick? }` — `motion.tr` layout fade, `ResourceTable` 전용 |
| `PulseOnChange` | `frontend/src/shared/motion/index.tsx :: PulseOnChange` | `{ signal: string\|number\|undefined; children }` — signal 변경마다 1회 scale 1.35→1 pulse. 최초 수신은 조용히(ref 가드) |

## 그래프 공통 (`flow/index.tsx`, `flow/flow.css`)

모든 그래프 뷰는 이 모듈만 사용(노드 좌표 하드코딩 금지). `@xyflow/react` 스타일시트와 `flow.css` 를 import 한다.

| 심볼 | 앵커 | 내용 |
|---|---|---|
| `FlowDirection` | `frontend/src/shared/flow/index.tsx :: FlowDirection` | `'LR' \| 'TB'` |
| `useAutoLayout` | `frontend/src/shared/flow/index.tsx :: useAutoLayout` | `(nodes: Node[], edges: Edge[], direction = 'LR') => { nodes; edges }` — dagre(`nodesep 28, ranksep 60, margin 12`)로 좌표 계산. 노드 크기는 `measured ?? width/height ?? 168×48`. source/target Position 을 방향에 맞게 설정. `useMemo` 의존: nodes/edges/direction |
| `FlowEdgeData` | `frontend/src/shared/flow/index.tsx :: FlowEdgeData` | `{ active?: boolean; tone?: Tone }` |
| `AnimatedFlowEdge` | `frontend/src/shared/flow/index.tsx :: AnimatedFlowEdge` | `Edge<FlowEdgeData>` |
| `AnimatedEdge` | `frontend/src/shared/flow/index.tsx :: AnimatedEdge` | `(props: EdgeProps<AnimatedFlowEdge>)` — smoothstep path(radius 8). active 면 `strokeDasharray '6 4'` + `flow-dash 0.7s linear infinite`, stroke = `tone ? toneColor(tone) : active ? toneColor('info') : var(--border)` |
| `CollapsibleGroupData` | `frontend/src/shared/flow/index.tsx :: CollapsibleGroupData` | `{ label: string; count: number; collapsed: boolean; tone?: Tone; active?: boolean; onToggle?: () => void }` |
| `CollapsibleGroupNode` | `frontend/src/shared/flow/index.tsx :: CollapsibleGroupNode` | 접기/펼치기 그룹 노드 — 클릭 시 `onToggle`(자식 표시/숨김은 부모가 제어), `aria-expanded`, chevron 회전(`.flow-group__chev--open`), count pill |
| `FlowCanvas` | `frontend/src/shared/flow/index.tsx :: FlowCanvas` | `{ nodes; edges; nodeTypes?; onNodeClick?: (id) => void; children? }` — `ReactFlowProvider` 래핑. 기본 nodeTypes `{ group_collapsible: CollapsibleGroupNode }` 병합, edgeTypes `{ animated: AnimatedEdge }`. fitView(padding 0.15), zoom 0.3~1.6, panOnScroll, 드래그/연결 비활성, `colorMode="dark"`, attribution 숨김, `Background gap 20`. 내부 `FitOnChange` 가 노드 id 시그니처 변경 시 rAF 후 `fitView({duration:300})` 재실행 |

`flow.css`: `@keyframes flow-dash`(stroke-dashoffset -20), `flow-pulse`(opacity 1↔0.55), `.flow-node--pulse`(1.4s infinite), `.flow-group*` 스타일. `prefers-reduced-motion: reduce` 에서 애니메이션 제거.

## 디자인 토큰 (`tokens.css`)

`frontend/src/shared/tokens.css` — `:root` CSS 변수 정본(hex 직접 사용 금지):

- surface: `--surface-0 #0e1015`, `--surface-1 #171a21`, `--surface-2 #1f232d`, `--surface-3 #2a2f3c`; `--border #2f3441`, `--border-focus #4a6cf7`
- text: `--text-1 #e8eaf0`, `--text-2 #9aa1b2`, `--text-3 #626a7d`
- 시맨틱: `--brand #4a6cf7`, `--ok #3ecf8e`, `--warn #f5b83d`, `--danger #f0554e`, `--info #58a6ff`, `--neutral #626a7d`
- 히트 스케일: `--heat-good #1d7a53`, `--heat-mid #8a6d1f`, `--heat-bad #a13732`
- 타이포: `--font-sans "Pretendard Variable",Inter,system-ui`, `--font-mono "JetBrains Mono",ui-monospace`; `--fs-xs 11px ~ --fs-2xl 28px`
- 간격 `--sp-1 4px ~ --sp-8 32px`, radius `--radius-sm 6px / md 10px / lg 14px`, shadow 2종
- 모션: `--ease-out cubic-bezier(.16,1,.3,1)`, `--ease-in-out cubic-bezier(.65,0,.35,1)`, `--dur-fast 120ms / base 200ms / slow 350ms`
- 전역 리셋: box-sizing, 높이 100%, body 배경 `--surface-0`, 스크롤바 스타일.

## 컴포넌트 스타일 (`ui/app.css`)

`frontend/src/shared/ui/app.css` — 토큰 변수만 사용하는 클래스: `.btn`(+`--primary/--danger/--ghost/--sm`), `.card`, `.badge`(+`.dot`), `.statbox`, `.table`(+hover, `.clickable`), `.tabs`, `.input`, `.field`(+`.err`), `.modal-backdrop`/`.modal`(+`--lg` 760px)/`.drawer`(520px 우측), `.empty`, `.skeleton`(shimmer, reduced-motion 시 정지), `.kv`(140px 1fr 그리드), `.code`, `.avatar`, `.toasts`/`.toast`, `.crumbs`, `.stepper`(+`.done`/`.now`).

## 불변식·오류 (Invariants & Errors)

- 뷰/컴포넌트에서 직접 `fetch` 금지 — `api/get/post/put/del` 만 사용(D5).
- 색은 항상 토큰 변수·`toneColor` 경유. hex 하드코딩 금지.
- nivo·`@xyflow/react`·`motion` 은 각각 `ui/charts.tsx`·`flow/`·`motion/` 밖으로 새 import 를 만들지 않는다.
- zustand selector 에서 새 객체 생성 금지(무한 리렌더) — 파생값은 컴포넌트의 `useMemo` 로.
- `startLive()` 는 멱등(모듈 플래그) — 여러 번 호출해도 연결 1개.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `VITE_API_MODE` | `'mock' \| 'real'` | `'real'` | `'mock'` 명시 시에만 모든 API 가 `mockRequest` 로, live 는 가짜 1s 스트림. 로컬 vite dev 기본값은 `frontend/.env.development` 가 `mock` 으로 지정(실 백엔드 연동 시 `.env.development.local` 등으로 덮어씀) |
| `VITE_API_BASE` | string | `'/api'` | real 모드 REST prefix |
