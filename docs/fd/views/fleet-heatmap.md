# 뷰: 플릿 히트맵 (클러스터 모음 → 노드 → 팟 드릴다운)

[← 지도](../README.md) · 요구사항 [R6](../01-requirements.md#r6-클러스터-모음--클러스터--노드--팟-히트맵-드릴다운) · 상세 화면은 [cluster-detail.md](cluster-detail.md)

기본 랜딩(/overview). "주식 히트맵" 컨셉 채택 — **면적=규모, 색=건강도**.
참조: Finviz 색 매핑, 외부 기준 콘솔 Home, kube-ops-view 아이디어([02](../02-reference-map.md)).

## 레이아웃

```text
┌ StatBox 4개: 클러스터 n · 노드 n · 실행 팟 n · 열린 인시던트 n (CountUp) ┐
├ 레벨 Breadcrumbs: 플릿 > target > node-1        [범례: ■건강 ■주의 ■위험] ┤
│ ┌──────────────── TreemapChart ────────────────┐  ┌ 사이드 요약 패널 ┐ │
│ │  타일 = 현재 레벨 엔터티                       │  │ 호버/선택 대상    │ │
│ │  면적 = 규모, 색 = score, 라벨 = 이름+핵심수치 │  │ KeyValue+Spark   │ │
│ └───────────────────────────────────────────────┘  └─────────────────┘ │
└ 하단: 최근 인시던트 티커(대시보드 timeline 상위 5) ────────────────────┘
```

## 드릴다운 3레벨 (URL 반영 — [05](../05-routes-ia.md#딥링크url-상태-규칙))

| 레벨 | 타일 | 면적 | 색 score 입력 | 클릭 |
|---|---|---|---|---|
| 1 플릿 | 클러스터 | 팟 수(없으면 노드 수) | 인시던트 수·unhealthy 비율·연결 상태 | 레벨 2 (LayoutMorph 확대) |
| 2 클러스터 | 노드 | 해당 노드 팟 수 | 노드 ready·팟 실패 비율·(G6: cpu/mem) | 레벨 3 |
| 3 노드 | 팟 | 균등(또는 restart 수 가중) | 팟 phase·restart·live hot 표시 | PodDrawer → [cluster-detail § 팟](cluster-detail.md#팟-drawer) |

색 계산(단일 함수 `features/fleet/score.ts`):
`score = 1 - clamp(0.5*unhealthyRatio + 0.3*incidentPenalty + 0.2*staleness)` →
`--heat-bad → --heat-mid → --heat-good` 보간. 연결 끊김 클러스터는 neutral 빗금 패턴.

## 데이터

| 데이터 | API | 갱신 |
|---|---|---|
| 클러스터 목록·연결 상태 | `GET /clusters` | 30s refetch |
| 클러스터별 요약(노드/팟 카운트, 상태 분포) | `GET /clusters/{id}/inventory/summary` | 30s, 레벨 2 진입 시 |
| 노드·팟 상세 | `GET /clusters/{id}/inventory/resources?kind=Node`, `.../workloads` | 레벨 진입 시 |
| 실시간 색 갱신 | `WS /live/browser` — liveStore 의 hot pod/rollout 스냅샷 | push |
| 인시던트 티커 | `GET /dashboard/rca/timeline?limit=5` | 60s |

폴링과 WS 의 관계(모순 방지): WS 는 **색·hot 표시만** 덮어쓴다. 구조(타일 존재)는
inventory 쿼리가 정본 — WS 로 타일을 생성/삭제하지 않는다.

## 인터랙션·모션

- 타일 호버: scale 1.02 + 사이드 패널 갱신(120ms 디바운스)
- 레벨 전환: 클릭 타일 layoutId 공유 → LayoutMorph 확대(--dur-slow), 나머지 타일 FadeOut
- 실시간 색 변화: CSS transition --dur-slow (모션 원칙 3)
- 빈 플릿: EmptyState → [클러스터 등록](resources.md#클러스터-등록-위저드-실존-api--mock-불필요)

## AC

- [ ] /overview/c/:clusterId 새로고침 시 레벨 2 복원
- [ ] 클러스터 연결 끊김이 60s 내 neutral 표시 반영
- [ ] WS 단절 시 히트맵 구조 유지 + Topbar Live● 만 회색(기능 저하 없음)
- [ ] 타일 200개(팟 레벨)에서 60fps 호버 — score memo·가상 렌더 검증
- [ ] 색맹 대응: 색 외 보조 신호(위험 타일 ⚠ 아이콘) 제공
