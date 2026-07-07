---
source_commit: 664925a6
status: synced
---

# features/cluster — 클러스터 목록·상세(인벤토리 탭)·스케일/재시작

> 소스: `frontend/src/features/cluster/`

## 책임 (Responsibility)

- 클러스터 목록/인벤토리(워크로드·팟·노드·서비스·리소스·이벤트) 조회 훅과 화면, 비동기 스케일/재시작 명령을 제공한다.
- `useClusters`/`useClusterSummary`/`useWorkloads`/`useClusterUsage` 는 [fleet](./fleet.md)·[metrics](./metrics.md)·[org/AccessView](./org.md)·[resources](./resources.md) 도 소비하는 공용 데이터 훅이다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`, `@/shared/lib/types`, `@/shared/lib/ui-store`, `@/shared/lib/adapt`(`adaptCluster`, `adaptInventorySummary`, `adaptWorkloadResource`, `adaptServiceResource`, `adaptK8sEventResource`, `adaptInventoryResource`), `@/shared/lib/live`(`liveStore`), `@/shared/lib/format`, `@/shared/ui`, `@/shared/ui/icons`, `@/shared/motion` | [shared](shared.md) | API·실시간·UI (인벤토리 응답은 전부 adapt 경유) |
| import | `@/features/auth/api`(`useIsAdmin`) | [auth](./auth.md) | 등록 CTA 표시, 스케일/재시작 버튼 활성 |
| import | `@/features/fleet/api`(`useClusterAgg`) | [fleet](./fleet.md) | 상세 상단 집계 요약 보조 패널 |
| import | `@/features/notifications/api`(`useTimeline`) | [notifications](./notifications.md) | 캐시 공유용 참조(`void useTimeline`) |
| import | `@/features/resources/RegisterClusterWizard` | [resources](./resources.md) | 목록 화면의 등록 위저드 |
| import | `@/features/console/ui`(`useConsolePath`) | [app](./app.md) | `/console` base path 보존 링크 |
| 백엔드 | `/clusters/*` | [api-gateway](../services/gateway-api-gateway.md) | 인벤토리·명령 API |
| 실시간 | `liveStore.snapshot` | [realtime-gateway](../services/realtime-realtime-gateway.md) | hot 팟 강조(팟 탭) |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | API | 폴링/옵션 |
|---|---|---|---|
| `clusterKeys` | `frontend/src/features/cluster/api.ts :: clusterKeys` | — | `list() = ['clusters']`, `summary(id) = ['clusters', id, 'summary']`, `inv(id, kind) = ['clusters', id, 'inv', kind]` |
| `useClusters` | `frontend/src/features/cluster/api.ts :: useClusters` | GET `/clusters` → `{clusters: raw[]}` | 30s 폴링, `select: d.clusters.map(adaptCluster)` |
| `useClusterSummary` | `frontend/src/features/cluster/api.ts :: useClusterSummary` | GET `/clusters/${id}/inventory/summary` → raw envelope(`latest_snapshot.summary`) | `(id: string \| undefined)`, `enabled: !!id`, 30s, `select: adaptInventorySummary` → `ClusterSummary` |
| `useWorkloads` | `frontend/src/features/cluster/api.ts :: useWorkloads` | GET `/clusters/${id}/inventory/resources?resource_type=pod` → `{resources: raw[]}` | 쿼리키 `inv(id,'pods')`, `enabled: !!id`, 30s, select `d.resources.map(adaptWorkloadResource)` |
| `useResources` | `frontend/src/features/cluster/api.ts :: useResources` | GET `/clusters/${id}/inventory/resources[?resource_type=]` | `(id, kind?)`, 쿼리키 kind ?? 'all', `enabled: !!id`, select `d.resources.map(adaptInventoryResource)` |
| `useServices` | `frontend/src/features/cluster/api.ts :: useServices` | GET `/clusters/${id}/inventory/services` → `{resources: raw[]}` | `enabled: !!id`, select `d.resources.map(adaptServiceResource)` |
| `UsageSample` | `frontend/src/features/cluster/api.ts :: UsageSample` | — | `{ sampled_at: string \| null; usage: Record<string, number> }` |
| `useClusterUsage` | `frontend/src/features/cluster/api.ts :: useClusterUsage` | GET `/clusters/${id}/usage?limit=288` → `{samples: UsageSample[]}` | `(id: string \| undefined)`, 쿼리키 `['clusters', id, 'usage']`, `enabled: !!id`, 60s, select `.samples`. 스냅샷마다 적재되는 실측 usage 롤업 시계열(인벤토리 기반 장기 추이 — LIVE 스트림과 별개). [metrics](./metrics.md) 가 소비 |
| `useClusterEvents` | `frontend/src/features/cluster/api.ts :: useClusterEvents` | GET `/clusters/${id}/inventory/events` → `{resources: raw[]}` | `enabled: !!id`, select `d.resources.map(adaptK8sEventResource)` |
| `useResourceDetail` | 예정: `frontend/src/features/cluster/api.ts :: useResourceDetail` | GET `/clusters/${id}/inventory/resource-detail?resource_type=&kind=&name=&namespace=` → `{resource, related, events}` | node/service/workload/pod Drawer의 정본 API. 문자열 필터 대신 backend가 `involvedObject`와 selector/owner 관계를 계산한다 |
| `useScale` | `frontend/src/features/cluster/api.ts :: useScale` | POST `/clusters/${clusterId}/namespaces/${ns}/deployments/${name}/scale` body `{replicas}` | `(clusterId)` → mutation `({ns, name, replicas})`. 성공: toast info `'스케일 명령을 큐에 등록했습니다'` + `clusterKeys.list()` invalidate. 실패: toast danger(`commandFailureMessage`) |
| `useRestart` | `frontend/src/features/cluster/api.ts :: useRestart` | POST `/clusters/${clusterId}/namespaces/${ns}/deployments/${name}/restart` | 성공: toast info `'재시작 명령을 큐에 등록했습니다'`. 실패: toast danger(`commandFailureMessage`) |

내부 헬퍼 `commandFailureMessage(action, err)`(비공개) — 제어 명령 실패를 조용히 삼키지 않는다: `kind==='forbidden'` → `'<action> 거부됨 — 권한 또는 정책(policy)이 허용하지 않습니다'`, `'invalid'` → `'<action> 실패 — <detail ?? 정책 조건 불일치 안내>'`, 그 외 → `'<action> 실패 — <detail ?? 재시도 안내>'`.

## 컴포넌트

### `frontend/src/features/cluster/ClusterListView.tsx :: ClusterListView` (default export)

- 라우트: `/clusters`.
- state: `wizard: boolean`. 훅: `useClusters`, `useNavigate`, `useIsAdmin`, `useSearchFilter`(검색 대상 `` `${name} ${cluster_id} ${environment}` ``).
- 트리: `PageHeader('클러스터', sub, actions=admin 일 때만 primary "+ 클러스터 등록" → wizard open)` → `SearchInput` → `Card > QueryBoundary > ResourceTable<Cluster>` → `RegisterClusterWizard(open, onClose)`.
- 테이블 열: 이름(b) / 환경(`Badge tone=neutral`) / 연결(`Badge status`) / 노드 / 팟 / 인시던트(>0 이면 `Badge tone=danger`, 아니면 '—') / 등록(`timeAgo`). 행 클릭 → `pathFor('/clusters/${cluster_id}')`.
- `ResourceTable.empty`: 검색어가 있으면 `EmptyState(GlobeIcon, "'<검색어>' 검색 결과가 없습니다", "이름·환경·cluster_id 로 검색합니다")`; 검색어가 없으면 admin 은 `EmptyState(..., "클러스터를 등록하고 에이전트가 연결되면 실측 인벤토리가 표시됩니다", action=첫 클러스터 등록)`, non-admin 은 `EmptyState(..., "접근 권한이 있는 클러스터가 연결되면 실측 인벤토리가 표시됩니다")`.

### `frontend/src/features/cluster/ClusterDetailView.tsx :: ClusterDetailView` (default export)

- 라우트: `/clusters/:clusterId`, `/clusters/:clusterId/pods/:namespace/:pod`(팟 Drawer 딥링크). 쿼리스트링: `tab`(기본 'workloads'), `q`(팟/리소스/이벤트 drilldown 필터 — 팟 이름·workload_name includes, namespace·node exact).
- 탭 상수 `TABS`: workloads/pods/nodes/services/resources/events (라벨: 워크로드·팟·노드·서비스·리소스·이벤트).
- state: `scaleTarget`, `restartTarget`, `workloadTarget`(`DeploymentTarget | null`), `nodeTarget`, `serviceTarget`, `replicas: number`(스케일 모달 열 때 대상 팟 수로 초기화).
- 데이터: `useClusters`(이름/뱃지), `useClusterSummary`, `useWorkloads`, `useIsAdmin`, `useScale`, `useRestart`, `liveStore(s => s.snapshot)`.
- `hotPods`: 스냅샷의 hot 팟 이름 Set — **selector 에서 새 객체 생성 금지 규칙에 따라 `useMemo` 로 파생**.
- `podRows`: workloads 에 `hot: hotPods.has(name) || w.hot` 병합 후 `q` 필터. `openPod` 는 URL 의 `:pod`+`:namespace` 매칭.
- 트리:
  ```
  FadeSlideIn
  ├─ Breadcrumbs [클러스터 → 이름]
  ├─ 헤더: h1(이름 + Badge(environment) + Badge(connection_status), flex wrap) · ContextActions(cluster)
  ├─ StatBox ×4: 노드 / 실행 팟(pod_phases['Running'], ok) / 비정상 팟(CrashLoopBackOff+Pending, Crash>0 이면 danger) / 서비스 (flex wrap)
  ├─ ClusterAggPanel: GET /clusters/{id}/summary 보조 패널(사용량 + 열린 인시던트, 실패해도 본문 차단 안 함)
  ├─ ContextEvents('클러스터 이벤트', 최근 3개)
  ├─ q 필터가 있으면 drill 배지 + code + 해제 버튼
  ├─ Tabs (setSp({tab}))
  ├─ 탭 콘텐츠: WorkloadsTab | 팟 테이블 | 노드 테이블 | ServicesTab | ResourcesTab | EventsTab
  ├─ Drawer(openPod) — KeyValue(상태/네임스페이스/재시작/노드/이미지/Ready) + ContextActions(pod) + ContextEvents('팟 이벤트')
  ├─ Drawer(nodeTarget) — KeyValue(Ready/팟 수/CPU/MEM/버전) + ContextActions(node) + ContextEvents('노드 이벤트') + "팟 보기"
  ├─ Drawer(serviceTarget) — KeyValue(ns/type/ClusterIP/ports) + ContextActions(service) + ContextEvents('서비스 이벤트') + "리소스 보기"
  ├─ Drawer(workloadTarget) — KeyValue(ns/팟 수) + ContextActions(workload) + ContextEvents('워크로드 이벤트') + 팟 보기/스케일/재시작
  └─ Modal(scaleTarget/restartTarget) — 대상은 DeploymentTarget{ns,name,podCount}. 스케일: 현재 팟 수 안내 + replicas number input(0~100, 초기값=podCount) + 실행(scale.mutate). 재시작: 확인 모달(danger) 후 restart.mutate
  ```
- 팟 탭 열: 이름(hot 이면 `IconFlame` warn) / 네임스페이스 / 상태 Badge / 재시작 / 노드. 행 클릭 → `pathFor('/clusters/${clusterId}/pods/${ns}/${name}?tab=pods')`. Drawer 닫기 → `pathFor('/clusters/${clusterId}?tab=pods')`.
- 노드 탭 열: 이름 / Ready·NotReady Badge / 팟 수 / CPU·MEM(`(ratio*100).toFixed(0)%`, null 은 '—') / 버전. 행 클릭 → node Drawer.
- 스케일/재시작 대상은 WorkloadsTab 의 그룹 키(디플로이먼트 실명 `workload_name || name`)에서 `DeploymentTarget{ns,name,podCount}` 로 전달 — 팟 이름에서 유도하지 않는다. 모달 안내문: "비동기 명령입니다 — command-worker 정책 확인 후 agent 가 실행합니다."

내부(비공개) 서브컴포넌트:

- `WorkloadsTab { clusterId; admin; onInspect; onDrillPods; onScale; onRestart }` — workloads 를 `${namespace}/${workload_name || name}` 키로 그룹핑해 deployment 행 생성(`workload_name` 은 인벤토리 summary 의 owner_name — [shared/adapt](shared.md#어댑터-libadaptts) `adaptWorkloadResource` 가 채움). 행 클릭은 workload Drawer. 열: 워크로드 / 네임스페이스 / Ready(`Running수/전체`) / 재시작 합 / 액션(스케일·재시작·팟 sm 버튼, `!admin` 시 disabled + title `'release_operator 권한 필요'`, `stopPropagation`).
- `ServicesTab { clusterId; onInspect }` — 이름/네임스페이스/타입/ClusterIP(code)/포트. 행 클릭은 service Drawer.
- `ContextActions` — `Link(pathFor('/metrics?cluster=<id>&subject=<subject>&name=<name>[&namespace=<ns>]'))` "메트릭" + `Link(pathFor('/ai?prefill=<cluster namespace/name subject 상태 분석>'))` "AI 분석".
- `ContextEvents` — `useClusterEvents(clusterId)` 결과를 target/message/reason lower-case includes 로 필터하고 compact 면 3개, 아니면 8개까지 표시한다. pending 이거나 결과가 없으면 null.
- `ResourcesTab { clusterId; filter }` — `q`가 있으면 kind/namespace/name/status includes 로 필터. 열: Kind/네임스페이스(null '—')/이름/상태 Badge/Age.
- `EventsTab { clusterId; filter }` — `q`가 있으면 reason/target/message/type includes 로 필터. 비면 EmptyState(`IconFile` 아이콘, '이벤트가 없습니다'); 열: 시각(timeAgo)/타입(Warning 은 warn Badge)/사유/대상(code)/메시지.
- `ClusterAggPanel` — `useClusterAgg(clusterId)` 결과가 pending 이면 null, error 면 회색 문구와 "다시 시도" 버튼. 성공 시 `Card('집계 요약 — 사용량 · 열린 인시던트')` 에 CPU/MEM/재시작 누적/열린 인시던트를 표시하고, 열린 인시던트는 최대 5개까지 `pathFor('/incidents/<id>')` 링크로 렌더한다.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/clusters` | `ClusterListView` | `RequireSession`+`ConsoleLayout` | 목록 + 등록 위저드 |
| `/clusters/:clusterId` | `ClusterDetailView` | `RequireSession`+`ConsoleLayout` | 상세, `?tab=`·`?q=` |
| `/clusters/:clusterId/pods/:namespace/:pod` | `ClusterDetailView` | `RequireSession`+`ConsoleLayout` | 팟 Drawer 딥링크 |

## 불변식·오류 (Invariants & Errors)

- 팟 hot 강조는 폴링을 기다리지 않고 WS 스냅샷 이름 매칭으로 즉시 반영한다.
- 클러스터 등록 CTA와 빈 상태 등록 action은 admin 에게만 노출한다. 등록 API도 provider/target 라우터에서 admin 세션을 요구한다.
- 스케일/재시작은 비동기 수락(202 성격) — 성공 토스트는 "큐 등록"을 의미하며 완료를 뜻하지 않는다.
- 스케일/재시작 버튼 노출 자체는 항상, 활성화만 `useIsAdmin()` — 서버가 최종 검증. 서버 거부(403 policy/422 검증)는 `commandFailureMessage` 로 사유를 danger 토스트에 그대로 노출한다.
- 인벤토리 응답(`resources[]` + `summary` envelope)은 반드시 shared/adapt 의 `adapt*Resource` 계열로 정규화해서 사용한다 — 뷰에서 raw 필드 직접 접근 금지.
- 파일 말미의 `void useTimeline;` 참조는 의도적(캐시 공유 주석) — 제거하지 않는다.
