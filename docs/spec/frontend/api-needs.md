---
title: 프론트 API 요청 큐
status: active-coordination-queue
date: 2026-07-11
owners: Codex 요청 / API 연결 작업자 처리
workorder: api-integration-workorder-20260711.md
---

# 프론트 API 요청 큐

이 문서는 골모드 §6b에 따른 단일 조율 큐다. Codex는 필요한 endpoint 함수·Zod schema가
`src/product/api`에 없을 때 직접 구현하지 않고 아래 표에 요청한다. API 작업자는 이 표를 일반
우선순위보다 먼저 처리하고, 완료 사실을 `codex-progress-20260711.md`에
`API 완성: <함수명> (<커밋 해시>)` 형식으로 기록한다.

## 작성 규칙

1. 한 행은 함께 검증·배포되는 함수군 하나다.
2. `routes.py 상수`는 `src/packages/contracts/gateway/routes.py`의 정확한 상수명만 쓴다.
3. 요청 시각은 `YYYY-MM-DD HH:mm KST`다.
4. 상태는 `requested`, `in_progress`, `blocked`만 사용한다. 완료 행은 progress 기록 확인 뒤 이
   표에서 제거하며 git history로 보존한다.
5. 응답 shape를 추측하거나 화면 component에 임시 fetch를 추가하지 않는다.
6. 24시간 미처리 전에는 Codex가 `src/product/api/**` endpoint·schema를 신설하지 않는다.

## 요청

### 신규 endpoint 함수·schema

| 함수명 | routes.py 상수 | 필요한 화면 | 요청 시각 | 상태 | 비고 |
|---|---|---|---|---|---|
| `getCluster` | `CLUSTER_PATH` | 전역 셸 / Home / capability 계산 | 2026-07-11 16:19 KST | requested | `ClusterResponse`의 cluster·agents를 strict schema로 검증 |
| `getClusterConnectionStatus` | `CLUSTER_CONNECTION_STATUS_PATH` | 전역 셸 연결 상태 | 2026-07-11 16:19 KST | requested | last-seen·connection status·agent capability를 축소하지 않음 |
| `getInventorySummary` | `CLUSTER_INVENTORY_SUMMARY_PATH` | namespace picker / Home / Resources | 2026-07-11 16:19 KST | requested | latest snapshot과 resource type·health count를 구분 |
| `getClusterSummary`, `getClusterNodesSummary`, `getNodePodsSummary` | `CLUSTER_SUMMARY_PATH`, `CLUSTER_NODES_SUMMARY_PATH`, `CLUSTER_NODE_PODS_SUMMARY_PATH` | Home / Metrics / topology projection | 2026-07-11 16:19 KST | requested | 세 summary 응답을 같은 contract-test suite로 검증 |
| `listRcaTimeline` | `DASHBOARD_RCA_TIMELINE_PATH` | Issues / Timeline / resource detail | 2026-07-11 16:19 KST | requested | `cluster_id`, `limit`, `AbortSignal` 지원; 고정 limit 6인 `getRcaTimeline`과 분리 |
| `listApplications`, `getApplication`, `listApplicationDeployments`, `listApplicationRuns` | `APPLICATIONS_PATH`, `APPLICATION_PATH`, `APPLICATION_DEPLOYMENTS_PATH`, `APPLICATION_RUNS_PATH` | Applications / GitOps / history | 2026-07-11 16:19 KST | requested | 자유형 map은 wire schema에서 보존하고 feature adapter에서만 좁힘 |
| `listInventoryEvents` | `CLUSTER_INVENTORY_EVENTS_PATH` | Timeline / Home activity | 2026-07-11 16:19 KST | requested | namespace·limit·AbortSignal 지원; event summary 임의 정규화 금지 |
| `listInventoryResourcesByType` | `CLUSTER_INVENTORY_RESOURCES_PATH` | Resources / topology projection | 2026-07-11 16:19 KST | requested | 기존 node·Pod 전용 함수를 변경하지 말고 범용 함수로 분리 |
| `getClusterResourceUsageSeries` | `CLUSTER_USAGE_PATH` | Pod·Node history / top metrics | 2026-07-11 16:19 KST | requested | `usage.pods`, `usage.nodes`를 보존; cluster rollup 전용 함수로 대체 금지 |
| `listMetricQueryPresets`, `runMetricQueryPreset` | `CLUSTER_METRIC_QUERY_PRESETS_PATH`, `CLUSTER_METRIC_QUERY_PRESET_RUN_PATH` | resource·PVC Metrics | 2026-07-11 16:19 KST | requested | run은 receipt만 확정하고 완료는 `getCommandStatus`로 수렴 |
| `runTelemetryQuery` | `AGENT_DEBUG_QUERY_PATH`, `COMMAND_STATUS_PATH` | Pod log snapshot | 2026-07-11 16:19 KST | requested | Prometheus 전용 함수와 분리; registered telemetry source literal 보존, POST 재전송 금지 |
| `submitCommand` | `COMMANDS_PATH` | Resources apply / remediation | 2026-07-11 16:19 KST | requested | `AcceptedResponse`를 성공으로 해석하지 않음; 현재 command id 부재는 `Cross-Gap-001`로 유지 |
| `restartDeployment`, `scaleDeployment` | `CLUSTER_DEPLOYMENT_RESTART_PATH`, `CLUSTER_DEPLOYMENT_SCALE_PATH` | Resources workload actions | 2026-07-11 16:19 KST | requested | Deployment capability에서만 사용; approval field와 management read-only 오류 보존 |
| `listCatalogItems`, `getCatalogItem` | `CATALOG_ITEMS_PATH`, `CATALOG_ITEM_PATH` | provider-neutral Catalog | 2026-07-11 16:19 KST | requested | install은 실행 계약이 없어 제외; 조회 응답만 구현 |
| `listRcaIncidents`, `getRcaIncident` | `DASHBOARD_RCA_TIMELINE_PATH`, `DASHBOARD_RCA_INCIDENT_PATH` | Issues 목록 / incident 상세 | 2026-07-11 16:19 KST | requested | timeline teaser와 분리; stable incident id가 있는 행만 상세 이동 |
| `getRecoveryPlanByCorrelation`, `selectRecoveryAction` | `RCA_RECOVERY_PLAN_BY_CORRELATION_PATH`, `RCA_RECOVERY_ACTION_SELECT_PATH` | incident 상세 복구 조치 | 2026-07-11 16:19 KST | requested | selection은 비낙관 receipt; `409`이면 plan 재조회 |
| `listEvidence`, `listRcaReports` | `EVIDENCE_QUERY_PATH`, `RCA_REPORTS_PATH` | evidence trail / resource-scoped AI 분석 | 2026-07-11 16:19 KST | requested | cursor·offset wire 의미 보존; stable correlation 없으면 호출하지 않음 |
| `listAiConversations`, `getAiConversation`, `createAiConversation`, `appendAiMessage`, `deleteAiConversation` | `AI_CONVERSATIONS_PATH`, `AI_CONVERSATION_PATH`, `AI_CONVERSATION_MESSAGES_PATH` | global AI conversation drawer | 2026-07-11 16:19 KST | requested | status literal 전체 보존; accepted 후 detail poll; delete 204 처리 |

