---
title: 외부 기준 기능 → 제품 계약 매핑표
status: p2-source-of-truth
date: 2026-07-11
api_status_synced_at: 2026-07-12 00:57 KST
source_inventory: reference-feature-inventory.md
source_mapping_units: 136
target_mapping_units: 136
next_gate: final-questions.md 1회 질문 라운드
---

# 외부 기준 기능 → 제품 계약 매핑표

## 0. 목적과 완료 불변식

이 문서는 P1의 browser 소비 API 136 mapping unit을 우리 backend 정본과 일대일 대조하는 P2
산출물이다. backend 구현을 추측하거나 synthetic로 대체하지 않는다.

완료 시 다음 조건을 동시에 만족해야 한다.

1. `P1 136 = P2 136`이고 reference ID가 중복·누락되지 않는다.
2. 각 행의 판정은 `직결`, `어댑터`, `BE-Gap` 중 정확히 하나다.
3. `우리 계약`은 `src/packages/contracts/gateway/routes.py`의 상수명과 실제 router response model
   근거를 함께 가진다. path 문자열만 비슷한 것은 근거가 아니다.
4. `어댑터`는 화면 component가 아니라 `src/product`의 view-neutral adapter가 수행할 변환을 적는다.
5. 필요한 endpoint 함수·schema가 없으면 직접 만들지 않고 `api-needs.md`에 요청한다.
6. `BE-Gap`은 disabled UI로 남기지 않는다. capability가 실존하지 않으므로 해당 control/surface를
   렌더하지 않는다.
7. 외부 기준 저장소의 provider·brand 이름은 제품 DTO와 화면 분기 기준이 아니다.

## 1. 판정 규칙

| 판정 | 의미 | 화면 처리 |
|---|---|---|
| `직결` | 우리 endpoint의 의미·scope·필수 데이터가 reference 기능을 변환 없이 충족 | 검증된 API 함수 결과를 그대로 소비 |
| `어댑터` | 의미는 충족하지만 endpoint 결합·field rename·filter·client state·polling 치환이 필요 | view-neutral adapter에서만 변환 |
| `BE-Gap` | 필수 의미·권한·데이터·operation이 우리 backend에 없음 | UI 미노출, stable gap ID 부여 |

부분 필드만 비슷하면 `직결`로 판정하지 않는다. reference의 핵심 interaction을 만들 수 있을 만큼
의미가 완결되고, 누락 필드가 optional presentation에만 영향을 줄 때만 `어댑터`가 가능하다.

## 2. 우리 계약 정본과 API 소유 경계

- route 정본: `src/packages/contracts/gateway/routes.py`
- request/response 정본: `src/packages/contracts/gateway/requests.py`, `responses.py`
- router 의미·permission: `src/domains/**/router.py`
- frontend endpoint 함수·Zod schema 소유: 병렬 API 작업자, `src/product/api/**`
- 화면·adapter·state 소유: Codex, `src/product/**` 중 API endpoint/schema 외 영역
- 사용 승인: `codex-progress-20260711.md`의 `API 완성:` 기록이 있는 함수만 화면에서 소비
- 요청 큐: `api-needs.md`

## 3. API 136행 매핑

완결 판정은 다음과 같다. 이 수치는 아래 `REF-API-001`~`REF-API-136` 행만 집계하며, 우리 고유
RCA 삽입점 5개는 별도 집계한다.

| 범위 | 전체 | 직결 | 어댑터 | BE-Gap | 미정 |
|---|---:|---:|---:|---:|---:|
| Reference browser 소비 API | 136 | 0 | 34 | 102 | 0 |
| 제품 고유 RCA 삽입점 | 5 | 4 | 1 | 0 | 0 |

`P1 136 = P2 136`이며, reference endpoint의 형태를 그대로 노출하는 `직결`이 0인 것은 오류가
아니다. 우리 backend가 provider-neutral projection 또는 여러 endpoint 결합을 요구하므로 화면과
wire 계약 사이에 view-neutral adapter가 필요하다.

