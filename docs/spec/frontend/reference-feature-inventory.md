---
title: 외부 기준 저장소 기능 전수표
status: p1-observation-and-latest-source-rebaseline
date: 2026-07-11
runtime_url: http://127.0.0.1:9280
runtime_version: 1.8.1
source_tag: upstream-head
source_commit: cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc
next_gate: reference-ui-delta-rebaseline-check --require-classified
---

# 외부 기준 저장소 기능 전수표

## 0. 목적과 사용 금지선

이 문서는 P1 실행 관찰 산출물과 최신 기준 재기준화 canonical inventory다. `source_commit`은 동결 원본과 출하 gate가 따르는 최신 기준이고, 실행 관찰 당시 과거 provenance는
아래 기준선과 재기준화 기록에 보존한다.
기존 관찰 행은 과거 runtime evidence이며 최신 원본 proof나 제품 구현 완료를 뜻하지 않는다. 최신 source proof와 delta 분류는 별도 rebaseline ledger에서 추적한다. 우리 backend endpoint 연결 판정과 제품 구현은 이 문서만으로 하지 않는다.

- P2 전에는 `직결 가능`, `어댑터 필요`, `백엔드 갭`을 확정하지 않는다.
- 화면이나 숫자를 synthetic·fixture로 채우지 않는다.
- 외부 저장소의 색, typography, logo, brand component를 제품 디자인으로 이식하지 않는다.
- RCA는 삽입 가능한 논리 위치만 표시하고 구현하지 않는다.
- source-only 기능을 현재 runtime에서 동작했다고 쓰지 않는다.

판정 용어는 다음 세 개만 사용한다.

| 판정 | 의미 |
|---|---|
| `runtime+source` | `:9280`에서 직접 관찰했고 관찰 당시 v1.8.1 소스로 의미를 확정한 과거 runtime evidence |
| `source-confirmed` | runtime에서 해당 screen·control·gated/empty/capability 상태를 관찰하고, 데이터·권한·안전 제한으로 끝까지 실행하지 않은 계약을 관찰 당시 v1.8.1 call-chain으로 확정한 과거 evidence |
| `runtime-gated` | control 또는 route는 관찰됐지만 권한·capability·데이터 부재로 하위 동작이 차단됨 |

## 1. 조사 기준선

| 항목 | 확인 값 | 근거 |
|---|---|---|
| 실행 URL | `http://127.0.0.1:9280` | HTTP 200과 browser 관찰 |
| 비교 실행 도구 | `1.8.1` | 로컬 CLI `--version` |
| source rebaseline target | upstream HEAD, commit `cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc` | `references/provenance/source.json`과 동결 source ledger |
| source license | Apache-2.0 | 동일 checkout의 `LICENSE` 직접 확인 |
| 실행 context | `cluster-1`, `mgmt`; 관찰 시작 current=`mgmt` | `GET /api/contexts`, process argument |
| 인증 | local no-auth (`authEnabled=false`, `authMode=none`) | `GET /api/auth/me` |
| 제한 flag | exec, Helm write, local terminal 비활성 | process argument와 `GET /api/capabilities` |
| timeline | SQLite persistent storage | process argument |
| 실시간 | `/api/events/stream` SSE | browser network와 `useEventSource` |
| 화면 최소 폭 | standalone content 800px + rail 176px 또는 56px | `web/src/App.tsx` root layout |

실행 관찰 source tag `v1.8.1`, revision `3ff2b1095151c690bf536e8e6ca685c2703fcd70`의 경로·symbol은 historical evidence로 보존하며, 최신 기준 source proof는 UI delta ledger에서 별도로 분류·검증한다. 주요 historical 관찰 진입점은 다음과 같다.

- route·shell·전역 interaction: `web/src/App.tsx`
- app composition: `web/src/*App.tsx`
- standalone sidebar: `web/src/components/nav/PrimaryNavRail.tsx`
- REST query·mutation: `web/src/api/client.ts`, `web/src/api/*.ts`
- 실시간: `web/src/hooks/useEventSource.ts`
- server route: `internal/server/server.go`와 각 `RegisterRoutes`
- shared screen component: `packages/k8s-ui/src/components/**`

## 2. 전역 셸과 공통 interaction

### 2.1 레이아웃

| 영역 | 구성 | interaction | 판정 |
|---|---|---|---|
| 왼쪽 rail | brand/home, 11개 primary menu, account, Settings, collapse | menu 이동, 176↔56px 고정 상태, slim hover label | `runtime+source` |
| 상단 왼쪽 | context + namespace가 결합된 scope pill, connection dot, port-forward indicator | context 전환, 다중 namespace 선택, disconnect 재시도 | `runtime+source` |
| 상단 중앙 | resource·command omnibar | 검색, command, view·kind 이동, context·namespace 전환 | `runtime+source` |
| 상단 오른쪽 | repository action, theme, help, diagnostics; capability가 있으면 terminal | theme 전환, 단축키 도움말, 진단 overlay | `runtime+source` |
| 중앙 content | 현재 route screen | route별 scroll ownership; fullscreen detail이면 배경 `inert` | `runtime+source` |
| 하단 dock | logs, exec, local terminal, port-forward panel | session tab, resize, close, 재연결 | `source-confirmed` |
| overlay | resource drawer, Helm drawer, settings, permissions, diagnostics, shortcut help, command palette | focus trap, Escape close, URL deep-link | `runtime+source` |

standalone rail 순서는 다음과 같다.

1. Home
2. Resources
3. Issues
4. Topology
5. Applications
6. Timeline
7. Live Traffic
8. Helm
9. GitOps
10. Checks
11. Cost

Settings는 route가 아니라 rail 하단 dialog다. Workload, Compare, Helm Compare는 primary menu가 아닌
contextual route다. embedded mode에서는 rail 대신 host chrome 또는 top pill navigation을 사용할 수
있지만 standalone 제품 포팅의 P1 기준은 rail이다.

### 2.2 scope와 URL 보존

- context 선택은 `POST /api/contexts/{name}` 이후 SSE의 progress·changed·topology 순서로 수렴한다.
- namespace는 `namespaces=a,b` query와 server active scope를 동기화한다.
- cluster-scoped surface, Cost, GitOps detail처럼 namespace가 의미 없는 화면은 picker를 disabled하고
  이유 tooltip을 제공하되 선택값은 보존한다.
- resource, application, GitOps detail, compare, timeline filter는 URL에 기록해 back/forward와 deep link를
  보존한다.
- 잘못되거나 사라진 application deep link는 data load 성공 후에만 URL에서 제거한다.

## 3. Route 전수표