### 기존 구현 검증·승인

아래 함수는 코드가 이미 있어도 `codex-progress-20260711.md`에 `API 완성:` 기록이 없으므로 §6b상
제품 화면에서 사용할 수 없다. API 작업자는 실응답·schema·오류·AbortSignal을 검증한 뒤 함수군을
승인 기록한다. 이 요청은 `client.ts`·`url.ts` 변경을 허용하지 않는다.

| 함수명 | routes.py 상수 | 필요한 화면 | 요청 시각 | 상태 | 비고 |
|---|---|---|---|---|---|
| `getSession`, `login`, `logout` | `AUTH_SESSION_PATH`, `AUTH_LOGIN_PATH`, `AUTH_LOGOUT_PATH` | session gate / 전역 셸 | 2026-07-11 16:19 KST | requested | 기존 함수군 검증 후 progress에 `API 완성:` 등록 |
| `listClusters` | `CLUSTERS_PATH` | cluster selector / context 전환 | 2026-07-11 16:19 KST | requested | strict schema·limit·AbortSignal 실응답 재검증 |
| `getFleetSummary` | `FLEET_SUMMARY_PATH` | Home | 2026-07-11 16:19 KST | requested | 기존 endpoint 함수의 실응답 승인만 필요 |
| `getRcaTimeline` | `DASHBOARD_RCA_TIMELINE_PATH` | Home RCA teaser | 2026-07-11 16:19 KST | requested | 고정 limit 6 의미를 유지; Issues 전체 목록에 사용 금지 |
| `listInventoryResources`, `listInventoryServices`, `listInventoryWorkloads`, `getInventoryResourceDetail` | `CLUSTER_INVENTORY_RESOURCES_PATH`, `CLUSTER_INVENTORY_SERVICES_PATH`, `CLUSTER_INVENTORY_WORKLOADS_PATH`, `CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH` | Home / Resources / topology projection | 2026-07-11 16:19 KST | requested | D1–D5 contract test와 cluster-1 실응답 검증 후 승인 |
| `getClusterUsage` | `CLUSTER_USAGE_PATH` | cluster-level usage card | 2026-07-11 16:19 KST | requested | cluster rollup 전용; Pod·Node history에 사용 금지 |
| `submitPrometheusQuery`, `getCommandStatus`, `pollCommand`, `runPrometheusQuery` | `AGENT_DEBUG_QUERY_PATH`, `COMMAND_STATUS_PATH` | Metrics / operation progress | 2026-07-11 16:19 KST | requested | possibly-sent POST 재전송 금지와 receipt polling을 contract test로 검증 |

## 큐 밖 Backend gap

route 자체가 없는 `BE-Gap-*`은 이 큐에 요청하지 않는다. 먼저 backend semantic contract가 확정돼야
하므로 P2 gap 대장에만 남기고 해당 화면·control은 렌더하지 않는다. WebSocket `/api/live/browser`는
HTTP endpoint 함수 큐와 분리해 realtime 작업자가 검증하며, progress에 `API 완성: connectRealtime`
기록이 생기기 전에는 제품에서 소비하지 않는다.