| ID | Reference method·path | 우리 계약 상수·path | 판정 | adapter 또는 gap 근거 | API 함수 상태 |
|---|---|---|---|---|---|
| `REF-API-001` | `GET /health` | `HEALTHZ_PATH` `GET /api/healthz` → `HealthResponse` | `BE-Gap` | `BE-Gap-001`: `status,service`만 있어 runtime·timeline·resource count 진단을 제공하지 못함 | backend 선행 |
| `REF-API-002` | `GET /diagnostics` | 없음 | `BE-Gap` | `BE-Gap-002`: informer·cache·drop·runtime 진단 계약 없음 | backend 선행 |
| `REF-API-003` | `GET /auth/me` | `AUTH_SESSION_PATH` `GET /api/auth/session` → `AuthSessionResponse` | `어댑터` | session barrier·user identity로 변환; auth mode/cloud role은 unavailable | `getSession` `API 완성: a245f02a` |
| `REF-API-004` | `GET /version-check` | 없음 | `BE-Gap` | `BE-Gap-003`: 제품·최신 version 비교 계약 없음 | backend 선행 |
| `REF-API-005` | `GET /connection` | `CLUSTERS_PATH` `GET /api/clusters` → `ClusterListResponse`; `CLUSTER_CONNECTION_STATUS_PATH` `GET .../connection-status` → `ClusterConnectionStatusResponse` | `어댑터` | current context를 URL cluster로 치환하고 agent last-seen·connection 결합 | `listClusters` `API 완성: 257581398`; `getClusterConnectionStatus` `API 완성: 3d99514d6` |
| `REF-API-006` | `POST /connection/retry` | 없음 | `BE-Gap` | `BE-Gap-004`: 사용자 주도 agent/connection retry operation 없음 | backend 선행 |
| `REF-API-007` | `GET /cluster-info` | `CLUSTER_PATH` `GET /api/clusters/{cluster_id}` → `ClusterResponse`; `CLUSTER_INVENTORY_SUMMARY_PATH` `GET .../inventory/summary` → `InventorySummaryResponse` | `어댑터` | registration·agent·snapshot을 결합; platform·CRD discovery는 unavailable | `getCluster` `API 완성: 60d0d63d7`; `getInventorySummary` `API 완성: 310c24a0d` |
| `REF-API-008` | `GET /capabilities` | `CLUSTER_PATH` → `ClusterResponse`; `AUTH_SESSION_PATH` → `AuthSessionResponse` | `어댑터` | agent capabilities와 role에서 명시적 true만 노출; 미확인 verb는 미노출 | `getCluster` `API 완성: 60d0d63d7`; `getSession` `API 완성: a245f02a` |
| `REF-API-009` | `GET /namespaces` | `CLUSTER_INVENTORY_SUMMARY_PATH` → `InventorySummaryResponse` | `어댑터` | latest snapshot의 실제 namespace 집합; status·authoritative access는 unavailable | `getInventorySummary` `API 완성: 310c24a0d` |
| `REF-API-010` | `GET /api-resources` | 없음 | `BE-Gap` | `BE-Gap-005`: group/version/kind/namespaced/verbs discovery 계약 없음 | backend 선행 |
| `REF-API-011` | `GET /contexts` | `CLUSTERS_PATH` → `ClusterListResponse` | `어댑터` | Kubernetes context를 접근 가능한 registered cluster로 치환 | `listClusters` `API 완성: 257581398` |
| `REF-API-012` | `GET /sessions` | 없음 | `BE-Gap` | `BE-Gap-006`: exec/local-terminal/port-forward session 집계 없음 | backend 선행 |
| `REF-API-013` | `POST /contexts/{name}` | `CLUSTERS_PATH` → `ClusterListResponse` | `어댑터` | server mutation 없이 ID 검증 후 URL cluster·request generation 전환 | `listClusters` `API 완성: 257581398` |
| `REF-API-014` | `GET /cluster/namespace-scope` | 없음 | `BE-Gap` | `BE-Gap-007`: accessible namespace·authoritative/cache scope 계약 없음 | backend 선행 |
| `REF-API-015` | `POST /cluster/namespace` | `CLUSTER_INVENTORY_SUMMARY_PATH` + inventory namespace query | `어댑터` | server rescope 대신 검증 namespace를 URL/filter와 모든 inventory request에 전달 | `getInventorySummary` `API 완성: 310c24a0d`; `listInventoryResources/listInventoryServices/listInventoryWorkloads/getInventoryResourceDetail` `API 완성: 94ad64bf1` |
| `REF-API-016` | `GET /search` | 없음 | `BE-Gap` | `BE-Gap-008`: 전체 resource·matched field·total 검색 계약 없음 | backend 선행 |
| `REF-API-017` | `GET /settings` | 없음 | `BE-Gap` | `BE-Gap-009`: 사용자 UI preference 조회 없음 | backend 선행 |
| `REF-API-018` | `PUT /settings` | 없음 | `BE-Gap` | `BE-Gap-010`: 사용자 UI preference 저장 없음 | backend 선행 |
| `REF-API-019` | `GET /github/starred` | 없음 | `BE-Gap` | `BE-Gap-011`: reference repository prompt 상태 없음; brand action은 제품에서 미노출 | backend 요청 안 함 |
| `REF-API-020` | `POST /github/star`; `POST /github/dismiss` | 없음 | `BE-Gap` | `BE-Gap-012`: reference repository prompt mutation 없음 | backend 요청 안 함 |
| `REF-API-021` | `POST /desktop/open-url` | 없음 | `BE-Gap` | `BE-Gap-013`: desktop bridge 없음 | backend 선행 |
| `REF-API-022` | `POST /desktop/open-file`; `POST /desktop/open-folder` | 없음 | `BE-Gap` | `BE-Gap-014`: local filesystem bridge 없음 | backend 선행 |
| `REF-API-023` | `POST /desktop/save-file` | 없음 | `BE-Gap` | `BE-Gap-015`: desktop save bridge 없음 | backend 선행 |
| `REF-API-024` | `POST /desktop/update`; `GET /desktop/update/status`; `POST /desktop/update/apply` | 없음 | `BE-Gap` | `BE-Gap-016`: desktop updater·progress 계약 없음 | backend 선행 |
| `REF-API-025` | `GET /dashboard` | `FLEET_SUMMARY_PATH` → `FleetSummaryResponse`; `CLUSTER_SUMMARY_PATH` → `ClusterSummaryDetailResponse`; `CLUSTER_INVENTORY_SUMMARY_PATH` → `InventorySummaryResponse`; `DASHBOARD_RCA_TIMELINE_PATH` → `RcaTimelineResponse` | `어댑터` | health·workload·warning·incident·usage·count를 Home frame으로 결합; 미지원 card는 미렌더 | `getFleetSummary` `API 완성: 0de498e01`; `getRcaTimeline` `API 완성: 7ad3800e6`; `getClusterSummary` `API 완성: 94063b29d`; `getInventorySummary` `API 완성: 310c24a0d` |
| `REF-API-026` | `GET /dashboard/crds` | 없음 | `BE-Gap` | `BE-Gap-017`: CRD discovery와 top CRD count 계약 없음 | backend 선행 |
| `REF-API-027` | `GET /dashboard/helm` | 없음 | `BE-Gap` | `BE-Gap-018`: 설치된 Helm release 요약 계약 없음 | backend 선행 |
| `REF-API-028` | `GET /issues` | `DASHBOARD_RCA_TIMELINE_PATH` `GET /api/dashboard/rca/timeline` → `RcaTimelineResponse` | `어댑터` | RCA incident를 issue row로 변환; reference category·severity가 없으면 unavailable | `getRcaTimeline` `API 완성: 7ad3800e6`; `listRcaTimeline` queue |
| `REF-API-029` | `GET /applications` | `APPLICATIONS_PATH` `GET /api/applications` → `ApplicationListResponse` | `어댑터` | provider-neutral application summary로 좁힘; runtime relationship은 실제 binding이 있을 때만 결합 | `listApplications` queue |
| `REF-API-030` | `GET /topology` | `CLUSTER_INVENTORY_RESOURCES_PATH`, `CLUSTER_INVENTORY_SERVICES_PATH`, `CLUSTER_INVENTORY_WORKLOADS_PATH` → `InventoryResourceListResponse`; `CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH` → `InventoryResourceDetailResponse` | `어댑터` | 목록을 node로, detail `related`를 edge로 변환; 미관측 edge와 대규모 graph completeness는 partial | `listInventoryResources/listInventoryServices/listInventoryWorkloads/getInventoryResourceDetail` `API 완성: 94ad64bf1` |
| `REF-API-031` | `GET /changes` | `CLUSTER_INVENTORY_EVENTS_PATH` → `InventoryEventList`/`InventoryResourceListResponse`; `DASHBOARD_RCA_TIMELINE_PATH` → `RcaTimelineResponse` | `어댑터` | observed Kubernetes event와 RCA 상태를 시간축으로 병합; cursor·stable tie-break 부재는 partial | `listInventoryEvents` `API 완성: 89a6a8edd`; `listRcaTimeline` queue |
| `REF-API-032` | `GET /audit` | 없음 | `BE-Gap` | `BE-Gap-019`: posture/audit finding collection 계약 없음 | backend 선행 |
| `REF-API-033` | `GET /settings/audit` | 없음 | `BE-Gap` | `BE-Gap-020`: audit hide·category·namespace 설정 조회 없음 | backend 선행 |
| `REF-API-034` | `PUT /settings/audit` | 없음 | `BE-Gap` | `BE-Gap-021`: audit 설정 mutation 없음 | backend 선행 |
| `REF-API-035` | `GET /secrets/certificate-expiry` | 없음 | `BE-Gap` | `BE-Gap-022`: certificate expiry projection 없음 | backend 선행 |
| `REF-API-036` | `GET /resource-counts` | `CLUSTER_INVENTORY_SUMMARY_PATH` → `InventorySummaryResponse` | `어댑터` | `counts[{resource_type,health,count}]`를 kind별 count로 합산; permission/unavailable은 HTTP state로 분리 | `getInventorySummary` `API 완성: 310c24a0d` |
| `REF-API-037` | `GET /resources/{kind}` | `CLUSTER_INVENTORY_RESOURCES_PATH` 및 service/workload 전용 path → `InventoryResourceListResponse` | `어댑터` | raw object 대신 canonical projection 사용; namespace·limit·truncation 한계는 partial로 보존 | `listInventoryResourcesByType` `API 완성: 6aaf19fea` |
| `REF-API-038` | `GET /resources/{kind}/{ns-or-_}/{name}` | `CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH` → `InventoryResourceDetailResponse` | `어댑터` | path identity를 query identity로 변환하고 `resource,related,events`를 detail로 사용; raw/certificate/HPA diagnosis는 없음 | `getInventoryResourceDetail` `API 완성: 94ad64bf1` |
| `REF-API-039` | `GET /resources/{kind}/{ns-or-_}/{name}/cascade-preview` | 없음 | `BE-Gap` | `BE-Gap-023`: dependent delete preview와 generic delete capability 없음 | backend 선행 |
| `REF-API-040` | `GET /issues/resource/{kind}/{ns-or-_}/{name}` | `CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH` → `InventoryResourceDetailResponse`; `DASHBOARD_RCA_TIMELINE_PATH` → `RcaTimelineResponse` | `어댑터` | resource-scoped event와 stable RCA resource identity를 병합; 완전성 미보장 시 partial | `getInventoryResourceDetail` `API 완성: 94ad64bf1`; `listRcaTimeline` queue |
| `REF-API-041` | `GET /audit/resource/{kind}/{ns}/{name}` | 없음 | `BE-Gap` | `BE-Gap-024`: resource-scoped audit finding 없음 | backend 선행 |
| `REF-API-042` | `GET /rbac/subject/{kind}/{ns}/{name}` | 없음 | `BE-Gap` | `BE-Gap-025`: ServiceAccount effective RBAC 조회 없음 | backend 선행 |
| `REF-API-043` | `GET /rbac/subject/{kind}/{name}` | 없음 | `BE-Gap` | `BE-Gap-026`: User/Group effective RBAC 조회 없음 | backend 선행 |
| `REF-API-044` | `GET /rbac/role/{kind}/{ns-or-_}/{name}` | 없음 | `BE-Gap` | `BE-Gap-027`: Role/ClusterRole rule·binding projection 없음 | backend 선행 |
| `REF-API-045` | `GET /rbac/namespace/{namespace}` | 없음 | `BE-Gap` | `BE-Gap-028`: namespace permission summary 없음 | backend 선행 |
| `REF-API-046` | `GET /rbac/whoami` | 없음; `AUTH_SESSION_PATH`는 product role만 제공 | `BE-Gap` | `BE-Gap-029`: namespace별 Kubernetes allowed operation 계약 없음 | backend 선행 |
| `REF-API-047` | `GET /resources/resourcequotas` | 없음 | `BE-Gap` | `BE-Gap-030`: agent inventory가 ResourceQuota를 수집하지 않음 | backend 선행 |
| `REF-API-048` | `GET /images/metadata` | 없음 | `BE-Gap` | `BE-Gap-031`: registry image metadata·auth·cache 계약 없음 | backend 선행 |
| `REF-API-049` | `GET /images/inspect` | 없음 | `BE-Gap` | `BE-Gap-032`: image layer/filesystem inspection 없음 | backend 선행 |
| `REF-API-050` | `GET /images/file` | 없음 | `BE-Gap` | `BE-Gap-033`: image file content endpoint 없음 | backend 선행 |
| `REF-API-051` | `GET /pods/{ns}/{name}/files` | 없음 | `BE-Gap` | `BE-Gap-034`: Pod filesystem browsing 없음 | backend 선행 |
| `REF-API-052` | `GET /pods/{ns}/{name}/files/download` | 없음 | `BE-Gap` | `BE-Gap-035`: Pod file download stream 없음 | backend 선행 |
| `REF-API-053` | `GET /capi/clusters/{ns}/{name}/kubeconfig` | 없음 | `BE-Gap` | `BE-Gap-036`: CAPI kubeconfig export 없음 | backend 선행 |
| `REF-API-054` | `POST /capi/clusters/{ns}/{name}/connect` | 없음 | `BE-Gap` | `BE-Gap-037`: CAPI context connect operation 없음 | backend 선행 |
| `REF-API-055` | `GET /metrics/pods/{ns}/{name}` | `CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH` → `InventoryResourceDetailResponse`; `CLUSTER_NODE_PODS_SUMMARY_PATH` → `NodePodsSummaryResponse` | `어댑터` | observed `cpu_mcores/mem_mib` 단위 변환; container breakdown·window는 unavailable | `getInventoryResourceDetail` `API 완성: 94ad64bf1`; `getNodePodsSummary` `API 완성: 94063b29d` |
| `REF-API-056` | `GET /metrics/nodes/{name}` | `CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH` → `InventoryResourceDetailResponse`; `CLUSTER_NODES_SUMMARY_PATH` → `ClusterNodesSummaryResponse` | `어댑터` | node CPU·memory와 ratio를 instant metric으로 변환 | `getInventoryResourceDetail` `API 완성: 94ad64bf1`; `getClusterNodesSummary` `API 완성: 94063b29d` |
| `REF-API-057` | `GET /metrics/pods/{ns}/{name}/history` | `CLUSTER_USAGE_PATH` `GET /api/clusters/{cluster_id}/usage` → `ClusterUsageResponse` | `어댑터` | sample의 `usage.pods[namespace/name]`을 series로 변환; container series는 unavailable | `getClusterResourceUsageSeries` queue |
| `REF-API-058` | `GET /metrics/nodes/{name}/history` | `CLUSTER_USAGE_PATH` → `ClusterUsageResponse` | `어댑터` | sample의 `usage.nodes[name]`을 CPU·memory series로 변환 | `getClusterResourceUsageSeries` queue |
| `REF-API-059` | `GET /metrics/top/pods` | `CLUSTER_NODE_PODS_SUMMARY_PATH` → `NodePodsSummaryResponse`; `CLUSTER_USAGE_PATH` → `ClusterUsageResponse` | `어댑터` | 최신 observed usage로 정렬; request/limit column은 unavailable | `getNodePodsSummary` `API 완성: 94063b29d`; `getClusterUsage` `API 완성: 1fe5bc859`; `getClusterResourceUsageSeries` queue |
| `REF-API-060` | `GET /metrics/top/nodes` | `CLUSTER_NODES_SUMMARY_PATH` → `ClusterNodesSummaryResponse` | `어댑터` | CPU·memory ratio와 Pod count로 top 목록 구성; allocatable absolute는 unavailable | `getClusterNodesSummary` `API 완성: 94063b29d` |
| `REF-API-061` | `GET /prometheus/status` | 없음 | `BE-Gap` | `BE-Gap-038`: telemetry source availability·connection·address·error 계약 없음 | backend 선행 |
| `REF-API-062` | `POST /prometheus/connect` | 없음 | `BE-Gap` | `BE-Gap-039`: telemetry source discovery/connect operation 없음 | backend 선행 |
| `REF-API-063` | `GET /prometheus/resources/{kind}/{ns}/{name}` 또는 cluster-scoped variant | `CLUSTER_METRIC_QUERY_PRESETS_PATH` → `MetricQueryPresetListResponse`; `CLUSTER_METRIC_QUERY_PRESET_RUN_PATH` → `AgentDebugQueryResponse`; `COMMAND_STATUS_PATH` → `CommandStatusResponse` | `어댑터` | backend-owned preset 실행 후 series·unit·range로 변환; preset 부재 시 미노출 | preset 함수군 queue; `getCommandStatus` 미승인 |
| `REF-API-064` | `GET /prometheus/query` | `AGENT_DEBUG_QUERY_PATH` → `AgentDebugQueryResponse`; `COMMAND_STATUS_PATH` → `CommandStatusResponse` | `어댑터` | receipt 기반 Prometheus 결과를 series로 변환; write 재전송 없이 status poll | `runPrometheusQuery/getCommandStatus` 미승인 |
| `REF-API-065` | `GET /prometheus/pvc/{ns}/{name}` | metric preset run + `COMMAND_STATUS_PATH` | `어댑터` | backend-owned PVC preset 결과를 used/capacity/ratio로 변환; preset·point 부재는 no-data | preset 함수군 queue |
| `REF-API-066` | `GET /prometheus/rightsizing/{kind}/{ns}/{name}` | 없음 | `BE-Gap` | `BE-Gap-040`: recommendation window·sample availability·rightsizing row 계약 없음 | backend 선행 |
| `REF-API-067` | `GET /pods/{ns}/{name}/logs` | `AGENT_DEBUG_QUERY_PATH` → `AgentDebugQueryResponse`; `COMMAND_STATUS_PATH` → `CommandStatusResponse` | `어댑터` | backend-owned telemetry query의 1회 snapshot으로 변환; Kubernetes container/tail semantics는 unavailable | `runTelemetryQuery` queue; `getCommandStatus` 미승인 |
| `REF-API-068` | `SSE /pods/{ns}/{name}/logs/stream` | 없음 | `BE-Gap` | `BE-Gap-041`: log event stream·end/error protocol 없음 | backend 선행 |
| `REF-API-069` | `SSE /workloads/{kind}/{ns}/{name}/logs/stream` | 없음 | `BE-Gap` | `BE-Gap-042`: workload multi-Pod log stream과 pod add/remove event 없음 | backend 선행 |
| `REF-API-070` | `WS /pods/{ns}/{name}/exec` | 없음 | `BE-Gap` | `BE-Gap-043`: interactive Kubernetes exec transport 없음 | backend 선행 |
| `REF-API-071` | `WS /local-terminal` | 없음 | `BE-Gap` | `BE-Gap-044`: local terminal transport 없음 | backend 선행 |
| `REF-API-072` | `GET /portforwards` | 없음 | `BE-Gap` | `BE-Gap-045`: active port-forward session model 없음 | backend 선행 |
| `REF-API-073` | `GET /portforwards/available/{type}/{ns}/{name}` | 없음 | `BE-Gap` | `BE-Gap-046`: available target port discovery 없음 | backend 선행 |
| `REF-API-074` | `POST /portforwards` | 없음 | `BE-Gap` | `BE-Gap-047`: port-forward create operation 없음 | backend 선행 |
| `REF-API-075` | `DELETE /portforwards/{id}` | 없음 | `BE-Gap` | `BE-Gap-048`: port-forward stop operation 없음 | backend 선행 |
| `REF-API-076` | `POST /resources/apply` | `COMMANDS_PATH` `POST /api/commands` → `AcceptedResponse`; `COMMAND_STATUS_PATH` → `CommandStatusResponse` | `어댑터` | raw YAML을 `CommandRequest(action=apply_manifest,diff.desired_manifest)`로 변환하고 sandbox·approval 정책을 유지. `Cross-Gap-001`: `AcceptedResponse`에 `command_id`가 없어 status를 직접 추적할 수 없음 | `getCommandStatus` 존재·미승인; `submitCommand` queue |
| `REF-API-077` | `PUT /resources/{kind}/{ns}/{name}` | 없음 | `BE-Gap` | `BE-Gap-049`: authoritative Kubernetes resource update 계약 없음 | backend 선행 |
| `REF-API-078` | `DELETE /resources/{kind}/{ns}/{name}` | 없음 | `BE-Gap` | `BE-Gap-050`: `DELETE_WORKLOAD_ACTION`은 상수만 있고 command catalog·route 실행 계약이 없음 | backend 선행 |
| `REF-API-079` | `POST /workloads/{kind}/{ns}/{name}/restart` | `CLUSTER_DEPLOYMENT_RESTART_PATH` `POST /api/clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/restart` → `AcceptedResponse` | `어댑터` | Deployment만 지원. receipt 후 inventory 재조회로 수렴하며 상태를 optimistic하게 변경하지 않음 | `restartDeployment` queue |
| `REF-API-080` | `POST /workloads/{kind}/{ns}/{name}/scale` | `CLUSTER_DEPLOYMENT_SCALE_PATH` `POST /api/clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/scale` → `AcceptedResponse` | `어댑터` | Deployment만 지원. receipt 후 inventory 재조회로 replicas를 수렴하며 optimistic 완료 표시 금지 | `scaleDeployment` queue |
| `REF-API-081` | `GET /workloads/{kind}/{ns}/{name}/revisions` | 없음; `APPLICATION_RUNS_PATH`는 GitOps workflow run | `BE-Gap` | `BE-Gap-051`: Kubernetes workload revision history 계약 없음 | backend 선행 |
| `REF-API-082` | `POST /workloads/{kind}/{ns}/{name}/rollback` | 없음 | `BE-Gap` | `BE-Gap-052`: workload revision rollback route·command action 없음 | backend 선행 |
| `REF-API-083` | `POST /cronjobs/{ns}/{name}/trigger` | 없음 | `BE-Gap` | `BE-Gap-053`: CronJob trigger 계약 없음 | backend 선행 |
| `REF-API-084` | `POST /cronjobs/{ns}/{name}/suspend`; `POST /cronjobs/{ns}/{name}/resume` | 없음 | `BE-Gap` | `BE-Gap-054`: CronJob lifecycle control 계약 없음 | backend 선행 |
| `REF-API-085` | `POST /nodes/{name}/cordon`; `POST /nodes/{name}/uncordon` | 없음 | `BE-Gap` | `BE-Gap-055`: node schedulability control 계약 없음 | backend 선행 |
| `REF-API-086` | `POST /nodes/{name}/drain` | 없음 | `BE-Gap` | `BE-Gap-056`: node drain·progress 계약 없음 | backend 선행 |
| `REF-API-087` | `POST /pods/{ns}/{name}/debug` | 없음; `AGENT_DEBUG_QUERY_PATH`는 telemetry query | `BE-Gap` | `BE-Gap-057`: Pod debug session 계약 없음 | backend 선행 |
| `REF-API-088` | `POST /nodes/{name}/debug`; `DELETE /nodes/{name}/debug` | 없음 | `BE-Gap` | `BE-Gap-058`: node debug session·cleanup 계약 없음 | backend 선행 |
| `REF-API-089` | `POST /curl/service` | 없음 | `BE-Gap` | `BE-Gap-059`: Service probe/curl 계약 없음 | backend 선행 |
| `REF-API-090` | `GET /traffic/sources` | 없음 | `BE-Gap` | `BE-Gap-060`: traffic source discovery 계약 없음 | backend 선행 |
| `REF-API-091` | `POST /traffic/source` | 없음 | `BE-Gap` | `BE-Gap-061`: traffic source selection 계약 없음 | backend 선행 |
| `REF-API-092` | `POST /traffic/connect` | 없음 | `BE-Gap` | `BE-Gap-062`: traffic source connection 계약 없음 | backend 선행 |
| `REF-API-093` | `GET /traffic/flows` | 없음; `CLUSTER_INVENTORY_SERVICES_PATH`는 service inventory | `BE-Gap` | `BE-Gap-063`: traffic flow·유속·edge 계약 없음 | backend 선행 |
| `REF-API-094` | `GET /network-policies/evaluate` | 없음 | `BE-Gap` | `BE-Gap-064`: network policy evaluation 계약 없음 | backend 선행 |
| `REF-API-095` | `GET /helm/releases` | 없음 | `BE-Gap` | `BE-Gap-065`: installed release list 계약 없음 | backend 선행 |
| `REF-API-096` | `GET /helm/releases/{ns}/{name}` | 없음 | `BE-Gap` | `BE-Gap-066`: release detail·history·health 계약 없음 | backend 선행 |
| `REF-API-097` | `GET /helm/releases/{ns}/{name}/manifest` | 없음 | `BE-Gap` | `BE-Gap-067`: release revision manifest 계약 없음 | backend 선행 |
| `REF-API-098` | `GET /helm/releases/{ns}/{name}/values` | 없음 | `BE-Gap` | `BE-Gap-068`: release values 계약 없음 | backend 선행 |
| `REF-API-099` | `GET /helm/releases/{ns}/{name}/diff`; `GET /helm/releases/{ns}/{name}/values/diff` | 없음 | `BE-Gap` | `BE-Gap-069`: release revision·values diff 계약 없음 | backend 선행 |
| `REF-API-100` | `GET /helm/releases/{ns}/{name}/notes/diff`; `GET /helm/releases/{ns}/{name}/hooks/diff`; `GET /helm/releases/{ns}/{name}/resources/diff` | 없음 | `BE-Gap` | `BE-Gap-070`: release domain diff 계약 없음 | backend 선행 |
| `REF-API-101` | `GET /helm/releases/{ns}/{name}/upgrade-info` | 없음 | `BE-Gap` | `BE-Gap-071`: release upgrade availability 계약 없음 | backend 선행 |
| `REF-API-102` | `GET /helm/releases/{ns}/{name}/versions` | 없음 | `BE-Gap` | `BE-Gap-072`: catalog item version은 설치 release의 upgrade version이 아님 | backend 선행 |
| `REF-API-103` | `GET /helm/upgrade-check` | 없음 | `BE-Gap` | `BE-Gap-073`: batch release upgrade check 계약 없음 | backend 선행 |
| `REF-API-104` | `GET /helm/repositories` | 없음 | `BE-Gap` | `BE-Gap-074`: Helm repository list 계약 없음 | backend 선행 |
| `REF-API-105` | `POST /helm/repositories/{name}/update` | 없음 | `BE-Gap` | `BE-Gap-075`: Helm repository refresh 계약 없음 | backend 선행 |
| `REF-API-106` | `GET /helm/oci-sources` | 없음 | `BE-Gap` | `BE-Gap-076`: OCI source list 계약 없음 | backend 선행 |
| `REF-API-107` | `POST /helm/oci-sources`; `DELETE /helm/oci-sources` | 없음 | `BE-Gap` | `BE-Gap-077`: OCI source mutation 계약 없음 | backend 선행 |
| `REF-API-108` | `GET /helm/charts` | `CATALOG_ITEMS_PATH` `GET /api/catalog/items` → `CatalogItemListResponse` | `어댑터` | provider-neutral installable catalog로 치환하고 item version의 `package_type=helm`을 분류 | `listCatalogItems` queue |
| `REF-API-109` | `GET /helm/charts/{repo}/{chart}`; `GET /helm/charts/{repo}/{chart}/{version}` | `CATALOG_ITEM_PATH` `GET /api/catalog/items/{item_id}` → `CatalogItemResponse` | `어댑터` | repository/chart/version identity를 catalog item identity와 item 내 versions로 변환 | `getCatalogItem` queue |
| `REF-API-110` | `GET /helm/artifacthub/search` | 없음 | `BE-Gap` | `BE-Gap-078`: external chart registry search 계약 없음 | backend 선행 |
| `REF-API-111` | `GET /helm/artifacthub/charts/{repo}/{chart}`; `GET /helm/artifacthub/charts/{repo}/{chart}/{version}` | 없음 | `BE-Gap` | `BE-Gap-079`: external chart registry detail 계약 없음 | backend 선행 |
| `REF-API-112` | `POST /helm/releases/install-stream` | 없음; `CATALOG_ITEM_INSTALLS_PATH`는 `CatalogInstallRunResponse` planned record | `BE-Gap` | `BE-Gap-080`: 실제 package install·progress stream·terminal result 계약 없음 | backend 선행 |
| `REF-API-113` | `POST /helm/releases/{ns}/{name}/upgrade-stream` | 없음 | `BE-Gap` | `BE-Gap-081`: release upgrade execution·progress 계약 없음 | backend 선행 |
| `REF-API-114` | `POST /helm/releases/{ns}/{name}/rollback-stream` | 없음 | `BE-Gap` | `BE-Gap-082`: release rollback execution·progress 계약 없음 | backend 선행 |
| `REF-API-115` | `POST /helm/releases/{ns}/{name}/values/preview` | 없음 | `BE-Gap` | `BE-Gap-083`: values render·validation preview 계약 없음 | backend 선행 |
| `REF-API-116` | `PUT /helm/releases/{ns}/{name}/values` | 없음 | `BE-Gap` | `BE-Gap-084`: release values apply 계약 없음 | backend 선행 |
| `REF-API-117` | `DELETE /helm/releases/{ns}/{name}` | 없음 | `BE-Gap` | `BE-Gap-085`: release uninstall 계약 없음 | backend 선행 |
| `REF-API-118` | `GET /api-resources`; `GET /resource-counts`; `GET /resources/{kind}` | `APPLICATIONS_PATH` `GET /api/applications` → `ApplicationListResponse`; `APPLICATION_DEPLOYMENTS_PATH` `GET /api/applications/{application_id}/deployments` → `DeploymentBindingListResponse` | `어댑터` | provider CR discovery 대신 canonical application·binding으로 GitOps 목록을 구성 | `listApplications`, `listApplicationDeployments` queue |
| `REF-API-119` | `GET /gitops/tree/{kind}/{ns-or-_}/{name}` | 없음 | `BE-Gap` | `BE-Gap-086`: desired/live node·edge·warning·summary graph 계약 없음 | backend 선행 |
| `REF-API-120` | `GET /gitops/insights/{kind}/{ns-or-_}/{name}` | 없음; 근접 계약은 `APPLICATION_RUNS_PATH`, `RCA_REPORTS_PATH` | `BE-Gap` | `BE-Gap-087`: summary·issues·changes·plan·history·capabilities·partial을 동일 cut으로 제공하지 않음 | backend 선행 |
| `REF-API-121` | `POST /flux/{kind}/{ns}/{name}/reconcile` | 없음 | `BE-Gap` | `BE-Gap-088`: canonical GitOps reconcile 계약 없음 | backend 선행 |
| `REF-API-122` | `POST /flux/{kind}/{ns}/{name}/sync-with-source` | 없음 | `BE-Gap` | `BE-Gap-089`: GitOps source sync 계약 없음 | backend 선행 |
| `REF-API-123` | `POST /flux/{kind}/{ns}/{name}/suspend`; `POST /flux/{kind}/{ns}/{name}/resume` | 없음 | `BE-Gap` | `BE-Gap-090`: GitOps lifecycle suspend·resume 계약 없음 | backend 선행 |
| `REF-API-124` | `POST /argo/applications/{ns}/{name}/sync` | 없음 | `BE-Gap` | `BE-Gap-091`: application reconcile plan/apply·revision·prune·selective sync·idempotency 계약 없음 | backend 선행 |
| `REF-API-125` | `POST /argo/applications/{ns}/{name}/refresh` | 없음 | `BE-Gap` | `BE-Gap-092`: canonical GitOps refresh 계약 없음 | backend 선행 |
| `REF-API-126` | `POST /argo/applications/{ns}/{name}/rollback` | 없음 | `BE-Gap` | `BE-Gap-093`: GitOps rollback plan 계약 없음 | backend 선행 |
| `REF-API-127` | `POST /argo/applications/{ns}/{name}/terminate` | 없음 | `BE-Gap` | `BE-Gap-094`: GitOps operation terminate 계약 없음 | backend 선행 |
| `REF-API-128` | `POST /argo/applications/{ns}/{name}/suspend`; `POST /argo/applications/{ns}/{name}/resume` | 없음 | `BE-Gap` | `BE-Gap-095`: GitOps lifecycle suspend·resume 계약 없음 | backend 선행 |
| `REF-API-129` | `GET /opencost/summary` | 없음 | `BE-Gap` | `BE-Gap-096`: currency·cost window·idle/storage·efficiency summary 계약 없음 | backend 선행 |
| `REF-API-130` | `GET /opencost/workloads` | 없음 | `BE-Gap` | `BE-Gap-097`: workload cost allocation 계약 없음 | backend 선행 |
| `REF-API-131` | `GET /opencost/trend` | 없음 | `BE-Gap` | `BE-Gap-098`: cost time series 계약 없음 | backend 선행 |
| `REF-API-132` | `GET /opencost/nodes` | 없음 | `BE-Gap` | `BE-Gap-099`: node cost·efficiency 계약 없음 | backend 선행 |
| `REF-API-133` | `GET /config` | 없음 | `BE-Gap` | `BE-Gap-100`: kubeconfig·MCP·timeline·Prometheus runtime configuration 계약 없음 | backend 선행 |
| `REF-API-134` | `PUT /config` | 없음 | `BE-Gap` | `BE-Gap-101`: runtime configuration update 계약 없음 | backend 선행 |
| `REF-API-135` | `PUT /integrations/prometheus` | 없음 | `BE-Gap` | `BE-Gap-102`: Prometheus source connection persist·probe 계약 없음 | backend 선행 |
| `REF-API-136` | `SSE /events/stream` | `packages.contracts.realtime.BROWSER_LIVE_PATH` `WS /api/live/browser` → `hello`, `snapshot`, `live.summary`, `resource.delta`, `ping` (`routes.py` 상수 없음) | `어댑터` | SSE를 WS로 치환. `resource.delta`·`live.summary`는 즉시 적용하고 WS에 없는 topology·Kubernetes event·context-switch는 30s poll; subscription seq gap은 snapshot으로 재수렴 | `connectRealtime/createRealtimeClient` 존재·미승인 |