| Route | 화면·상태 | 주요 query | 진입/복귀 | 판정 |
|---|---|---|---|---|
| `/`, `/home` | Overview/Home | `namespaces` | logo, Home menu, `g h` | `runtime+source` |
| `/resources` | 기본 kind로 이동하는 resource browser | global scope query | Resources menu, `g r` | `runtime+source` |
| `/resources/{kind}` | kind별 table + detail drawer | `resource`, `apiGroup`, `full`, `tab`, `search`, `filters`, `problems`, `showInactive`, `labels`, `ownerKind`, `ownerName`, `namespaces` | row click, search, cross-link | `runtime+source` |
| `/issues` | cluster issue list | `namespaces` | Home issue, menu, `g i` | `runtime+source` |
| `/topology` | interactive resource graph | `mode`, `group`, `namespaces`, filter state, policy-effect state | Home preview, menu, `g t` | `runtime+source` |
| `/applications` | application list 또는 detail | `app`, `workload`, `tab`, `namespaces` | menu, `g a`, browser back | `runtime+source` |
| `/timeline` | list 또는 swimlane | `view`, `filter`, `time`, `namespaces` | Home activity, menu, `g l` | `runtime+source` |
| `/traffic` | observed flow graph/list/setup | namespace·protocol·status·source filter | menu, `g f`, Home card | `runtime-gated` |
| `/helm` | release list + URL drawer | `release`, `releaseStorage`, `namespaces` | menu, `g m`, Home card | `runtime+source` |
| `/helm/compare` | revision compare | release identity와 revision pair | Helm drawer | `source-confirmed` |
| `/gitops` | GitOps table/tile workspace | mode, sync, health, automation, lifecycle, project, namespace, label, sort | menu, `g o`, Home card | `runtime+source` |
| `/gitops/detail/{kind}/{namespace-or-_}/{name}` | GitOps Topology·Resources·Activity | `apiGroup`, `from`, fullscreen state | row/node cross-link, breadcrumb | `source-confirmed` |
| `/checks`, `/audit` | audit/check workspace; `/audit`는 legacy alias | search, category, severity, framework, namespace | menu, `g u`, Home audit | `runtime+source` |
| `/cost` | OpenCost summary·trend·breakdown | range `6h|24h|7d`, selected namespace | menu, `g c`, Home card | `runtime-gated` |
| `/workload/{kind}/{namespace-or-_}/{name}` | full-page resource/workload detail | `apiGroup`, `tab` | detail expand, application workload | `source-confirmed` |
| `/compare` | 동일 kind 두 resource YAML diff | `kind`, `apiGroup`, `a`, `b` | drawer Compare, table compare mode | `source-confirmed` |
| `/auth/login`, `/auth/callback`, `/auth/logout` | OIDC/proxy auth | provider callback state | auth barrier | `source-confirmed` |

알 수 없는 client route는 Home으로 해석한다. server static handler는 client route에서 `index.html`로
fallback한다.

## 4. 화면별 기능·구성 요소·상호작용

### 4.1 Home

레이아웃은 최대 1600px content 안의 세 band와 오른쪽 active-issues panel이다.

| 영역 | 표시 내용 | interaction | 판정 |
|---|---|---|---|
| Cluster Health | cluster/platform/version, pod·deployment·node, CPU·memory, workload counts, warning events, issue count, freshness | count→Resources kind, warning→Timeline, issue→Issues, 수동 refresh | `runtime+source` |
| Live band | Topology preview, Timeline activity preview | 해당 full screen 이동 | `runtime+source` |
| Explore band | traffic, Helm, 조건부 Cost | 해당 screen 이동; 데이터 source 없으면 card 자체 미표시 가능 | `runtime+source` |
| Posture band | TLS certificate, NetworkPolicy coverage, GitOps controller, audit | filtered Resources·GitOps·Checks 이동 | `runtime+source` |
| Active Issues | severity, resource, reason, age, visibility/truncation/refresh 상태 | issue screen 또는 resource drawer 이동 | `runtime+source` |

상태는 initial loading, hard error, no namespace access, deferred/partial loading, background refresh 실패와
last-success 유지, empty issue를 구분한다.

### 4.2 Resources

- resource catalog는 built-in kind와 discovery된 CRD를 category별로 제공하며 favorite kind를 저장한다.
- table은 kind별 smart column, 검색, problem·status·label·owner·column filter, sort, resize, custom
  label/annotation column, inactive toggle을 제공한다.
- `j/k`, `g g/G`, `Enter/d`, `y`, `l`, `[/]` keyboard grammar를 지원한다.
- row click은 URL-backed drawer를 열고 `full=1` 또는 좁은 화면에서는 fullscreen detail이 된다.
- detail은 summary, status, metadata, YAML, related resource, event, metrics, logs, RBAC, GitOps owner,
  image filesystem, actions를 kind·capability에 따라 조합한다.
- compare mode는 같은 kind 두 행 선택 후 `/compare`로 이동한다.
- bulk action과 update/delete/apply/restart/scale 등 write control은 capability·RBAC가 있을 때만 제공한다.

### 4.3 Issues

- critical, warning, info severity facet과 합계, visibility impact, truncated result를 표시한다.
- facet은 다중 선택이며 clear filter를 제공한다.
- issue row는 kind, namespace/name, message, source/category/evidence를 보여주고 resource detail로 이동한다.
- loading, error, background last-success, no visible issues, limited visibility를 분리한다.

### 4.4 Topology

- resource hierarchy와 observed traffic의 두 mode, namespace/app/ungrouped grouping을 제공한다.
- kind filter sidebar, topology search, scope pill, freshness, fit/zoom/reset, policy-effect overlay가 있다.
- graph는 ELK worker layout, pan, wheel zoom, click select, Shift+click multi-select를 사용한다.
- node click은 같은 canonical resource drawer를 열며 GitOps kind는 detail route로 cross-link할 수 있다.
- SSE topology frame은 cluster size에 따라 500/1000/2000/3000ms로 throttle한다.

### 4.5 Applications

- deployable workload를 app/release evidence로 묶어 health, version, workload class, namespace, 관계를
  list/table로 표시한다.
- `?app=` 선택 시 browser history를 보존한 detail로 전환하며 app graph와 workload를 제공한다.
- identity sibling이 둘 이상이면 environment instance switcher가 나타난다.
- instance 전환은 kind+name 또는 environment suffix를 제거한 stem으로 workload 위치를 보존하고,
  대응 workload가 없으면 overview로 돌아가 안내 toast를 표시한다.
- `?workload=` 선택은 embedded Workload detail을 열며 back은 app graph로 복귀한다.

### 4.6 Timeline

- list와 swimlane mode를 전환한다.
- filter는 all, changes, Kubernetes events, warnings, unhealthy이고 time은 5m, 30m, 1h, 6h, 24h,
  all이다. deleted resource 포함 toggle을 제공한다.
- change row는 field diff와 child resource를 확장하고 resource/GitOps detail로 이동한다.
- SSE `k8s_event`가 query를 invalidate하며 REST `/changes` 15초 polling이 fallback이다.

### 4.7 Live Traffic

- Hubble, Caretta, Istio source를 발견하고 active source와 connection state를 표시한다.
- data가 있으면 graph와 flow list, namespace·protocol·status filter를 제공한다.
- source가 없거나 연결되지 않으면 setup/connect flow를 제공한다.
- observed flow는 REST snapshot과 수동 refresh를 사용한다. server의 `/traffic/flows/stream`은 이
  버전의 standalone browser가 사용하지 않는다.

### 4.8 Helm

- all-namespace release table은 status, chart/app version, resource health, storage namespace, GitOps
  ownership, upgrade availability를 표시한다.
- release drawer는 overview, values, manifest, notes, hooks, resources, history와 revision diff를 조합한다.
- install wizard는 repository/OCI/ArtifactHub search, chart/version, namespace, values, progress stream을 제공한다.
- compare route는 manifest·values·notes·hook·resource revision diff를 제공한다.
- upgrade, rollback, uninstall, values apply, repository update는 `helmWrite`와 RBAC가 있을 때만 제공한다.
- 현재 runtime은 `--disable-helm-write`라 read surface만 검증 대상이다.

