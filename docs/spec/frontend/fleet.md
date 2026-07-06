---
source_commit: 664925a6
status: synced
---

# features/fleet — 플릿 히트맵(오버뷰) 드릴다운

> 소스: `frontend/src/features/fleet/`

## 책임 (Responsibility)

- 앱의 기본 랜딩 화면: 클러스터→노드→팟 3단계 트리맵 히트맵과 상단 집계 스탯, 최근 인시던트 목록.
- 건강도 산식(`score.ts`)의 단일 출처.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/features/cluster/api`(`useClusters`, `useClusterSummary`, `useWorkloads`) | [cluster](./cluster.md) | 데이터 |
| import | `@/features/notifications/api`(`useTimeline`) | [notifications](./notifications.md) | 최근 인시던트 |
| import | `@/shared/ui`, `@/shared/ui/charts`(`TreemapChart`, `heatColor`, `HeatNode`), `@/shared/ui/icons`, `@/shared/motion`, `@/shared/lib/live`, `@/shared/lib/format` | [shared](shared.md) | 차트·실시간·UI |
| 실시간 | `liveStore.snapshot` | [realtime-gateway](../services/realtime-realtime-gateway.md) | 팟 phase/restarts 실시간 덮어쓰기 |

## 공개 인터페이스 (Public API)

### 건강도 — `score.ts` (0=위험 ~ 1=건강, 내부 `clamp` 0..1)

| 심볼 | 앵커 | 산식 |
|---|---|---|
| `clusterScore` | `frontend/src/features/fleet/score.ts :: clusterScore` | `(c: Cluster) => number` — 연결 안 됨(`connection_status !== 'connected'`)이면 0.15. 아니면 `clamp(1 - (0.5*min(1, incident_count/3) + 0.2*(pod_count===0 ? 1 : 0)))` |
| `nodeScore` | `frontend/src/features/fleet/score.ts :: nodeScore` | `(n: NodeInfo, pods: Workload[]) => number` — 해당 노드 팟 중 비Running 비율 `bad/mine`: `clamp((ready ? 1 : 0.2) - 0.6*비율)` |
| `podScore` | `frontend/src/features/fleet/score.ts :: podScore` | `(p: Workload) => number` — CrashLoopBackOff/Failed→0.05, Pending→0.5, 그 외 `clamp(1 - min(0.6, restarts*0.08))` |

### 뷰 — `frontend/src/features/fleet/FleetHeatmapView.tsx :: FleetHeatmapView` (default export)

- 라우트: `/overview`(플릿 레벨), `/overview/c/:clusterId`(노드 레벨, `:clusterId` param).
- state: `nodeSel: string | null`(노드 드릴다운 — URL 아님), `hover: string | null`.
- 데이터: `useClusters`, `useClusterSummary(clusterId)`, `useWorkloads(clusterId ?? '')`, `useTimeline`, `liveStore(s => s.snapshot)`.
- 파생(`useMemo`):
  - `livePods`: 스냅샷 pods 를 `Map<name, pod>` 으로.
  - `pods`: clusterId 있을 때 workloads 각 항목을 livePods 로 `phase/restarts/hot` 덮어쓰기(폴링 대기 없이 실시간 반영).
  - `tiles: HeatNode[]` — 레벨별:
    - 플릿: 클러스터당 `{ id: cluster_id, label: '<name> · <pod_count>pods', value: max(1, pod_count), score: clusterScore(c) }`
    - 노드: `{ id: name, label: '<name> · <pod_count>', value: max(1, pod_count), score: nodeScore(n, pods) }`
    - 팟(nodeSel): 해당 노드 팟 최대 400개, `{ id: name, label: name, value: 1 + restarts, score: podScore(p) }`
- 스탯: `totals` = 클러스터 수 / node_count 합 / pod_count 합 / incident_count 합. **실행 팟 스탯**은 스냅샷 수신 후 `clusters.length === 1` 인 경우에만 live Running 수로 대체(스냅샷은 단일 클러스터 범위라 단위가 다르기 때문).
- 타일 클릭 `onTile(id)`: 플릿→`nav('/overview/c/'+id)`; 노드→`setNodeSel(id)`; 팟→`nav('/clusters/'+clusterId+'?tab=pods&q='+id)`.
- 트리:
  ```
  FadeSlideIn
  ├─ StatBox ×4 (클러스터/노드/실행 팟/열린 인시던트 — 인시던트>0 이면 danger, 0 이면 ok)
  ├─ 행: Breadcrumbs(플릿 → clusterId → nodeSel; span 클릭 시 nodeSel 해제) · 히트 범례(건강 0.9/주의 0.5/위험 0.1 heatColor 칩)
  ├─ 그리드(1fr 280px):
  │  ├─ Card(h 440) > QueryBoundary(clustersQ) > tiles 비면 EmptyState('클러스터가 없습니다' + /clusters 등록 버튼)
  │  │   아니면 TreemapChart(nodes=tiles, onTileClick=onTile)  (onMouseMove 로 treemap 밖이면 hover 해제)
  │  └─ Card(title = hoverInfo?.label ?? '요약') — hover 시 KeyValue(건강도%/규모), 아니면 KeyValue(레벨/타일 수/안내)
  └─ Card('최근 인시던트') > QueryBoundary(timelineQ, skeleton 2)
      비면 EmptyState(IconCheckCircle '열린 인시던트가 없습니다')
      아니면 AnimatedList(items.slice(0,5), key=incident_id): Badge(danger, stage) + Link(/incidents/:id, summary) + timeAgo + '파이프라인 →' 링크
  ```

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/overview` | `FleetHeatmapView` | `RequireSession`+`AppShell` | 플릿 레벨 트리맵 |
| `/overview/c/:clusterId` | `FleetHeatmapView` | `RequireSession`+`AppShell` | 노드 레벨(팟 레벨은 로컬 state) |

## 불변식·오류 (Invariants & Errors)

- 건강도 계산은 반드시 `score.ts` 3개 함수만 사용(뷰 인라인 산식 금지).
- 색상은 `heatColor`(토큰 heat 스케일 보간) 경유.
- 팟 타일은 400개로 잘라 렌더 폭주를 방지한다.
- 노드→팟 드릴다운은 URL 에 남기지 않는다(브레드크럼 클릭으로 복귀).