## 4. UI 컴포넌트 매핑

`CAT`는 현재 `src/components/ui/**`의 catalog source이고 제품에서 직접 import하지 않는다. `Port`는
같은 primitive를 `src/product/shared/ui/primitives/**`에 제품 소유 코드로 재생성한다는 뜻이다.
`PROD`는 기존 `src/product/shared/ui/**`다. Custom은 시각 스타일이 아니라 primitive에 없는 도메인
interaction만 구현한다.

### 4.1 전역 셸·공통 요소

| ID | Reference UI 요소 | 제품 소유 primitive/composite | 방식 | custom 사유 | keyboard·a11y 계약 |
|---|---|---|---|---|---|
| `UI-001` | 접힘 가능한 왼쪽 rail | Port `Sidebar*` | 조합 | `ProductShell`은 route/capability 조합만 담당 | `nav` label, `aria-current`, `aria-expanded` |
| `UI-002` | slim rail hover label | Port `Tooltip` | 직접 | 없음 | keyboard focus에도 tooltip, icon accessible name |
| `UI-003` | 상단 utility bar | Port `ButtonGroup`, `Button`, `DropdownMenu`, `Tooltip`, `Separator` | 조합 | Header 배치 composite만 제품 소유 | `header` landmark, 논리적 tab 순서 |
| `UI-004` | context+namespace scope pill | Port `Combobox`, `Popover`, `ButtonGroup`, `Badge` + `ScopePicker` | Custom | selector 연동, 다중 namespace, URL 보존, disabled reason | combobox keyboard, 선택 수 announce, `aria-describedby` |
| `UI-005` | connection·freshness·health | PROD `StatusMark` + Port `Badge`, `Tooltip` | 조합 | canonical status formatter | 색 외 text, 변경 `aria-live=polite` |
| `UI-006` | port-forward indicator | Port `Badge`, `Popover`, `Item`, `Button` | 조합 | 없음 | session 수 accessible name, stop keyboard |
| `UI-007` | resource·command omnibar | Port `CommandDialog` | 직접 | 없음 | Cmd/Ctrl+K, focus trap, grouped/empty, Escape |
| `UI-008` | theme/help/diagnostics/terminal action | Port `Toggle`, `ButtonGroup`, `DropdownMenu`, `Tooltip` | 조합 | capability 노출만 shell 소유 | `aria-pressed`, icon label; unsupported는 미렌더 |
| `UI-009` | screen scroll owner | Port `ScrollArea` | 직접 | route별 단일 owner 지정 | nested scroll 최소화, `main` focus target |
| `UI-010` | URL-backed resource/Helm detail | Port `Sheet`·`Drawer`·`Tabs` + `ResponsiveDetailSurface` | Custom | 동일 URL/content/focus를 desktop/mobile overlay가 공유 | Title, Escape, focus trap/restore, background inert |
| `UI-011` | Settings·permissions·diagnostics·shortcut overlay | Port `Dialog`, `Tabs`, `ScrollArea` | 조합 | 없음 | DialogTitle, Escape, focus trap |
| `UI-012` | logs/exec/terminal/port-forward dock | Port `Resizable`, `Tabs`, `ButtonGroup` + `SessionDock` | Custom | 지속 session, resize, reconnect, close, route 밖 lifecycle | resize keyboard 대안, roving tab focus |
| `UI-013` | context switching overlay | Port `Dialog`, `Progress`, `Spinner`, `Alert` | Custom state | realtime progress와 terminal state 결합 | progress `aria-live`, cancel 가능 여부 명시 |
| `UI-014` | toast | Port `Sonner` | 직접 | 없음 | 중요 실패는 화면 state도 유지 |
| `UI-015` | initial loading | Port `Skeleton`, `Spinner` + PROD `ProductStateScreen` | 조합 | screen-shaped skeleton | `aria-busy`, skeleton hidden, reduced-motion |
| `UI-016` | empty/no-data | Port `Empty` + PROD `ProductStateScreen` | 조합 | 없음 | title/description/recovery action |
| `UI-017` | error/partial/stale/403/background failure | Port `Alert`, `Badge`, `Button` + PROD `ProductStateScreen` | 조합 | last-valid 유지 여부는 query state | 403/error 분리, retry label, polite announce |
| `UI-018` | 일반 surface/card | PROD `Surface` 또는 Port `Card` | 직접 | title/action/footer가 있으면 Card composition | section heading 연결 |
| `UI-019` | KPI·count·usage | PROD `Metric` + Port `Progress`, `Chart` | 조합 | nullable value와 unit formatter | unavailable을 0으로 읽지 않음 |
| `UI-020` | status badge | PROD `StatusMark` + Port `Badge` | 조합 | backend status 전체 literal formatter | 색+문자, unknown 명시 |
| `UI-021` | 일반 row/activity list | Port `Item`, `Separator`, `ScrollArea` | 직접 | 없음 | 실제 이동은 link/button; clickable div 금지 |
| `UI-022` | 일반 table | Port `Table` | 직접 | 단순 표만 해당 | caption, sortable `aria-sort` |
| `UI-023` | 위험/write action | Port `Button`, `DropdownMenu`, `AlertDialog` | 조합 | receipt state는 feature 소유 | confirm, pending 중 중복 실행 금지 |
| `UI-024` | search·filter·option | Port `InputGroup`, `Combobox`, `Select`, `Checkbox`, `ToggleGroup`, `Switch`, `Popover` | 조합 | 없음 | clear filter, 2~7 options는 ToggleGroup |
| `UI-025` | detail section/tab | Port `Tabs`, `Accordion`, `Collapsible`, `Breadcrumb` | 조합 | 없음 | URL tab과 focus 동기화 |
| `UI-026` | Settings·wizard form | Port `Field`, `InputGroup`, `Select`, `Checkbox`, `RadioGroup`, `Textarea` | 조합 | 없음 | FieldSet/Legend, `aria-invalid` |
| `UI-027` | shortcut help·registry | Port `Dialog`, `Table`, `Kbd` + `createShortcutMatcher`·`useProductShortcuts` | Custom | scoped chord, timeout, input 억제, scope priority | allowInInputs만 허용, 1,000ms sequence 취소 |
| `UI-028` | light/dark toggle | Port `Toggle` + existing theme runtime | 직접 | 없음 | label, `aria-pressed`, 저장값 우선·미설정 light, system 제3모드 금지 |

