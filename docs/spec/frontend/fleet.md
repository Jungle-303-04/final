---
source_commit: f91a4def
status: synced
---

# features/fleet — 플릿 집계 API와 홈 대시보드 건강도 매핑

> 소스: `frontend/src/features/fleet/api.ts`

## 책임 (Responsibility)

- 홈 대시보드(`frontend/src/features/console/pages/HomePage.tsx`)와 클러스터 상세의 보조 집계 패널이 쓰는 플릿/클러스터 집계 API 훅을 제공한다.
- 예전 히트맵 전용 화면 파일은 더 이상 존재하지 않는다. 현재 기본 랜딩은 router index(`/`)의 `HomePage`이며, `/overview`와 `/overview/*`는 `/`로 redirect 된다.
- 건강 상태 문자열을 홈 treemap 점수와 표시 라벨로 바꾸는 단일 매핑을 제공한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`(`get`) | [shared](shared.md) | REST client |
| import ← | `@/features/console/pages/HomePage` | [app](app.md) | `useFleetSummary`, `healthScore`, `healthLabel` 소비. 선택 클러스터의 usage/widget/preset 훅과 함께 홈 dashboard grid 를 구성 |
| import ← | `@/features/cluster/ClusterDetailView` | [cluster](./cluster.md) | `useClusterAgg` 소비 |
| 백엔드 | `/fleet/summary`, `/clusters/{id}/summary` | [api-gateway](../services/gateway-api-gateway.md) | 대시보드 집계 API |

## 공개 인터페이스 (Public API)

### 타입

| 심볼 | 필드 |
|---|---|
| `FleetHealth` | `'healthy' \| 'warning' \| 'critical' \| 'stale' \| 'unknown'` |
| `FleetClusterSummary` | `cluster_id`, `name`, `health`, `pods_running`, `pods_total`, `nodes_ready`, `nodes_total`, `open_incidents`, `restarts_recent`, `cpu_pct`, `mem_pct`, `last_seen` |
| `FleetTotals` | `clusters`, `healthy`, `warning`, `critical`, `stale`, `unknown`, `open_incidents`, `pending_approvals`, `running_workflows`, `dead_letters` |
| `FleetSummary` | `{ clusters: FleetClusterSummary[]; totals: FleetTotals }` |
| `ClusterAggSummary` | `workloads`, `recent_events`, `open_incidents`, `usage` |

### 훅과 헬퍼

| 심볼 | 앵커 | API/동작 |
|---|---|---|
| `fleetKeys.summary()` | `frontend/src/features/fleet/api.ts :: fleetKeys` | `['fleet', 'summary']` |
| `fleetKeys.clusterAgg(id)` | 〃 | `['clusters', id, 'agg']` |
| `useFleetSummary` | `frontend/src/features/fleet/api.ts :: useFleetSummary` | GET `/fleet/summary` with `{timeoutMs: 8_000}`, 30s refetch, `retry:false` |
| `useClusterAgg` | `frontend/src/features/fleet/api.ts :: useClusterAgg` | `(id: string \| undefined)`, GET `/clusters/${id}/summary` with `{timeoutMs: 8_000}`, `enabled: !!id`, 30s refetch, `retry:false` |
| `HEALTH_SCORE` | `frontend/src/features/fleet/api.ts :: HEALTH_SCORE` | healthy 0.92, warning 0.5, critical 0.08, stale 0.28, unknown 0.36 |
| `HEALTH_LABEL` | `frontend/src/features/fleet/api.ts :: HEALTH_LABEL` | healthy '정상', warning '주의', critical '위험', stale '스테일', unknown '미확인' |
| `healthScore` | `frontend/src/features/fleet/api.ts :: healthScore` | 알 수 없는 health 문자열은 0.5 |
| `healthLabel` | `frontend/src/features/fleet/api.ts :: healthLabel` | 알 수 없는 health 문자열은 원문 표시 |

## 소비 화면

- `HomePage`(`/`)는 `useFleetSummary()`로 플릿 맵 treemap, KPI strip, 클러스터 테이블을 렌더한다. 클러스터 타일/행 클릭은 `pathFor('/clusters/:clusterId')` 로 이동해 `/console` base path를 보존한다.
- 홈 플릿 맵은 `all`, `cpu`, `memory`, `incidents` 렌즈 탭을 제공한다. 모든 렌즈의 tile 크기는 pod total 로 고정하고, `all`은 health score, `cpu`/`memory`는 관측 사용률을 낮을수록 좋은 score, `incidents`는 open incident 유무를 위험 score 로 매핑한다.
- 홈 KPI strip 은 `FleetTotals`와 `FleetClusterSummary[]`에서 팟 수, 평균 CPU, 평균 메모리, 활성 알림(`open_incidents + dead_letters`)을 계산한다. CPU/MEM 관측값이 없으면 합성하지 않고 `—`로 표시한다.
- 홈 dashboard grid 의 저장 위젯/스냅샷 추이 카드는 선택 클러스터 기준 `useMetricWidgets`, `useMetricQueryPresets`, `useClusterUsage` 결과를 사용한다. fleet API가 제공하지 않는 위젯/시계열을 여기서 만들어 넣지 않는다.
- 홈 스냅샷 추이 카드는 [metrics](./metrics.md)의 `buildUsageSeries()`와 같은 규칙을 쓴다. `restart_total` 누적값을 직접 그리지 않고 샘플 간 증가분으로 표시한다.
- `ClusterDetailView`는 `useClusterAgg(clusterId)`로 `ClusterAggPanel`을 렌더한다. 이 보조 패널은 pending 이면 null, 실패하면 본문을 막지 않고 재시도 문구를 표시한다.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/` | `features/console/pages/HomePage` | `RequireSession`+`ConsoleLayout` | 플릿 현황 홈 |
| `/overview` | `<Navigate to="/" replace />` | 없음 | 구 오버뷰 경로 호환 redirect |
| `/overview/*` | `<Navigate to="/" replace />` | 없음 | 구 오버뷰 하위 경로 호환 redirect |

## 불변식·오류 (Invariants & Errors)

- 집계 API 타입이 화면 계약이다. 필드가 없으면 UI에서 합성하지 않고 빈 상태나 `—`로 표시한다.
- 건강도 점수/라벨 변환은 이 파일의 `healthScore`/`healthLabel`만 사용한다.
- `unknown` 은 backend 가 pod/node/usage 관측값 부재를 그대로 드러낸 상태이고, `stale` 은 관측값은 있으나 agent connection status 가 online 이 아닌 상태다. 프론트는 이를 healthy 로 보정하지 않는다.
- `/fleet/summary`와 `/clusters/{id}/summary`는 실측 집계이며, 프론트에서 과거 `score.ts`식 계산을 복원하지 않는다.
