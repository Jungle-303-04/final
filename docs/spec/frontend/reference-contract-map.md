---
title: 외부 기준 기능 → 제품 계약 매핑표
status: p2-in-progress
date: 2026-07-11
source_inventory: reference-feature-inventory.md
source_mapping_units: 136
target_mapping_units: 0
next_gate: final-questions.md 1회 질문 라운드
---

# 외부 기준 기능 → 제품 계약 매핑표

## 0. 목적과 완료 불변식

이 문서는 P1의 browser 소비 API 136 mapping unit을 우리 backend 정본과 일대일 대조하는 P2
산출물이다. backend 구현을 추측하거나 synthetic로 대체하지 않는다.

완료 시 다음 조건을 동시에 만족해야 한다.

1. `P1 136 = P2 136`이고 reference ID가 중복·누락되지 않는다.
2. 각 행의 판정은 `직결`, `어댑터`, `BE-Gap` 중 정확히 하나다.
3. `우리 계약`은 `src/packages/contracts/gateway/routes.py`의 상수명과 실제 router response model
   근거를 함께 가진다. path 문자열만 비슷한 것은 근거가 아니다.
4. `어댑터`는 화면 component가 아니라 `src/product`의 view-neutral adapter가 수행할 변환을 적는다.
5. 필요한 endpoint 함수·schema가 없으면 직접 만들지 않고 `api-needs.md`에 요청한다.
6. `BE-Gap`은 disabled UI로 남기지 않는다. capability가 실존하지 않으므로 해당 control/surface를
   렌더하지 않는다.
7. 외부 기준 저장소의 provider·brand 이름은 제품 DTO와 화면 분기 기준이 아니다.

## 1. 판정 규칙

| 판정 | 의미 | 화면 처리 |
|---|---|---|
| `직결` | 우리 endpoint의 의미·scope·필수 데이터가 reference 기능을 변환 없이 충족 | 검증된 API 함수 결과를 그대로 소비 |
| `어댑터` | 의미는 충족하지만 endpoint 결합·field rename·filter·client state·polling 치환이 필요 | view-neutral adapter에서만 변환 |
| `BE-Gap` | 필수 의미·권한·데이터·operation이 우리 backend에 없음 | UI 미노출, stable gap ID 부여 |

부분 필드만 비슷하면 `직결`로 판정하지 않는다. reference의 핵심 interaction을 만들 수 있을 만큼
의미가 완결되고, 누락 필드가 optional presentation에만 영향을 줄 때만 `어댑터`가 가능하다.

## 2. 우리 계약 정본과 API 소유 경계

- route 정본: `src/packages/contracts/gateway/routes.py`
- request/response 정본: `src/packages/contracts/gateway/requests.py`, `responses.py`
- router 의미·permission: `src/domains/**/router.py`
- frontend endpoint 함수·Zod schema 소유: 병렬 API 작업자, `src/product/api/**`
- 화면·adapter·state 소유: Codex, `src/product/**` 중 API endpoint/schema 외 영역
- 사용 승인: `codex-progress-20260711.md`의 `API 완성:` 기록이 있는 함수만 화면에서 소비
- 요청 큐: `api-needs.md`

## 3. API 136행 매핑

| ID | Reference method·path | 우리 계약 상수·path | 판정 | adapter 또는 gap 근거 | API 함수 상태 |
|---|---|---|---|---|---|

## 4. UI 컴포넌트 매핑

`CAT`는 현재 `src/components/ui/**`의 catalog source이고 제품에서 직접 import하지 않는다. `Port`는
같은 primitive를 `src/product/shared/ui/primitives/**`에 제품 소유 코드로 재생성한다는 뜻이다.
`PROD`는 기존 `src/product/shared/ui/**`다. Custom은 시각 스타일이 아니라 primitive에 없는 도메인
interaction만 구현한다.

### 4.1 전역 셸·공통 요소

