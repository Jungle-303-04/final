from __future__ import annotations

HEALTHZ_PATH = "/healthz"
READYZ_PATH = "/readyz"
AUTH_SESSION_PATH = "/auth/session"
AUTH_SIGNUP_PATH = "/auth/signup"
AUTH_LOGIN_PATH = "/auth/login"
AUTH_LOGOUT_PATH = "/auth/logout"
AUTH_VERIFY_EMAIL_PATH = "/auth/verify-email"
AUTH_RESEND_VERIFICATION_PATH = "/auth/resend-verification"
AUTH_APPROVE_USER_PATH = "/auth/users/{user_id}/approve"
GITHUB_WEBHOOK_PATH = "/github/webhook"
AGENT_CONNECT_PATH = "/agent/connect"
AGENT_EVIDENCE_PATH = "/agent/evidence"
TARGETS_PATH = "/targets"
COMMANDS_PATH = "/commands"
APPROVAL_GRANT_PATH = "/approvals/{approval_id}/grant"
APPROVAL_REJECT_PATH = "/approvals/{approval_id}/reject"
DEAD_LETTERS_PATH = "/dead-letters"
DEAD_LETTER_REPLAY_PATH = "/dead-letters/{dead_letter_id}/replay"
AI_CONVERSATIONS_PATH = "/ai/conversations"
AI_CONVERSATION_PATH = "/ai/conversations/{conversation_id}"
AI_CONVERSATION_MESSAGES_PATH = "/ai/conversations/{conversation_id}/messages"
APPLICATIONS_PATH = "/applications"
APPLICATION_PATH = "/applications/{application_id}"
APPLICATION_DEPLOYMENTS_PATH = "/applications/{application_id}/deployments"
APPLICATION_RUNS_PATH = "/applications/{application_id}/runs"
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
CLUSTER_PATH = "/clusters/{cluster_id}"
CLUSTER_CONNECTION_STATUS_PATH = "/clusters/{cluster_id}/connection-status"
CLUSTER_INVENTORY_RESOURCES_PATH = "/clusters/{cluster_id}/inventory/resources"
CLUSTER_INVENTORY_SUMMARY_PATH = "/clusters/{cluster_id}/inventory/summary"
CLUSTER_INVENTORY_WORKLOADS_PATH = "/clusters/{cluster_id}/inventory/workloads"
CLUSTER_INVENTORY_SERVICES_PATH = "/clusters/{cluster_id}/inventory/services"
CLUSTER_INVENTORY_EVENTS_PATH = "/clusters/{cluster_id}/inventory/events"
CLUSTER_DEPLOYMENT_SCALE_PATH = (
    "/clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/scale"
)
CLUSTER_DEPLOYMENT_RESTART_PATH = (
    "/clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/restart"
)
CLUSTER_POLICY_PATH = "/clusters/{cluster_id}/policy"
PROVIDERS_CATALOG_PATH = "/providers/catalog"
PROVIDERS_VALIDATE_PATH = "/providers/validate"
DASHBOARD_RCA_TIMELINE_PATH = "/dashboard/rca/timeline"
DASHBOARD_RCA_INCIDENT_PATH = "/dashboard/rca/incidents/{incident_id}"


def agent_command_result_path(command_id: str) -> str:
    return AGENT_COMMAND_RESULT_PATH.format(command_id=command_id)


def agent_command_start_path(command_id: str) -> str:
    return AGENT_COMMAND_START_PATH.format(command_id=command_id)


def agent_command_heartbeat_path(command_id: str) -> str:
    return AGENT_COMMAND_HEARTBEAT_PATH.format(command_id=command_id)


def agent_evidence_job_result_path(job_id: str) -> str:
    return AGENT_EVIDENCE_JOB_RESULT_PATH.format(job_id=job_id)


def dashboard_rca_incident_path(incident_id: str) -> str:
    return DASHBOARD_RCA_INCIDENT_PATH.format(incident_id=incident_id)
