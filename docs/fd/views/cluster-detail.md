# 뷰: 클러스터 상세

[← 지도](../README.md) · 요구사항 [R6](../01-requirements.md#r6-클러스터-모음--클러스터--노드--팟-히트맵-드릴다운) · 진입: [fleet-heatmap](fleet-heatmap.md) 또는 /clusters 목록

참조 UX: Plural CD>Clusters 탭 구조, Headlamp 리소스 테이블(Apache-2.0 — 코드 차용 가능)([02](../02-reference-map.md)).

## 목록 — ClusterListView (/clusters)

ResourceTable: 이름, 환경 Badge, 연결 상태(●), 노드/팟 수, 열린 인시던트, 등록일.
데이터: `GET /clusters` + 행별 summary lazy. [+ 클러스터 등록] → [resources 위저드](resources.md#클러스터-등록-위저드-실존-api--mock-불필요).

## 상세 — ClusterDetailView (/clusters/:clusterId)

```text
┌ 헤더: 이름 · env Badge · 연결● · agent 정책 gen · [메트릭 보기] [⋮] ┐
│ StatBox: 노드 · 팟(실행/전체) · 서비스 · 최근 인시던트               │
├ Tabs: resources | workloads | services | nodes | pods | events | policy ┤
│  (탭 상태는 ?tab= — 05 규칙)                                        │
└──────────────────────────────────────────────────────────────────────┘
```

## 탭 명세 (전부 ResourceTable + EntityDrawer 패턴 — 신규 컴포넌트 없음)

| 탭 | API | 컬럼 | Drawer 내용 |
|---|---|---|---|
| resources | `GET /clusters/{id}/inventory/resources` (?kind, ?namespace 필터) | kind, ns, 이름, 상태 Badge, age | KeyValue(메타) + CodeBlock(raw yaml/json) + labels |
| workloads | `.../inventory/workloads` | 이름, kind, ns, ready x/y, restarts, 이미지 | 팟 목록 + [스케일]·[재시작] 액션 |
| services | `.../inventory/services` | 이름, ns, type, clusterIP, 포트 | 엔드포인트 KeyValue |
| nodes | `.../inventory/resources?kind=Node` | 이름, ready, 팟 수, 버전, (G6: cpu/mem Sparkline) | 노드 조건 테이블 + 팟 목록 |
| pods | `.../inventory/workloads` 평탄화 + liveStore hot 병합 | 이름, ns, phase Badge, restarts, node, hot🔥 | 아래 팟 Drawer |
| events | `.../inventory/events` | 시각, type, reason, 대상, 메시지 | — (테이블 전용) |
| policy | 조회 API 없음 **(G11)** — 계약 기본값으로 폼 프리필 + "현재 적용값 미조회" warn 배너 | — (Form 뷰, admin 전용) | 주기·provider 토글·실패 정책 편집 → `PUT /clusters/{id}/policy` (👑, AgentPolicy 전체 전송) |

30s refetch 공통. pods 탭의 hot 표시는 liveStore(WS) — 구조는 inventory 정본([fleet-heatmap § 데이터](fleet-heatmap.md#데이터) 동일 규칙).

## 팟 Drawer

/clusters/:id/pods/:namespace/:pod (URL 오버레이). Tabs:

| 탭 | 내용 | 데이터 |
|---|---|---|
| 개요 | phase, restarts, node, 이미지, 시작시각 (KeyValue) | inventory 행 |
| 실시간 | live summary 중 이 팟 항목 Sparkline(있을 때) | liveStore |
| 원인 분석 | 이 팟 연관 인시던트 목록 → [ai-chat](ai-chat.md) "이 팟 분석" 버튼 | `GET /dashboard/rca/timeline?cluster_id=` 필터 |

## 쓰기 액션 (권한: release_operator 이상 — RequirePermission)

| 액션 | API | UX |
|---|---|---|
| 배포 스케일 | `POST /clusters/{id}/namespaces/{ns}/deployments/{name}/scale` | Modal: replicas 스텝퍼(0~100) → 낙관적 갱신 없이 Toast "명령 큐 등록" — **비동기 명령**임을 명시(command-worker 경유) |
| 롤아웃 재시작 | `POST .../deployments/{name}/restart` | 확인 Modal(danger) → 동일 Toast |

명령 결과는 즉시 반영되지 않는다 — workloads 탭 30s 폴링과 live summary 가 수렴 표시.
"명령 추적" 링크 → [notifications](notifications.md) 의 command 항목.

## AC

- [ ] 모든 탭이 URL 딥링크로 직접 진입 가능
- [ ] 스케일/재시작이 権한 없으면 disabled + 사유, 있으면 확인 Modal 필수
- [ ] inventory 5000행(백엔드 상한)에서 테이블 가상화로 렌더 지연 없음
- [ ] Drawer 열림 상태에서 목록 폴링이 Drawer 데이터를 덮어써도 스크롤·탭 유지