| ID | Reference UI 요소 | 제품 소유 primitive/composite | 방식 | custom 사유 | keyboard·a11y 계약 |
|---|---|---|---|---|---|
| `UI-001` | 접힘 가능한 왼쪽 rail | Port `Sidebar*` | 조합 | `ProductShell`은 route/capability 조합만 담당 | `nav` label, `aria-current`, `aria-expanded` |
| `UI-002` | slim rail hover label | Port `Tooltip` | 직접 | 없음 | keyboard focus에도 tooltip, icon accessible name |
| `UI-003` | 상단 utility bar | Port `ButtonGroup`, `Button`, `DropdownMenu`, `Tooltip`, `Separator` | 조합 | Header 배치 composite만 제품 소유 | `header` landmark, 논리적 tab 순서 |
| `UI-004` | context+namespace scope pill | Port `Combobox`, `Popover`, `ButtonGroup`, `Badge` + `ScopePicker` | Custom | selector 연동, 다중 namespace, URL 보존, disabled reason | combobox keyboard, 선택 수 announce, `aria-describedby` |
| `UI-005` | connection·freshness·health | PROD `StatusMark` + Port `Badge`, `Tooltip` | 조합 | canonical status formatter | 색 외 text, 변경 `aria-live=polite` |
| `UI-006` | port-forward indicator | Port `Badge`, `Popover`, `Item`, `Button` | 조합 | 없음 | session 수 accessible name, stop keyboard |
| `UI-007` | resource·command omnibar | Port `CommandDialog` | 직접 | 없음 | Cmd/Ctrl+K, focus trap, grouped/empty, Escape |
| `UI-008` | theme/help/diagnostics/terminal action | Port `Toggle`, `ButtonGroup`, `DropdownMenu`, `Tooltip` | 조합 | capability 노출만 shell 소유 | `aria-pressed`, icon label; unsupported는 미렌더 |
| `UI-009` | screen scroll owner | Port `ScrollArea` | 직접 | route별 단일 owner 지정 | nested scroll 최소화, `main` focus target |
| `UI-010` | URL-backed resource/Helm detail | Port `Sheet`·`Drawer`·`Tabs` + `ResponsiveDetailSurface` | Custom | 동일 URL/content/focus를 desktop/mobile overlay가 공유 | Title, Escape, focus trap/restore, background inert |
| `UI-011` | Settings·permissions·diagnostics·shortcut overlay | Port `Dialog`, `Tabs`, `ScrollArea` | 조합 | 없음 | DialogTitle, Escape, focus trap |
| `UI-012` | logs/exec/terminal/port-forward dock | Port `Resizable`, `Tabs`, `ButtonGroup` + `SessionDock` | Custom | 지속 session, resize, reconnect, close, route 밖 lifecycle | resize keyboard 대안, roving tab focus |
| `UI-013` | context switching overlay | Port `Dialog`, `Progress`, `Spinner`, `Alert` | Custom state | realtime progress와 terminal state 결합 | progress `aria-live`, cancel 가능 여부 명시 |
| `UI-014` | toast | Port `Sonner` | 직접 | 없음 | 중요 실패는 화면 state도 유지 |
| `UI-015` | initial loading | Port `Skeleton`, `Spinner` + PROD `ProductStateScreen` | 조합 | screen-shaped skeleton | `aria-busy`, skeleton hidden, reduced-motion |
| `UI-016` | empty/no-data | Port `Empty` + PROD `ProductStateScreen` | 조합 | 없음 | title/description/recovery action |
| `UI-017` | error/partial/stale/403/background failure | Port `Alert`, `Badge`, `Button` + PROD `ProductStateScreen` | 조합 | last-valid 유지 여부는 query state | 403/error 분리, retry label, polite announce |
| `UI-018` | 일반 surface/card | PROD `Surface` 또는 Port `Card` | 직접 | title/action/footer가 있으면 Card composition | section heading 연결 |
| `UI-019` | KPI·count·usage | PROD `Metric` + Port `Progress`, `Chart` | 조합 | nullable value와 unit formatter | unavailable을 0으로 읽지 않음 |
| `UI-020` | status badge | PROD `StatusMark` + Port `Badge` | 조합 | backend status 전체 literal formatter | 색+문자, unknown 명시 |
| `UI-021` | 일반 row/activity list | Port `Item`, `Separator`, `ScrollArea` | 직접 | 없음 | 실제 이동은 link/button; clickable div 금지 |
| `UI-022` | 일반 table | Port `Table` | 직접 | 단순 표만 해당 | caption, sortable `aria-sort` |
| `UI-023` | 위험/write action | Port `Button`, `DropdownMenu`, `AlertDialog` | 조합 | receipt state는 feature 소유 | confirm, pending 중 중복 실행 금지 |
| `UI-024` | search·filter·option | Port `InputGroup`, `Combobox`, `Select`, `Checkbox`, `ToggleGroup`, `Switch`, `Popover` | 조합 | 없음 | clear filter, 2~7 options는 ToggleGroup |
| `UI-025` | detail section/tab | Port `Tabs`, `Accordion`, `Collapsible`, `Breadcrumb` | 조합 | 없음 | URL tab과 focus 동기화 |
| `UI-026` | Settings·wizard form | Port `Field`, `InputGroup`, `Select`, `Checkbox`, `RadioGroup`, `Textarea` | 조합 | 없음 | FieldSet/Legend, `aria-invalid` |
| `UI-027` | shortcut help·registry | Port `Dialog`, `Table`, `Kbd` + `useShortcutRegistry` | Custom | scoped chord, timeout, input 억제, scope priority | allowInInputs만 허용, sequence 취소 |
| `UI-028` | light/dark toggle | Port `Toggle` + existing theme runtime | 직접 | 없음 | label, `aria-pressed`, OS initial value |

