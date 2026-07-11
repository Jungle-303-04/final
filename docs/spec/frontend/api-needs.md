---
title: 프론트 API 요청 큐
status: active-coordination-queue
date: 2026-07-11
owners: Codex 요청 / API 연결 작업자 claim·처리
workorder: api-integration-workorder-20260711.md
snapshot: 26행·46함수 / requested 25 / blocked 1 / valid completion anchors 3
---

# 프론트 API 요청 큐

이 파일은 goalmode §6b의 단일 작업 큐다. API 작업자는 이 표에서 원자적으로 claim한 함수군만
`references/ui-layer-lab/src/product/api/**`에 구현·검증한다. Codex는 progress 파일에 정확한
`API 완성: <함수명> (<코드 커밋 hash>)` 앵커가 생긴 함수만 소비한다.

상세한 경로, 소유권, schema, test, mutation 안전, 2커밋 완료 절차는
`api-integration-workorder-20260711.md`가 정본이다.

## 1. 상태와 claim 규칙

1. 상태는 `requested`, `in_progress`, `blocked`만 쓴다.
2. claim 전 최신 원격의 queue와 progress를 확인한다.
3. `requested` 행 하나를 `in_progress`로 바꾸고 `담당/브랜치`, `claim·heartbeat`를 채운 조율
   커밋을 먼저 push한다.
4. 전체 queue에서 `in_progress`는 동시에 한 행만 허용한다. 이것이 모든 행이 공유하는 `index.ts`와
   일부 공용 schema·test 파일의 file lock이다. 한 행의 일부 함수만 claim하지 않는다.
5. `in_progress`의 마지막 heartbeat가 24시간 지나기 전에는 다른 작업자나 Codex가 인수하지
   않는다. 회수 커밋이 원격에 반영된 뒤에만 재claim할 수 있다.
6. blocker가 생기면 상태를 `blocked`로 바꾸고 원인·재현·선행 작업·재개 조건을 비고에 적는다.
7. 코드 커밋 A가 `origin/woonyong/ui-layer-lab`에 push되고 full gate가 통과한 뒤 progress EOF에
   함수별 exact 앵커를 추가한다. 앵커 hash는 canonical branch의 ancestor여야 한다.
8. 함수군의 모든 앵커가 확인된 뒤에만 행을 제거한다. 완료 전 일부 함수 export를 제품이 소비하지
   않는다.
9. `client.ts`, `url.ts`, 화면, adapter, backend는 이 큐의 수정 권한 밖이다.
10. canonical branch force-push 금지. feature branch를 썼다면 merge/cherry-pick 후의 최종 hash만
    앵커로 기록하고, squash/rebase로 이미 기록한 hash를 제거하지 않는다.

queue coordinator와 행 분할·회수·unblock 승인 주체는 현재 primary Codex 작업(`/root`)이다.
`claim·heartbeat`는 queue 시각 갱신 커밋이 canonical branch에 push된 경우에만 유효하다. 대상 파일의
`test` 표기는 첫 endpoint 파일과 같은 stem의 `<domain>.test.ts`다.

시각 형식:

```text
담당/브랜치: <작업자 식별자>@<branch>
claim·heartbeat: YYYY-MM-DD HH:mm KST
```

## 2. 신규 endpoint 함수·schema