### 4.2 화면별 요소

| ID | 화면·요소 | 제품 소유 primitive/composite | 방식 | custom 사유 | keyboard·a11y 계약 |
|---|---|---|---|---|---|
| `UI-029` | Home 3-band + attention rail | PROD `Surface`·Port `Card`, `Separator` | 조합 | responsive CSS grid | mobile에서 attention을 DOM 순서대로 하단 배치 |
| `UI-030` | Cluster Health summary | PROD `Metric`, `StatusMark` + Port `Progress`, `Button` | 조합 | API count/freshness link composition | count는 link, refresh announce |
| `UI-031` | preview cards | Port `Card`, `AspectRatio`, `Item` | 조합 | topology preview renderer만 별도 | nested interactive 금지 |
| `UI-032` | Home Active Issues | Port `Item`, `Badge`, `ScrollArea` | 조합 | visibility/truncation composition | issue/resource link, severity text |
| `UI-033` | resource kind catalog | Port `Accordion`, `ScrollArea`, `Badge`, `Toggle` | 조합 | discovery category·favorite state | `[/]`, current `aria-current` |
| `UI-034` | favorite kind | Port `Toggle`, `Tooltip` | 직접 | 없음 | `aria-pressed`, icon name |
| `UI-035` | smart resource grid | Port `Table` + existing table engine + `ResourceDataGrid` | Custom | smart columns, resize, filters, row cursor, compare, shortcut grammar | roving row focus, sort, resize keyboard |
| `UI-036` | column/label manager | Port `DropdownMenu`, `Checkbox`, `Input` | 조합 | 없음 | menu checkbox와 column name 연결 |
| `UI-037` | resource detail | `UI-010` + Port `Tabs`, `Accordion`, `Badge`, `DropdownMenu` | 조합 | kind/capability section registry | Enter/d, y, l, Escape, focus restore |
| `UI-038` | YAML viewer/editor | Port `Textarea`, `ScrollArea`, `ButtonGroup` + `YamlEditor` | Custom | syntax, line, validation, large text, read/edit mode | label, tab policy, validation line announce |
| `UI-039` | live logs | Port `ScrollArea`, `InputGroup`, `ButtonGroup`, `Switch` + `LogViewer` | Custom | stream append, tail lock, filter/search, high volume | pause/tail, polite new-line announce |
| `UI-040` | resource/workload metrics | Port `Chart` | 조합 | query/unit/freshness adapter만 필요 | chart description + table alternative |
| `UI-041` | image filesystem | Port `Accordion`, `Collapsible`, `ScrollArea` + `FileTree` | Custom | arbitrary-depth lazy tree·download | tree semantics, arrow navigation |
| `UI-042` | related resources/events/RBAC | Port `Item`, `Table`, `Badge`, `Collapsible` | 조합 | 없음 | stable identity가 없으면 link 금지 |
| `UI-043` | YAML/resource compare | Port `Tabs`, `ToggleGroup`, `ButtonGroup`, `ScrollArea` + `DiffViewer` | Custom | aligned side/unified hunks와 diff/spec/raw filter | add/delete text label |
| `UI-044` | Issues severity facet | Port `ToggleGroup` multiple, `Badge`, `Button` | 직접 | 없음 | `aria-pressed`, clear |
| `UI-045` | Issues rows | Port `Item` 또는 `Table`, `Badge` | 조합 | evidence preview composition | row link, severity/source text |
| `UI-046` | Topology toolbar | Port `ToggleGroup`, `Select`, `InputGroup`, `ButtonGroup`, `Tooltip` | 조합 | 없음 | f/+/-/0, icon labels |
| `UI-047` | Topology kind filters | Port `Accordion`, `Checkbox`, `ScrollArea` | 조합 | 없음 | filtered count announce |
| `UI-048` | Topology graph | `TopologyCanvas` | Custom | arbitrary node/edge, layout, pan/zoom, multi-select, LOD는 Chart 범위 밖 | focusable nodes, parallel list, reduced motion |
| `UI-049` | policy/selection overlay | Port `Popover` 또는 `Sheet`, `Item`, `Badge` | 조합 | graph selection state만 adapter | trigger-selected node 연결 |
| `UI-050` | Applications list | Port `Table`, `Badge`, `Item` | 조합 | 없음 | sortable status, app link |
| `UI-051` | application relation graph | `UI-048` scoped preset | Custom reuse | 같은 graph, app scope layout만 다름 | parallel list 동일 |
| `UI-052` | environment switcher | Port `Combobox`, `Badge` | 조합 | workload identity preservation | current env announce, reason |
| `UI-053` | embedded Workload detail | Port `Breadcrumb`, `Tabs`, `Button`, `Sonner` | 조합 | nested URL/back state | back label, focus restore |
| `UI-054` | Timeline controls | Port `ToggleGroup`, `Select`, `Switch` | 조합 | 없음 | control-result count 연결 |
| `UI-055` | Timeline event/change list | Port `Item`, `Collapsible`, `Badge`, `Separator` | 조합 | lazy child diff | chronological list, expanded state |
| `UI-056` | Timeline swimlane | `TimelineSwimlane` | Custom | category lane, absolute time, zoom/range, event selection | keyboard event list, range text |
| `UI-057` | Traffic setup | Port `Card`, `RadioGroup`, `Field`, `Dialog`, `Progress`, `Alert` | Custom wizard | discovery→connect state machine | FieldSet, progress announce |
| `UI-058` | Traffic flow list | Port `Table`, `Badge` | 직접 | 없음 | protocol/status text |
| `UI-059` | Traffic graph | `TopologyCanvas` flow preset 또는 domain SVG | Custom | directed width/arrow/selection | accessible flow table 필수 |
| `UI-060` | Helm releases·drawer | Port `Table` + `UI-010`, `Tabs`, `Badge` | 조합 | 없음 | revision/action label |
| `UI-061` | Helm install/upgrade wizard | Port `Dialog`, `Field`, `Command`, `Select`, `Textarea`, `Progress` + `OperationWizard` | Custom | discovery, step validation, review, stream lifecycle | step title/current/total, previous/next |
| `UI-062` | Helm code/diff panels | `UI-038`, `UI-043` | Custom reuse | 동일 code/diff 요구 | 동일 |
| `UI-063` | Helm progress stream | Port `Progress`, `Alert`, `ScrollArea`, `Spinner` + `StreamingOperationStatus` | Custom | frame accumulation과 terminal convergence | `aria-live`, terminal focus |
| `UI-064` | GitOps table/tile switch | Port `ToggleGroup`, `Table`, `Card`, `Badge` | 조합 | canonical row adapter | same selection, pressed state |
| `UI-065` | GitOps filters | Port `Combobox`, `Select`, `Checkbox`, `Popover`, `Badge` | 조합 | 없음 | active chips, clear-all |
| `UI-066` | GitOps operations | Port `DropdownMenu`, `Button`, `AlertDialog`, `Spinner` | 조합 | capability/lifecycle/receipt state | reason, confirm, pending |
| `UI-067` | GitOps detail | Port `Tabs`, `Breadcrumb` + `UI-048` | 조합+Custom | graph only custom | URL tab sync |
| `UI-068` | drift/history/remediation | `UI-043` + Port `Collapsible`, `Table`, `Item`, `Badge` | 조합 | ResourceDiff adapter | rollback confirm, field text |
| `UI-069` | Checks explorer | Port `InputGroup`, `Combobox`, `Table`, `Badge`, `Collapsible`, `Switch`, `AlertDialog` | 조합 | persisted hide scope | remediation heading, impact confirm |
| `UI-070` | Cost summary/trend | PROD `Metric` + Port `Chart`, `Table`, `ToggleGroup`, `Alert`, `Tooltip` | 조합 | unavailable-reason adapter | chart table alternative, reason |
| `UI-071` | Workload detail | Port `Tabs` + `UI-038/039/040/048`, `Table`, `Badge` | 조합 | kind/data section registry | unavailable section tab 미렌더 |
| `UI-072` | Settings forms | Port `Dialog`, `Tabs`, `Field`, `InputGroup`, `Switch`, `NativeSelect`, `Button`, `Alert` | 조합 | secret redaction/persistence state | secret label, pending announce |
| `UI-073` | Auth barrier | Port `Card`, `Field`, `Button`, `Spinner`, `Alert` | 조합 | redirect/callback state | heading, callback busy, retry |