### 4.9 GitOps

- fleet list는 외부 GitOps Application·Kustomization·HelmRelease를 canonical row로 정규화한다.
- table/tile 전환, tool scope, sync, health, automation, lifecycle, project, namespace, destination,
  label filter와 sort를 제공한다.
- row action은 refresh/hard refresh/sync/terminate/suspend/resume 또는 reconcile/sync-with-source다.
- detail은 Topology, Resources, Activity 세 tab, status·source·destination·revision facts,
  parent breadcrumb, fullscreen graph를 제공한다.
- Resources tab은 drift, desired/live change, recent event, remediation plan을 표시한다.
- Activity tab은 operation/history와 rollback 진입점을 제공한다.
- terminating resource는 mutation을 제한하고 lifecycle 상태를 status보다 우선한다.
- Applications mode만 실제 화면이다. Sources, Projects, Alerts mode는 현재 placeholder이므로 구현된
  독립 화면으로 계산하지 않는다.

### 4.10 Checks

- security, reliability, efficiency check 결과를 resource와 namespace 기준으로 탐색한다.
- search, category, severity, framework, namespace filter와 finding 설명·remediation을 제공한다.
- check/category/namespace hide 설정은 persisted audit settings를 갱신한다.
- Home audit card와 resource drawer의 audit badge가 같은 결과로 이동한다.

### 4.11 Cost

- OpenCost가 탐지됐을 때 cluster hourly·monthly projection, namespace/workload/node breakdown,
  efficiency, trend를 제공한다.
- trend range는 6h, 24h, 7d다.
- no Prometheus, no metrics, query error를 서로 다른 unavailable reason으로 표시한다.
- namespace picker는 이 화면에서 disabled된다. breakdown 자체가 전체 cluster namespace 비교이기 때문이다.

### 4.12 Workload·Compare·공통 detail

- Workload route는 overview, topology, metrics, logs, events, YAML, pods, RBAC, GitOps/Helm 관계를
  kind·data에 따라 제공한다.
- Compare는 side-by-side/unified, swap A↔B, diff-only, spec-only, raw metadata toggle을 제공한다.
- server noise field는 기본 diff에서 제외하고 raw metadata toggle로 복원한다.
- 공통 detail은 URL·back button·Escape·focus restore를 보존한다.

### 4.13 Settings·도구 overlay

- Settings는 Personal/My permissions와 owner-gated startup configuration을 분리한다.
- configuration은 kubeconfig, kubeconfig directories, default namespace, port, browser launch, MCP,
  timeline backend/history limit, Prometheus URL·secret headers를 포함한다.
- 일반 config save는 next launch 적용이고 Prometheus `Apply now`는 즉시 연결 probe까지 수행한다.
- Shortcut help, diagnostics, command palette/omnibar, permissions dialog는 focus trap과 Escape close를
  제공한다.

## 5. Keyboard 전수표

| Shortcut | 동작 | scope |
|---|---|---|
| `g h/r/i/t/a/l/f/m/o/u/c` | Home/Resources/Issues/Topology/Applications/Timeline/Traffic/Helm/GitOps/Checks/Cost | global sequence |
| `g s` | Settings 열기 | standalone global |
| `n` | namespace switcher | global |
| `c` | context switcher | global |
| `t` | light/dark theme | global |
| `?` | shortcut help toggle | global |
| `Cmd+K` 또는 `Ctrl+K` | omnibar/command palette | global, input에서도 허용 |
| `Ctrl+Shift+D` | diagnostics | global, input에서도 허용 |
| `/` | 현재 화면 검색 focus | screen scope |
| `f`, `+`, `-`, `0` | topology fit, zoom in/out/reset | topology scope |
| `j`, `k`, `g g`, `G` | row 다음/이전, 처음/마지막 | table scope |
| `Enter`, `d` | 선택 resource detail | table scope |
| `y`, `l` | YAML, logs | resource/workload scope |
| `[`, `]` | 이전/다음 resource kind | resources scope |
| `Escape` | overlay/drawer/search 닫기 | active overlay 우선 |

shortcut registry는 input, textarea, select, contenteditable에서 기본 shortcut을 억제하고 명시적으로
`allowInInputs`인 shortcut만 허용한다. multi-key sequence는 1,000ms 뒤 취소되고 화면 scope shortcut이
global보다 우선한다.

## 6. 실시간·polling·cache 모델

### 6.1 SSE

`GET /api/events/stream`은 다음 named event를 전달한다.

| Event | payload | client 처리 |
|---|---|---|
| `topology` | `{nodes, edges}` | size-based throttle 후 최신 frame commit |
| `k8s_event` | Kubernetes event summary | 최근 100개 prepend, 관련 query invalidate |
| `heartbeat` | 없음 | 연결 유지 |
| `context_switch_progress` | `{message}` | switching overlay 진행 문구 |
| `context_changed` | `{context}` | topology/event clear, cache invalidate, 다음 topology 대기 |
| `deferred_ready` | 없음 | dashboard/deferred query refetch |
| `connection_state` | connection state object | connection provider 갱신 |

연결 오류는 3초부터 1.5배 backoff해 최대 30초로 재연결한다. context·server namespace filter·view
mode·policy effect가 바뀌면 기존 EventSource를 닫고 다시 연결한다.

### 6.2 주요 REST 갱신 주기

| Query | stale/poll | 비고 |
|---|---|---|
| connection | 500ms while connecting | connected 후 polling 중지 |
| dashboard | stale 15s / poll 30s | SSE deferred-ready가 추가 refetch |
| issues·audit | stale 30s / poll 60s | background error면 last-success 유지 |
| applications | stale 30s / poll 60s | URL detail과 같은 collection 공유 |
| resource list | stale 30s / poll 60s 또는 120s | SSE event가 near-real-time invalidate |
| changes | stale 5s / poll 15s | SSE fallback |
| metrics.k8s.io live/history/top | stale 15~25s / poll 30s | unavailable 오류는 제한 retry |
| Prometheus resource/namespace/cluster | stale 30s / poll 60s | PVC 120s, rightsizing 10m |
| GitOps rows | stale 30s / poll 120s | cold empty는 2s bounded retry 4회 |
| GitOps counts | stale 10s / poll 60s | row refresh와 함께 수동 갱신 |
| Helm list/detail | list stale 30s; detail poll 10s | mutation 뒤 immediate + 1.2s refetch |
| Cost summary | stale 30s / poll 60s | trend/nodes 120s |
| port-forward sessions | poll 30s | active session 표시 |

전역 React Query 기본은 window-focus refetch 비활성, query retry 1회다. query에 기존 data가 있을 때
background 실패는 console warning과 화면 freshness/error를 병행하고 data를 지우지 않는다.

## 7. API 전수표

이 절은 외부 기준 저장소의 browser 소비 계약이다. 경로는 runtime에서 `/api` 아래에 mount된다.
`요청/응답`은 wire의 주요 shape이며 P2에서 우리 canonical DTO와 별도 매핑한다.