### 4.2 화면별 요소

| ID | 화면·요소 | 제품 소유 primitive/composite | 방식 | custom 사유 | keyboard·a11y 계약 |
|---|---|---|---|---|---|
| `UI-029` | Home 3-band + attention rail | PROD `Surface`·Port `Card`, `Separator` | 조합 | responsive CSS grid | mobile에서 attention을 DOM 순서대로 하단 배치 |
| `UI-030` | Cluster Health summary | PROD `Metric`, `StatusMark` + Port `Progress`, `Button` | 조합 | API count/freshness link composition | count는 link, refresh announce |
| `UI-031` | preview cards | Port `Card`, `AspectRatio`, `Item` | 조합 | topology preview renderer만 별도 | nested interactive 금지 |
| `UI-032` | Home Active Issues | Port `Item`, `Badge`, `ScrollArea` | 조합 | visibility/truncation composition | issue/resource link, severity text |
| `UI-033` | resource kind catalog | Port `Accordion`, `ScrollArea`, `Badge`, `Toggle` | 조합 | discovery category·favorite state | `[/]`, current `aria-current` |
| `UI-034` | favorite kind | Port `Toggle`, `Tooltip` | 직접 | 없음 | `aria-pressed`, icon name |
| `UI-035` | smart resource grid | Port `Table` + existing table engine + `ResourceDataGrid` | Custom | smart columns, resize, filters, row cursor, compare, shortcut grammar | roving row focus, sort, resize keyboard |
| `UI-036` | column/label manager | Port `DropdownMenu`, `Checkbox`, `Input` | 조합 | 없음 | menu checkbox와 column name 연결 |
| `UI-037` | resource detail | `UI-010` + Port `Tabs`, `Accordion`, `Badge`, `DropdownMenu` | 조합 | kind/capability section registry | Enter/d, y, l, Escape, focus restore |
| `UI-038` | YAML viewer/editor | Port `Textarea`, `ScrollArea`, `ButtonGroup` + `YamlEditor` | Custom | syntax, line, validation, large text, read/edit mode | label, tab policy, validation line announce |
| `UI-039` | live logs | Port `ScrollArea`, `InputGroup`, `ButtonGroup`, `Switch` + `LogViewer` | Custom | stream append, tail lock, filter/search, high volume | pause/tail, polite new-line announce |
| `UI-040` | resource/workload metrics | Port `Chart` | 조합 | query/unit/freshness adapter만 필요 | chart description + table alternative |
| `UI-041` | image filesystem | Port `Accordion`, `Collapsible`, `ScrollArea` + `FileTree` | Custom | arbitrary-depth lazy tree·download | tree semantics, arrow navigation |
| `UI-042` | related resources/events/RBAC | Port `Item`, `Table`, `Badge`, `Collapsible` | 조합 | 없음 | stable identity가 없으면 link 금지 |
| `UI-043` | YAML/resource compare | Port `Tabs`, `ToggleGroup`, `ButtonGroup`, `ScrollArea` + `DiffViewer` | Custom | aligned side/unified hunks와 diff/spec/raw filter | add/delete text label |
| `UI-044` | Issues severity facet | Port `ToggleGroup` multiple, `Badge`, `Button` | 직접 | 없음 | `aria-pressed`, clear |
| `UI-045` | Issues rows | Port `Item` 또는 `Table`, `Badge` | 조합 | evidence preview composition | row link, severity/source text |
| `UI-046` | Topology toolbar | Port `ToggleGroup`, `Select`, `InputGroup`, `ButtonGroup`, `Tooltip` | 조합 | 없음 | f/+/-/0, icon labels |
| `UI-047` | Topology kind filters | Port `Accordion`, `Checkbox`, `ScrollArea` | 조합 | 없음 | filtered count announce |
| `UI-048` | Topology graph | `TopologyCanvas` | Custom | arbitrary node/edge, layout, pan/zoom, multi-select, LOD는 Chart 범위 밖 | focusable nodes, parallel list, reduced motion |
| `UI-049` | policy/selection overlay | Port `Popover` 또는 `Sheet`, `Item`, `Badge` | 조합 | graph selection state만 adapter | trigger-selected node 연결 |
| `UI-050` | Applications list | Port `Table`, `Badge`, `Item` | 조합 | 없음 | sortable status, app link |
| `UI-051` | application relation graph | `UI-048` scoped preset | Custom reuse | 같은 graph, app scope layout만 다름 | parallel list 동일 |
| `UI-052` | environment switcher | Port `Combobox`, `Badge` | 조합 | workload identity preservation | current env announce, reason |
| `UI-053` | embedded Workload detail | Port `Breadcrumb`, `Tabs`, `Button`, `Sonner` | 조합 | nested URL/back state | back label, focus restore |
| `UI-054` | Timeline controls | Port `ToggleGroup`, `Select`, `Switch` | 조합 | 없음 | control-result count 연결 |
| `UI-055` | Timeline event/change list | Port `Item`, `Collapsible`, `Badge`, `Separator` | 조합 | lazy child diff | chronological list, expanded state |
| `UI-056` | Timeline swimlane | `TimelineSwimlane` | Custom | category lane, absolute time, zoom/range, event selection | keyboard event list, range text |
| `UI-057` | Traffic setup | Port `Card`, `RadioGroup`, `Field`, `Dialog`, `Progress`, `Alert` | Custom wizard | discovery→connect state machine | FieldSet, progress announce |
| `UI-058` | Traffic flow list | Port `Table`, `Badge` | 직접 | 없음 | protocol/status text |
| `UI-059` | Traffic graph | `TopologyCanvas` flow preset 또는 domain SVG | Custom | directed width/arrow/selection | accessible flow table 필수 |
| `UI-060` | Helm releases·drawer | Port `Table` + `UI-010`, `Tabs`, `Badge` | 조합 | 없음 | revision/action label |
| `UI-061` | Helm install/upgrade wizard | Port `Dialog`, `Field`, `Command`, `Select`, `Textarea`, `Progress` + `OperationWizard` | Custom | discovery, step validation, review, stream lifecycle | step title/current/total, previous/next |
| `UI-062` | Helm code/diff panels | `UI-038`, `UI-043` | Custom reuse | 동일 code/diff 요구 | 동일 |
| `UI-063` | Helm progress stream | Port `Progress`, `Alert`, `ScrollArea`, `Spinner` + `StreamingOperationStatus` | Custom | frame accumulation과 terminal convergence | `aria-live`, terminal focus |
| `UI-064` | GitOps table/tile switch | Port `ToggleGroup`, `Table`, `Card`, `Badge` | 조합 | canonical row adapter | same selection, pressed state |
| `UI-065` | GitOps filters | Port `Combobox`, `Select`, `Checkbox`, `Popover`, `Badge` | 조합 | 없음 | active chips, clear-all |
| `UI-066` | GitOps operations | Port `DropdownMenu`, `Button`, `AlertDialog`, `Spinner` | 조합 | capability/lifecycle/receipt state | reason, confirm, pending |
| `UI-067` | GitOps detail | Port `Tabs`, `Breadcrumb` + `UI-048` | 조합+Custom | graph only custom | URL tab sync |
| `UI-068` | drift/history/remediation | `UI-043` + Port `Collapsible`, `Table`, `Item`, `Badge` | 조합 | ResourceDiff adapter | rollback confirm, field text |
| `UI-069` | Checks explorer | Port `InputGroup`, `Combobox`, `Table`, `Badge`, `Collapsible`, `Switch`, `AlertDialog` | 조합 | persisted hide scope | remediation heading, impact confirm |
| `UI-070` | Cost summary/trend | PROD `Metric` + Port `Chart`, `Table`, `ToggleGroup`, `Alert`, `Tooltip` | 조합 | unavailable-reason adapter | chart table alternative, reason |
| `UI-071` | Workload detail | Port `Tabs` + `UI-038/039/040/048`, `Table`, `Badge` | 조합 | kind/data section registry | unavailable section tab 미렌더 |
| `UI-072` | Settings forms | Port `Dialog`, `Tabs`, `Field`, `InputGroup`, `Switch`, `NativeSelect`, `Button`, `Alert` | 조합 | secret redaction/persistence state | secret label, pending announce |
| `UI-073` | Auth barrier | Port `Card`, `Field`, `Button`, `Spinner`, `Alert` | 조합 | redirect/callback state | heading, callback busy, retry |