### 4.3 Custom dependency 결정 후보

| 후보 | 현재 dependency 상태 | 최종 질문 대상 |
|---|---|---|
| `TopologyCanvas`·Traffic/App graph | graph layout·interaction dependency 없음 | graph engine 선택 |
| `DiffViewer`·`YamlEditor` | code editor·diff engine 없음 | editor/diff dependency 선택 |
| `LogViewer`·terminal | virtualization·terminal emulator 없음 | log virtualization·terminal dependency 선택 |
| `ResourceDataGrid` | table engine 있음, virtualization 없음 | 대형 grid virtualization 선택 |

## 5. RCA·복구·AI 통합 매핑

### 5.1 데이터·route 매핑

| 삽입 지점 | 우리 route 상수·path | 제품 동작 | API 함수 상태 | 판정 |
|---|---|---|---|---|
| Issues incident 목록·상세 | `DASHBOARD_RCA_TIMELINE_PATH` `GET /api/dashboard/rca/timeline` → `RcaTimelineResponse`; `DASHBOARD_RCA_INCIDENT_PATH` `GET /api/dashboard/rca/incidents/{incident_id}` → `RcaIncidentResponse` | cluster/limit 목록 → stable incident detail; WS에 RCA event가 없어 30s poll | teaser `getRcaTimeline`은 `API 완성: 7ad3800e6`; 범용 `listRcaTimeline`과 `getRcaIncident` queue | `직결` |
| “복구 조치” | `RCA_RECOVERY_PLAN_BY_CORRELATION_PATH` `GET /api/rca/recovery-plans/by-correlation/{correlation_id}` → `RecoveryPlanStatusResponse`; `RCA_RECOVERY_ACTION_SELECT_PATH` `POST /api/rca/recovery-plans/{plan_id}/actions/{action_id}/select` → `AcceptedResponse` | plan 조회; action은 비낙관 receipt 후 30s poll, `409`면 plan 재조회 | `getRecoveryPlanByCorrelation`, `selectRecoveryAction` queue | `직결` |
| evidence trail | `EVIDENCE_QUERY_PATH` `GET /api/evidence` → `EvidenceQueryResponse` | correlation cursor pagination; raw 비노출 | `listEvidence` queue | `직결` |
| resource-scoped AI analysis | `RCA_REPORTS_PATH` `GET /api/rca-reports` → `RcaReportListResponse` + recovery/evidence correlation 조회 | resource→correlation이 실제 binding될 때만 section render; 추정 금지 | `listRcaReports` queue | `어댑터` |
| global AI conversation drawer | `AI_CONVERSATIONS_PATH` GET/POST → `AiConversationListResponse`/`AiConversationAcceptedResponse`; `AI_CONVERSATION_PATH` GET/DELETE → `AiConversationResponse`/204; `AI_CONVERSATION_MESSAGES_PATH` POST → `AiConversationAcceptedResponse` | accepted 후 detail 30s poll; status 전체 literal과 allowlisted context 보존 | conversation 함수군 queue | `직결` |