P1의 **browser 소비 API mapping unit은 136행**이다. P2는 아래 7.2~7.11의 Markdown body row를
같은 단위·순서로 모두 옮겨 `P1 136 = P2 136`을 증명한다. 동일 shape·consumer를 가진 endpoint
variant가 한 행에 묶인 경우 그 행 전체가 한 mapping unit이다. P2에서 임의로 합치거나 빼지 않으며,
분할이 필요하면 P1과 P2를 같은 커밋에서 함께 갱신한다. 7.12의 standalone browser 비소비 경로는
136행에서 제외한다.

| 절 | mapping unit |
|---|---:|
| 7.2 Bootstrap·전역 셸·desktop | 24 |
| 7.3 Home·Issues·Applications·Topology·Timeline | 11 |
| 7.4 Resource browser·detail·RBAC·compare | 19 |
| 7.5 Metrics·logs·dock | 21 |
| 7.6 Resource·workload mutation | 14 |
| 7.7 Live Traffic | 5 |
| 7.8 Helm | 23 |
| 7.9 GitOps | 11 |
| 7.10 Cost·Settings·기타 overlay | 7 |
| 7.11 실시간 event | 1 |
| **합계** | **136** |

### 7.1 공통 wire 규칙

- 기본 base는 `/api`이고 embedded cluster surface에서는 `/c/{cluster-id}/api` 같은 host base로 바뀐다.
  REST, SSE, WebSocket은 동일 base·credential·동적 auth header 규칙을 사용한다.
- 성공 응답은 endpoint별 object 또는 array다. 공통 success envelope는 없다.
- 실패 응답의 공통 최소형은 `{error: string}`이고 일부 경로는 `error_code`를 더한다. `401`은
  OIDC redirect 또는 proxy reload, `403`은 permission 상태, `404`는 대상 소멸, `409`는 진행 중
  operation 충돌로 해석한다.
- 목록용 cursor 계약은 없다. resource list는 전체 array, changes는 `limit<=10000`, search는 limit,
  ArtifactHub만 offset/limit를 사용한다. 대형 Pod·Event·ReplicaSet·EndpointSlice 목록은 client가
  25,000건 초과 시 렌더링을 차단한다.
- cluster-scoped resource의 namespace path segment는 `_`다. query의 namespace 다중값은 endpoint에 따라
  `namespaces=a,b`이고 Live Traffic처럼 단일 namespace만 받는 예외가 있다.
- 아래 `주기·trigger`는 자동 polling뿐 아니라 screen 진입, SSE invalidation, mutation 후 refetch를 포함한다.

### 7.2 Bootstrap·전역 셸·desktop

| Method·path | 요청 | 응답 주요 shape | 소비 위치·주기 | 판정 |
|---|---|---|---|---|
| `GET /health` | 없음 | runtime·timeline·resource count를 포함한 health object | diagnostics/bootstrap | `runtime+source` |
| `GET /diagnostics` | 없음 | metrics source, informer sync, drop/error/cache/runtime snapshot | diagnostics overlay, 열렸을 때 | `source-confirmed` |
| `GET /auth/me` | 없음 | `{authEnabled,authMode,username?,groups?,cloudRole?,proxyLogoutConfigured?}` | auth barrier·user menu, stale 5m | `runtime+source` |
| `GET /version-check` | 없음 | current/latest version과 update availability | header update notice | `runtime+source` |
| `GET /connection` | 없음 | `{state,context,clusterName?,contexts[],error?,errorType?,progressMessage?}` | connection provider, connecting 중 500ms | `runtime+source` |
| `POST /connection/retry` | body 없음 | authoritative connection state | connection error CTA; 전체 cache reset | `source-confirmed` |
| `GET /cluster-info` | 없음 | `{context,cluster,platform,kubernetesVersion,nodeCount,podCount,namespaceCount,inCluster,crdDiscoveryStatus?}` | header/Home/Traffic, 60s; discovery 중 2s | `runtime+source` |
| `GET /capabilities` | `namespace?` | exec·logs·portForward·Helm/node/workload/resource verb 등 capability object | global 60s | `runtime+source` |
| `GET /namespaces` | 없음 | `[{name,status}]` | namespace picker, stale 30s | `runtime+source` |
| `GET /api-resources` | 없음 | `[{group,version,kind,name,namespaced,isCrd,verbs[]}]` | catalog·omnibar·GitOps discovery, stale 5m | `runtime+source` |
| `GET /contexts` | 없음 | `ContextInfo[]` | context picker, stale 30s | `runtime+source` |
| `GET /sessions` | 없음 | `{portForwards,execSessions/localTerminals?,total}` | context switch confirm 직전 | `runtime+source` |
| `POST /contexts/{name}` | body 없음 | 새 context의 cluster info | context switch; 성공 시 모든 query 제거·재조회 | `runtime+source` |
| `GET /cluster/namespace-scope` | 없음 | `{actives,mode,accessibleNamespaces,authoritative,canClearNamespace,cacheScoped,namespaceRescope,...}` | namespace picker, stale 30s | `runtime+source` |
| `POST /cluster/namespace` | `{namespaces:string[]}` | authoritative namespace scope | namespace 변경; cache-scoped면 전체 query reset | `source-confirmed` |
| `GET /search` | `q,limit,include=none,context,globalNs?` | `{hits,total,...}`; hit은 resource identity·matched fields | omnibar, 입력 debounce | `runtime+source` |
| `GET /settings` | 없음 | user UI preferences | App bootstrap/settings | `runtime+source` |
| `PUT /settings` | preference object | 저장된 preference object | theme·UI preference 변경 | `source-confirmed` |
| `GET /github/starred` | 없음 | star prompt state | standalone header/bootstrap | `runtime+source` |
| `POST /github/star`, `POST /github/dismiss` | body 없음 | action state 또는 success object | repository prompt action | `source-confirmed` |
| `POST /desktop/open-url` | `{url}` | success/error | desktop external link | `source-confirmed` |
| `POST /desktop/open-file`, `POST /desktop/open-folder` | local path payload | success/error | desktop file/folder action | `source-confirmed` |
| `POST /desktop/save-file` | filename·content payload | saved path/result | YAML·diff·log download | `source-confirmed` |
| `POST /desktop/update`, `GET /desktop/update/status`, `POST /desktop/update/apply` | update 시작/apply는 body 없음 | update phase·progress·error state | desktop update notice; 진행 중 polling | `source-confirmed` |

### 7.3 Home·Issues·Applications·Topology·Timeline

