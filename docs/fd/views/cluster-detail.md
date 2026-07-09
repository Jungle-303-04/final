# 뷰: 클러스터 상세

[← 지도](../README.md) · 요구사항 [R6](../01-requirements.md#r6-클러스터-모음--클러스터--노드--팟-히트맵-드릴다운) · 진입: [fleet-heatmap](fleet-heatmap.md) 또는 /clusters 목록

참조 UX: 외부 기준 콘솔 CD>Clusters 탭 구조, 벤치마크 k8s 리소스 테이블(Apache-2.0 — 코드 차용 가능)([02](../02-reference-map.md)).

## 목록 — ClusterListView (/clusters)

ResourceTable: 이름, 환경 Badge, 연결 상태(●), 노드/팟 수, 열린 인시던트, 등록일.
데이터: `GET /clusters`. admin 의 [+ 클러스터 등록] → [resources 위저드](resources.md#클러스터-등록-위저드-실존-api--테스트 전용 대역 불필요).

## 상세 — ClusterDetailView (/clusters/:clusterId)

```text
┌ 헤더: 이름 · env Badge · 연결● · [메트릭] [AI 분석]                 ┐
│ StatBox: 노드 · 실행 팟 · 비정상 팟 · 서비스                         │
│ 집계 요약 + 최근 클러스터 이벤트 + q drill 배지                       │
├ Tabs: workloads | pods | nodes | services | resources | events        ┤
│  (탭 상태는 ?tab= — 05 규칙)                                        │
└──────────────────────────────────────────────────────────────────────┘
```

## 탭 명세

| 탭 | API | 컬럼 | Drawer 내용 |
|---|---|---|---|
| workloads | `GET /clusters/{id}/inventory/workloads` | 워크로드, kind, ns, Ready, health, 스케일/재시작/팟 | ResourceDetailDrawer: `resource-detail` + related pods + involvedObject 이벤트 |
| pods | `GET /clusters/{id}/inventory/resources?resource_type=pod` + liveStore hot 병합 | 이름, ns, phase Badge, restarts, node, hot | ResourceDetailDrawer: pod detail + involvedObject 이벤트 |
| nodes | `GET /clusters/{id}/inventory/summary`의 nodes | 이름, ready, 팟 수, CPU, MEM, 버전 | ResourceDetailDrawer: node detail + related pods + involvedObject 이벤트 |
| services | `GET /clusters/{id}/inventory/services` | 이름, ns, type, ClusterIP, 포트 | ResourceDetailDrawer: service detail + selector 기반 related pods + involvedObject 이벤트 |
| resources | `GET /clusters/{id}/inventory/resources` | kind, ns, 이름, 상태 Badge, age | `?q=`가 있으면 kind/ns/name/status includes 필터 |
| events | `GET /clusters/{id}/inventory/events` | 시각, type, reason, 대상, 메시지 | `?q=`가 있으면 reason/target/message/type includes 필터 |

summary/pods/workloads는 30s refetch, usage 집계는 `ClusterAggPanel`이 `GET /clusters/{id}/summary`로 따로 읽는다.
pods 탭의 hot 표시는 liveStore(WS) — 구조는 inventory 정본([fleet-heatmap § 데이터](fleet-heatmap.md#데이터) 동일 규칙).
단일 리소스 Drawer는 `GET /clusters/{id}/inventory/resource-detail?resource_type=&kind=&name=&namespace=`를 정본 계약으로 사용한다. 응답의 `resource`, `related`, `events`는 inventory read model 기반이며 public 응답에 raw Kubernetes object는 없다.

## ContextActions와 Drawer

`ContextActions`는 동일한 리소스 맥락을 메트릭과 AI로 넘긴다.

- 메트릭: `/metrics?cluster=<id>&subject=<subject>&name=<name>[&namespace=<ns>]`
- AI: `/ai?prefill=<cluster namespace/name subject 상태 분석>&context=<json>` (`cluster_id`, `resource_type`, `kind`, `namespace`, `name`, `uid` 문자열 컨텍스트)

팟 Drawer는 `/clusters/:id/pods/:namespace/:pod` URL 오버레이를 유지한다.
노드/서비스/워크로드 Drawer는 URL search state(`detail`, `name`, `namespace`, `kind`)로 복원 가능하다.

## 쓰기 액션 (권한: release_operator 이상 — RequirePermission)

| 액션 | API | UX |
|---|---|---|
| 배포 스케일 | `POST /clusters/{id}/namespaces/{ns}/deployments/{name}/scale` | Modal: replicas 스텝퍼(0~100) → 낙관적 갱신 없이 Toast "명령 큐 등록" — **비동기 명령**임을 명시(command-worker 경유) |
| 롤아웃 재시작 | `POST .../deployments/{name}/restart` | 확인 Modal(danger) → 동일 Toast |

명령 결과는 즉시 반영되지 않는다 — workloads 탭 30s 폴링과 live summary 가 수렴 표시.
"명령 추적" 링크 → [notifications](notifications.md) 의 command 항목.

## AC

- [ ] 모든 탭이 URL 딥링크로 직접 진입 가능
- [ ] 스케일/재시작이 권한 없으면 disabled + 사유, 있으면 확인 Modal 필수
- [ ] `?q=` drilldown 해제 시 현재 tab을 유지
- [ ] Drawer 열림 상태에서 목록 폴링이 Drawer 데이터를 덮어써도 스크롤·탭 유지
