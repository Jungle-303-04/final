# API 계층 (`src/features/console/api/`)

콘솔 UI의 **유일한 데이터 접근 지점**. 페이지·위젯·맵은 전부 `../api`에서만 import하고,
mock 구현(`mock.ts`, `metrics.ts`)은 이 계층 뒤의 어댑터로 격리되어 있다.

## 구조

```
페이지/위젯/맵 ──> api/index.ts ──> mock.ts      (엔티티: 클러스터·서비스·저장소…)
                              └──> metrics.ts   (팟-상향 집계: PodMetric → Node/Group/Cluster/Fleet)
```

- 어댑터 내부(`metrics.ts` → `mock.ts`)를 제외하면 UI 코드에 mock 직접 import는 없다.
  검증: `grep -rn "from '\.\{1,2\}/mock'" src/features/console` → api/·어댑터만 나와야 함.
- 데이터 **타입이 곧 API 계약**이다 (`ConsoleCluster`, `PodMetric`, `ClusterAgg`, `FleetAgg` …).

## 백엔드 연결 절차

1. `api/index.ts`의 re-export를 실제 구현으로 교체한다 (TanStack Query 권장 — 의존성 설치됨).
   - `getClusterAgg(id)` → `GET /api/clusters/:id/metrics`
   - `getPodMetrics(id)` → `GET /api/clusters/:id/pods`
   - `collectorOf(id)` → node-collector 헬스 엔드포인트 (I11: 비정상이면 available:false)
   - `CLUSTERS`/`SERVICES` 등 목록 → 대응 목록 API
2. 페이지 코드는 수정하지 않는다 — 반환 타입이 유지되는 한 그대로 동작.
3. 집계 불변식(부모=Σ자식, 가중평균)은 백엔드가 보장해야 하며,
   `scripts/validate-metrics.ts`의 검증 항목이 그 계약의 사양이다.

## 불변식 (기획서 docs/map-rbac-plan.md의 I1~I12)

- I3: 모든 수치는 팟 레벨에서 생성 → 상향 합산. 비율은 Σ사용량÷Σ용량.
- I6: 플릿 집계 함수(`getFleetAgg`)는 반드시 "뷰어에게 보이는 클러스터 목록"을 인자로 받는다.
- I11: 수집기 비정상 클러스터는 값을 만들지 않는다 — `available:false` + 사유.