RCA status는 `active`, `waiting`, `completed`, `failed`를 축소하지 않는다. 현재 realtime WS에는 RCA·AI
terminal event가 없으므로 goalmode 기본 규칙대로 30초 polling을 사용한다. resource detail에 stable
correlation이 없으면 AI 분석 section 자체를 렌더하지 않는다.

### 5.2 UI 매핑

| ID | 삽입 UI | 제품 소유 primitive/composite | 방식 | custom 사유 | keyboard·a11y 계약 |
|---|---|---|---|---|---|
| `RCA-001` | Issues top-level menu | Port `SidebarMenuItem`, `SidebarMenuButton`, `Badge` | 직접 | 기존 Issues IA를 RCA-backed route로 연결 | current route와 open count text |
| `RCA-002` | incident list·detail | Port `Table`/`Item` + `UI-010`, `Tabs`, `Badge`, `Alert` | `IncidentWorkspace` 조합 | timeline→detail/correlation binding | `incident_id`가 있을 때만 row link |
| `RCA-003` | summary·status·root cause | PROD `StatusMark` + Port `Card`, `Badge`, `Item` | 조합 | RCA status 전체 literal formatter | status 축소 금지, 문자 보존 |
| `RCA-004` | recovery plan·action select | Port `Card`, `Accordion`, `Progress`, `RadioGroup`, `AlertDialog`, `Button`, `Spinner` + `RecoveryPlanSection` | Custom | plan/action receipt와 terminal convergence | FieldSet, confirm, pending 중 중복 금지 |
| `RCA-005` | evidence trail | Port `Item`, `Separator`, `Collapsible`, `Badge`, `ScrollArea` + `EvidenceTrail` | Custom | correlation 순서, source/type/time, late item 보존 | ordered list, timestamp, 색 외 source/type |
| `RCA-006` | resource-scoped AI analysis | Port `Card`/`Collapsible`, `Alert`, `Badge` + `ScopedAiAnalysisSection` | 조합 | resource/correlation binding과 no-data 미렌더 | heading, empty card 금지 |
| `RCA-007` | global AI conversation drawer | Port `Sheet`/`Drawer`, message primitives, `InputGroup`, `Textarea`, `Button`, `Spinner` + `AiConversationDrawer` | Custom | conversation, polling, status, context, retry | Title, focus trap, message log, composer label |
| `RCA-008` | selected context attachment | Port `Attachment`, `Badge`, `Tooltip`, `Button` + `ResourceContextAttachment` | 조합 | canonical resource context 직렬화 | cluster/kind/name readable label |
| `RCA-009` | conversation list/switch | Port `Command`, `ScrollArea`, `Item`, `Badge` | 조합 | pagination·selected state | listbox keyboard, current announce |
| `RCA-010` | AI/recovery async status | Port `Progress`, `Badge`, `Alert`, `Sonner` + `OperationStatusView` | Custom | accepted→poll→terminal, retry, literal preservation | `aria-live`, failure CTA, optimistic 완료 금지 |

