---
source_commit: 96ba52c8
status: synced
---

# features/cluster — 클러스터 목록·상세(인벤토리 탭)·스케일/재시작

> 소스: `frontend/src/features/cluster/`

## 책임 (Responsibility)

- 클러스터 목록/인벤토리(워크로드·팟·노드·서비스·리소스·이벤트) 조회 훅과 화면, 비동기 스케일/재시작 명령을 제공한다.
- `useClusters`/`useClusterSummary`/`useWorkloads` 는 [fleet](./fleet.md)·[metrics](./metrics.md)·[org/AccessView](./org.md)·[resources](./resources.md) 도 소비하는 공용 데이터 훅이다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`, `@/shared/lib/types`, `@/shared/lib/ui-store`, `@/shared/lib/adapt`(`adaptCluster`), `@/shared/lib/live`(`liveStore`), `@/shared/lib/format`, `@/shared/ui`, `@/shared/ui/icons`, `@/shared/motion` | [shared](shared.md) | API·실시간·UI |
| import | `@/features/auth/api`(`useIsAdmin`) | [auth](./auth.md) | 스케일/재시작 버튼 활성 |
| import | `@/features/notifications/api`(`useTimeline`) | [notifications](./notifications.md) | 캐시 공유용 참조(`void useTimeline`) |
| import | `@/features/resources/RegisterClusterWizard` | [resources](./resources.md) | 목록 화면의 등록 위저드 |
| 백엔드 | `/clusters/*` | [api-gateway](../services/gateway-api-gateway.md) | 인벤토리·명령 API |
| 실시간 | `liveStore.snapshot` | [realtime-gateway](../services/realtime-realtime-gateway.md) | hot 팟 강조(팟 탭) |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | API | 폴링/옵션 |
|---|---|---|---|
| `clusterKeys` | `frontend/src/features/cluster/api.ts :: clusterKeys` | — | `list() = ['clusters']`, `summary(id) = ['clusters', id, 'summary']`, `inv(id, kind) = ['clusters', id, 'inv', kind]` |
| `useClusters` | `frontend/src/features/cluster/api.ts :: useClusters` | GET `/clusters` → `{clusters: raw[]}` | 30s 폴링, `select: d.clusters.map(adaptCluster)` |
| `useClusterSummary` | `frontend/src/features/cluster/api.ts :: useClusterSummary` | GET `/clusters/${id}/inventory/summary` → `ClusterSummary` | `(id: string \| undefined)`, `enabled: !!id`, 30s |
| `useWorkloads` | `frontend/src/features/cluster/api.ts :: useWorkloads` | GET `/clusters/${id}/inventory/workloads` | 30s, select `.workloads` |
| `useResources` | `frontend/src/features/cluster/api.ts :: useResources` | GET `/clusters/${id}/inventory/resources[?kind=]` | `(id, kind?)`, 쿼리키 kind ?? 'all', select `.resources` |
| `useServices` | `frontend/src/features/cluster/api.ts :: useServices` | GET `/clusters/${id}/inventory/services` | select `.services` |
| `useClusterEvents` | `frontend/src/features/cluster/api.ts :: useClusterEvents` | GET `/clusters/${id}/inventory/events` | select `.events` |
| `useScale` | `frontend/src/features/cluster/api.ts :: useScale` | POST `/clusters/${clusterId}/namespaces/${ns}/deployments/${name}/scale` body `{replicas}` | `(clusterId)` → mutation `({ns, name, replicas})`. 성공: toast info `'스케일 명령을 큐에 등록했습니다'` + `clusterKeys.list()` invalidate |
| `useRestart` | `frontend/src/features/cluster/api.ts :: useRestart` | POST `/clusters/${clusterId}/namespaces/${ns}/deployments/${name}/restart` | 성공: toast info `'재시작 명령을 큐에 등록했습니다'` |

## 컴포넌트

### `frontend/src/features/cluster/ClusterListView.tsx :: ClusterListView` (default export)

- 라우트: `/clusters`.
- state: `wizard: boolean`. 훅: `useClusters`, `useNavigate`, `useSearchFilter`(검색 대상 `` `${name} ${cluster_id} ${environment}` ``).
- 트리: 헤더(h1 '클러스터' + primary "+ 클러스터 등록" → wizard open) → `SearchInput` → `Card > QueryBoundary > ResourceTable<Cluster>` → `RegisterClusterWizard(open, onClose)`.
- 테이블 열: 이름(b) / 환경(`Badge tone=neutral`) / 연결(`Badge status`) / 노드 / 팟 / 인시던트(>0 이면 `Badge tone=danger`, 아니면 '—') / 등록(`timeAgo`). 행 클릭 → `/clusters/${cluster_id}`.

### `frontend/src/features/cluster/ClusterDetailView.tsx :: ClusterDetailView` (default export)

- 라우트: `/clusters/:clusterId`, `/clusters/:clusterId/pods/:namespace/:pod`(팟 Drawer 딥링크). 쿼리스트링: `tab`(기본 'workloads'), `q`(팟 필터 — 이름 includes 또는 node 정확 일치).
- 탭 상수 `TABS`: workloads/pods/nodes/services/resources/events (라벨: 워크로드·팟·노드·서비스·리소스·이벤트).
- state: `scaleTarget: Workload | null`, `replicas: number`(모달 열 때 2로 리셋).
- 데이터: `useClusters`(이름/뱃지), `useClusterSummary`, `useWorkloads`, `useIsAdmin`, `useScale`, `useRestart`, `liveStore(s => s.snapshot)`.
- `hotPods`: 스냅샷의 hot 팟 이름 Set — **selector 에서 새 객체 생성 금지 규칙에 따라 `useMemo` 로 파생**.
- `podRows`: workloads 에 `hot: hotPods.has(name) || w.hot` 병합 후 `q` 필터. `openPod` 는 URL 의 `:pod`+`:namespace` 매칭.
- 트리:
  ```
  FadeSlideIn
  ├─ Breadcrumbs [클러스터 → 이름]
  ├─ 헤더: h1(이름 + Badge(environment) + Badge(connection_status)) · Link(/metrics?cluster=<id>) "메트릭 보기"
  ├─ StatBox ×4: 노드 / 실행 팟(pod_phases['Running'], ok) / 비정상 팟(CrashLoopBackOff+Pending, Crash>0 이면 danger) / 서비스
  ├─ Tabs (setSp({tab}))
  ├─ 탭 콘텐츠: WorkloadsTab | 팟 테이블 | 노드 테이블 | ServicesTab | ResourcesTab | EventsTab
  ├─ Drawer(openPod) — KeyValue(상태/네임스페이스/재시작/노드/이미지/Ready) + Link(/ai?prefill=<ns/pod 팟 상태를 분석해줘>) "✦ 이 팟 분석"
  └─ Modal(scaleTarget) — replicas number input(0~100) + 실행(scale.mutate)
  ```
- 팟 탭 열: 이름(hot 이면 `IconFlame` warn) / 네임스페이스 / 상태 Badge / 재시작 / 노드. 행 클릭 → `/clusters/${clusterId}/pods/${ns}/${name}?tab=pods`. Drawer 닫기 → `/clusters/${clusterId}?tab=pods`.
- 노드 탭 열: 이름 / Ready·NotReady Badge / 팟 수 / CPU·MEM(`(ratio*100).toFixed(0)%`, null 은 '—') / 버전.
- 스케일/재시작 시 deployment 이름은 `w.name.replace(/-pod-.*/, '')` 로 유도. 모달 안내문: "비동기 명령입니다 — command-worker 정책 확인 후 agent 가 실행합니다."

내부(비공개) 서브컴포넌트:

- `WorkloadsTab { clusterId; admin; onScale: (w) => void; onRestart: (w) => void }` — workloads 를 `${namespace}/${name.replace(/-pod-.*/,'')}` 키로 그룹핑해 deployment 행 생성. 열: 워크로드 / 네임스페이스 / Ready(`Running수/전체`) / 재시작 합 / 액션(스케일·재시작 sm 버튼, `!admin` 시 disabled + title `'release_operator 권한 필요'`, `stopPropagation`).
- `ServicesTab` — 이름/네임스페이스/타입/ClusterIP(code)/포트.
- `ResourcesTab` — Kind/네임스페이스(null '—')/이름/상태 Badge/Age.
- `EventsTab` — 비면 EmptyState('이벤트가 없습니다'); 열: 시각(timeAgo)/타입(Warning 은 warn Badge)/사유/대상(code)/메시지.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/clusters` | `ClusterListView` | `RequireSession`+`AppShell` | 목록 + 등록 위저드 |
| `/clusters/:clusterId` | `ClusterDetailView` | `RequireSession`+`AppShell` | 상세, `?tab=`·`?q=` |
| `/clusters/:clusterId/pods/:namespace/:pod` | `ClusterDetailView` | `RequireSession`+`AppShell` | 팟 Drawer 딥링크 |

## 불변식·오류 (Invariants & Errors)

- 팟 hot 강조는 폴링을 기다리지 않고 WS 스냅샷 이름 매칭으로 즉시 반영한다.
- 스케일/재시작은 비동기 수락(202 성격) — 성공 토스트는 "큐 등록"을 의미하며 완료를 뜻하지 않는다.
- 스케일/재시작 버튼 노출 자체는 항상, 활성화만 `useIsAdmin()` — 서버가 최종 검증.
- 파일 말미의 `void useTimeline;` 참조는 의도적(캐시 공유 주석) — 제거하지 않는다.