| Method·path | 요청 | 응답 주요 shape | 소비 위치·주기 | 판정 |
|---|---|---|---|---|
| `GET /dashboard` | `namespaces?` | `{cluster,health,problems,resourceCounts,recentEvents,recentChanges,topologySummary,trafficSummary?,metrics?,certificateHealth?,networkPolicyCoverage?,audit?,gitopsControllers?,nodeVersionSkew?,deferredLoading?,partialData?,accessRestricted?}` | Home, stale 15s/poll 30s | `runtime+source` |
| `GET /dashboard/crds` | `namespaces?` | `{topCRDs:[{kind,name,group,count}]}` | Home lazy card, 60s | `runtime+source` |
| `GET /dashboard/helm` | `namespaces?` | `{total,releases[],restricted?,error?,errorCode?}` | Home lazy card, 60s | `runtime+source` |
| `GET /issues` | `namespaces?,severity?,category?,limit?` | `{issues,total,total_matched,recent_changes?,visibility?}` | Home Active Issues·Issues, poll 30s | `runtime+source` |
| `GET /applications` | `namespaces?` | `{applications,argoClaims?}`; app은 identity·health·versions·workloads·relationships | Applications list/detail, stale 30s/poll 60s | `runtime+source` |
| `GET /topology` | `namespaces?,view=resources|traffic?,policyEffect?` | `{nodes,edges,warnings?,largeCluster?,hiddenKinds?,requiresNamespaceFilter?,estimatedNodes?,summaryMode?,crdDiscoveryStatus?}` | Topology, app graph, Timeline grouping; manual query stale 5s | `runtime+source` |
| `GET /changes` | `namespaces?,kind?,name?,since,filter,include_k8s_events?,include_managed?,include_deleted?,sources?,limit` | `TimelineEvent[]` | Home activity·Timeline·resource detail; 15~60s + SSE invalidation | `runtime+source` |
| `GET /audit` | `namespaces?` | audit finding collection + visibility summary | Home posture·Checks·Resources, poll 60s | `runtime+source` |
| `GET /settings/audit` | 없음 | hidden check/category/namespace 설정 | Checks 설정 | `runtime+source` |
| `PUT /settings/audit` | audit settings object | 저장된 audit settings | Checks hide/show 변경 후 audit invalidate | `source-confirmed` |
| `GET /secrets/certificate-expiry` | `namespaces?` | certificate expiry summary/list | Home TLS·Secret columns | `runtime+source` |

`GET /changes`는 timestamp 내림차순이지만 cursor와 stable tie-break 계약이 없다. reconnect resume cursor도
없으므로 P2에서 그대로 기능 동등성을 만들 수 있는지 별도 판정해야 한다.

### 7.4 Resource browser·detail·RBAC·compare

| Method·path | 요청 | 응답 주요 shape | 소비 위치·주기 | 판정 |
|---|---|---|---|---|
| `GET /resource-counts` | `namespaces?` | `{counts,forbidden?,unavailable?,reasons?}` | Resources catalog·GitOps kind detection, 60s | `runtime+source` |
| `GET /resources/{kind}` | `namespace?` 또는 `namespaces?`, `group?`, `include=summary|raw` | bare Kubernetes object array | Resources·GitOps·compare candidate, 60/120s + SSE invalidate | `runtime+source` |
| `GET /resources/{kind}/{ns-or-_}/{name}` | `group?` | `{resource,relationships?,certificateInfo?,hpaDiagnosis?}` | drawer·Workload·Compare·GitOps node | `runtime+source` |
| `GET /resources/{kind}/{ns-or-_}/{name}/cascade-preview` | `group?` | `{root,dependents[]}` | delete confirm 전 | `runtime+source` |
| `GET /issues/resource/{kind}/{ns-or-_}/{name}` | `group?` | `Issue[]` | resource/workload issue section, stale 30s | `runtime+source` |
| `GET /audit/resource/{kind}/{ns}/{name}` | 없음 | `AuditFinding[]` | resource/workload check section | `runtime+source` |
| `GET /rbac/subject/{kind}/{ns}/{name}` | ServiceAccount identity | subject binding·effective role summary | Pod/ServiceAccount detail, stale 15s | `runtime+source` |
| `GET /rbac/subject/{kind}/{name}` | User 또는 Group identity | subject binding·effective role summary | User/Group detail, stale 15s | `source-confirmed` |
| `GET /rbac/role/{kind}/{ns-or-_}/{name}` | Role/ClusterRole identity | role rules·binding·subjects summary | Role detail, stale 15s | `source-confirmed` |
| `GET /rbac/namespace/{namespace}` | 없음 | namespace permission summary | Namespace detail, stale 15s | `source-confirmed` |
| `GET /rbac/whoami` | `namespace` | current subject·allowed operations | My permissions, stale 30s | `runtime+source` |
| `GET /resources/resourcequotas` | `namespace` | bare ResourceQuota array | Namespace quota renderer, stale 15s | `source-confirmed` |
| `GET /images/metadata` | `image,namespace?,pod?,pullSecrets?` | cache/auth/size/platform metadata | image filesystem entry, stale 60s | `source-confirmed` |
| `GET /images/inspect` | 같은 image query | filesystem tree·layer metadata | image filesystem modal, stale 5m | `source-confirmed` |
| `GET /images/file` | image identity + file path | file bytes/content metadata | image file preview/download | `source-confirmed` |
| `GET /pods/{ns}/{name}/files` | `container,path` | directory entries | Pod filesystem modal | `source-confirmed` |
| `GET /pods/{ns}/{name}/files/download` | `container,path` | streamed file body | Pod file download | `source-confirmed` |
| `GET /capi/clusters/{ns}/{name}/kubeconfig` | 없음 | kubeconfig file | CAPI Cluster detail | `source-confirmed` |
| `POST /capi/clusters/{ns}/{name}/connect` | body 없음 | connection/context result | CAPI Cluster Connect action | `source-confirmed` |

`GET /resources/{kind}`의 `403`·deferred `503`·실제 empty `[]`는 서로 다른 의미다. legacy RBAC
preflight가 `200 []`를 반환하는 예외도 있어 P2 adapter가 HTTP status만으로 empty를 단정하면 안 된다.

### 7.5 Metrics·logs·dock

| Method·path | 요청 | 응답 주요 shape | 소비 위치·주기 | 판정 |
|---|---|---|---|---|
| `GET /metrics/pods/{ns}/{name}` | 없음 | `{metadata,timestamp,window,containers:[{name,usage:{cpu,memory}}]}` | Pod live metric, 30s | `runtime+source` |
| `GET /metrics/nodes/{name}` | 없음 | `{metadata,timestamp,window,usage:{cpu,memory}}` | Node live metric, 30s | `source-confirmed` |
| `GET /metrics/pods/{ns}/{name}/history` | 없음 | `{namespace,name,containers:[{name,dataPoints[{timestamp,cpu,memory}]}],metricsUnavailable?,...}` | Pod chart, 30s | `runtime+source` |
| `GET /metrics/nodes/{name}/history` | 없음 | `{name,dataPoints[{timestamp,cpu,memory}],metricsUnavailable?,...}` | Node chart, 30s | `source-confirmed` |
| `GET /metrics/top/pods` | `namespaces?` | `[{namespace,name,cpu,memory,cpuRequest,cpuLimit,memoryRequest,memoryLimit}]` | Pod table columns, 30s | `runtime+source` |
| `GET /metrics/top/nodes` | 없음 | `[{name,cpu,memory,podCount,cpuAllocatable,memoryAllocatable}]` | Node table columns, 30s | `source-confirmed` |
| `GET /prometheus/status` | 없음 | `{available,connected,address?,service?,contextName?,error?}` | metric panels, 60s | `runtime+source` |
| `POST /prometheus/connect` | `optional=true?`, body 없음 | Prometheus status | auto/manual discovery 후 status invalidate | `source-confirmed` |
| `GET /prometheus/resources/{kind}/{ns}/{name}`, `GET /prometheus/resources/{kind}/{name}` | `category=cpu|memory|network_rx|network_tx|filesystem|restarts`, `range` | `{kind,namespace?,name,category,unit,range,result:{resultType,series[]},query?,hint?}` | resource/workload charts, 60s | `runtime+source` |
| `GET /prometheus/query` | `query,range` | `{resultType,series[]}` | HPA PromQL range chart, 60s | `source-confirmed` |
| `GET /prometheus/pvc/{ns}/{name}` | 없음 | `{namespace,name,used,capacity,ratio,hasData}` | PVC usage, 120s | `source-confirmed` |
| `GET /prometheus/rightsizing/{kind}/{ns}/{name}` | 없음 | `{kind,namespace,name,window,sampleAvailable,rows[],reason?}` | workload rightsizing, 10m | `runtime+source` |
| `GET /pods/{ns}/{name}/logs` | `container?,tailLines?,sinceSeconds?,timestamps?` | `{podName,namespace,containers,logs}` | Pod log initial snapshot, stale 5s | `source-confirmed` |
| `SSE /pods/{ns}/{name}/logs/stream` | 같은 log query | `connected|log|end|error` event | Pod Logs tab/dock | `source-confirmed` |
| `SSE /workloads/{kind}/{ns}/{name}/logs/stream` | 같은 log query | `connected|log|pod_added|pod_removed|end|error` event | Workload Logs tab | `source-confirmed` |
| `WS /pods/{ns}/{name}/exec` | `container?,shell?` | terminal byte/message stream | exec dock; capability gated | `source-confirmed` |
| `WS /local-terminal` | shell/session query | terminal byte/message stream | local terminal dock; capability gated | `source-confirmed` |
| `GET /portforwards` | 없음 | active forward session array | header/dock, 30s | `runtime+source` |
| `GET /portforwards/available/{type}/{ns}/{name}` | 없음 | `{ports[]}` 또는 available port array | resource Port Forward action | `runtime+source` |
| `POST /portforwards` | `{namespace,podName?|serviceName?,podPort,localPort?,listenAddress?}` | created session | port-forward dialog | `source-confirmed` |
| `DELETE /portforwards/{id}` | 없음 | success/204 | dock stop/reconnect replacement | `source-confirmed` |

