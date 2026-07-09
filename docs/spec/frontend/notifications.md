---
source_commit: f91a4def
status: synced
---

# features/notifications — 알림 합성 피드·RCA 인시던트 그래프·DLQ 운영

> 소스: `frontend/src/features/notifications/`

## 책임 (Responsibility)

- 3개 실존 소스(승인 대기 run · RCA 타임라인 인시던트 · open Dead Letter)를 정규화한 합성 알림 피드(`useNotices`) — 전용 알림 API(G9) 도입 시 `api.ts` 만 교체.
- RCA 타임라인/인시던트 상세 훅, 인시던트 파이프라인 그래프 뷰, Dead Letter 재처리 화면(설정 하위).
- 알림 채널 설정 화면(`/settings/alerts`): Webhook 채널 조회, 테스트 발송 선검증, 저장/삭제.
- 읽음 처리는 localStorage 워터마크(kind 별 마지막 확인 시각)로 로컬 관리.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`, `@/shared/lib/types`, `@/shared/lib/adapt`(`adaptIncident`, `adaptIncidentDetail`), `@/shared/lib/format`, `@/shared/flow`, `@/ui` | [shared](shared.md) | API·그래프·UI |
| import | `@/features/repo/api`(`useApplications`, `useRunsAll`) | [repo](./repo.md) | 승인 대기 알림 소스 |
| import | `@/features/auth/api`(`useIsAdmin`) | [auth](./auth.md) | DLQ 쿼리는 admin 만 |
| import | `@/features/org/SettingsNav` | [org](./org.md) | OpsView·AlertChannelsView 레이아웃 |
| import | `@/features/console/ui`(`useConsolePath`) | [app](./app.md) | `/console` base path 보존 링크 |
| import ← | [app/ConsoleLayout](app.md)(unread 뱃지), [fleet](./fleet.md)·[cluster](./cluster.md)(useTimeline) | — | 소비자 |
| 백엔드 | `/dashboard/rca/*`, `/dead-letters*`, `/alert-channels*` | [api-gateway](../services/gateway-api-gateway.md) | |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | API | 폴링/옵션 |
|---|---|---|---|
| `NOTIFICATION_QUERY_TIMEOUT_MS` | `frontend/src/features/notifications/api.ts :: NOTIFICATION_QUERY_TIMEOUT_MS` | — | `8_000` — 타임라인/인시던트/evidence/RCA report/DLQ 조회 |
| `useTimeline` | `frontend/src/features/notifications/api.ts :: useTimeline` | GET `/dashboard/rca/timeline?limit=20` with `{timeoutMs: 8_000}` | 쿼리키 `['timeline']`, 60s, `retry:false`, select `d.items.map(adaptIncident)` |
| `useIncident` | `frontend/src/features/notifications/api.ts :: useIncident` | GET `/dashboard/rca/incidents/${incidentId}` with `{timeoutMs: 8_000}` | 쿼리키 `['incident', id]`, `enabled: !!id`, 30s, `retry:false`, select `adaptIncidentDetail(d.item ?? {})` |
| `useEvidence` | `frontend/src/features/notifications/api.ts :: useEvidence` | GET `/evidence?correlation_id=...&kind=...&limit=100` with `{timeoutMs: 8_000}` | 쿼리키 `['evidence', correlationId, kind??'all']`, `enabled: !!correlationId`, 30s, `retry:false` |
| `useRcaReports` | `frontend/src/features/notifications/api.ts :: useRcaReports` | GET `/rca-reports?correlation_id=...&limit=50` with `{timeoutMs: 8_000}` | 쿼리키 `['rca-reports', correlationId]`, `enabled: !!correlationId`, 30s, `retry:false`, select `d.items` |
| `useDeadLetters` | `frontend/src/features/notifications/api.ts :: useDeadLetters` | GET `/dead-letters?limit=20` with `{timeoutMs: 8_000}` | `(enabled: boolean)`, 쿼리키 `['dead-letters']`, 60s, `retry:false`, select `.dead_letters` |
| `useRecoveryPlan` | `frontend/src/features/notifications/api.ts :: useRecoveryPlan` | GET `/rca/recovery-plans/by-correlation/${correlationId}` with `{timeoutMs: 8_000}` | 쿼리키 `['recovery-plan', correlationId]`, `enabled: !!correlationId`, 30s. `not_found`은 재시도하지 않고 그 외 오류는 2회 미만 재시도 |
| `useReplayDeadLetter` | `frontend/src/features/notifications/api.ts :: useReplayDeadLetter` | POST `/dead-letters/${id}/replay` | mutation `(id: number)`, 성공/실패 `@/ui` toast, 성공 시 `['dead-letters']` invalidate |
| `useAlertChannels` | `frontend/src/features/notifications/api.ts :: useAlertChannels` | GET `/alert-channels` with `{timeoutMs: 8_000}` | 쿼리키 `['alert-channels']`, `retry:false`, select `.channels` |
| `useTestAlertChannel` | `frontend/src/features/notifications/api.ts :: useTestAlertChannel` | POST `/alert-channels/test` | mutation `AlertChannelTestPayload` → `{valid; delivered; code?; detail; status_code?}`. 컴포넌트가 현재 입력 서명과 성공 응답을 묶어 저장 활성 조건으로 사용 |
| `useSaveAlertChannel` | `frontend/src/features/notifications/api.ts :: useSaveAlertChannel` | POST `/alert-channels` | mutation `AlertChannelPayload`, 성공/실패 `@/ui` toast, 성공 시 `['alert-channels']` invalidate |
| `useDeleteAlertChannel` | `frontend/src/features/notifications/api.ts :: useDeleteAlertChannel` | DELETE `/alert-channels/${channelId}` | mutation `(channelId: string)`, 성공/실패 `@/ui` toast, 성공 시 `['alert-channels']` invalidate |
| `useNotices` | `frontend/src/features/notifications/api.ts :: useNotices` | (합성 — 아래) | `() => { notices: Notice[]; unread: number; markAllSeen: (kind?: string) => void }` |
| `timeAgo` (re-export) | `frontend/src/features/notifications/api.ts :: timeAgo` | — | shared/lib/format 재수출 |

`useNotices` 합성 규칙:

1. 소스: `useRunsAll(useApplications())` 의 `WAITING_FOR_APPROVAL` run → `{ id: 'apr-<run_id>', kind:'approval', tone:'warn', title:'배포 승인 필요: <appId> <sha7>', link:'/workflows/<run_id>' }`; `useTimeline` 항목 → `{ id:'inc-<incident_id>', kind:'incident', tone:'danger', title:'인시던트: <summary>', link:'/incidents/<id>' }`; `useDeadLetters(admin)` 중 `status==='open'` → `{ id:'dlq-<id>', kind:'dlq', tone:'danger', title:'처리 실패 이벤트: <subject> (<consumer>)', link:'/settings/ops' }`.
2. 읽음: `localStorage['notice:lastSeen:<kind>'] >= n.at` 이면 `read: true`. `useSyncExternalStore` + 모듈 listener Set 으로 같은 탭 내 갱신 전파.
3. 정렬: `at` 내림차순. `unread` = read 아닌 개수.
4. `markAllSeen(kind?)`: kind 지정 시 그 kind 만, 아니면 `['approval','incident','dlq','cluster']` 전부 + `'any'` 워터마크를 현재 시각으로.

## 컴포넌트

### `frontend/src/features/notifications/NotificationsView.tsx :: NotificationsView` (default export)

- 라우트: `/incidents`. 구 경로 `/notifications` 는 router 에서 `/incidents` 로 redirect.
- 모듈 상수 `FILTERS`: `[{value:'all',label:'전체'}, {value:'approval',label:'승인'}, {value:'incident',label:'인시던트'}, {value:'dlq',label:'운영'}, {value:'cluster',label:'클러스터'}]`.
- state: `filter`(기본 'all'). 마운트 시 `markAllSeen()` 1회(진입 시 워터마크 갱신).
- 트리: `PageHeader('인시던트')` → `Card('알림 목록', '<필터 라벨> N건')` → `Tabs`(필터별 count) → 비면 `EmptyState(BellIcon, title=전체면 '알림 없음'/필터면 '<라벨> 알림 없음')`, 아니면 토큰 surface row 목록. 각 row는 `Badge(toneSeverity(notice.tone))`, title(read 면 muted), timeAgo, `Button('바로가기')`를 렌더하고 `navigate(pathFor(notice.link))`로 이동한다.

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
- 트리: `PageHeader(summary)` + `Breadcrumb(인시던트 → 인시던트 <id>)` + correlation 복사 버튼 → 그리드: `Card('RCA 파이프라인') > FlowCanvas(nodes, edges, nodeTypes)`(모바일은 내부 가로 스크롤) · `Card('상세') > KeyValueList`(상태/클러스터 링크/현재 단계/근본 원인/신뢰도/correlation/커맨드/PR/갱신) + `RecoveryPlanPanel` → 하단 2열 `RcaReportsPanel`/`EvidencePanel`.
- pending 은 `PageHeader('인시던트')` + `Card><Skeleton lines=6>`, 일반 오류는 `PageHeader('인시던트 조회 실패')` + `EmptyState('인시던트 조회 실패', 다시 시도)`.
- 타임라인 상세가 404 여도 동일 문자열을 correlation id 로 보고 `RecoveryPlanPanel`, `RcaReportsPanel`, `EvidencePanel` 은 계속 렌더한다.
- `RecoveryPlanPanel`: 복구 계획이 아직 없으면 설명 문단 대신 `Badge(tone="neutral", "생성 전")`만 표시한다.
- `RcaReportsPanel`: `useRcaReports(correlationId)` 결과를 카드 목록으로 표시한다. 결과가 없으면 `EmptyState(IconFile, 'RCA 리포트 없음')`. `RcaReportCard` 는 root cause, 대상(`namespace/resource_kind/resource_name`), 주 증상과 `secondary_symptoms`, reason, 후보 평가, 근거 참조, 미수집 체크를 보여준다.
- `CandidateScores`: `report.candidates` 를 입력 순서 그대로 2개 우선 표시하고, 더 있으면 "후보 N개 더 보기"로 펼친다. `selected_candidate_id` 와 같은 후보는 좌측 보더와 `선정` badge 로 강조한다. `source === 'ai_fallback'` 은 `AI` badge 로 표시한다.
- `EvidenceRefList`: `supporting_evidence_refs` 가 있으면 기존 문자열 badge 대신 source/name/summary/query 트레일을 표시한다. 참조가 없을 때만 `supporting_evidence` 문자열 badge 로 fallback 한다.
- `EvidencePanel`: `useEvidence(correlationId)` 결과를 kind 필터(kubernetes/prometheus/loki/tempo)와 접힘 가능한 evidence row 로 표시한다. 증거가 없을 때도 인시던트 상태를 함께 본다. 비종결 인시던트가 evidence 단계이거나 `missing_evidence`가 남아 있으면 `증거 수집 중` + 다시 확인 CTA, 종결/근거 없음이면 `증거 없음`으로 표시한다. 각 evidence row 토글은 `aria-expanded`가 달린 실제 `button`이고, 펼치면 수집 시각/evidence_ref/source trail을 보여준다.

### `frontend/src/features/notifications/OpsView.tsx :: OpsView` (default export)

- 라우트: `/settings/ops` (가드 `RequireAdmin`). 레이아웃: `SettingsNav(title='운영 DLQ')`.
- 데이터: `useDeadLetters(true)`, `useReplayDeadLetter`. state: `confirming: DeadLetter | null`.
- 레이아웃: `Card('Dead Letter')` 안에 `@/ui Table`. loading Skeleton, 오류+재시도, 빈 상태('Dead Letter 없음') 구분.
- 테이블 열: ID / Subject(code) / Consumer / 오류 / 상태 Badge(open → 열림, 그 외 처리됨) / 발생(timeAgo) / (`status==='open'` 이면 "재처리" sm 버튼 → confirm 모달). 실행 중에는 해당 행 버튼만 pending.
- 확인 모달('Dead Letter 재처리'): ID/Subject/Consumer/오류 요약을 보여주고, "원인이 해결된 뒤에만 같은 이벤트를 event bus로 다시 넣으세요" 문구를 표시한다. 재처리 실행(`replay.mutate(id)`) 성공 시 모달을 닫는다.

### `frontend/src/features/notifications/AlertChannelsView.tsx :: AlertChannelsView` (default export)

- 라우트: `/settings/alerts` (가드 `RequireAdmin`). 레이아웃: `SettingsNav(title='알림 채널')`.
- 데이터: `useAlertChannels`, `useTestAlertChannel`, `useSaveAlertChannel`, `useDeleteAlertChannel`.
- state: `form`(`channel_id`, `name`, `url`, `min_severity`, `enabled`, `test_severity`, `test_message`), `testedSignature`, `testError`, `deleting`.
- 목록: `Card('채널 목록')` 안에 `@/ui Table`. loading Skeleton, 오류+재시도, 빈 상태('알림 채널 없음') 구분.
- 테이블 열: 채널(이름+URL) / 최소 심각도 / 상태 / 수정 시간 / 편집·삭제. 삭제는 `ConfirmDialog`를 거쳐 `DELETE /alert-channels/{id}`.
- 폼: 이름, HTTPS Webhook URL, 최소 심각도, 채널 활성 checkbox, 테스트 심각도, 테스트 메시지.
- 저장 활성 조건: 로컬 검증 통과 + `POST /alert-channels/test` 응답이 `valid && delivered` + 응답 시점의 `formSignature`가 현재 입력값과 동일. 사용자가 값을 변경하면 `testedSignature`가 불일치해 저장이 즉시 비활성화된다.
- 저장 실행: `POST /alert-channels` body `{channel_id?; name; kind:'webhook'; url; min_severity; enabled}`. 성공 시 저장된 응답으로 편집 폼을 갱신해 현재 저장값은 테스트 통과 상태로 유지한다.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/incidents` | `NotificationsView` | `RequireSession`+`ConsoleLayout` | 합성 피드 + kind 필터 |
| `/notifications` | `<Navigate to="/incidents" replace />` | 없음 | 구 알림 경로 호환 redirect |
| `/incidents/:incidentId` | `IncidentDetailView` | `RequireSession`+`ConsoleLayout` | RCA 파이프라인 그래프 |
| `/settings/ops` | `OpsView` | `RequireSession`+`ConsoleLayout`+`RequireAdmin` | DLQ 목록·재처리 |
| `/settings/alerts` | `AlertChannelsView` | `RequireSession`+`ConsoleLayout`+`RequireAdmin` | 알림 채널 테스트·저장 |

## 불변식·오류 (Invariants & Errors)

- 알림은 서버 저장이 아니라 파생 — 서버 상태 변화(승인 완료, DLQ replay)로 자연 소멸한다.
- 읽음 상태는 localStorage 워터마크 비교(ISO 문자열 사전순) — 계정 간 공유되지 않는다.
- DLQ 조회는 admin 일 때만 `enabled`(비 admin 은 approval/incident 만 합성).
- 그래프 좌표 고정값 사용 금지 — `useAutoLayout` 경유. subject→stage 매핑은 정규식 방어 로직을 유지한다.