| ID | 우선 | 함수명 | routes.py 상수 | 대상 파일 | 필요한 화면 | 요청 시각 | 상태 | 담당/브랜치 | claim·heartbeat | 완료 조건·주의 |
|---|---:|---|---|---|---|---|---|---|---|---|
| `APIQ-001` | P0 | `getCluster` | `CLUSTER_PATH` | `cluster-detail.ts`, `cluster-detail-schemas.ts`, test | 전역 셸 / Home / capability | 2026-07-11 16:19 KST | requested | — | — | `ClusterResponse`의 cluster·agents 전체 wire 계약 |
| `APIQ-002` | P0 | `getClusterConnectionStatus` | `CLUSTER_CONNECTION_STATUS_PATH` | `cluster-connection.ts`, `cluster-connection-schemas.ts`, test | 전역 셸 연결 상태 | 2026-07-11 16:19 KST | requested | — | — | last-seen·status·agent capability 축소 금지 |
| `APIQ-003` | P1 | `getInventorySummary` | `CLUSTER_INVENTORY_SUMMARY_PATH` | `inventory-summary.ts`, `inventory-summary-schemas.ts`, test | namespace picker / Home / Resources | 2026-07-11 16:19 KST | requested | — | — | latest snapshot, counts, type·health 구분 |
| `APIQ-004` | P1 | `getClusterSummary`, `getClusterNodesSummary`, `getNodePodsSummary` | `CLUSTER_SUMMARY_PATH`, `CLUSTER_NODES_SUMMARY_PATH`, `CLUSTER_NODE_PODS_SUMMARY_PATH` | `cluster-summary.ts`, `cluster-summary-schemas.ts`, test | Home / Metrics / topology projection | 2026-07-11 16:19 KST | requested | — | — | 세 response model을 동일 test suite에서 개별 검증 |
| `APIQ-005` | P2 | `listRcaTimeline` | `DASHBOARD_RCA_TIMELINE_PATH` | `rca-list.ts`, `rca-list-schemas.ts`, test | Issues / Timeline / resource detail | 2026-07-11 16:19 KST | requested | — | — | `cluster_id?`, `limit=50`(1..100), signal; teaser 함수와 분리 |
| `APIQ-006` | P2 | `listApplications`, `getApplication`, `listApplicationDeployments`, `listApplicationRuns` | `APPLICATIONS_PATH`, `APPLICATION_PATH`, `APPLICATION_DEPLOYMENTS_PATH`, `APPLICATION_RUNS_PATH` | `applications.ts`, `applications-schemas.ts`, test | Applications / GitOps / history | 2026-07-11 16:19 KST | requested | — | — | list limit 1..500; 내부 JsonMap 보존; cursor/filter 발명 금지 |
| `APIQ-007` | P2 | `listInventoryEvents` | `CLUSTER_INVENTORY_EVENTS_PATH` | `inventory-events.ts`, `inventory-events-schemas.ts`, test | Timeline / Home activity | 2026-07-11 16:19 KST | requested | — | — | namespace, limit 1..1000, signal; 임의 event 정규화 금지 |
| `APIQ-008` | P2 | `listInventoryResourcesByType` | `CLUSTER_INVENTORY_RESOURCES_PATH` | `inventory-query.ts`, `inventory-query-schemas.ts`, test | Resources / topology projection | 2026-07-11 16:19 KST | requested | — | — | 기존 Home node·pod 함수 변경 금지; 동일 route의 범용 query |
| `APIQ-009` | P2 | `getClusterResourceUsageSeries` | `CLUSTER_USAGE_PATH` | `usage-series.ts`, `usage-series-schemas.ts`, test | Pod·Node history / top metrics | 2026-07-11 16:19 KST | requested | — | — | limit 1..2000; `samples[].usage` JsonMap 보존; rollup으로 대체 금지 |
| `APIQ-010` | P2 | `listMetricQueryPresets`, `runMetricQueryPreset` | `CLUSTER_METRIC_QUERY_PRESETS_PATH`, `CLUSTER_METRIC_QUERY_PRESET_RUN_PATH` | `metric-presets.ts`, `metric-presets-schemas.ts`, test | resource·PVC Metrics | 2026-07-11 16:19 KST | requested | — | — | run body 없음; `AgentDebugQueryResponse`, HTTP 200 receipt |
| `APIQ-011` | P2 | `runTelemetryQuery` | `AGENT_DEBUG_QUERY_PATH`, `COMMAND_STATUS_PATH` | `telemetry.ts`, `telemetry-schemas.ts`, test | Pod log snapshot | 2026-07-11 16:19 KST | requested | — | — | `APIQ-027` 완료 앵커 의존; 완료 전 claim 금지. 명시적 AGENT_* browser 예외; POST 1회; source literal 보존 |
| `APIQ-012` | P3 | `submitCommand` | `COMMANDS_PATH` | `commands.ts`, `commands-schemas.ts`, test | Resources apply / remediation | 2026-07-11 16:19 KST | requested | — | — | `AcceptedResponse` 200; command_id 없음; `Cross-Gap-001`, polling 발명 금지 |
| `APIQ-013` | P2 | `grantApproval`, `rejectApproval` | `APPROVAL_GRANT_PATH`, `APPROVAL_REJECT_PATH` | `approvals.ts`, `approvals-schemas.ts`, test | Applications / GitOps approval | 2026-07-11 17:17 KST | requested | — | — | body absent/null/`{}` 허용; reason nullable; 404/409; POST 재전송 금지 |
| `APIQ-014` | P3 | `restartDeployment`, `scaleDeployment` | `CLUSTER_DEPLOYMENT_RESTART_PATH`, `CLUSTER_DEPLOYMENT_SCALE_PATH` | `deployments.ts`, `deployments-schemas.ts`, test | Resources workload actions | 2026-07-11 16:19 KST | requested | — | — | body·path strict; accepted 200에 command_id 없음; live mutation 승인 필요 |
| `APIQ-015` | P3 | `listCatalogItems`, `getCatalogItem` | `CATALOG_ITEMS_PATH`, `CATALOG_ITEM_PATH` | `catalog.ts`, `catalog-schemas.ts`, test | provider-neutral Catalog | 2026-07-11 16:19 KST | requested | — | — | item JsonMap 보존; pagination/filter 발명 금지; install 제외 |
| `APIQ-016` | P2 | `getRcaIncident` | `DASHBOARD_RCA_INCIDENT_PATH` | `rca-detail.ts`, `rca-detail-schemas.ts`, test | Issues incident 상세 | 2026-07-11 16:19 KST | requested | — | — | incident path + `cluster_id?`; stable incident id가 있을 때만 호출 |
| `APIQ-017` | P2 | `getRecoveryPlanByCorrelation`, `selectRecoveryAction` | `RCA_RECOVERY_PLAN_BY_CORRELATION_PATH`, `RCA_RECOVERY_ACTION_SELECT_PATH` | `recovery.ts`, `recovery-schemas.ts`, test | incident 상세 복구 조치 | 2026-07-11 16:19 KST | requested | — | — | selection body 필수·`{}` 허용; receipt 200; 409 후 plan 재조회는 adapter 소유 |
| `APIQ-018` | P2 | `listEvidence`, `listRcaReports` | `EVIDENCE_QUERY_PATH`, `RCA_REPORTS_PATH` | `evidence.ts`, `evidence-schemas.ts`, test | evidence trail / AI 분석 | 2026-07-11 16:19 KST | requested | — | — | ISO time, limit/offset/cursor, next_cursor 보존; correlation 없으면 호출 안 함 |
| `APIQ-019` | P2 | `listAiConversations`, `getAiConversation`, `createAiConversation`, `appendAiMessage` | `AI_CONVERSATIONS_PATH`, `AI_CONVERSATION_PATH`, `AI_CONVERSATION_MESSAGES_PATH` | `conversations.ts`, `conversations-schemas.ts`, test | global AI conversation drawer | 2026-07-11 16:19 KST | requested | — | — | 내부 JsonMap·status string 보존; create/append 200 receipt; POST 재전송 금지 |
| `APIQ-020` | BLOCK | `deleteAiConversation` | `AI_CONVERSATION_PATH` | `conversations.ts`, `conversations-schemas.ts`, test | AI conversation 삭제 | 2026-07-11 21:55 KST | blocked | transport/backend owner | — | `BLOCK-204-001`: backend 204 empty body를 frozen `client.ts`가 invalid-payload 처리. 승인된 no-content 지원 또는 body 계약 후 재개 |

