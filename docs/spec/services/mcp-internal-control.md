---
source_commit: 94d74b6d
status: synced
---

# internal-control MCP - Opsia Gateway를 보수적으로 호출하는 내부 제어 서버

> 소스: `src/services/mcp/internal_control/` · 테스트: `tests/test_internal_mcp.py`

## 책임 (Responsibility)

- AI client가 Opsia 운영 정보를 읽고, 제한된 운영 요청을 제안 또는 승인형 제출로 보낼 수 있게 MCP stdio 서버를 제공한다.
- MCP는 자체 운영 권한을 만들지 않는다. 이미 인증된 사용자 범위의 Opsia Gateway API만 호출한다.
- 읽기 tool은 기존 Gateway `GET` route만 호출하고, Gateway가 반환한 실제 값만 `data`에 담는다.
- 쓰기 tool은 기본적으로 `dry_run=true` proposal만 반환한다. 실제 `POST`/`PATCH`는 `dry_run=false`, `approval_confirmed=true`, `OPSIA_MCP_ENABLE_WRITES=true`가 모두 맞을 때에만 allowlist된 Gateway route로 전달한다.
- 직접 하지 않는 일: DB 접근, Kubernetes/Docker/subprocess 실행, 메시지큐 publish/consume, service-admin trusted proxy secret 사용, Gateway RBAC·감사·workflow 상태 검사를 우회하는 mutation.
- 서버 이름은 `opsia-internal-control`, MCP protocol version은 `2025-11-25`, 전송 방식은 newline-delimited JSON-RPC over stdio다.

## 빠른 요약

- 이 MCP는 AI에게 관리자 권한을 주는 계층이 아니라, AI가 기존 Opsia Gateway를 같은 인증 경계 안에서 호출하게 하는 어댑터다.
- 읽기 tool은 모두 read-only로 선언되며 `safety.mutating=false`, `approval_required=false`를 반환한다.
- 쓰기 tool은 먼저 제안서(proposal)를 만든다. 실제 제출은 사용자 승인 입력과 MCP write-enable env가 모두 필요하고, Gateway의 기존 권한·감사·workflow 로직이 최종 권위다.
- proposal과 응답은 secret/token/password/manifest diff를 redaction한다. 원본 payload는 Gateway에 제출하기 직전까지 변형하지 않는다.
- `RUNTIME_DISCOVERY_IGNORE = True`는 MCP stdio entrypoint가 `src/services/*/*/app.py` 자동 발견에서 배포 서비스로 오인되지 않게 하는 opt-out marker다.

## 먼저 이해할 것

이 서비스는 새 domain service나 새 worker가 아니라, AI client와 기존 Gateway 사이에 놓인 얇은 MCP 어댑터다. 처음 읽는 사람은 "AI가 직접 무언가를 실행한다"가 아니라 "AI가 기존 콘솔 API를 안전하게 요청한다"로 이해하면 된다.

```text
AI client
  -> MCP stdio(JSON-RPC)
  -> internal-control MCP tool
  -> Opsia api-gateway HTTP route
  -> 기존 router / RBAC / audit / workflow / worker
```

따라서 이 문서를 볼 때 핵심 질문은 "AI에게 어떤 권한을 새로 주었나?"가 아니라 "AI가 기존 어떤 Gateway API를 어떤 안전장치와 함께 호출하나?"다.

처음 읽는 순서는 빠른 요약, 작업자별 읽는 법, Tool 분류, 필요한 tool 표, 유지보수 체크리스트 순서를 권장한다.