metrics source마다 freshness 의미가 통일되어 있지 않다. metrics.k8s.io만 `timestamp/window`, Prometheus는
series point와 optional `query/hint`, OpenCost는 `available/reason`을 사용하며 공통 `observedAt`, `stale`,
`coverage`, `partial` 필드는 없다. metrics unavailable 분류도 stable error code가 아니라 일부 404/500
message token heuristic을 사용한다. 이는 원형의 계약 한계이며 P2에서 숨기지 않는다.

Pod·Workload log stream과 exec/local-terminal WebSocket에는 event ID, resume cursor, application-level
reconnect 계약이 없다. log client는 `error` 또는 `end`에서 stream을 닫고 사용자가 새 요청을 시작해야 한다.

### 7.6 Resource·workload mutation

| Method·path | 요청 | 응답·후속 동작 | 소비 위치 | 판정 |
|---|---|---|---|---|
| `POST /resources/apply` | raw YAML `text/plain`; `mode=apply|create,dryRun?,force?` | `[{name,namespace,kind,created}]`; list/topology invalidate | create/apply/remediation | `source-confirmed` |
| `PUT /resources/{kind}/{ns}/{name}` | raw YAML `text/plain`; `group?,force?` | authoritative K8s object; detail cache seed 후 list invalidate | YAML editor | `source-confirmed` |
| `DELETE /resources/{kind}/{ns}/{name}` | `group?,force?` | `204`; list/detail/topology invalidate | single/bulk delete | `source-confirmed` |
| `POST /workloads/{kind}/{ns}/{name}/restart` | body 없음 | success object; resource/list/topology invalidate | workload action | `runtime+source` |
| `POST /workloads/{kind}/{ns}/{name}/scale` | `{replicas}` | authoritative/success result | scale confirm | `runtime-gated` |
| `GET /workloads/{kind}/{ns}/{name}/revisions` | 없음 | revision history array | rollback dialog | `runtime+source` |
| `POST /workloads/{kind}/{ns}/{name}/rollback` | `{revision}` | rollback result | revision confirm | `runtime-gated` |
| `POST /cronjobs/{ns}/{name}/trigger` | body 없음 | created Job/result | CronJob action | `source-confirmed` |
| `POST /cronjobs/{ns}/{name}/suspend`, `POST /cronjobs/{ns}/{name}/resume` | body 없음 | updated CronJob/result | CronJob action | `source-confirmed` |
| `POST /nodes/{name}/cordon`, `POST /nodes/{name}/uncordon` | body 없음 | updated node/result | Node action | `source-confirmed` |
| `POST /nodes/{name}/drain` | drain option payload | `{evictedPods?,errors?}`; 장시간 요청 | Node confirm/progress | `source-confirmed` |
| `POST /pods/{ns}/{name}/debug` | `{targetContainer}` | ephemeral-container result | Pod debug terminal | `source-confirmed` |
| `POST /nodes/{name}/debug`, `DELETE /nodes/{name}/debug` | create는 `{}` | debug pod/session 또는 cleanup result | Node terminal | `source-confirmed` |
| `POST /curl/service` | `{namespace,name,port,scheme,path}` | status, headers, body, duration/error | Service Curl dialog | `source-confirmed` |

현재 실행판에서 `Restart`는 confirmation 없이 즉시 mutation을 보낸다. 이는 관찰 결과일 뿐 우리 제품의
안전 interaction을 확정하는 규칙이 아니며, P2에서 operation 계약과 함께 별도 판정한다.

### 7.7 Live Traffic

| Method·path | 요청 | 응답 주요 shape | 소비 위치·주기 | 판정 |
|---|---|---|---|---|
| `GET /traffic/sources` | 없음 | `{cluster,active,detected[],notDetected[],recommended?}` | source detection·wizard, stale 30s | `runtime+source` |
| `POST /traffic/source` | `{source}` | active source result | source 변경 후 flows invalidate | `source-confirmed` |
| `POST /traffic/connect` | body 없음 | connection state | wizard connect | `source-confirmed` |
| `GET /traffic/flows` | `namespace?`, `since=5m|1h?` | `{source,timestamp,flows[],aggregated[],warning?}` | graph·flow dock REST snapshot, 수동 refresh | `runtime-gated` |
| `GET /network-policies/evaluate` | pod/label identity, direction, port, protocol | `{selectingPolicies[],verdict}` | flow detail policy check | `source-confirmed` |

server에는 `GET /traffic/flows/stream`이 등록되어 있지만 v1.8.1 standalone browser는 호출하지 않는다.
따라서 P1 소비 API에 포함하지 않고 §7.12의 server-only 경로로 분리한다.
namespace 접근 권한이 0개인 server 경로는 정상 object 대신 `[]`를 반환하는 shape 불일치가 있다.
client는 object를 전제로 하므로 이 예외도 P2에서 명시적으로 판정해야 한다.

### 7.8 Helm

