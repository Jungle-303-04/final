---
source_commit: 664925a6
status: synced
---

# features/notifications — 알림 합성 피드·RCA 인시던트 그래프·DLQ 운영

> 소스: `frontend/src/features/notifications/`

## 책임 (Responsibility)

- 3개 실존 소스(승인 대기 run · RCA 타임라인 인시던트 · open Dead Letter)를 정규화한 합성 알림 피드(`useNotices`) — 전용 알림 API(G9) 도입 시 `api.ts` 만 교체.
- RCA 타임라인/인시던트 상세 훅, 인시던트 파이프라인 그래프 뷰, Dead Letter 재처리 화면(설정 하위).
- 읽음 처리는 localStorage 워터마크(kind 별 마지막 확인 시각)로 로컬 관리.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`, `@/shared/lib/types`, `@/shared/lib/adapt`(`adaptIncident`, `adaptIncidentDetail`), `@/shared/lib/format`, `@/shared/ui`, `@/shared/ui/status`, `@/shared/ui/icons`, `@/shared/flow`, `@/shared/motion` | [shared](shared.md) | API·그래프·UI |
| import | `@/features/repo/api`(`useApplications`, `useRunsAll`) | [repo](./repo.md) | 승인 대기 알림 소스 |
| import | `@/features/auth/api`(`useIsAdmin`) | [auth](./auth.md) | DLQ 쿼리는 admin 만 |
| import | `@/features/org/SettingsNav` | [org](./org.md) | OpsView 레이아웃 |
| import ← | [app/AppShell](app.md)(unread 뱃지), [fleet](./fleet.md)·[cluster](./cluster.md)(useTimeline) | — | 소비자 |
| 백엔드 | `/dashboard/rca/*`, `/dead-letters*` | [api-gateway](../services/gateway-api-gateway.md) | |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | API | 폴링/옵션 |
|---|---|---|---|
| `useTimeline` | `frontend/src/features/notifications/api.ts :: useTimeline` | GET `/dashboard/rca/timeline?limit=20` | 쿼리키 `['timeline']`, 60s, select `d.items.map(adaptIncident)` |
| `useIncident` | `frontend/src/features/notifications/api.ts :: useIncident` | GET `/dashboard/rca/incidents/${incidentId}` | 쿼리키 `['incident', id]`, `enabled: !!id`, 30s, select `adaptIncidentDetail(d.item ?? {})` |
| `useDeadLetters` | `frontend/src/features/notifications/api.ts :: useDeadLetters` | GET `/dead-letters?limit=20` | `(enabled: boolean)`, 쿼리키 `['dead-letters']`, 60s, select `.dead_letters` |
| `useReplayDeadLetter` | `frontend/src/features/notifications/api.ts :: useReplayDeadLetter` | POST `/dead-letters/${id}/replay` | mutation `(id: number)`, 성공 시 `['dead-letters']` invalidate |
| `useNotices` | `frontend/src/features/notifications/api.ts :: useNotices` | (합성 — 아래) | `() => { notices: Notice[]; unread: number; markAllSeen: (kind?: string) => void }` |
| `timeAgo` (re-export) | `frontend/src/features/notifications/api.ts :: timeAgo` | — | shared/lib/format 재수출 |

`useNotices` 합성 규칙:

1. 소스: `useRunsAll(useApplications())` 의 `WAITING_FOR_APPROVAL` run → `{ id: 'apr-<run_id>', kind:'approval', tone:'warn', title:'배포 승인 필요: <appId> <sha7>', link:'/workflows/<run_id>' }`; `useTimeline` 항목 → `{ id:'inc-<incident_id>', kind:'incident', tone:'danger', title:'인시던트: <summary>', link:'/incidents/<id>' }`; `useDeadLetters(admin)` 중 `status==='open'` → `{ id:'dlq-<id>', kind:'dlq', tone:'danger', title:'처리 실패 이벤트: <subject> (<consumer>)', link:'/settings/ops' }`.
2. 읽음: `localStorage['notice:lastSeen:<kind>'] >= n.at` 이면 `read: true`. `useSyncExternalStore` + 모듈 listener Set 으로 같은 탭 내 갱신 전파.
3. 정렬: `at` 내림차순. `unread` = read 아닌 개수.
4. `markAllSeen(kind?)`: kind 지정 시 그 kind 만, 아니면 `['approval','incident','dlq','cluster']` 전부 + `'any'` 워터마크를 현재 시각으로.

## 컴포넌트

### `frontend/src/features/notifications/NotificationsView.tsx :: NotificationsView` (default export)

- 라우트: `/notifications`.
- 모듈 상수 `FILTERS`: `[['all','전체'],['approval','승인'],['incident','인시던트'],['dlq','운영(DLQ)'],['cluster','클러스터']]`.
- state: `filter`(기본 'all'). 마운트 시 `markAllSeen()` 1회(진입 시 워터마크 갱신).
- 트리: h1 '알림' → 필터 버튼 행(`btn btn--sm`, 비활성은 `btn--ghost` 추가) → 비면 `EmptyState(IconBell '알림이 없습니다')`, 아니면 `AnimatedList(key=n.id)`: `Card` 행 = `Badge(tone, kind)` + title(read 면 opacity 0.6) + timeAgo + `Link(n.link)` '바로가기 →'.

### `frontend/src/features/notifications/IncidentDetailView.tsx :: IncidentDetailView` (default export)

- 라우트: `/incidents/:incidentId`. 데이터: `useIncident`.
- state: `collapsed: Record<string, boolean>`(evidence/actions 그룹 접기).
- 파이프라인 모델(비공개 유틸):
  - `STAGES = ['incident','evidence','analysis','actions']`, 라벨 `인시던트/증거 수집/원인 분석/복구 조치`.
  - `stageOfSubject(subject)`: 소문자화 후 정규식 매핑 — `recovery|action|plan|command|execut|patch`→actions, `evidence|collect`→evidence, `analy|rca|root|diagnos`→analysis, 그 외→incident (백엔드 subject 네이밍 변화 방어).
  - `TERMINAL = {'completed','done','resolved','closed','failed','rejected'}`, `trunc(s, n=44)`.
  - 노드 타입: `StageNode`(`{label; sub?; tone; active}` — surface-2 + tone 보더, active 면 pulse), `ItemNode`(`{label; tone}` — mono 소형 카드, 좌측 tone 보더), `nodeTypes = { stage: StageNode, item: ItemNode }`. evidence/actions 그룹은 shared 의 `group_collapsible`(`CollapsibleGroupData`) 사용.
  - `buildGraph(inc, collapsed, toggle)`:
    - `running = !TERMINAL.has(status)`, `cur = STAGES.indexOf(stageOfSubject(current_subject))`, `failed = status==='failed' || !!error_reason`.
    - `stageTone(i)`: `i<cur`→ok, `i===cur`→failed?danger : running?info : `toneOf(status)`, `i>cur`→neutral.
    - incident stage 노드(sub=trunc(summary)) → evidence 그룹(자식: supporting_evidence ok / missing_evidence `미수집:` warn) → analysis stage(sub = root_cause + `신뢰도 N%`) → actions 그룹(자식: action_route info `경로:` / command_id info `커맨드:` / pr_url ok `PR:` / error_reason danger `실패:`).
    - 그룹 자식은 collapsed 시 노드·edge 생략. 자식 edge 는 해당 그룹이 현재 단계이고 running 일 때 active.
    - 메인 edge(incident→evidence→analysis→actions): `targetIdx < cur`→ok, `=== cur && failed`→danger, `=== cur && !running`→ok, running && `=== cur`→active.
  - 좌표: `useAutoLayout(raw, 'LR')`.
- 트리: Breadcrumbs [알림 → `인시던트 <id>`] → `QueryBoundary(skeleton 6)`: h1(summary)+Badge(status) → 그리드(1fr 300px): `Card(h 420) > FlowCanvas(nodes, edges, nodeTypes)` · `Card('상세') > KeyValue`(클러스터/현재 단계/근본 원인(null 은 '분석 중')/신뢰도 %/PR 링크/갱신 timeAgo).

### `frontend/src/features/notifications/OpsView.tsx :: OpsView` (default export)

- 라우트: `/settings/ops` (가드 `RequireAdmin`). 레이아웃: `SettingsNav(title='운영 (Dead Letter)')`.
- 데이터: `useDeadLetters(true)`, `useReplayDeadLetter`. state: `confirming: DeadLetter | null`.
- 테이블 열: ID / Subject(code) / Consumer / 오류 / 상태 Badge / 발생(timeAgo) / (`status==='open'` 이면 "재처리" sm 버튼 → confirm 모달).
- 확인 모달('Dead Letter 재처리'): 경고문 "원인이 해결됐는지 확인했나요? 같은 이벤트가 event bus 로 다시 들어갑니다." → 재처리 실행(`replay.mutate(id)`).

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/notifications` | `NotificationsView` | `RequireSession`+`AppShell` | 합성 피드 + kind 필터 |
| `/incidents/:incidentId` | `IncidentDetailView` | `RequireSession`+`AppShell` | RCA 파이프라인 그래프 |
| `/settings/ops` | `OpsView` | `RequireSession`+`AppShell`+`RequireAdmin` | DLQ 목록·재처리 |

## 불변식·오류 (Invariants & Errors)

- 알림은 서버 저장이 아니라 파생 — 서버 상태 변화(승인 완료, DLQ replay)로 자연 소멸한다.
- 읽음 상태는 localStorage 워터마크 비교(ISO 문자열 사전순) — 계정 간 공유되지 않는다.
- DLQ 조회는 admin 일 때만 `enabled`(비 admin 은 approval/incident 만 합성).
- 그래프 좌표 하드코딩 금지 — `useAutoLayout` 경유. subject→stage 매핑은 정규식 방어 로직을 유지한다.