| 알고 싶은 것 | 먼저 볼 곳 | 같이 확인할 것 |
|---|---|---|
| 전체 tool 목록 | [Tool 목록](#tool-목록) | `src/services/mcp/internal_control/tools.py :: default_tool_registry` |
| Gateway 호출 경계 | [Gateway 호출](#gateway-호출) | `src/services/mcp/internal_control/api_client.py :: ManagementApiClient` |
| 쓰기 안전장치 | [쓰기 tool](#쓰기-tool) | `src/services/mcp/internal_control/tools.py :: _post_or_propose` |
| 인증과 env | [설정](#설정-settings) | `src/services/mcp/internal_control/config.py :: McpSettings` |
| service discovery 예외 | [불변식과 오류](#불변식과-오류-invariants--errors) | `src/services/mcp/internal_control/app.py :: RUNTIME_DISCOVERY_IGNORE` |

## 작업자별 읽는 법

| 작업자 | 읽을 부분 | 판단 기준 |
|---|---|---|
| Product / 기획 | 빠른 요약, [대표 사용 흐름](#대표-사용-흐름) | AI가 할 수 있는 일과 반드시 사용자 승인이 필요한 일을 구분한다. |
| Frontend / AI 패널 | `tool`, `data`, `safety`, `proposal`, `operation_id` 구조 | `approval_required=true`이면 사용자 승인 UI를 먼저 보여준다. `operation_id`는 Gateway 응답에서 온 값일 때만 추적 ID로 사용한다. |
| Backend / Gateway | route mapping, `ManagementApiClient`, `_post_or_propose` | MCP가 새 업무 로직을 만들지 않고 기존 route 상수와 Gateway 권한 검사를 재사용하는지 확인한다. |
| Security / Ops | 인증 env, write-enable, allowlist, redaction, byte limit | service-admin trusted proxy secret, 원문 credential, 무제한 payload, 직접 DB/Kubernetes/queue 접근이 없는지 확인한다. |
| SRE / 운영 | [읽기 tool](#읽기-tool), [쓰기 tool](#쓰기-tool) | 장애 조사에 필요한 조회 tool과 실제 상태를 바꾸는 승인형 tool을 구분한다. |
| QA / 테스트 | [검증](#검증-tests), `tests/test_internal_mcp.py` | dry-run은 mutation 제출이 없어야 하고, 실제 쓰기는 사용자 승인, env opt-in, Gateway 권한 검사를 모두 통과해야 한다. |

## 용어

| 용어 | 의미 |
|---|---|
| MCP | AI client가 tool을 발견하고 호출하게 하는 Model Context Protocol 서버. 여기서는 stdio JSON-RPC 서버다. |
| Gateway | Opsia의 기존 HTTP 진입점. 인증, RBAC, 감사, workflow 상태 검사의 권위가 여기에 있다. |
| 읽기 tool | 기존 Gateway `GET`만 호출하는 tool. `mutating=false`, `approval_required=false`다. |
| 쓰기 tool | 기존 Gateway `POST`/`PATCH`를 보낼 수 있는 tool. 기본은 dry-run proposal이고 곧장 실행하지 않는다. |
| `dry_run` | mutation 제출 없이 "이 요청을 보낼 예정"이라는 proposal만 반환하는 모드. 기본값은 `true`다. |
| `proposal` | 실제 보낼 method/path/body를 redaction해서 보여주는 승인 자료다. |
| `approval_confirmed` | 사용자가 proposal을 보고 승인했다는 MCP 입력이다. Gateway의 실제 approval/RBAC 검사를 대체하지 않는다. |
| `operation_id` | 실제 제출 뒤 Gateway 응답에서만 추출하는 추적 ID다. MCP가 임의로 만들지 않는다. |

## 대표 사용 흐름

| 상황 | MCP가 하는 일 | 사람이 확인할 것 |
|---|---|---|
| "현재 cluster 상태를 요약해줘" | `list_clusters`, `get_cluster_summary`, `get_cluster_connection_status` 같은 읽기 tool로 Gateway `GET` API를 호출한다. | 화면에 나온 값이 Gateway 응답 기반인지 확인한다. |
| "이 장애의 근거 로그를 찾아줘" | `list_recent_incidents`, `list_evidence_windows`, `get_log_evidence`, `get_rca_bundle`로 기존 evidence와 RCA projection을 조회한다. | 없는 로그를 AI가 추측하지 않고 `available=false` 같은 실제 상태를 설명하는지 확인한다. |
| "alert rule을 만들어줘" | 기본적으로 `create_alert_rule` dry-run proposal만 만든다. 실제 제출은 사용자가 승인하고 MCP write env가 열린 뒤 Gateway로 보낸다. | proposal의 scope, 조건, 알림 채널을 보고 승인 여부를 결정한다. |
| "manifest를 바꿔줘" | `propose_manifest_change` dry-run에서는 비변경 preview API만 호출한다. 승인 후에도 cluster apply가 아니라 Safe PR workflow API로만 연결한다. | diff와 대상 resource를 검토하고 PR/approval 흐름을 확인한다. |
| "명령 실행 요청을 취소하거나 재시도해줘" | `cancel_command_request`, `retry_command_request`가 기존 command API로 요청한다. | `Idempotency-Key`, command 상태, Gateway 감사 로그를 확인한다. |

## Tool 분류

Tool이 많기 때문에 먼저 관심 영역으로 좁힌 뒤 아래의 상세 표를 보면 된다.

| 관심 영역 | 주로 볼 tool |
|---|---|
| Cluster 상태 | `list_clusters`, `get_fleet_summary`, `get_cluster_summary`, `get_cluster_connection_status`, `get_cluster_inventory_summary` |
| Resource와 topology | `list_resources`, `get_resource_detail`, `get_resource_graph`, `get_resource_capabilities`, `get_resource_metrics_history` |
| Incident와 evidence | `list_recent_incidents`, `get_rca_incident`, `get_rca_bundle`, `list_evidence_windows`, `get_log_evidence` |
| Alert 운영 | `list_alert_rules`, `get_alert_rule`, `create_alert_rule`, `update_alert_rule`, `disable_alert_rule`, `list_alert_events`, `ack_alert_event` |
| Command와 recovery | `create_command_request`, `get_command_status`, `cancel_command_request`, `retry_command_request`, `get_recovery_plan`, `request_recovery_action` |
| Application과 release | `list_applications`, `get_application_detail`, `get_application_drift`, `list_release_plans`, `create_release_plan`, `start_release_run` |
| Workflow와 audit | `list_pending_approvals`, `approve_or_reject_workflow`, `list_workflow_runs`, `get_workflow_run`, `list_audit_timeline` |
| Metrics | `list_metric_query_presets`, `run_metric_query_preset`, `list_metric_widgets`, `get_metric_widget` |

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.contracts.gateway.routes` | [contracts](../packages/contracts.md) | 기존 Gateway route 상수로만 HTTP path 구성 |
| import | `packages.contracts.gateway.params` | [contracts](../packages/contracts.md) | Gateway query parameter 이름 공유 |
| import | `packages.contracts.gateway.limits` | [contracts](../packages/contracts.md) | limit, id 길이, 필터 길이 상한 공유 |
| import | `packages.security.log_lines` | [security](../packages/security.md) | error, proposal, read response redaction |
| import | `packages.config` | [config](../packages/config.md) | 기본 session cookie 이름 |
| outbound | Opsia api-gateway HTTP | [gateway-api-gateway](gateway-api-gateway.md) | 인증 헤더를 포함한 기존 Gateway `GET`/`POST`/`PATCH` 호출 |
| inbound | MCP host stdio | 없음 | JSON-RPC request/response line 처리 |
| test | `httpx.MockTransport` | 없음 | 실제 네트워크 없이 Gateway 호출 경계 검증 |

## 공개 인터페이스 (Public API)

| 표면 | 코드 앵커 | 설명 |
|---|---|---|
| `main` | `src/services/mcp/internal_control/app.py :: main` | `python -m services.mcp.internal_control.app` entrypoint. `RUNTIME_DISCOVERY_IGNORE = True`로 runtime service discovery에서 제외된다. |
| `McpSettings` | `src/services/mcp/internal_control/config.py :: McpSettings` | Gateway base URL, 사용자 인증 방식, write-enable flag, timeout, response size limit을 담는 설정 객체다. |
| `load_settings` | `src/services/mcp/internal_control/config.py :: load_settings` | env를 읽고 fail-closed 검증을 수행한다. `OPSIA_MCP_API_BASE_URL`이 `MANAGEMENT_BASE_URL`보다 우선한다. |
| `ManagementApiClient` | `src/services/mcp/internal_control/api_client.py :: ManagementApiClient` | 검증된 path/query/body/header만 받아 Gateway JSON API를 호출한다. 지원 method는 `GET`, `POST`, `PATCH`다. |
| `ToolRegistry` | `src/services/mcp/internal_control/tools.py :: ToolRegistry` | tool 목록 정렬, 중복 이름 방지, tool dispatch를 담당한다. |
| `default_tool_registry` | `src/services/mcp/internal_control/tools.py :: default_tool_registry` | 현재 공개 MCP tool 75개를 생성한다. 읽기 61개, 쓰기 14개다. |
| `_post_or_propose` | `src/services/mcp/internal_control/tools.py :: _post_or_propose` | 대부분의 쓰기 tool이 공유하는 proposal/approval/write-enable/allowlist gate다. |
| `InternalControlMcpServer` | `src/services/mcp/internal_control/server.py :: InternalControlMcpServer` | `initialize`, `ping`, `tools/list`, `tools/call` JSON-RPC dispatch를 담당한다. |
| `run_stdio` | `src/services/mcp/internal_control/server.py :: run_stdio` | stdin 한 줄을 JSON-RPC request로 처리하고 stdout 한 줄로 response를 쓴다. |

## 데이터 모델 (Data Model)

자체 DB table은 없다. 모든 업무 데이터는 Gateway 응답 또는 MCP safety envelope이다.

공통 tool result:

```json
{
  "tool": "<tool name>",
  "data": "<Gateway response or null>",
  "safety": {
    "mutating": false,
    "dry_run": true,
    "proposal": null,
    "approval_required": false,
    "operation_id": null,
    "api_path": "/gateway/path",
    "reason": "<why this safety posture is used>"
  }
}
```

읽기 safety:

| 필드 | 값 |
|---|---|
| `mutating` | `false` |
| `dry_run` | `null` |
| `proposal` | `null` |
| `approval_required` | `false` |
| `operation_id` | `null` |
| `api_path` | 실제 호출한 Gateway path |

쓰기 safety:

| 조건 | HTTP 호출 | safety |
|---|---|---|
| `dry_run=true` 또는 생략 | 일반 쓰기는 없음. `propose_manifest_change`만 비변경 preview API 호출 | `mutating=false`, `approval_required=true`, redacted `proposal` 반환 |
| `dry_run=false`, `approval_confirmed` 누락 또는 false | 없음 | `ToolInputError` |
| `dry_run=false`, `approval_confirmed=true`, `OPSIA_MCP_ENABLE_WRITES` false | 없음 | `ToolInputError` |
| 모든 조건 충족 | allowlist된 기존 Gateway `POST`/`PATCH` | `mutating=true`, Gateway 응답에서만 `operation_id` 추출 |

proposal 구조:

```json
{
  "method": "POST or PATCH",
  "api_path": "/gateway/path",
  "body": "<redacted payload>",
  "body_redacted": true,
  "headers": "<optional redacted extra headers>",
  "uses_existing_gateway_api": true
}
```

`headers`는 `cancel_command_request`, `retry_command_request`처럼 기존 Gateway API가 `Idempotency-Key`를 요구할 때만 들어간다. 이 값도 proposal에서는 redaction된다.

## 이벤트 (Events)

이 MCP 서비스는 event bus에 직접 publish/consume하지 않는다.

| 방향 | 이벤트 | 설명 |
|---|---|---|
| publish | 없음 | command, approval, workflow, audit, safe-pr 이벤트 발행은 Gateway와 기존 worker가 담당한다. |
| consume | 없음 | MCP는 stdio request를 받아 Gateway HTTP API만 호출한다. |

## Tool 목록

### 읽기 tool

모든 읽기 tool은 `READ_ONLY_TOOL_ANNOTATIONS`를 사용한다. 권한 방식은 공통적으로 "사용자 인증 헤더를 Gateway에 전달하고 Gateway route의 session/RBAC/workspace/cluster 검사를 따른다"이다.

| MCP tool | 기능 | 호출하는 기존 Gateway API | 권한 방식 |
|---|---|---|---|
| `list_clusters` | 사용자가 볼 수 있는 cluster 목록 | `GET CLUSTERS_PATH` | Gateway cluster list 권한 |
| `get_fleet_summary` | fleet 전체 요약 | `GET FLEET_SUMMARY_PATH` | Gateway fleet summary 권한 |
| `list_feature_contracts` | 제품 feature contract catalog | `GET FEATURE_CONTRACTS_PATH` | Gateway session 권한 |
| `get_cluster_summary` | 단일 cluster drill-down summary | `GET CLUSTER_SUMMARY_PATH` | 해당 cluster 접근 권한 |
| `get_cluster_connection_status` | 등록, heartbeat, 연결 단계 | `GET CLUSTER_CONNECTION_STATUS_PATH` | 해당 cluster 접근 권한 |
| `get_cluster_inventory_summary` | inventory snapshot metadata와 resource count | `GET CLUSTER_INVENTORY_SUMMARY_PATH` | 해당 cluster inventory 권한 |
| `get_cluster_nodes_summary` | node health/usage roll-up | `GET CLUSTER_NODES_SUMMARY_PATH` | 해당 cluster 접근 권한 |
| `get_cluster_node_pods_summary` | node별 pod roll-up | `GET CLUSTER_NODE_PODS_SUMMARY_PATH` | 해당 cluster 접근 권한 |
| `get_cluster_usage` | persisted usage series | `GET CLUSTER_USAGE_PATH` | 해당 cluster usage 권한 |
| `list_resources` | persisted inventory resource 목록 | `GET CLUSTER_INVENTORY_RESOURCES_PATH` | 해당 cluster inventory 권한 |
| `list_cluster_workloads` | workload inventory 목록 | `GET CLUSTER_INVENTORY_WORKLOADS_PATH` | 해당 cluster inventory 권한 |
| `list_cluster_services` | service inventory 목록 | `GET CLUSTER_INVENTORY_SERVICES_PATH` | 해당 cluster inventory 권한 |
| `list_cluster_events` | event inventory 목록 | `GET CLUSTER_INVENTORY_EVENTS_PATH` | 해당 cluster inventory 권한 |
| `list_helm_releases` | inventory metadata에서 추론한 Helm release 목록 | `GET HELM_RELEASES_PATH` | Gateway가 허용한 cluster/namespace scope |
| `get_helm_release` | Helm release detail metadata | `GET HELM_RELEASE_PATH` + `cluster_id` query | Gateway Helm/inventory 권한. values와 manifest는 decode하지 않음 |
| `list_global_filter_facets` | 전역 filter facet | `GET FILTER_FACETS_PATH` | Gateway facet 권한 |
| `list_resource_filter_facets` | resource filter facet | `GET RESOURCES_FILTER_FACETS_PATH` | Gateway resource facet 권한 |
| `list_resource_label_facets` | resource label facet | `GET RESOURCE_LABEL_FACETS_PATH` | Gateway resource facet 권한 |
| `get_resource_metrics_history` | resource metric history batch | `GET RESOURCE_METRICS_HISTORY_PATH` | Gateway metric history 권한 |
| `get_resource_detail` | resource detail, related, events | `GET CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH` | 해당 cluster inventory 권한 |
| `list_recent_incidents` | RCA report summary 목록 | `GET RCA_REPORTS_PATH` | Gateway RCA read 권한 |
| `get_rca_bundle` | remediation bundle | `GET RCA_BUNDLE_PATH` | Gateway RCA bundle 권한, 응답 redaction |
| `list_incident_recent_changes` | incident workload scope의 최근 GitOps change | `GET RCA_RECENT_CHANGES_PATH` | Gateway RCA recent-change 권한 |
| `list_rca_rules` | RCA rule catalog | `GET RCA_RULES_PATH` | Gateway RCA rule read 권한 |
| `list_dead_letters` | dead-letter entry 목록 | `GET DEAD_LETTERS_PATH` | Gateway admin/ops 권한 |
| `list_rca_issues` | RCA issue queue | `GET DASHBOARD_RCA_ISSUES_PATH` | Gateway dashboard RCA 권한 |
| `list_issue_filter_facets` | issue filter facet | `GET ISSUES_FILTER_FACETS_PATH` | Gateway issue facet 권한 |
| `list_issue_label_facets` | issue label facet | `GET ISSUES_LABEL_FACETS_PATH` | Gateway issue facet 권한 |
| `get_rca_incident` | 단일 RCA incident projection | `GET DASHBOARD_RCA_INCIDENT_PATH` | Gateway RCA incident 권한 |
| `list_resource_issues` | 특정 resource의 RCA issue 목록 | `GET RESOURCE_RCA_ISSUES_PATH` | Gateway inventory + RCA read 권한 |
| `list_evidence_windows` | evidence window key 목록 | `GET EVIDENCE_WINDOWS_PATH` | Gateway evidence 권한 |
| `get_log_evidence` | evidence window의 logs source | `GET EVIDENCE_WINDOW_PATH` | Gateway evidence 권한. logs source가 없으면 window 존재만 재확인 |
| `get_command_status` | command 상태와 agent 결과 | `GET COMMAND_STATUS_PATH` | Gateway command status 권한 |
| `list_alert_rules` | alert rule 목록 | `GET ALERT_RULES_PATH` | Gateway alert admin/read 권한 |
| `get_alert_rule` | alert rule list 응답에서 rule 하나 선택 | `GET ALERT_RULES_PATH` | Gateway alert admin/read 권한 |
| `list_alert_channels` | alert channel 목록 | `GET ALERT_CHANNELS_PATH` | Gateway alert channel 권한, endpoint redaction |
| `get_alert_channel` | alert channel list 응답에서 channel 하나 선택 | `GET ALERT_CHANNELS_PATH` | Gateway alert channel 권한, endpoint redaction |
| `list_alert_events` | alert event 목록 | `GET ALERT_EVENTS_PATH` | Gateway alert event 권한 |
| `get_recovery_plan` | correlation id의 recovery plan | `GET RCA_RECOVERY_PLAN_BY_CORRELATION_PATH` | Gateway RCA recovery 권한 |
| `list_applications` | application 목록 | `GET APPLICATIONS_PATH` | Gateway application read 권한 |
| `list_application_filter_facets` | application filter facet | `GET APPLICATION_FILTER_FACETS_PATH` | Gateway application facet 권한 |
| `list_application_label_facets` | application label facet | `GET APPLICATION_LABEL_FACETS_PATH` | Gateway application facet 권한 |
| `get_application_detail` | application detail projection | `GET APPLICATION_PATH` | Gateway application read 권한 |
| `get_application_drift` | application drift projection | `GET APPLICATION_DRIFT_PATH` | Gateway application drift 권한 |
| `list_application_deployments` | application deployment history | `GET APPLICATION_DEPLOYMENTS_PATH` | Gateway application deployment 권한 |
| `list_audit_timeline` | correlation 기준 audit timeline | `GET AUDIT_TIMELINE_PATH` | Gateway audit read 권한 |
| `list_workflow_runs` | application runs 또는 release runs 목록 | `GET APPLICATION_RUNS_PATH` 또는 `GET RELEASE_RUNS_PATH` | Gateway application/release run 권한 |
| `get_workflow_run` | application run filter 또는 release run detail | `GET APPLICATION_RUNS_PATH` 또는 `GET RELEASE_RUN_PATH` | Gateway application/release run 권한 |
| `get_release_run_report` | release run report | `GET RELEASE_RUN_REPORT_PATH` | Gateway release run 권한 |
| `list_release_plans` | release plan 목록 | `GET RELEASE_PLANS_PATH` | Gateway release plan 권한 |
| `get_release_plan` | release plan detail | `GET RELEASE_PLAN_PATH` | Gateway release plan 권한 |
| `get_release_run_summary` | release run summary roll-up | `GET RELEASE_RUN_SUMMARY_PATH` | Gateway release read 권한 |
| `list_release_audit` | release audit event 목록 | `GET RELEASE_AUDIT_PATH` | Gateway release audit 권한 |
| `list_pending_approvals` | pending application/release approval 탐색 | `GET GITOPS_FILTER_RESULTS_PATH`, `GET APPLICATION_RUNS_PATH`, `GET RELEASE_RUNS_PATH` | Gateway GitOps/application/release read 권한 |
| `list_gitops_filter_facets` | GitOps filter facet | `GET GITOPS_FILTER_FACETS_PATH` | Gateway GitOps facet 권한 |
| `get_resource_capabilities` | resource에 가능한 action 목록 | `GET RESOURCE_CAPABILITIES_PATH` | Gateway resource capability 권한 |
| `get_resource_graph` | resource graph snapshot | `GET RESOURCES_GRAPH_PATH` | Gateway resource graph 권한 |
| `list_recent_changes` | bounded change timeline | `GET CHANGES_PATH` | Gateway changes 권한 |
| `list_metric_query_presets` | cluster metric preset 목록 | `GET CLUSTER_METRIC_QUERY_PRESETS_PATH` | 해당 cluster metric 권한 |
| `list_metric_widgets` | cluster metric widget 목록 | `GET CLUSTER_METRIC_WIDGETS_PATH` | 해당 cluster metric 권한 |
| `get_metric_widget` | metric widget list 응답에서 widget 하나 선택 | `GET CLUSTER_METRIC_WIDGETS_PATH` | 해당 cluster metric 권한 |

### 쓰기 tool

모든 쓰기 tool은 `WRITE_TOOL_ANNOTATIONS`를 사용한다. 즉 `readOnlyHint=false`, `destructiveHint=true`, `idempotentHint=false`로 노출된다. 권한 방식은 공통적으로 `dry_run` proposal, 사용자 승인 입력, MCP write-enable env, Gateway RBAC와 audit/workflow 검사를 모두 통과해야 한다.

| MCP tool | 기능 | 호출하는 기존 Gateway API | 권한 방식 |
|---|---|---|---|
| `run_metric_query_preset` | 기존 metric preset 실행 요청 | `POST CLUSTER_METRIC_QUERY_PRESET_RUN_PATH` | proposal 기본. 승인 시 Gateway가 read-only agent debug command를 queue하고 command 권한을 검사 |
| `create_alert_rule` | alert rule 생성 | `POST ALERT_RULES_PATH` | proposal 기본. 승인 시 Gateway alert admin session/model validation |
| `request_recovery_action` | 기존 recovery plan/action 선택 | `POST RCA_RECOVERY_ACTION_SELECT_PATH` 또는 `POST RCA_RECOVERY_ACTION_SELECT_BY_CORRELATION_PATH` | proposal 기본. plan/action 존재와 stale selection은 Gateway가 검사 |
| `create_command_request` | manual command request 생성 | `POST COMMANDS_PATH` | proposal 기본. direct execution flag key는 MCP가 선차단하고 Gateway command 정책이 최종 검사 |
| `approve_or_reject_workflow` | approval grant/reject | `POST APPROVAL_GRANT_PATH` 또는 `POST APPROVAL_REJECT_PATH` | proposal 기본. Gateway가 approval 상태와 deployment access 검사 |
| `update_alert_rule` | alert rule 부분 수정 | `PATCH ALERT_RULE_PATH` | proposal 기본. Gateway alert admin/model validation |
| `disable_alert_rule` | alert rule 비활성화 | `PATCH ALERT_RULE_PATH` with `enabled=false` | 삭제가 아니라 기존 PATCH API만 사용 |
| `cancel_command_request` | command cancel 요청 | `POST COMMAND_CANCEL_PATH` | proposal 기본. caller-supplied `Idempotency-Key` 필수, Gateway command state 검사 |
| `retry_command_request` | command retry 요청 | `POST COMMAND_RETRY_PATH` | proposal 기본. caller-supplied `Idempotency-Key` 필수, Gateway command state 검사 |
| `ack_alert_event` | alert event ack | `POST ALERT_EVENT_ACK_PATH` | proposal 기본. Gateway가 actor와 상태 전이를 기록 |
| `promote_alert_incident` | alert event를 incident로 승격 | `POST ALERT_EVENT_PROMOTE_INCIDENT_PATH` | proposal 기본. Gateway alert lifecycle 권한 검사 |
| `propose_manifest_change` | manifest edit preview 및 Safe PR 제출 | dry-run: `POST RESOURCE_MANIFEST_PREVIEW_PATH`; 승인: `POST RESOURCE_MANIFEST_APPROVE_PATH` | dry-run도 cluster apply가 아니라 preview만 호출. 승인 시 Safe PR workflow API만 호출 |
| `create_release_plan` | release plan 생성 또는 갱신 | `POST RELEASE_PLANS_PATH` | proposal 기본. Gateway application manage permission과 plan validation |
| `start_release_run` | release run 시작 | `POST RELEASE_PLAN_START_PATH` | proposal 기본. Gateway blocker, approval evidence, application permission 검사 |

## 동작 (Behavior)

### 설정 검증

1. `load_settings()`는 `OPSIA_MCP_API_BASE_URL`, 없으면 `MANAGEMENT_BASE_URL`을 읽는다.
2. base URL은 `http` 또는 `https`만 허용한다. credentials, query, fragment, 공백, control character, backslash는 거부한다.
3. `http://`는 loopback host만 기본 허용한다. 그 외 HTTP는 `OPSIA_MCP_ALLOW_INSECURE_HTTP=true`가 필요하다.
4. 인증은 `OPSIA_MCP_BEARER_TOKEN`, `OPSIA_MCP_COOKIE`, `OPSIA_MCP_SESSION_COOKIE` 중 정확히 하나만 허용한다.
5. `OPSIA_MCP_TRUSTED_PROXY_SECRET`은 항상 거부한다. MCP가 service-admin proxy 권한을 빌리지 못하게 하기 위한 fail-closed 규칙이다.

### Gateway 호출

1. `ManagementApiClient`는 매 요청 직전 `McpSettings.auth_headers()`를 사용한다.
2. path는 `/`로 시작하는 상대 path만 허용한다. `//`, `://`, query, fragment, 공백, control character, backslash가 있으면 거부한다.
3. query key/value는 문자열화하되 unsafe character가 있으면 거부한다. bool은 `true`/`false`로 보낸다.
4. response body는 `OPSIA_MCP_MAX_RESPONSE_BYTES` 상한까지 streaming read한다.
5. HTTP 실패 detail은 JSON `detail` 우선으로 읽고 `redact_log_line`과 길이 상한 500자로 정리한다.

### 읽기 요청 처리

1. `_reject_unknown`으로 schema 밖 argument를 거부한다.
2. string argument는 trim하고, 빈 문자열은 missing으로 처리하며, control character와 길이 초과를 거부한다.
3. path parameter는 `_format_path(..., quote(..., safe=""))`로 percent-encode한다.
4. GET 결과는 Gateway 응답을 redaction 후 `data`에 둔다. MCP가 없는 값을 추측하거나 합성하지 않는다.
5. `get_log_evidence`만 logs source 404와 evidence window 404를 구분하기 위해 같은 window를 한 번 더 GET할 수 있다. window가 존재하면 `available=false`, `payload=null`을 반환한다.

### 쓰기 요청 처리

1. 대부분의 쓰기 tool은 `_post_or_propose`를 통과한다.
2. `_post_or_propose`는 `ALLOWED_WRITE_GATEWAY_ROUTES`에 있는 method/template만 허용한다. allowlist 밖 route는 dry-run proposal 단계에서도 거부한다.
3. `propose_manifest_change`는 dry-run에서 `ALLOWED_NON_MUTATING_POST_GATEWAY_ROUTES`의 preview API만 호출하고, 승인 제출은 `ALLOWED_WRITE_GATEWAY_ROUTES`의 Safe PR approve API만 호출한다.
4. payload는 `json.dumps(..., allow_nan=False)`로 finite JSON인지 확인하고 UTF-8 기준 `MAX_WRITE_PAYLOAD_BYTES`를 넘으면 거부한다.
5. proposal body는 deep-copy 후 redaction한다. 실제 Gateway 제출 전까지 원본 payload를 변형하지 않는다.
6. 실제 POST/PATCH는 `approval_confirmed=true`와 `OPSIA_MCP_ENABLE_WRITES=true`가 모두 필요하다.
7. `operation_id`는 Gateway 응답의 `rule_id`, `command_id`, `event_id`, `correlation_id`, `audit_event_id`, `workflow_run_id`, `approval_id`, `plan_id`, `run_id` 같은 tool별 허용 key에서만 추출한다.

## 불변식과 오류 (Invariants & Errors)

- Gateway가 유일한 권한 결정 지점이다. MCP는 인증 헤더를 전달할 뿐 RBAC, workspace, cluster access를 자체 확장하지 않는다.
- MCP는 DB, Kubernetes API, Docker, subprocess, event bus에 직접 접근하지 않는다.
- 쓰기 tool은 기본적으로 network write를 하지 않는다. `dry_run=true`가 기본이다.
- `approval_confirmed=true`는 사용자가 proposal을 보았다는 MCP 입력일 뿐이다. Gateway approval/RBAC/audit 검사를 대체하지 않는다.
- `create_command_request`는 `confirmation`, `direct_execution`, `direct_execution_confirmed` key를 중첩 위치와 상관없이 거부한다.
- `additionalProperties=false` schema와 `_reject_unknown` 런타임 검증을 같이 유지한다.
- JSON-RPC line은 `MAX_JSONRPC_LINE_BYTES`, 쓰기 payload는 `MAX_WRITE_PAYLOAD_BYTES`, Gateway response는 `OPSIA_MCP_MAX_RESPONSE_BYTES`로 제한한다.
- server internal exception detail은 JSON-RPC response에 노출하지 않는다.
- proposal, read response, Gateway error detail에는 secret/token/password/API key/raw manifest diff가 노출되면 안 된다.

## 설정 (Settings)

| 환경변수 / 상수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `OPSIA_MCP_API_BASE_URL` | str | 없음 | MCP가 호출할 Opsia Gateway base URL. 있으면 `MANAGEMENT_BASE_URL`보다 우선 |
| `MANAGEMENT_BASE_URL` | str | 없음 | 기존 배포 env fallback. MCP에서는 base URL로만 사용 |
| `OPSIA_MCP_BEARER_TOKEN` | str | 없음 | `Authorization: Bearer ...` 사용자 범위 인증 |
| `OPSIA_MCP_COOKIE` | str | 없음 | 전체 Cookie header 사용자 범위 인증 |
| `OPSIA_MCP_SESSION_COOKIE` | str | 없음 | session token 값. `OPSIA_MCP_SESSION_COOKIE_NAME`과 조합해 Cookie header 생성 |
| `OPSIA_MCP_SESSION_COOKIE_NAME` | str | `Auth.SESSION_COOKIE_NAME` | session cookie 이름 |
| `OPSIA_MCP_TRUSTED_PROXY_SECRET` | str | 금지 | 설정되면 MCP 시작 실패 |
| `OPSIA_MCP_ENABLE_WRITES` | bool | `false` | `true`일 때만 승인된 쓰기 tool이 Gateway POST/PATCH를 제출 |
| `OPSIA_MCP_ALLOW_INSECURE_HTTP` | bool | `false` | loopback 외 `http://` base URL 허용 opt-in |
| `OPSIA_MCP_REQUEST_TIMEOUT_SECONDS` | float | `10.0` | Gateway HTTP timeout. `0 < value <= 60.0` |
| `OPSIA_MCP_MAX_RESPONSE_BYTES` | int | `2097152` | Gateway response body read 상한. `0 < value <= 8388608` |

## 검증 (Tests)

- `tests/test_internal_mcp.py`는 설정 fail-closed, trusted proxy 금지, registry/schema, read-only GET, query forwarding, unsafe input rejection, path encoding, response redaction, write dry-run, approval gate, write-enable gate, Gateway write allowlist, proposal redaction, direct execution flag 차단, JSON-RPC error handling을 검증한다.
- `tests/test_rca_changes.py`는 RCA recent-changes Gateway route가 shared limit/param/route contract를 사용하면서 기존 5/50 동작값을 유지하는지 검증한다.
- `tests/test_rca_changes_migration.py`는 RCA recent-change 저장 구조 migration 회귀를 검증한다.
- `tests/test_service_discovery.py`는 MCP stdio `app.py`가 `RUNTIME_DISCOVERY_IGNORE = True`로 배포 서비스 discovery에 들어가지 않는지 검증한다.
- 관련 회귀 묶음: `uv run pytest tests\test_internal_mcp.py tests\test_rca_changes.py tests\test_rca_changes_migration.py tests\test_service_discovery.py tests\test_bruno_collection.py -q`.

## 유지보수 체크리스트

- 새 읽기 tool을 추가할 때는 기존 Gateway `GET` route 상수를 사용하고, `READ_ONLY_TOOL_ANNOTATIONS`, `_reject_unknown`, response redaction 테스트를 함께 추가한다.
- 새 쓰기 tool을 추가할 때는 기존 Gateway `POST`/`PATCH` route만 사용하고, `_post_or_propose` 또는 그와 같은 gate를 통과시킨다.
- 새 쓰기 route는 `ALLOWED_WRITE_GATEWAY_ROUTES`에 명시해야 하며, 비변경 preview POST라면 `ALLOWED_NON_MUTATING_POST_GATEWAY_ROUTES`에 따로 둔다.
- operation id는 Gateway 응답에서만 추출한다. MCP가 임의 operation id를 만들면 안 된다.
- AI가 직접 queue publish/consume, DB update, Kubernetes apply를 하게 만드는 코드는 이 서비스에 넣지 않는다.
- 문서를 갱신할 때는 `source_commit`을 코드 반영 커밋으로 맞추고 `status: synced`를 유지한다.