| Method·path | 요청 | 응답 주요 shape | 소비 위치·주기 | 판정 |
|---|---|---|---|---|
| `GET /helm/releases` | `namespaces?` | release array: name/ns/chart/app version/status/revision/update/resource health | list/Home, stale 30s | `runtime+source` |
| `GET /helm/releases/{ns}/{name}` | 없음 | release detail·history·values metadata·resources | drawer, mutation 중 10s | `source-confirmed` |
| `GET /helm/releases/{ns}/{name}/manifest` | `revision?` | manifest text/object | Manifest·compare | `source-confirmed` |
| `GET /helm/releases/{ns}/{name}/values` | `revision?`, `all?` | values text/object | Values·compare | `source-confirmed` |
| `GET /helm/releases/{ns}/{name}/diff`, `GET /helm/releases/{ns}/{name}/values/diff` | `revision1,revision2`; values는 mode option | diff sections | compare Summary/Values | `source-confirmed` |
| `GET /helm/releases/{ns}/{name}/notes/diff`, `GET /helm/releases/{ns}/{name}/hooks/diff`, `GET /helm/releases/{ns}/{name}/resources/diff` | `revision1,revision2` | domain별 diff | Helm compare | `source-confirmed` |
| `GET /helm/releases/{ns}/{name}/upgrade-info` | 없음 | current/latest version, available, reason | drawer | `source-confirmed` |
| `GET /helm/releases/{ns}/{name}/versions` | 없음 | chart version array | upgrade dialog | `source-confirmed` |
| `GET /helm/upgrade-check` | `namespaces?` | release별 upgrade map | list batch decoration | `source-confirmed` |
| `GET /helm/repositories` | 없음 | repository array | Catalog | `source-confirmed` |
| `POST /helm/repositories/{name}/update` | body 없음 | update result | Catalog refresh | `source-confirmed` |
| `GET /helm/oci-sources` | 없음 | OCI source array | catalog source setting | `source-confirmed` |
| `POST /helm/oci-sources`, `DELETE /helm/oci-sources` | source identity/credentials 또는 delete identity | source result | Track chart source | `source-confirmed` |
| `GET /helm/charts` | repo/search/filter query | chart summary array | local Catalog search | `source-confirmed` |
| `GET /helm/charts/{repo}/{chart}`, `GET /helm/charts/{repo}/{chart}/{version}` | path version 또는 latest | chart detail·versions·values schema | install wizard | `source-confirmed` |
| `GET /helm/artifacthub/search` | `q,offset,limit,sort,official?,verified?` | paged chart hits | ArtifactHub Catalog | `source-confirmed` |
| `GET /helm/artifacthub/charts/{repo}/{chart}`, `GET /helm/artifacthub/charts/{repo}/{chart}/{version}` | path version 또는 latest | ArtifactHub chart detail | install wizard | `source-confirmed` |
| `POST /helm/releases/install-stream` | chart/repo/version/release/ns/values/options | fetch stream의 `data:` progress frame + terminal result | install progress | `source-confirmed` |
| `POST /helm/releases/{ns}/{name}/upgrade-stream` | version·repository·values·options query/body | progress frame + terminal result | upgrade confirm/progress | `source-confirmed` |
| `POST /helm/releases/{ns}/{name}/rollback-stream` | `revision` | progress frame + terminal result | rollback confirm/progress | `source-confirmed` |
| `POST /helm/releases/{ns}/{name}/values/preview` | candidate values | rendered/validated preview | Values editor | `source-confirmed` |
| `PUT /helm/releases/{ns}/{name}/values` | values + upgrade options | apply result | Values Apply | `source-confirmed` |
| `DELETE /helm/releases/{ns}/{name}` | uninstall options | uninstall result | uninstall confirm | `source-confirmed` |

Helm write 경로는 현재 runtime의 `helmWrite=false` 때문에 실행하지 않았다. 외부 GitOps 관리 HelmRelease는 직접
upgrade를 노출하지 않고 GitOps detail로 보낸다.
세 progress stream 모두 `{type:'progress',phase?,message?,detail?}`와 terminal
`{type:'complete',message,release?}` 또는 `{type:'error',message}`를 전달한다. event ID, sequence,
heartbeat, resume, reconnect, operation receipt, idempotency key는 없다.

### 7.9 GitOps

| Method·path | 요청 | 응답 주요 shape | 소비 위치·주기 | 판정 |
|---|---|---|---|---|
| `GET /api-resources`, `GET /resource-counts`, `GET /resources/{kind}` | 외부 GitOps Application·Kustomization·HelmRelease·source kind discovery | raw CR object를 client에서 canonical row로 정규화 | list; count 60s/row 120s | `runtime+source` |
| `GET /gitops/tree/{kind}/{ns-or-_}/{name}` | `group?,namespaces?` | `{root,nodes,edges,warnings?,summary}`; edge `owns|source|dependsOn` | detail Topology, stale 5s | `source-confirmed` |
| `GET /gitops/insights/{kind}/{ns-or-_}/{name}` | `group?,namespaces?` | `{summary,issues?,changes?,plan?,history?,capabilities?,warnings?,partial?}` | detail Resources/Activity, stale 5s; Running 2s | `source-confirmed` |
| `POST /gitops/{kind}/{ns}/{name}/reconcile` | body 없음 | 즉시 `{message,operation,tool,resource,requestedAt?,source?}` | list/detail action | `source-confirmed` |
| `POST /gitops/{kind}/{ns}/{name}/sync-with-source` | body 없음 | 같은 immediate response | list/detail action | `source-confirmed` |
| `POST /gitops/{kind}/{ns}/{name}/suspend`, `POST /gitops/{kind}/{ns}/{name}/resume` | body 없음 | 같은 immediate response | lifecycle action | `source-confirmed` |
| `POST /gitops/applications/{ns}/{name}/sync` | `{resources?,revision?,prune?,dryRun?,force?,applyOnly?,syncOptions?}` | 같은 immediate response | sync dialog/action | `source-confirmed` |
| `POST /gitops/applications/{ns}/{name}/refresh` | `type=hard?`, body 없음 | 같은 immediate response | refresh/hard refresh | `source-confirmed` |
| `POST /gitops/applications/{ns}/{name}/rollback` | `{id,prune?,dryRun?}` | 같은 immediate response | history rollback | `source-confirmed` |
| `POST /gitops/applications/{ns}/{name}/terminate` | body 없음 | 같은 immediate response | running operation action | `source-confirmed` |
| `POST /gitops/applications/{ns}/{name}/suspend`, `POST /gitops/applications/{ns}/{name}/resume` | body 없음 | 같은 immediate response | lifecycle action | `source-confirmed` |

operation receipt·idempotency key·progress cursor endpoint는 없다. 외부 GitOps Application은 insights의 Running phase를 2초
polling하고 외부 source controller는 별도 in-flight 계약이 없다. 또한 UI operation union과 backend가 반환 가능한 rollback
등 일부 operation 문자열 사이 불일치가 소스에 존재한다. 이는 P2에서 숨기지 않고 계약 갭 후보로 평가한다.

### 7.10 Cost·Settings·기타 overlay

| Method·path | 요청 | 응답 주요 shape | 소비 위치·주기 | 판정 |
|---|---|---|---|---|
| `GET /opencost/summary` | 없음 | `available`, `reason?`, currency/window, hourly·monthly, storage/idle, efficiency, namespaces | Home Cost·Cost header, 60s | `runtime+source` |
| `GET /opencost/workloads` | `namespace` | workload cost rows | namespace inline expand | `source-confirmed` |
| `GET /opencost/trend` | `range=6h|24h|7d` | time buckets by namespace/category | Cost trend, 120s | `source-confirmed` |
| `GET /opencost/nodes` | 없음 | node cost/efficiency rows | Cost nodes, 120s | `runtime+source` |
| `GET /config` | 없음 | `{file,effective,isDesktop,prometheusHeaderKeys?}`; config에 kubeconfig dirs/default ns/port/browser/MCP/timeline/Prometheus 포함 | Settings/MCP setup | `runtime+source` |
| `PUT /config` | 전체 config object | saved config | Settings Save; 다음 launch 적용 | `source-confirmed` |
| `PUT /integrations/prometheus` | `{prometheusUrl,headers?}` | `{connected,address?,error?}`; persist + live probe 결과 | Settings Apply now | `source-confirmed` |

