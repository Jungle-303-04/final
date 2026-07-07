# 뷰: 플릿 현황 홈

[← 지도](../README.md) · 요구사항 [R6](../01-requirements.md#r6-클러스터-모음--클러스터--노드--팟-히트맵-드릴다운) · 상세 화면은 [cluster-detail.md](cluster-detail.md)

현재 기본 랜딩은 `/`의 `frontend/src/features/console/pages/HomePage.tsx`다. 구 `/overview`와 `/overview/*`는 `/`로 redirect 된다.
"주식 히트맵" 컨셉 중 현재 구현된 범위는 **클러스터 treemap(면적=pods_total, 색=health)** 이며, 노드·팟 드릴다운은 클러스터 상세 탭으로 연결한다.
참조: 벤치마크 히트맵 색 매핑, 외부 기준 콘솔 Home, 벤치마크 클러스터 타일 아이디어([02](../02-reference-map.md)).

## 레이아웃

```text
PageHeader("플릿 현황") [+ 레포 연결] [+ 클러스터 등록(admin)]
├─ StatCard 5개: 클러스터 · 열린 인시던트 · 승인 대기 · 실행 중 워크플로우 · 처리 실패 이벤트(DLQ)
├─ 클러스터 없으면 EmptyState (admin 은 [첫 클러스터 등록], non-admin 은 접근 가능한 클러스터 안내)
├─ 클러스터 있으면 TreemapChart + 클러스터 Table
├─ 최근 인시던트 카드
├─ 승인 대기 배포 카드
└─ 최근 AI 대화 카드
```

## Treemap

| 항목 | 구현 |
|---|---|
| 데이터 | `useFleetSummary()` → `fleet.clusters` |
| 면적 | `Math.max(1, pods_total)` |
| 색 | `healthScore(health)` (`healthy=0.92`, `warning=0.5`, `critical=0.08`, `stale=0.28`, `unknown=0.36`) |
| 라벨 | `<name> · <pods_running>/<pods_total> pods` |
| 클릭 | `/clusters/:clusterId` 이동 |
| 높이 | `TreemapChart`의 `minHeight=300`이 결정한다 |

## 데이터

| 데이터 | API | 갱신 |
|---|---|---|
| 플릿 집계 | `GET /fleet/summary` | 30s refetch |
| 최근 인시던트 | `GET /dashboard/rca/timeline?limit=20` | 60s refetch |
| 승인 대기 | `useNotices()` 합성 notice 중 `kind === 'approval'` | 소스 쿼리 갱신에 따름 |
| 최근 AI 대화 | `GET /ai/conversations` | chat API 쿼리 정책 |

## 인터랙션

- `+ 레포 연결`은 `ConnectRepoWizard`, admin 의 `+ 클러스터 등록`은 `RegisterClusterWizard`를 연다.
- 클러스터 treemap tile 또는 테이블 row 클릭은 `/clusters/:clusterId`로 이동한다.
- 최근 인시던트는 `/incidents/:incidentId`, 승인 대기는 notice link, AI 대화는 `/ai/:conversationId` 링크를 사용한다.

## AC

- [ ] `/overview` 접속 시 `/`로 redirect 된다.
- [ ] 클러스터가 0개면 HomePage가 admin 에게만 등록 CTA를 제공한다.
- [ ] `GET /fleet/summary` 값만으로 카드, treemap, 테이블을 그리며 프론트에서 집계 값을 합성하지 않는다.
- [ ] `unknown`/`stale` health 를 healthy 로 보정하지 않고 그대로 라벨·색상에 반영한다.
- [ ] treemap tile/cluster row 클릭이 클러스터 상세로 이어진다.