### 4.3 Custom dependency 결정 후보

| 후보 | 현재 dependency 상태 | 최종 질문 대상 |
|---|---|---|
| `TopologyCanvas`·Traffic/App graph | graph layout·interaction dependency 없음 | graph engine 선택 |
| `DiffViewer`·`YamlEditor` | code editor·diff engine 없음 | editor/diff dependency 선택 |
| `LogViewer`·terminal | virtualization·terminal emulator 없음 | log virtualization·terminal dependency 선택 |
| `ResourceDataGrid` | table engine 있음, virtualization 없음 | 대형 grid virtualization 선택 |

## 5. RCA·복구·AI 통합 매핑

### 5.1 데이터·route 매핑

| 삽입 지점 | 우리 route 상수·path | 제품 동작 | API 함수 상태 | 판정 |
|---|---|---|---|---|

### 5.2 UI 매핑

| ID | 삽입 UI | 제품 소유 primitive/composite | 방식 | custom 사유 | keyboard·a11y 계약 |
|---|---|---|---|---|---|
| `RCA-001` | Issues top-level menu | Port `SidebarMenuItem`, `SidebarMenuButton`, `Badge` | 직접 | 기존 Issues IA를 RCA-backed route로 연결 | current route와 open count text |
| `RCA-002` | incident list·detail | Port `Table`/`Item` + `UI-010`, `Tabs`, `Badge`, `Alert` | `IncidentWorkspace` 조합 | timeline→detail/correlation binding | `incident_id`가 있을 때만 row link |
| `RCA-003` | summary·status·root cause | PROD `StatusMark` + Port `Card`, `Badge`, `Item` | 조합 | RCA status 전체 literal formatter | status 축소 금지, 문자 보존 |
| `RCA-004` | recovery plan·action select | Port `Card`, `Accordion`, `Progress`, `RadioGroup`, `AlertDialog`, `Button`, `Spinner` + `RecoveryPlanSection` | Custom | plan/action receipt와 terminal convergence | FieldSet, confirm, pending 중 중복 금지 |
| `RCA-005` | evidence trail | Port `Item`, `Separator`, `Collapsible`, `Badge`, `ScrollArea` + `EvidenceTrail` | Custom | correlation 순서, source/type/time, late item 보존 | ordered list, timestamp, 색 외 source/type |
| `RCA-006` | resource-scoped AI analysis | Port `Card`/`Collapsible`, `Alert`, `Badge` + `ScopedAiAnalysisSection` | 조합 | resource/correlation binding과 no-data 미렌더 | heading, empty card 금지 |
| `RCA-007` | global AI conversation drawer | Port `Sheet`/`Drawer`, message primitives, `InputGroup`, `Textarea`, `Button`, `Spinner` + `AiConversationDrawer` | Custom | conversation, polling, status, context, retry | Title, focus trap, message log, composer label |
| `RCA-008` | selected context attachment | Port `Attachment`, `Badge`, `Tooltip`, `Button` + `ResourceContextAttachment` | 조합 | canonical resource context 직렬화 | cluster/kind/name readable label |
| `RCA-009` | conversation list/switch | Port `Command`, `ScrollArea`, `Item`, `Badge` | 조합 | pagination·selected state | listbox keyboard, current announce |
| `RCA-010` | AI/recovery async status | Port `Progress`, `Badge`, `Alert`, `Sonner` + `OperationStatusView` | Custom | accepted→poll→terminal, retry, literal preservation | `aria-live`, failure CTA, optimistic 완료 금지 |

## 6. Backend gap 대장

| Gap ID | 필요한 의미 | 영향 화면·interaction | 현재 가장 가까운 계약 | P4 처리 |
|---|---|---|---|---|

## 7. API 요청 큐 인계

P2에서 필요한 endpoint 함수·schema만 `api-needs.md`에 한 번씩 요청한다. 같은 route를 여러 화면이
쓰면 함수군 하나로 합치되 필요한 모든 화면을 비고에 적는다. `API 완성:` 기록 전에는 존재하는
파일도 화면에서 import하지 않는다.

## 8. P2 완료 게이트

- reference ID `REF-API-001`~`REF-API-136` 연속성·유일성 검증
- 판정 136개, 미정 0개
- route 상수·router 근거 없는 `직결`/`어댑터` 0개
- component mapping 누락 0개
- goalmode RCA 5개 삽입 지점 매핑 완료
- `api-needs.md`와 이 문서의 함수 상태 일치
- allowlist 밖 archived 문서 참조 0개
- `npm run check` 통과