OpenCost unavailable reason은 `no_prometheus`, `no_metrics`, `query_error`를 구분한다. config 응답은
Prometheus secret header의 값은 노출하지 않고 key만 반환한다. integration update에서 headers 생략은
기존 secret 유지, 빈 object는 삭제 의미다.

### 7.11 실시간 event 계약

| Transport·path | 요청 | event/response | 소비 위치·재연결 | 판정 |
|---|---|---|---|---|
| `SSE /events/stream` | `namespaces?,view?,policyEffect?` | `connection_state`, initial/debounced `topology`, immediate `k8s_event`, `context_switch_progress`, `context_changed`, `deferred_ready`, 30s `heartbeat` | 전역; 3s×1.5, max 30s reconnect | `runtime+source` |

server는 client 최대 100개를 허용한다. server topology debounce는 warm-up 뒤 규모에 따라
1/2/5/15초, client commit throttle은 node 수에 따라 0.5/1/2/3초다. `Last-Event-ID`, resume cursor,
sequence number는 없다. 재연결 시 full initial topology로 다시 수렴한다.

### 7.12 server 등록 경로 중 standalone browser 비소비

다음 경로는 v1.8.1 server에 등록됐지만 standalone screen call-chain과 runtime network에서 소비되지
않았다. P1 기능 동등 목록에 자동 포함하지 않으며 P2가 임의로 연결해서도 안 된다.

| 경로 | 비소비 판정 근거 |
|---|---|
| `GET /events`, `GET /certificates`, `GET /packages`, `GET /metrics/top/resources` | UI는 각각 `/changes`, certificate summary, resource catalog, pod/node top을 사용 |
| `GET /gitops/managed-resources`, `GET /argo/destinations` | shared/hub 또는 server 보조 계약만 있고 standalone call 없음 |
| `GET /traffic/flows/stream` | server route는 있으나 현재 TrafficView는 REST snapshot·manual refresh라고 명시 |
| `GET /traffic/source`, `GET /traffic/connection` | client hook은 있으나 standalone component import/call 없음 |
| `GET /changes/{kind}/{ns}/{name}/children` | client hook은 있으나 standalone component import/call 없음 |
| `GET /prometheus/namespace/{ns}`, `GET /prometheus/cluster` | client hook은 있으나 standalone component import/call 없음 |
| `GET /workloads/{kind}/{ns}/{name}/pods`, `GET /workloads/{kind}/{ns}/{name}/logs` | client hook은 있으나 UI는 workload log SSE를 직접 사용 |
| `POST /helm/releases`, `POST /helm/releases/{ns}/{name}/rollback`, `POST /helm/releases/{ns}/{name}/upgrade` | non-stream 경로는 정의·등록됐지만 UI는 progress stream 경로를 사용 |
| `GET /ai/**`, `GET /debug/**`, `/debug/pprof/**` | MCP·diagnostics 개발용 server surface; 제품 browser screen call 없음 |
| `POST /agent/self-upgrade` | server/Hub 운영 경로; standalone desktop update UI는 `/desktop/update*` 사용 |

## 8. Capability·권한·제한 동작

- global capability는 `/capabilities`, namespace capability는 `/capabilities?namespace=`로 읽는다.
- exec, local terminal, Helm write, node write, workload write, port-forward, logs, secret read/update,
  resource verb가 별도 capability다.
- CRD screen과 GitOps kind는 `/api-resources` discovery에 실제 kind가 있을 때만 query한다.
- API 403은 empty로 바꾸지 않는다. resource list는 forbidden/unavailable kind를 별도 표시한다.
- namespace 제한 계정은 visible namespace만 보여 주고 결과가 부분적임을 impact 문구로 표시한다.
- 현재 runtime에서 `exec=false`, `localTerminal=false`, `helmWrite=false`이므로 해당 action 성공은
  관찰하지 않았다.
- external destination처럼 현재 인스턴스가 연결하지 않은 cluster는 workload link를 disabled하고
  연결할 cluster명을 reason으로 표시한다.

## 9. RCA 후속 삽입 후보

RCA를 새 top-level menu로 만들지 않는다. P1에서 확인한 정보 구조상 다음 위치가 의미적으로 맞다.

| 후보 | 삽입 이유 | 필요한 context | P1 조치 |
|---|---|---|---|
| Home Active Issues row/detail | 사용자가 cluster 문제를 처음 발견하는 지점 | cluster, namespace, resource, issue evidence | 위치만 예약 |
| Issues resource row 확장 또는 detail | issue→원인→근거→복구의 주 서사 | issue ID, correlation ID, resource ref | 위치만 예약 |
| Resource drawer의 issue/audit 다음 section | 단일 resource 진단 context가 완성됨 | resource UID/ref, events, metrics, relations | `POST /diagnose/runs`, `GET /diagnose/runs`, `SSE /diagnose/runs/{run_id}/stream`; exact identity와 durable replay |
| Workload detail의 Events/Metrics 인접 tab | workload 단위 RCA evidence와 같은 scope | workload ref, pod members, time range | `GET /dashboard/resources/issues`, `GET /rca-reports`; exact workspace·cluster·resource 범위의 원인·영향·근거 패널 |
| GitOps detail Resources/Activity | drift·operation failure의 원인과 recovery가 자연스럽게 연결 | app ref, revision, changes, history | `GET /dashboard/resources/issues`, `GET /rca-reports`; application/resource detail 공용 RCA context 연결 |
| Timeline event/resource change detail | 시간 순 인과와 correlation을 보여 주는 지점 | event ID, occurredAt, resource ref | `GET /dashboard/rca/incidents/{incident_id}`, `GET /dashboard/resources/issues`, `GET /rca-reports`; incident correlation 또는 exact resource context 연결 |

RCA가 없는 대상에는 빈 card나 가짜 요약을 만들지 않는다. P2 endpoint와 binding이 확인된
Workload·GitOps·Timeline 후보만 공용 strict adapter로 연결하며, 범위가 불완전하면 추론 없이 부분 상태를 표시한다.

## 10. P1 완료·P2 인계 조건

- 모든 primary·contextual route가 route 표와 화면 절에 존재한다.
- 전역 shell, mouse, keyboard, URL, focus, realtime 동작이 기록됐다.
- browser가 호출하는 read·mutation·stream endpoint가 §7에 한 번 이상 존재한다.
- browser 소비 API mapping unit 136행을 기계적으로 재계수했고 P2의 동일 행 수 게이트를 고정했다.
- runtime 완결 관찰과 gated/source-confirmed 관찰을 구분했다.
- 외부 코드·스타일을 제품에 복사하지 않았다.
- 동일 checkout의 Apache-2.0 license를 확인했으며 P1에서는 코드를 이식하지 않았다.
- RCA는 후보 위치만 기록했다.
- P2는 이 문서의 API row를 한 행도 생략하지 않고 우리 route 근거와 매핑한다.
