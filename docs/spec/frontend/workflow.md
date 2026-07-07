---
source_commit: 664925a6
status: synced
---

# features/workflow — run 목록·단계 그래프

> 소스: `frontend/src/features/workflow/`

## 책임 (Responsibility)

- 전체 앱의 run 을 모은 목록(`WorkflowListView`)과 단일 run 의 단계 파이프라인 그래프(`WorkflowGraphView`).
- 자체 API 훅 없음 — 데이터는 전적으로 [repo](./repo.md) 의 `useApplications`/`useRunsAll` 을 재사용한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/features/repo/api`(`useApplications`, `useRunsAll`), `@/features/repo/ApprovalCard` | [repo](./repo.md) | 데이터·승인 카드 |
| import | `@/shared/flow`(`FlowCanvas`, `useAutoLayout`, `FlowEdgeData`), `@/shared/ui`, `@/shared/ui/plan-diff`, `@/shared/ui/status`, `@/shared/ui/icons`, `@/shared/lib/format`, `@/shared/motion`, `@/shared/lib/types` | [shared](shared.md) | 그래프·UI |
| 외부 | `@xyflow/react`(`Handle`, `Position`, 타입) | — | 커스텀 노드 |
| 백엔드 | (간접) GET `/applications`, GET `/applications/:id/runs` | [api-gateway](../services/gateway-api-gateway.md) | repo 훅 경유 |

## 공개 인터페이스 (Public API)

### `frontend/src/features/workflow/WorkflowListView.tsx :: WorkflowListView` (default export)

- 라우트: `/workflows`.
- 모듈 상수 `ACTIVE`(비공개): repo 와 동일한 활성 상태 7종 Set.
- 데이터: `useApplications()` → `useRunsAll(apps.data ?? [])`. 행 = 모든 run 에 `appId` 부착 후 정렬: **활성 run 우선**, 그다음 `started_at` 내림차순(localeCompare).
- 트리: h1 '워크플로우' → `Card` → 비면 `EmptyState('⇶', '실행된 워크플로우가 없습니다', '레포에 커밋이 감지되면 run 이 생성됩니다')`, 아니면 `ResourceTable` 열: 앱(b appId) / 커밋(code shortSha) / 상태(Badge) / 현재 단계(current_step) / 시작(timeAgo). 행 클릭 → `/workflows/${run_id}`.

### `frontend/src/features/workflow/WorkflowGraphView.tsx :: WorkflowGraphView` (default export)

- 라우트: `/workflows/:runId`.
- 모듈 상수(비공개): `ORDER = ['STARTED','RENDERING','DIFFING','POLICY_CHECKING','WAITING_FOR_APPROVAL','APPLYING','ROLLOUT_WAITING','SUCCEEDED']`, `TERMINAL = {'SUCCEEDED','FAILED'}`, `nodeTypes = { step: StepNode }`.
- 내부 `StepNode` — `NodeProps<Node<{ step: RunStep; active: boolean }>>`: PENDING 이면 투명 배경·`--border`·`--text-3`, 아니면 surface-2 + `toneColor(toneOf(status))` 보더. active 면 `.flow-node--pulse`. SUCCEEDED 면 `IconCheck`(ok) prefix. 좌우 invisible Handle.
- 데이터: `useApplications` → `useRunsAll` 로 전 run 을 만들고 `run_id === runId` 검색(활성 run 있으면 10s 폴링이 그래프를 자동 갱신).
- state: `selected: string | null`(클릭한 스텝 이름).
- 그래프 모델(`useMemo`, 좌표는 `useAutoLayout(raw.nodes, raw.edges, 'LR')`):
  - 노드: ORDER 각 이름에 대해 `run.steps` 에서 찾고 없으면 `{name, status:'PENDING'}`. `active = !TERMINAL.has(run.status) && step.name === run.status`.
  - edge(i→i+1, type 'animated'): `done = status==='SUCCEEDED' || targetIdx < statusIdx || 해당 스텝 status==='SUCCEEDED'` → `tone:'ok'`; `active = running && targetIdx === statusIdx`(현재 단계 진입 edge 만 dash-flow); 그 외 무톤.
  - `run.status === 'FAILED'` 이면 FAILED 노드 추가 + `실패 스텝(steps 중 status FAILED, 기본 'POLICY_CHECKING') → FAILED` danger edge.
- run 미발견: `apps.isPending` 이면 `Skeleton(5)`, 아니면 `Card('run 을 찾을 수 없습니다: <runId>')`.
- 트리:
  ```
  FadeSlideIn
  ├─ Breadcrumbs [워크플로우 → '<appId> · <sha>']
  ├─ 헤더: h1(appId) + code(sha) + Badge(status)
  ├─ WAITING_FOR_APPROVAL && approval_id → ApprovalCard(summary '<sha> 배포 승인' — DIFFING step 에 detail 이 있을 때만 ' — diff: <detail>' 접미)
  │   + DIFFING step 의 changes 가 있으면 '적용될 변경 (plan)' 카드 안에 PlanDiff(changes, resource)
  └─ 그리드(1fr 300px):
     ├─ Card(h 340, p 0) > FlowCanvas(nodes, edges, nodeTypes, onNodeClick=setSelected)
     └─ Card(title = selected ?? '단계 상세')
        선택 시 KeyValue(상태 Badge — PENDING 은 status 'unknown' 으로 표기 / 상세 detail ?? '—')
        + 선택 step 에 changes 가 있으면 PlanDiff(changes, resource), 없고 DIFFING detail 만 있으면 CodeBlock(detail)
        미선택 시 안내문 '노드를 클릭하면 산출물이 표시됩니다.'
  ```

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/workflows` | `WorkflowListView` | `RequireSession`+`ConsoleLayout` | 전 앱 run 목록(활성 우선 정렬) |
| `/workflows/:runId` | `WorkflowGraphView` | `RequireSession`+`ConsoleLayout` | 단계 그래프 + 승인 카드 |

## 불변식·오류 (Invariants & Errors)

- 노드 좌표 하드코딩 금지 — 반드시 `useAutoLayout`(dagre) 사용.
- dash-flow(active) edge 는 진행 중 run 의 "현재 단계 진입 edge" 하나뿐이다.
- 단계 어휘는 `ORDER` 8단계 + FAILED 로 고정 — [repo](./repo.md) 의 미니 스텝바와 동일 순서를 유지한다. 실백엔드 run 의 steps[](`git/render/diff/policy/approval/...`)는 [shared/adapt](shared.md#어댑터-libadaptts) 의 `adaptRun` 이 이 어휘로 매핑해서 도착한다 — 뷰에서 재매핑 금지.
- plan 미리보기는 `RunStep.changes` 를 `PlanDiff` 에 그대로 전달 — 프론트에서 diff 를 만들지 않는다.