## 3. 기존 구현 검증·승인

아래 함수는 이미 존재하지만 exact 완료 앵커가 없다. claim한 작업자는 실응답·schema·URL·오류·
AbortSignal contract test를 추가하고, 필요한 경우 claim 범위 안에서만 구현을 보정한다. 코드 변경이
없어도 test commit hash가 완료 앵커의 코드 hash가 된다.

| ID | 우선 | 함수명 | routes.py 상수 | 대상 파일 | 필요한 화면 | 요청 시각 | 상태 | 담당/브랜치 | claim·heartbeat | 완료 조건·주의 |
|---|---:|---|---|---|---|---|---|---|---|---|
| `APIQ-022` | P0 | `listClusters` | `CLUSTERS_PATH` | `clusters.ts`, `cluster-schemas.ts`, `clusters.test.ts` | cluster selector | 2026-07-11 16:19 KST | requested | — | — | limit default 100, signal, strict 실응답 |
| `APIQ-023` | P1 | `getFleetSummary` | `FLEET_SUMMARY_PATH` | `fleet.ts`, `schemas.ts`, `fleet.test.ts` | Home | 2026-07-11 16:19 KST | requested | — | — | 실제 session scope summary와 nullable 검증 |
| `APIQ-024` | P1 | `getRcaTimeline` | `DASHBOARD_RCA_TIMELINE_PATH` | `rca.ts`, `schemas.ts`, `rca.test.ts` | Home RCA teaser | 2026-07-11 16:19 KST | requested | — | — | 고정 `limit=6`; Issues 전체 목록에 사용 금지 |
| `APIQ-025` | P1 | `listInventoryResources`, `listInventoryServices`, `listInventoryWorkloads`, `getInventoryResourceDetail` | `CLUSTER_INVENTORY_RESOURCES_PATH`, `CLUSTER_INVENTORY_SERVICES_PATH`, `CLUSTER_INVENTORY_WORKLOADS_PATH`, `CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH` | `inventory.ts`, `inventory-schemas.ts`, `inventory.test.ts` | Home / Resources / topology projection | 2026-07-11 16:19 KST | requested | — | — | workorder D1–D8, cluster-1 실응답, bounds·signal |
| `APIQ-026` | P1 | `getClusterUsage` | `CLUSTER_USAGE_PATH` | `metrics.ts`, `metrics-schemas.ts`, `metrics.test.ts` | cluster usage card | 2026-07-11 16:19 KST | requested | — | — | cluster rollup 전용; `features/**` test fixture 역방향 import 제거 |
| `APIQ-027` | P2 | `submitPrometheusQuery`, `getCommandStatus`, `pollCommand`, `runPrometheusQuery` | `AGENT_DEBUG_QUERY_PATH`, `COMMAND_STATUS_PATH` | `metrics.ts`, `metrics-schemas.ts`, `metrics.test.ts` | Metrics / operation progress | 2026-07-11 16:19 KST | requested | — | — | possibly-sent POST 재전송 0, polling GET만, terminal/timeout/abort, API-owned fixture |

## 4. 큐 밖 Backend gap과 realtime

- route 자체가 없는 `BE-Gap-*`은 이 큐에 넣지 않는다. backend semantic contract가 먼저다.
- repo/provider/target/org/alert/dead-letter 함수는 현재 필요한 화면이 확정되지 않아 아직 요청하지
  않았다. routes가 있다는 이유만으로 만들지 않는다.
- WebSocket `/api/live/browser`는 HTTP queue와 분리한다. connection·handshake·resume·sequence gap
  contract test와 `API 완성: connectRealtime (<hash>)` 앵커 전에는 제품에서 소비하지 않는다.
- `APIQ-020` blocked는 24시간 takeover 대상이 아니다. 비고의 unblock 조건이 충족되어 coordinator가
  `requested`로 되돌린 뒤에만 claim한다.
