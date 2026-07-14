from __future__ import annotations

HEALTHZ_PATH = "/healthz"
READYZ_PATH = "/readyz"
AUTH_SESSION_PATH = "/auth/session"
AUTH_SESSION_REFRESH_PATH = "/auth/session/refresh"
AUTH_SIGNUP_PATH = "/auth/signup"
AUTH_LOGIN_PATH = "/auth/login"
AUTH_LOGOUT_PATH = "/auth/logout"
AUTH_CHECK_EMAIL_PATH = "/auth/check-email"
AUTH_VERIFY_EMAIL_PATH = "/auth/verify-email"
AUTH_RESEND_VERIFICATION_PATH = "/auth/resend-verification"
AUTH_APPROVE_USER_PATH = "/auth/users/{user_id}/approve"
GITHUB_WEBHOOK_PATH = "/github/webhook"
# 외부 모니터링(Alertmanager/Grafana) 알림 수신 — 인시던트 파이프라인 트리거.
ALERTMANAGER_WEBHOOK_PATH = "/webhooks/alertmanager"
AGENT_CONNECT_PATH = "/agent/connect"
AGENT_EVIDENCE_PATH = "/agent/evidence"
TARGETS_PATH = "/targets"
# 원라인 인스톨러 — agent 토큰 자체가 자격증명(해시 대조)이라 세션 불필요.
INSTALL_MANIFEST_PATH = "/install/{agent_token}"
COMMANDS_PATH = "/commands"
COMMAND_STATUS_PATH = "/commands/{command_id}"
APPROVAL_GRANT_PATH = "/approvals/{approval_id}/grant"
APPROVAL_REJECT_PATH = "/approvals/{approval_id}/reject"
DEAD_LETTERS_PATH = "/dead-letters"
DEAD_LETTER_REPLAY_PATH = "/dead-letters/{dead_letter_id}/replay"
AI_CONVERSATIONS_PATH = "/ai/conversations"
AI_CONVERSATION_PATH = "/ai/conversations/{conversation_id}"
AI_CONVERSATION_MESSAGES_PATH = "/ai/conversations/{conversation_id}/messages"
# Context-bound AI facade. These routes are intentionally separate from the
# asynchronous conversation workflow: every synchronous answer must carry
# materialized, user-authorized evidence.
AI_CHAT_PATH = "/ai/chat"
AI_SUGGESTIONS_PATH = "/ai/suggestions"
AI_RESOURCES_PATH = "/ai/resources/{kind}"
AI_RESOURCE_PATH = "/ai/resources/{kind}/{namespace}/{name}"
# Browser log SSE. Multi-cluster identity is a required query parameter; these
# path constants own only the target identity portion.
POD_LOG_STREAM_PATH = "/pods/{namespace}/{name}/logs/stream"
WORKLOAD_LOG_STREAM_PATH = "/workloads/{kind}/{namespace}/{name}/logs/stream"
# 관리 콘솔 — 조직/그룹/멤버/권한 (프론트 콘솔 전용, admin 세션)
ORGS_PATH = "/orgs"
ORG_PATH = "/orgs/{org_id}"
GROUPS_PATH = "/groups"
GROUP_PATH = "/groups/{group_id}"
GROUP_MEMBERS_PATH = "/groups/{group_id}/members"
GROUP_MEMBER_PATH = "/groups/{group_id}/members/{user_id}"
USERS_PATH = "/users"
# 알림 라우팅 룰 — 워크스페이스별 수신 채널(admin 세션)
ALERT_CHANNELS_PATH = "/alert-channels"
ALERT_CHANNEL_PATH = "/alert-channels/{channel_id}"
ALERT_CHANNEL_TEST_PATH = "/alert-channels/test"
ACCESS_PATH = "/access"
ACCESS_ITEM_PATH = "/access/{access_id}"
APPLICATIONS_PATH = "/applications"
APPLICATION_CONNECT_PATH = "/applications/connect"
APPLICATION_PATH = "/applications/{application_id}"
APPLICATION_DEPLOYMENTS_PATH = "/applications/{application_id}/deployments"
APPLICATION_DRIFT_PATH = "/applications/{application_id}/drift"
APPLICATION_RUNS_PATH = "/applications/{application_id}/runs"
APPLICATION_FILTER_RESULTS_PATH = "/applications/filter-results"
APPLICATION_FILTER_FACETS_PATH = "/applications/filter-facets"
APPLICATION_LABEL_FACETS_PATH = "/applications/label-facets"
GITOPS_FILTER_RESULTS_PATH = "/gitops/filter-results"
GITOPS_FILTER_FACETS_PATH = "/gitops/filter-facets"
REPOSITORY_DISCOVERY_PROBE_PATH = "/repositories/discovery/probe"
REPOSITORY_DISCOVERY_BRANCHES_PATH = "/repositories/discovery/branches"
REPOSITORY_DISCOVERY_MANIFESTS_PATH = "/repositories/discovery/manifests"
REPOSITORY_DISCOVERY_VALIDATE_PATH = "/repositories/discovery/validate"
REPOS_VALIDATE_PATH = "/repos/validate"
REPOS_BRANCHES_PATH = "/repos/branches"
REPOS_MANIFESTS_PATH = "/repos/manifests"
DIAGNOSTICS_PATH = "/diagnostics"
RELEASE_PLANS_PATH = "/release-plans"
RELEASE_READINESS_PATH = "/release-readiness"
RELEASE_MANIFEST_RENDER_PATH = "/release-plans/render-manifest"
RELEASE_MANIFEST_SAFE_PR_PATH = "/release-plans/render-manifest/safe-pr"
RELEASE_PLAN_DISPATCH_PATH = "/release-plans/dispatch"
RELEASE_PLAN_PREVIEW_PATH = "/release-plans/preview"
RELEASE_PLAN_START_PATH = "/release-plans/start"
RELEASE_PLAN_ARCHIVE_PATH = "/release-plans/{plan_id}/archive"
RELEASE_PLAN_RESTORE_PATH = "/release-plans/{plan_id}/restore"
RELEASE_PLAN_PATH = "/release-plans/{plan_id}"
RELEASE_RUNS_PATH = "/release-runs"
RELEASE_RUN_PATH = "/release-runs/{run_id}"
RELEASE_RUN_SUMMARY_PATH = "/release-runs/summary"
RELEASE_RUN_HANDOFF_PATH = "/release-runs/{run_id}/handoff"
RELEASE_RUN_REPORT_PATH = "/release-runs/{run_id}/report"
RELEASE_RUN_REPORT_EXPORT_PATH = "/release-runs/{run_id}/report/export"
RELEASE_RUN_ADVANCE_PATH = "/release-runs/{run_id}/advance"
RELEASE_RUN_CANCEL_PATH = "/release-runs/{run_id}/cancel"
RELEASE_RUN_PAUSE_PATH = "/release-runs/{run_id}/pause"
RELEASE_RUN_RESUME_PATH = "/release-runs/{run_id}/resume"
RELEASE_RUN_RETRY_PATH = "/release-runs/{run_id}/retry"
RELEASE_RUN_ROLLBACK_PATH = "/release-runs/{run_id}/rollback"
RELEASE_RUN_NOTIFY_PATH = "/release-runs/{run_id}/notify"
RELEASE_AUDIT_PATH = "/release-audit"
RELEASE_AUDIT_EXPORT_PATH = "/release-audit/export"
CATALOG_ITEMS_PATH = "/catalog/items"
CATALOG_ITEM_PATH = "/catalog/items/{item_id}"
CATALOG_ITEM_INSTALLS_PATH = "/catalog/items/{item_id}/installs"
AGENT_COMMAND_POLL_PATH = "/agent/commands/poll"
AGENT_COMMAND_START_PATH = "/agent/commands/{command_id}/start"
AGENT_COMMAND_HEARTBEAT_PATH = "/agent/commands/{command_id}/heartbeat"
AGENT_COMMAND_RESULT_PATH = "/agent/commands/{command_id}/result"
AGENT_EVIDENCE_JOB_SCHEDULE_PATH = "/agent/evidence/jobs"
AGENT_EVIDENCE_JOB_POLL_PATH = "/agent/evidence/jobs/poll"
AGENT_EVIDENCE_JOB_RESULT_PATH = "/agent/evidence/jobs/{job_id}/result"
AGENT_INVENTORY_SNAPSHOTS_PATH = "/agent/inventory/snapshots"
AGENT_POLICY_PATH = "/agent/policy"
AGENT_POLICY_STATUS_PATH = "/agent/policy/status"
AGENT_RECONCILE_STATUS_PATH = "/agent/reconcile/status"
AGENT_DEBUG_QUERY_PATH = "/agent/debug/query"
CLUSTERS_PATH = "/clusters"
CLUSTERS_CONNECT_PATH = "/clusters/connect"
CLUSTER_PATH = "/clusters/{cluster_id}"
# 콘솔 fleet 화면용 집계 — 워크스페이스 전체 클러스터 health/사용량 롤업(세션 범위).
FLEET_SUMMARY_PATH = "/fleet/summary"
# 클러스터 타일 클릭 드릴다운 — 워크로드 health 그룹/경고 이벤트/열린 인시던트/usage 스냅샷.
CLUSTER_SUMMARY_PATH = "/clusters/{cluster_id}/summary"
CLUSTER_CONNECTION_STATUS_PATH = "/clusters/{cluster_id}/connection-status"
CLUSTER_CONNECTION_PATH = "/clusters/{cluster_id}/connection"
CLUSTER_NODES_SUMMARY_PATH = "/clusters/{cluster_id}/nodes/summary"
CLUSTER_NODE_PODS_SUMMARY_PATH = "/clusters/{cluster_id}/nodes/{node_name}/pods/summary"
CLUSTER_INVENTORY_RESOURCES_PATH = "/clusters/{cluster_id}/inventory/resources"
CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH = "/clusters/{cluster_id}/inventory/resource-detail"
CLUSTER_INVENTORY_SUMMARY_PATH = "/clusters/{cluster_id}/inventory/summary"
CLUSTER_INVENTORY_WORKLOADS_PATH = "/clusters/{cluster_id}/inventory/workloads"
CLUSTER_INVENTORY_SERVICES_PATH = "/clusters/{cluster_id}/inventory/services"
CLUSTER_INVENTORY_EVENTS_PATH = "/clusters/{cluster_id}/inventory/events"
# 워크스페이스 범위 Resources 필터 계약 — 기존 단일 클러스터 인벤토리 경로와 분리한다.
RESOURCES_FILTER_FACETS_PATH = "/resources/filter-facets"
FILTERED_RESOURCES_PATH = "/resources"
RESOURCE_LABEL_FACETS_PATH = "/resources/label-facets"
FILTER_FACETS_PATH = "/filter-facets"
RESOURCES_GRAPH_PATH = "/resources/graph"
TOPOLOGY_PATH = "/topology"
# Resources 표의 여러 pod 추세를 한 번에 읽는다. 단건 BQ-065를 클라이언트에서
# fan-out하지 않도록 서버 batch 경계를 별도로 둔다.
RESOURCE_METRICS_HISTORY_PATH = "/metrics/history"
# 단일 inventory resource의 실행 가능 액션만 반환한다. 거부/미지원 액션을
# disabled 항목으로 노출하지 않는 BQ-061 capability 경계다.
RESOURCE_CAPABILITIES_PATH = "/capabilities"
# 워크스페이스 범위 Issues 필터 계약 — mutable RCA timeline projection의 완전성을 명시한다.
ISSUES_FILTER_RESULTS_PATH = "/issues"
ISSUES_FILTER_FACETS_PATH = "/issues/filter-facets"
ISSUES_LABEL_FACETS_PATH = "/issues/label-facets"
# 스냅샷 기반 실측 활용 시계열(usage rollup) — 콘솔 추이 차트용.
CLUSTER_USAGE_PATH = "/clusters/{cluster_id}/usage"
CLUSTER_METRIC_QUERY_PRESETS_PATH = "/clusters/{cluster_id}/metric-query-presets"
CLUSTER_METRIC_QUERY_PRESET_PATH = "/clusters/{cluster_id}/metric-query-presets/{preset_id}"
CLUSTER_METRIC_QUERY_PRESET_RUN_PATH = "/clusters/{cluster_id}/metric-query-presets/{preset_id}/run"
CLUSTER_METRIC_WIDGETS_PATH = "/clusters/{cluster_id}/metric-widgets"
CLUSTER_METRIC_WIDGET_PATH = "/clusters/{cluster_id}/metric-widgets/{widget_id}"
METRICS_VALIDATE_PATH = "/metrics/validate"
CLUSTER_DEPLOYMENT_SCALE_PATH = (
    "/clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/scale"
)
CLUSTER_DEPLOYMENT_RESTART_PATH = (
    "/clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/restart"
)
CLUSTER_POLICY_PATH = "/clusters/{cluster_id}/policy"
CLUSTER_SCHEDULING_PROFILES_PATH = "/clusters/{cluster_id}/scheduling-profiles"
PROVIDERS_CATALOG_PATH = "/providers/catalog"
PROVIDERS_CLUSTER_DISCOVERY_PATH = "/providers/cluster-discovery"
PROVIDERS_VALIDATE_PATH = "/providers/validate"
TARGETS_PREFLIGHT_PATH = "/targets/preflight"
DASHBOARD_RCA_TIMELINE_PATH = "/dashboard/rca/timeline"
DASHBOARD_RCA_INCIDENT_PATH = "/dashboard/rca/incidents/{incident_id}"
AUDIT_TIMELINE_PATH = "/audit/timeline"
# 범용 조회 API — 세션 워크스페이스 범위의 evidence/RCA report 목록(read-only)
EVIDENCE_QUERY_PATH = "/evidence"
EVIDENCE_WINDOWS_PATH = "/evidence/windows"
EVIDENCE_WINDOW_PATH = "/evidence/windows/{evidence_key}"
RCA_REPORTS_PATH = "/rca-reports"
RCA_RULES_PATH = "/rca/rules"
RCA_RULES_VALIDATE_PATH = "/rca/rules/validate"
RCA_TEST_SCENARIOS_PATH = "/rca/test-scenarios"
RCA_TEST_RUNS_PATH = "/rca/test-runs"
RCA_TEST_RUN_PATH = "/rca/test-runs/{run_id}"
RCA_BUNDLE_PATH = "/rca/bundles/{correlation_id}"
RCA_RECENT_CHANGES_PATH = "/rca/incidents/{incident_id}/recent-changes"
RCA_RECOVERY_PLAN_BY_CORRELATION_PATH = "/rca/recovery-plans/by-correlation/{correlation_id}"
RCA_RECOVERY_ACTION_SELECT_BY_CORRELATION_PATH = (
    "/rca/recovery-plans/by-correlation/{correlation_id}/actions/select"
)
RCA_RECOVERY_ACTION_SELECT_PATH = "/rca/recovery-plans/{plan_id}/actions/{action_id}/select"


def agent_command_result_path(command_id: str) -> str:
    return AGENT_COMMAND_RESULT_PATH.format(command_id=command_id)


def agent_command_start_path(command_id: str) -> str:
    return AGENT_COMMAND_START_PATH.format(command_id=command_id)


def agent_command_heartbeat_path(command_id: str) -> str:
    return AGENT_COMMAND_HEARTBEAT_PATH.format(command_id=command_id)


def agent_evidence_job_result_path(job_id: str) -> str:
    return AGENT_EVIDENCE_JOB_RESULT_PATH.format(job_id=job_id)