## 6. Backend gap 대장

각 stable gap의 상세 endpoint 근거는 §3의 동일 ID 행이 정본이다. 아래 대장은 구현 순서와 제품
노출 정책을 빠르게 판단하기 위한 domain 묶음이며, 범위에 포함된 개별 ID를 하나의 API로 합쳐도
된다는 뜻이 아니다.

| Gap ID | 필요한 의미 | 영향 화면·interaction | 현재 가장 가까운 계약 | P4 처리 |
|---|---|---|---|---|
| `BE-Gap-001`~`004` | runtime 진단·version·connection retry | 전역 diagnostics·connection recovery | `/healthz`, cluster connection read | 기능 미노출; backend operation 계약 전 구현 금지 |
| `BE-Gap-005`~`008` | API resource discovery·session 집계·namespace 권한 scope·global search | scope picker·omnibar·session indicator | 제한된 inventory projection | 기능 미노출; loaded-page 검색으로 위장 금지 |
| `BE-Gap-009`~`012` | user preference와 reference repository prompt | Settings·reference brand prompt | 없음 | preference는 backend 계약 전 미노출; brand prompt는 영구 제외 |
| `BE-Gap-013`~`016` | desktop open/save/updater bridge | desktop-only utility action | 없음 | Web 제품에서 영구 제외 |
| `BE-Gap-017`~`022` | CRD·Helm dashboard·audit·certificate expiry | Home preview·Checks·resource detail | inventory·RCA는 의미 불일치 | 해당 card/menu 미노출 |
| `BE-Gap-023`~`030` | cascade preview·resource audit·Kubernetes effective RBAC·quota | Resources detail·delete safety | auth session은 product role만 제공 | 관련 tab/action 미노출 |
| `BE-Gap-031`~`037` | image·Pod filesystem·CAPI connect/export | Resources detail | 없음 | 관련 section/action 미노출 |
| `BE-Gap-038`~`040` | telemetry source 상태·connect·rightsizing | Metrics source banner·recommendation | query command만 존재 | source 설정·rightsizing 미노출 |
| `BE-Gap-041`~`048` | logs stream·exec·terminal·port-forward lifecycle | resource session dock | 단발 telemetry query만 존재 | snapshot만 adapter로 제공; session UI 미노출 |
| `BE-Gap-049`~`058` | generic resource update/delete·workload revision/rollback·CronJob·node/Pod debug | Resources mutation menus | Deployment restart/scale만 제한 지원 | 지원되는 Deployment action만 노출 |
| `BE-Gap-059`~`064` | service probe·traffic source/flow·network policy evaluation | Live Traffic·resource relationship | service inventory는 flow가 아님 | 메뉴·graph·action 전체 미노출 |
| `BE-Gap-065`~`085` | Helm release read/diff/repository/install/upgrade/rollback/uninstall | Helm | catalog item read만 존재 | catalog 조회만 adapter; Helm 메뉴 미노출 |
| `BE-Gap-086`~`095` | desired/live tree·insight·canonical GitOps operations | GitOps detail·operation actions | application/binding read만 존재 | 목록 가능한 read만 노출; operation control 미노출 |
| `BE-Gap-096`~`099` | cost summary·allocation·trend·node efficiency | Cost | 없음 | Cost 메뉴 미노출 |
| `BE-Gap-100`~`102` | runtime config read/write·Prometheus integration persist/probe | Settings·Metrics source setup | 없음 | 관련 Settings section 미노출 |
| `Cross-Gap-001` | accepted command를 status와 연결할 stable `command_id` | resource apply·generic remediation progress | `COMMANDS_PATH`의 `AcceptedResponse` + `COMMAND_STATUS_PATH` | endpoint 호출은 adapter 가능하나 terminal progress UI 미노출; receipt 계약 보강 전 optimistic 완료 금지 |

## 7. API 요청 큐 인계

P2에서 필요한 endpoint 함수·schema만 `api-needs.md`에 한 번씩 요청한다. 같은 route를 여러 화면이
쓰면 함수군 하나로 합치되 필요한 모든 화면을 비고에 적는다. `API 완성:` 기록 전에는 존재하는
파일도 화면에서 import하지 않는다.

## 8. P2 완료 게이트

- reference ID `REF-API-001`~`REF-API-136` 연속성·유일성 검증
- 판정 136개, 미정 0개
- route 상수·router 근거 없는 `직결`/`어댑터` 0개
- component mapping 누락 0개
- goalmode RCA 5개 삽입 지점 매핑 완료
- `api-needs.md`와 이 문서의 함수 상태 일치
- allowlist 밖 archived 문서 참조 0개
- `npm run check` 통과
