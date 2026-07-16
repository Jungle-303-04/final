from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from copy import deepcopy
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from packages.contracts.gateway import routes
from packages.contracts.gitops import ApprovalStatus, WorkflowRunStatus
from packages.security.log_lines import REDACTED_VALUE, redact_log_line
from services.mcp.internal_control.api_client import ManagementApiClient, ManagementApiError
from services.mcp.internal_control.config import OPSIA_MCP_ENABLE_WRITES_ENV

ToolHandler = Callable[[ManagementApiClient, dict[str, Any]], Awaitable[dict[str, Any]]]

DEFAULT_LIST_CLUSTERS_LIMIT = 100
DEFAULT_LIST_RESOURCES_LIMIT = 200
DEFAULT_RECENT_INCIDENT_LIMIT = 20
DEFAULT_RELATED_LIMIT = 100
DEFAULT_EVENT_LIMIT = 50
DEFAULT_APPLICATION_LIMIT = 100
DEFAULT_RELEASE_RUN_LIMIT = 50
DEFAULT_AUDIT_TIMELINE_LIMIT = 50
MAX_PENDING_APPROVAL_APPLICATIONS = 50
MAX_LIST_LIMIT = 1000
MAX_QUERY_LIMIT = 200
MAX_WRITE_PAYLOAD_BYTES = 64 * 1024
LOG_EVIDENCE_SOURCE = "logs"
PENDING_APPROVAL_STATUS = ApprovalStatus.REQUESTED.value
WAITING_FOR_APPROVAL_STATUS = WorkflowRunStatus.WAITING_FOR_APPROVAL.value
IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"
APPLICATIONS_ENVIRONMENT_QUERY = "applications.environment"
APPLICATIONS_STATUS_QUERY = "applications.status"
APPLICATIONS_PENDING_PROMOTION_QUERY = "applications.pendingPromotion"
APPLICATIONS_SEARCH_QUERY = "applications.q"
GITOPS_APPROVAL_QUERY = "gitops.approval"
RESPONSE_RULES_KEY = "rules"
RESPONSE_RUNS_KEY = "runs"
RESPONSE_ITEMS_KEY = "items"
ALERT_RULE_ID_KEY = "rule_id"
APPLICATION_ID_KEY = "application_id"
WORKFLOW_RUN_ID_KEY = "workflow_run_id"
READ_ONLY_TOOL_ANNOTATIONS = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
}
WRITE_TOOL_ANNOTATIONS = {
    "readOnlyHint": False,
    "destructiveHint": False,
    "idempotentHint": False,
}
SENSITIVE_PROPOSAL_KEY_PARTS = frozenset(
    {
        "api_key",
        "apikey",
        "authorization",
        "cookie",
        "credential",
        "id_token",
        "password",
        "passwd",
        "private_key",
        "refresh_token",
        "secret",
        "ssh_key",
        "token",
    }
)
SENSITIVE_PROPOSAL_EXACT_KEYS = frozenset({"data", "edited_yaml", "stringdata"})
SENSITIVE_PROPOSAL_MARKER_KEYS = frozenset({"key", "name"})
SENSITIVE_PROPOSAL_MARKER_VALUE_KEYS = frozenset({"default", "literal", "value"})
DIRECT_EXECUTION_KEYS = frozenset(
    {"confirmation", "direct_execution", "direct_execution_confirmed"}
)
WRITE_METHODS = frozenset({"POST", "PATCH"})


class ToolInputError(ValueError):
    """The model supplied invalid tool arguments."""


@dataclass(frozen=True)
class McpTool:
    name: str
    title: str
    description: str
    input_schema: dict[str, Any]
    handler: ToolHandler
    annotations: dict[str, Any] | None = None

    def as_protocol_tool(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "inputSchema": deepcopy(self.input_schema),
            "annotations": dict(self.annotations or READ_ONLY_TOOL_ANNOTATIONS),
        }


class ToolRegistry:
    def __init__(self, tools: list[McpTool]) -> None:
        names = [tool.name for tool in tools]
        duplicates = sorted({name for name in names if names.count(name) > 1})
        if duplicates:
            raise ValueError(f"duplicate MCP tool names: {', '.join(duplicates)}")
        self._tools = {tool.name: tool for tool in tools}

    def list_tools(self) -> list[dict[str, Any]]:
        return [self._tools[name].as_protocol_tool() for name in sorted(self._tools)]

    async def call(
        self,
        name: str,
        arguments: dict[str, Any],
        client: ManagementApiClient,
    ) -> dict[str, Any]:
        try:
            tool = self._tools[name]
        except KeyError as exc:
            raise ToolInputError(f"unknown tool: {name}") from exc
        return await tool.handler(client, arguments)


def default_tool_registry() -> ToolRegistry:
    return ToolRegistry(
        [
            McpTool(
                name="list_clusters",
                title="List Clusters",
                description=(
                    "List clusters visible to the authenticated Opsia session by calling "
                    "the existing cluster API."
                ),
                input_schema=_schema(
                    properties={
                        "limit": _integer(
                            "Maximum number of clusters to return.",
                            minimum=1,
                            maximum=200,
                            default=DEFAULT_LIST_CLUSTERS_LIMIT,
                        ),
                    }
                ),
                handler=list_clusters,
            ),
            McpTool(
                name="get_cluster_summary",
                title="Get Cluster Summary",
                description=(
                    "Return the existing fleet drill-down summary for one authorized cluster."
                ),
                input_schema=_schema(
                    properties={
                        "cluster_id": _string("Cluster id from list_clusters.", max_length=512),
                    },
                    required=["cluster_id"],
                ),
                handler=get_cluster_summary,
            ),
            McpTool(
                name="list_resources",
                title="List Resources",
                description=(
                    "List persisted inventory resources for one authorized cluster through "
                    "the inventory API."
                ),
                input_schema=_schema(
                    properties={
                        "cluster_id": _string("Cluster id from list_clusters.", max_length=512),
                        "resource_type": _string(
                            "Optional resource type filter, for example pod, workload, service, node, namespace, or event.",
                            max_length=80,
                        ),
                        "namespace": _string("Optional Kubernetes namespace filter.", max_length=253),
                        "include_deleted": {
                            "type": "boolean",
                            "description": "Include deleted inventory rows when the API has retained them.",
                            "default": False,
                        },
                        "limit": _integer(
                            "Maximum number of resources to return.",
                            minimum=1,
                            maximum=MAX_LIST_LIMIT,
                            default=DEFAULT_LIST_RESOURCES_LIMIT,
                        ),
                    },
                    required=["cluster_id"],
                ),
                handler=list_resources,
            ),
            McpTool(
                name="get_resource_detail",
                title="Get Resource Detail",
                description=(
                    "Fetch one persisted inventory resource detail plus related resources "
                    "and Kubernetes events from the existing inventory API."
                ),
                input_schema=_schema(
                    properties={
                        "cluster_id": _string("Cluster id from list_clusters.", max_length=512),
                        "resource_type": _string("Resource type returned by list_resources.", max_length=80),
                        "kind": _string("Kubernetes kind, for example Pod or Deployment.", max_length=120),
                        "name": _string("Kubernetes resource name.", max_length=253),
                        "namespace": _string("Namespace for namespaced resources.", max_length=253),
                        "related_limit": _integer(
                            "Maximum related resources to return.",
                            minimum=1,
                            maximum=MAX_LIST_LIMIT,
                            default=DEFAULT_RELATED_LIMIT,
                        ),
                        "event_limit": _integer(
                            "Maximum related events to return.",
                            minimum=1,
                            maximum=MAX_QUERY_LIMIT,
                            default=DEFAULT_EVENT_LIMIT,
                        ),
                    },
                    required=["cluster_id", "resource_type", "kind", "name"],
                ),
                handler=get_resource_detail,
            ),
            McpTool(
                name="list_recent_incidents",
                title="List Recent Incidents",
                description=(
                    "List sanitized RCA report summaries visible to the authenticated "
                    "Opsia session."
                ),
                input_schema=_schema(
                    properties={
                        "correlation_id": _string("Optional incident correlation id.", max_length=255),
                        "since": _string("Optional ISO-8601 lower bound.", max_length=80),
                        "until": _string("Optional ISO-8601 upper bound.", max_length=80),
                        "limit": _integer(
                            "Maximum number of reports to return.",
                            minimum=1,
                            maximum=MAX_QUERY_LIMIT,
                            default=DEFAULT_RECENT_INCIDENT_LIMIT,
                        ),
                        "offset": _integer("Offset for legacy pagination.", minimum=0, maximum=10000, default=0),
                        "cursor": _string("Optional cursor returned by the API.", max_length=2048),
                    }
                ),
                handler=list_recent_incidents,
            ),
            McpTool(
                name="list_evidence_windows",
                title="List Evidence Windows",
                description=(
                    "List persisted evidence windows visible to the authenticated Opsia "
                    "session so a later get_log_evidence call can use an existing evidence_key."
                ),
                input_schema=_schema(
                    properties={
                        "limit": _integer(
                            "Maximum number of evidence windows to return.",
                            minimum=1,
                            maximum=MAX_QUERY_LIMIT,
                            default=DEFAULT_RECENT_INCIDENT_LIMIT,
                        ),
                        "offset": _integer(
                            "Offset for pagination.",
                            minimum=0,
                            maximum=10000,
                            default=0,
                        ),
                    }
                ),
                handler=list_evidence_windows,
            ),
            McpTool(
                name="get_log_evidence",
                title="Get Log Evidence",
                description=(
                    "Fetch the logs source from a persisted evidence window. The evidence_key "
                    "must come from existing Opsia evidence or RCA data."
                ),
                input_schema=_schema(
                    properties={
                        "evidence_key": _string("Persisted evidence window key.", max_length=512),
                    },
                    required=["evidence_key"],
                ),
                handler=get_log_evidence,
            ),
            McpTool(
                name="get_command_status",
                title="Get Command Status",
                description=(
                    "Fetch command status and agent result details through the existing "
                    "command status API."
                ),
                input_schema=_schema(
                    properties={
                        "command_id": _string("Existing command id.", max_length=200),
                    },
                    required=["command_id"],
                ),
                handler=get_command_status,
            ),
            McpTool(
                name="list_alert_rules",
                title="List Alert Rules",
                description=(
                    "List existing alert rules through the admin alert-rule API before "
                    "creating or updating a rule."
                ),
                input_schema=_schema(properties={}),
                handler=list_alert_rules,
            ),
            McpTool(
                name="get_alert_rule",
                title="Get Alert Rule",
                description=(
                    "Return one alert rule by filtering the existing alert-rule list API; "
                    "no direct database lookup is used."
                ),
                input_schema=_schema(
                    properties={
                        "rule_id": _string("Existing alert rule id.", max_length=120),
                    },
                    required=["rule_id"],
                ),
                handler=get_alert_rule,
            ),
            McpTool(
                name="get_recovery_plan",
                title="Get Recovery Plan",
                description=(
                    "Fetch the existing RCA recovery plan for an incident correlation id "
                    "before requesting one of its actions."
                ),
                input_schema=_schema(
                    properties={
                        "correlation_id": _string(
                            "Existing incident correlation id.",
                            max_length=2048,
                        ),
                    },
                    required=["correlation_id"],
                ),
                handler=get_recovery_plan,
            ),
            McpTool(
                name="list_applications",
                title="List Applications",
                description=(
                    "List applications visible to the authenticated Opsia session through "
                    "the product applications API."
                ),
                input_schema=_schema(
                    properties={
                        "clusters": _string("Optional comma-separated cluster filter.", max_length=2048),
                        "namespaces": _string("Optional comma-separated namespace filter.", max_length=2048),
                        "applications": _string("Optional comma-separated application filter.", max_length=2048),
                        "labels": _string("Optional comma-separated label filter.", max_length=2048),
                        "environment": _string("Optional application environment filter.", max_length=120),
                        "status": _string("Optional application status filter.", max_length=120),
                        "pending_promotion": _string(
                            "Optional pending promotion filter accepted by the Gateway.",
                            max_length=120,
                        ),
                        "query": _string("Optional application search query.", max_length=200),
                        "limit": _integer(
                            "Maximum number of applications to return.",
                            minimum=1,
                            maximum=200,
                            default=DEFAULT_APPLICATION_LIMIT,
                        ),
                    }
                ),
                handler=list_applications,
            ),
            McpTool(
                name="get_application_detail",
                title="Get Application Detail",
                description=(
                    "Fetch one application detail projection through the existing "
                    "applications API."
                ),
                input_schema=_schema(
                    properties={
                        "application_id": _string("Existing application id.", max_length=200),
                        "instance": _string("Optional application instance id.", max_length=200),
                        "workload": _string("Optional workload key within the application.", max_length=128),
                    },
                    required=["application_id"],
                ),
                handler=get_application_detail,
            ),
            McpTool(
                name="list_audit_timeline",
                title="List Audit Timeline",
                description=(
                    "List an authorized audit timeline for an existing correlation id "
                    "through the audit API."
                ),
                input_schema=_schema(
                    properties={
                        "correlation_id": _string("Existing correlation id.", max_length=2048),
                        "cursor": _string("Optional cursor returned by the audit API.", max_length=2048),
                        "limit": _integer(
                            "Maximum number of audit items to return.",
                            minimum=1,
                            maximum=MAX_QUERY_LIMIT,
                            default=DEFAULT_AUDIT_TIMELINE_LIMIT,
                        ),
                    },
                    required=["correlation_id"],
                ),
                handler=list_audit_timeline,
            ),
            McpTool(
                name="list_workflow_runs",
                title="List Workflow Runs",
                description=(
                    "List workflow-like runs from the existing application-runs API when "
                    "application_id is supplied, otherwise from release-runs."
                ),
                input_schema=_schema(
                    properties={
                        "application_id": _string(
                            "Optional application id for application workflow runs.",
                            max_length=200,
                        ),
                        "plan_id": _string("Optional release plan id for release runs.", max_length=160),
                        "status": _string("Optional release run status filter.", max_length=80),
                        "attention_only": _boolean("Only release runs needing attention.", default=False),
                        "active_only": _boolean("Only active release runs.", default=False),
                        "limit": _integer(
                            "Maximum number of runs to return.",
                            minimum=1,
                            maximum=500,
                            default=DEFAULT_RELEASE_RUN_LIMIT,
                        ),
                    }
                ),
                handler=list_workflow_runs,
            ),
            McpTool(
                name="get_workflow_run",
                title="Get Workflow Run",
                description=(
                    "Fetch a release run by id, or filter one application run from the "
                    "existing application-runs API when application_id is supplied."
                ),
                input_schema=_schema(
                    properties={
                        "run_id": _string("Existing release run id or workflow_run_id.", max_length=200),
                        "application_id": _string(
                            "Optional application id when run_id is an application workflow_run_id.",
                            max_length=200,
                        ),
                    },
                    required=["run_id"],
                ),
                handler=get_workflow_run,
            ),
            McpTool(
                name="list_pending_approvals",
                title="List Pending Approvals",
                description=(
                    "Find pending approvals from existing application workflow runs or "
                    "waiting release runs. MCP does not query approval tables directly."
                ),
                input_schema=_schema(
                    properties={
                        "application_id": _string(
                            "Optional application id to search application workflow approvals.",
                            max_length=200,
                        ),
                        "limit": _integer(
                            "Maximum number of runs to inspect.",
                            minimum=1,
                            maximum=500,
                            default=DEFAULT_RELEASE_RUN_LIMIT,
                        ),
                    }
                ),
                handler=list_pending_approvals,
            ),
            McpTool(
                name="get_resource_capabilities",
                title="Get Resource Capabilities",
                description=(
                    "Return the authorized actions currently available for one existing "
                    "inventory resource key."
                ),
                input_schema=_schema(
                    properties={
                        "resource": _string("Existing inventory resource key.", max_length=255),
                    },
                    required=["resource"],
                ),
                handler=get_resource_capabilities,
            ),
            McpTool(
                name="run_metric_query_preset",
                title="Run Metric Query Preset",
                description=(
                    "Dry-run or queue an existing metric preset through the Gateway. The "
                    "Gateway records a read-only agent debug command and returns command_id."
                ),
                input_schema=_schema(
                    properties={
                        "cluster_id": _string("Cluster id from list_clusters.", max_length=512),
                        "preset_id": _string("Existing metric query preset id.", max_length=120),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not queue the query.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the query.",
                            default=False,
                        ),
                    },
                    required=["cluster_id", "preset_id"],
                ),
                handler=run_metric_query_preset,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="create_alert_rule",
                title="Create Alert Rule",
                description=(
                    "Dry-run or submit an alert rule through the existing admin alert-rule "
                    "API. The tool does not bypass Gateway admin-session checks."
                ),
                input_schema=_schema(
                    properties={
                        "payload": _object(
                            "Existing AlertRuleCreateRequest body from the Opsia API contract."
                        ),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["payload"],
                ),
                handler=create_alert_rule,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="request_recovery_action",
                title="Request Recovery Action",
                description=(
                    "Dry-run or submit an existing RCA recovery action selection through "
                    "the Gateway. The selected plan/action must already exist."
                ),
                input_schema=_schema(
                    properties={
                        "plan_id": _string(
                            "Existing recovery plan id. Provide either plan_id or correlation_id.",
                            max_length=2048,
                        ),
                        "correlation_id": _string(
                            "Existing incident correlation id. Provide either correlation_id or plan_id.",
                            max_length=2048,
                        ),
                        "expected_plan_id": _string(
                            "Required with correlation_id so the Gateway can reject stale selections.",
                            max_length=2048,
                        ),
                        "action_id": _string(
                            "Existing recovery action candidate id from the recovery plan.",
                            max_length=2048,
                        ),
                        "reason": _string(
                            "Optional user-visible reason recorded by the existing API.",
                            max_length=500,
                        ),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["action_id"],
                ),
                handler=request_recovery_action,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="create_command_request",
                title="Create Command Request",
                description=(
                    "Dry-run or submit a manual command request through the existing command "
                    "API. MCP refuses direct-execution confirmation flags."
                ),
                input_schema=_schema(
                    properties={
                        "payload": _object(
                            "Existing CommandRequest body from the Opsia API contract."
                        ),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["payload"],
                ),
                handler=create_command_request,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="approve_or_reject_workflow",
                title="Approve Or Reject Workflow",
                description=(
                    "Dry-run or submit an approval grant/reject decision through the existing "
                    "approval API. The Gateway checks approval state and deployment access."
                ),
                input_schema=_schema(
                    properties={
                        "approval_id": _string("Existing approval id.", max_length=2048),
                        "decision": {
                            "type": "string",
                            "description": "Approval decision to send to the Gateway.",
                            "enum": ["grant", "reject"],
                        },
                        "reason": _string(
                            "Optional user-visible reason recorded with the decision.",
                            max_length=500,
                        ),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["approval_id", "decision"],
                ),
                handler=approve_or_reject_workflow,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="update_alert_rule",
                title="Update Alert Rule",
                description=(
                    "Dry-run or submit a partial alert-rule update through the existing "
                    "admin alert-rule PATCH API."
                ),
                input_schema=_schema(
                    properties={
                        "rule_id": _string("Existing alert rule id.", max_length=120),
                        "payload": _object(
                            "Existing AlertRulePatchRequest body from the Opsia API contract."
                        ),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["rule_id", "payload"],
                ),
                handler=update_alert_rule,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="disable_alert_rule",
                title="Disable Alert Rule",
                description=(
                    "Dry-run or disable an alert rule by sending enabled=false through "
                    "the existing alert-rule PATCH API."
                ),
                input_schema=_schema(
                    properties={
                        "rule_id": _string("Existing alert rule id.", max_length=120),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["rule_id"],
                ),
                handler=disable_alert_rule,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="cancel_command_request",
                title="Cancel Command Request",
                description=(
                    "Dry-run or request command cancellation through the existing command "
                    "control API with a caller-supplied idempotency key."
                ),
                input_schema=_schema(
                    properties={
                        "command_id": _string("Existing command id.", max_length=200),
                        "idempotency_key": _string(
                            "Stable key for this cancel request; Gateway uses it for idempotency.",
                            max_length=200,
                        ),
                        "reason": _string("Optional cancellation reason.", max_length=500),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["command_id", "idempotency_key"],
                ),
                handler=cancel_command_request,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="retry_command_request",
                title="Retry Command Request",
                description=(
                    "Dry-run or request command retry through the existing command "
                    "control API with a caller-supplied idempotency key."
                ),
                input_schema=_schema(
                    properties={
                        "command_id": _string("Existing command id.", max_length=200),
                        "idempotency_key": _string(
                            "Stable key for this retry request; Gateway uses it for idempotency.",
                            max_length=200,
                        ),
                        "reason": _string("Optional retry reason.", max_length=500),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["command_id", "idempotency_key"],
                ),
                handler=retry_command_request,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="ack_alert_event",
                title="Ack Alert Event",
                description=(
                    "Dry-run or acknowledge an existing alert event through the Gateway. "
                    "The alert API records actor and state."
                ),
                input_schema=_schema(
                    properties={
                        "event_id": _string("Existing alert event id.", max_length=120),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["event_id"],
                ),
                handler=ack_alert_event,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="promote_alert_incident",
                title="Promote Alert Incident",
                description=(
                    "Dry-run or promote an existing alert event to an incident through "
                    "the Gateway alert API."
                ),
                input_schema=_schema(
                    properties={
                        "event_id": _string("Existing alert event id.", max_length=120),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["event_id"],
                ),
                handler=promote_alert_incident,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="propose_manifest_change",
                title="Propose Manifest Change",
                description=(
                    "Preview a manifest edit through the existing manifest editor, or "
                    "after approval submit it only to the Safe PR workflow."
                ),
                input_schema=_schema(
                    properties={
                        "resource_id": _string("Existing inventory resource key.", max_length=255),
                        "payload": _object(
                            "Existing ResourceManifestPreviewRequest body from the Opsia API contract."
                        ),
                        "reason": _string(
                            "Required audit reason used if the proposal is submitted to Safe PR.",
                            max_length=500,
                        ),
                        "dry_run": _boolean(
                            "When true, call only the non-mutating preview API and return the Safe PR proposal.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the preview.",
                            default=False,
                        ),
                    },
                    required=["resource_id", "payload", "reason"],
                ),
                handler=propose_manifest_change,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="create_release_plan",
                title="Create Release Plan",
                description=(
                    "Dry-run or create/update a release plan through the existing release "
                    "plan API. Gateway application permissions and blockers still apply."
                ),
                input_schema=_schema(
                    properties={
                        "payload": _object(
                            "Existing ReleasePlanUpsertRequest body from the Opsia API contract."
                        ),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["payload"],
                ),
                handler=create_release_plan,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
            McpTool(
                name="start_release_run",
                title="Start Release Run",
                description=(
                    "Dry-run or start a release run through the existing release-plan "
                    "start API. Gateway blocker and approval-evidence checks still apply."
                ),
                input_schema=_schema(
                    properties={
                        "payload": _object(
                            "Existing ReleasePlanUpsertRequest body, usually with an existing plan_id."
                        ),
                        "dry_run": _boolean(
                            "When true, return only a proposal and do not call the Gateway.",
                            default=True,
                        ),
                        "approval_confirmed": _boolean(
                            "Must be true with dry_run=false after the user has approved the proposal.",
                            default=False,
                        ),
                    },
                    required=["payload"],
                ),
                handler=start_release_run,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
        ]
    )


async def list_clusters(client: ManagementApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(arguments, {"limit"})
    limit = _bounded_int(arguments, "limit", DEFAULT_LIST_CLUSTERS_LIMIT, 1, 200)
    data = await client.get_json(routes.CLUSTERS_PATH, {"limit": limit})
    return _read_result("list_clusters", routes.CLUSTERS_PATH, data)


async def get_cluster_summary(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"cluster_id"})
    cluster_id = _required_str(arguments, "cluster_id", max_length=512)
    path = _format_path(routes.CLUSTER_SUMMARY_PATH, cluster_id=cluster_id)
    data = await client.get_json(path)
    return _read_result("get_cluster_summary", path, data)


async def list_resources(client: ManagementApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    _reject_unknown(arguments, {"cluster_id", "resource_type", "namespace", "include_deleted", "limit"})
    cluster_id = _required_str(arguments, "cluster_id", max_length=512)
    path = _format_path(routes.CLUSTER_INVENTORY_RESOURCES_PATH, cluster_id=cluster_id)
    data = await client.get_json(
        path,
        {
            "resource_type": _optional_str(arguments, "resource_type", max_length=80),
            "namespace": _optional_str(arguments, "namespace", max_length=253),
            "include_deleted": _optional_bool(arguments, "include_deleted", default=False),
            "limit": _bounded_int(arguments, "limit", DEFAULT_LIST_RESOURCES_LIMIT, 1, MAX_LIST_LIMIT),
        },
    )
    return _read_result("list_resources", path, data)


async def get_resource_detail(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(
        arguments,
        {
            "cluster_id",
            "resource_type",
            "kind",
            "name",
            "namespace",
            "related_limit",
            "event_limit",
        },
    )
    cluster_id = _required_str(arguments, "cluster_id", max_length=512)
    path = _format_path(routes.CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH, cluster_id=cluster_id)
    data = await client.get_json(
        path,
        {
            "resource_type": _required_str(arguments, "resource_type", max_length=80),
            "kind": _required_str(arguments, "kind", max_length=120),
            "name": _required_str(arguments, "name", max_length=253),
            "namespace": _optional_str(arguments, "namespace", max_length=253),
            "related_limit": _bounded_int(arguments, "related_limit", DEFAULT_RELATED_LIMIT, 1, MAX_LIST_LIMIT),
            "event_limit": _bounded_int(arguments, "event_limit", DEFAULT_EVENT_LIMIT, 1, MAX_QUERY_LIMIT),
        },
    )
    return _read_result("get_resource_detail", path, data)


async def list_recent_incidents(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"correlation_id", "since", "until", "limit", "offset", "cursor"})
    data = await client.get_json(
        routes.RCA_REPORTS_PATH,
        {
            "correlation_id": _optional_str(arguments, "correlation_id", max_length=255),
            "since": _optional_str(arguments, "since", max_length=80),
            "until": _optional_str(arguments, "until", max_length=80),
            "limit": _bounded_int(arguments, "limit", DEFAULT_RECENT_INCIDENT_LIMIT, 1, MAX_QUERY_LIMIT),
            "offset": _bounded_int(arguments, "offset", 0, 0, 10000),
            "cursor": _optional_str(arguments, "cursor", max_length=2048),
        },
    )
    return _read_result("list_recent_incidents", routes.RCA_REPORTS_PATH, data)


async def list_evidence_windows(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"limit", "offset"})
    data = await client.get_json(
        routes.EVIDENCE_WINDOWS_PATH,
        {
            "limit": _bounded_int(arguments, "limit", DEFAULT_RECENT_INCIDENT_LIMIT, 1, MAX_QUERY_LIMIT),
            "offset": _bounded_int(arguments, "offset", 0, 0, 10000),
        },
    )
    return _read_result("list_evidence_windows", routes.EVIDENCE_WINDOWS_PATH, data)


async def get_log_evidence(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"evidence_key"})
    evidence_key = _required_str(arguments, "evidence_key", max_length=512)
    path = _format_path(routes.EVIDENCE_WINDOW_PATH, evidence_key=evidence_key)
    try:
        data = await client.get_json(path, {"source": LOG_EVIDENCE_SOURCE})
    except ManagementApiError as exc:
        if exc.status_code != 404:
            raise
        await client.get_json(path)
        data = {
            "evidence_key": evidence_key,
            "source": LOG_EVIDENCE_SOURCE,
            "available": False,
            "payload": None,
            "reason": "logs evidence source is not available for this evidence window",
        }
    return _read_result("get_log_evidence", path, data)


async def get_command_status(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"command_id"})
    command_id = _required_str(arguments, "command_id", max_length=200)
    path = _format_path(routes.COMMAND_STATUS_PATH, command_id=command_id)
    data = await client.get_json(path)
    return _read_result("get_command_status", path, data)


async def list_alert_rules(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, set())
    data = await client.get_json(routes.ALERT_RULES_PATH)
    return _read_result("list_alert_rules", routes.ALERT_RULES_PATH, data)


async def get_alert_rule(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"rule_id"})
    rule_id = _required_str(arguments, "rule_id", max_length=120)
    data = await client.get_json(routes.ALERT_RULES_PATH)
    rule = _find_mapping_by_key(
        _list_from_response(data, RESPONSE_RULES_KEY),
        ALERT_RULE_ID_KEY,
        rule_id,
    )
    return _read_result(
        "get_alert_rule",
        routes.ALERT_RULES_PATH,
        {
            "rule": rule,
            "available": rule is not None,
        },
    )


async def get_recovery_plan(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"correlation_id"})
    correlation_id = _required_str(arguments, "correlation_id", max_length=2048)
    path = _format_path(
        routes.RCA_RECOVERY_PLAN_BY_CORRELATION_PATH,
        correlation_id=correlation_id,
    )
    data = await client.get_json(path)
    return _read_result("get_recovery_plan", path, data)


async def list_applications(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(
        arguments,
        {
            "clusters",
            "namespaces",
            "applications",
            "labels",
            "environment",
            "status",
            "pending_promotion",
            "query",
            "limit",
        },
    )
    data = await client.get_json(
        routes.APPLICATIONS_PATH,
        {
            "clusters": _optional_str(arguments, "clusters", max_length=2048),
            "namespaces": _optional_str(arguments, "namespaces", max_length=2048),
            "applications": _optional_str(arguments, "applications", max_length=2048),
            "labels": _optional_str(arguments, "labels", max_length=2048),
            APPLICATIONS_ENVIRONMENT_QUERY: _optional_str(
                arguments,
                "environment",
                max_length=120,
            ),
            APPLICATIONS_STATUS_QUERY: _optional_str(arguments, "status", max_length=120),
            APPLICATIONS_PENDING_PROMOTION_QUERY: _optional_str(
                arguments,
                "pending_promotion",
                max_length=120,
            ),
            APPLICATIONS_SEARCH_QUERY: _optional_str(arguments, "query", max_length=200),
            "limit": _bounded_int(arguments, "limit", DEFAULT_APPLICATION_LIMIT, 1, 200),
        },
    )
    return _read_result("list_applications", routes.APPLICATIONS_PATH, data)


async def get_application_detail(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"application_id", "instance", "workload"})
    application_id = _required_str(arguments, "application_id", max_length=200)
    path = _format_path(routes.APPLICATION_PATH, application_id=application_id)
    data = await client.get_json(
        path,
        {
            "instance": _optional_str(arguments, "instance", max_length=200),
            "workload": _optional_str(arguments, "workload", max_length=128),
        },
    )
    return _read_result("get_application_detail", path, data)


async def list_audit_timeline(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"correlation_id", "cursor", "limit"})
    data = await client.get_json(
        routes.AUDIT_TIMELINE_PATH,
        {
            "correlation_id": _required_str(arguments, "correlation_id", max_length=2048),
            "cursor": _optional_str(arguments, "cursor", max_length=2048),
            "limit": _bounded_int(
                arguments,
                "limit",
                DEFAULT_AUDIT_TIMELINE_LIMIT,
                1,
                MAX_QUERY_LIMIT,
            ),
        },
    )
    return _read_result("list_audit_timeline", routes.AUDIT_TIMELINE_PATH, data)


async def list_workflow_runs(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(
        arguments,
        {"application_id", "plan_id", "status", "attention_only", "active_only", "limit"},
    )
    application_id = _optional_str(arguments, "application_id", max_length=200)
    limit = _bounded_int(arguments, "limit", DEFAULT_RELEASE_RUN_LIMIT, 1, 500)
    if application_id is not None:
        path = _format_path(routes.APPLICATION_RUNS_PATH, application_id=application_id)
        data = await client.get_json(path, {"limit": limit})
        return _read_result("list_workflow_runs", path, data)
    data = await client.get_json(
        routes.RELEASE_RUNS_PATH,
        {
            "plan_id": _optional_str(arguments, "plan_id", max_length=160),
            "status": _optional_str(arguments, "status", max_length=80),
            "attention_only": _optional_bool(arguments, "attention_only", default=False),
            "active_only": _optional_bool(arguments, "active_only", default=False),
            "limit": limit,
        },
    )
    return _read_result("list_workflow_runs", routes.RELEASE_RUNS_PATH, data)


async def get_workflow_run(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"run_id", "application_id"})
    run_id = _required_str(arguments, "run_id", max_length=200)
    application_id = _optional_str(arguments, "application_id", max_length=200)
    if application_id is not None:
        path = _format_path(routes.APPLICATION_RUNS_PATH, application_id=application_id)
        data = await client.get_json(path, {"limit": 500})
        run = _find_mapping_by_key(
            _list_from_response(data, RESPONSE_RUNS_KEY),
            WORKFLOW_RUN_ID_KEY,
            run_id,
        )
        return _read_result(
            "get_workflow_run",
            path,
            {
                "run": run,
                "available": run is not None,
            },
        )
    path = _format_path(routes.RELEASE_RUN_PATH, run_id=run_id)
    data = await client.get_json(path)
    return _read_result("get_workflow_run", path, data)


async def list_pending_approvals(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"application_id", "limit"})
    application_id = _optional_str(arguments, "application_id", max_length=200)
    limit = _bounded_int(arguments, "limit", DEFAULT_RELEASE_RUN_LIMIT, 1, 500)
    if application_id is not None:
        path = _format_path(routes.APPLICATION_RUNS_PATH, application_id=application_id)
        data = await client.get_json(path, {"limit": limit})
        runs = _pending_runs(_list_from_response(data, RESPONSE_RUNS_KEY))
        return _read_result(
            "list_pending_approvals",
            path,
            {
                "source": "application_runs",
                "runs": runs,
                "pending_count": len(runs),
            },
        )

    gitops_data = await client.get_json(
        routes.GITOPS_FILTER_RESULTS_PATH,
        {
            GITOPS_APPROVAL_QUERY: PENDING_APPROVAL_STATUS,
            "limit": min(limit, MAX_QUERY_LIMIT),
        },
    )
    gitops_items = _list_from_response(gitops_data, RESPONSE_ITEMS_KEY)
    application_runs: list[dict[str, Any]] = []
    for pending_application_id in _unique_strings(
        item.get(APPLICATION_ID_KEY) for item in gitops_items
    )[:MAX_PENDING_APPROVAL_APPLICATIONS]:
        path = _format_path(
            routes.APPLICATION_RUNS_PATH,
            application_id=pending_application_id,
        )
        run_data = await client.get_json(path, {"limit": limit})
        application_runs.extend(_pending_runs(_list_from_response(run_data, RESPONSE_RUNS_KEY)))

    release_data = await client.get_json(
        routes.RELEASE_RUNS_PATH,
        {
            "status": WAITING_FOR_APPROVAL_STATUS,
            "limit": min(limit, MAX_QUERY_LIMIT),
        },
    )
    release_runs = _pending_runs(_list_from_response(release_data, RESPONSE_RUNS_KEY))
    return _read_result(
        "list_pending_approvals",
        routes.GITOPS_FILTER_RESULTS_PATH,
        {
            "source": "gitops_filter_application_runs_release_runs",
            "gitops_changes": gitops_items,
            "application_runs": application_runs,
            "release_runs": release_runs,
            "pending_count": len(application_runs) + len(release_runs),
            "gitops_pending_count": len(gitops_items),
            "application_scan_truncated": len(
                _unique_strings(item.get(APPLICATION_ID_KEY) for item in gitops_items)
            )
            > MAX_PENDING_APPROVAL_APPLICATIONS,
        },
    )


async def get_resource_capabilities(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"resource"})
    data = await client.get_json(
        routes.RESOURCE_CAPABILITIES_PATH,
        {
            "resource": _required_str(arguments, "resource", max_length=255),
        },
    )
    return _read_result("get_resource_capabilities", routes.RESOURCE_CAPABILITIES_PATH, data)


async def run_metric_query_preset(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"cluster_id", "preset_id", "dry_run", "approval_confirmed"})
    cluster_id = _required_str(arguments, "cluster_id", max_length=512)
    preset_id = _required_str(arguments, "preset_id", max_length=120)
    path = _format_path(
        routes.CLUSTER_METRIC_QUERY_PRESET_RUN_PATH,
        cluster_id=cluster_id,
        preset_id=preset_id,
    )
    return await _post_or_propose(
        client,
        arguments,
        tool_name="run_metric_query_preset",
        api_path=path,
        payload={},
        operation_keys=("command_id", "correlation_id"),
        reason=(
            "Running a metric preset is cluster-read-only, but the existing Gateway "
            "queues an agent debug command and records command status. MCP therefore "
            "defaults to dry_run and requires approval_confirmed=true before it queues "
            "the request. The Gateway verifies preset existence and evidence access."
        ),
    )


async def create_alert_rule(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"payload", "dry_run", "approval_confirmed"})
    payload = _required_object(arguments, "payload")
    return await _post_or_propose(
        client,
        arguments,
        tool_name="create_alert_rule",
        api_path=routes.ALERT_RULES_PATH,
        payload=payload,
        operation_keys=("rule_id",),
        reason=(
            "Alert rule creation is a persistent admin operation, so MCP defaults to "
            "dry_run and requires approval_confirmed=true before it submits the "
            "existing alert-rule POST. Gateway admin-session checks still decide "
            "whether the request is allowed."
        ),
    )


async def request_recovery_action(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(
        arguments,
        {
            "plan_id",
            "correlation_id",
            "expected_plan_id",
            "action_id",
            "reason",
            "dry_run",
            "approval_confirmed",
        },
    )
    plan_id = _optional_str(arguments, "plan_id", max_length=2048)
    correlation_id = _optional_str(arguments, "correlation_id", max_length=2048)
    if (plan_id is None) == (correlation_id is None):
        raise ToolInputError("provide exactly one of plan_id or correlation_id")
    action_id = _required_str(arguments, "action_id", max_length=2048)
    reason = _optional_str(arguments, "reason", max_length=500)
    if plan_id is not None:
        api_path = _format_path(
            routes.RCA_RECOVERY_ACTION_SELECT_PATH,
            plan_id=plan_id,
            action_id=action_id,
        )
        payload: dict[str, Any] = {}
    else:
        expected_plan_id = _required_str(arguments, "expected_plan_id", max_length=2048)
        api_path = _format_path(
            routes.RCA_RECOVERY_ACTION_SELECT_BY_CORRELATION_PATH,
            correlation_id=correlation_id or "",
        )
        payload = {
            "expected_plan_id": expected_plan_id,
            "action_id": action_id,
        }
    if reason is not None:
        payload["reason"] = reason
    return await _post_or_propose(
        client,
        arguments,
        tool_name="request_recovery_action",
        api_path=api_path,
        payload=payload,
        operation_keys=("event_id", "correlation_id", "command_id"),
        reason=(
            "Recovery action selection can trigger follow-up workflow events, so MCP "
            "defaults to dry_run and requires approval_confirmed=true before it "
            "submits the existing RCA selection POST. The Gateway verifies that the "
            "plan and action already exist for the authenticated workspace."
        ),
    )


async def create_command_request(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"payload", "dry_run", "approval_confirmed"})
    payload = _required_object(arguments, "payload")
    _reject_direct_execution_flags(payload)
    return await _post_or_propose(
        client,
        arguments,
        tool_name="create_command_request",
        api_path=routes.COMMANDS_PATH,
        payload=payload,
        operation_keys=("command_id", "event_id", "correlation_id", "audit_event_id"),
        reason=(
            "Command requests can affect clusters, so MCP defaults to dry_run, "
            "requires approval_confirmed=true for submission, and refuses direct "
            "execution confirmation flags. The existing command API still performs "
            "RBAC, cluster-scope, diff, audit, and policy validation."
        ),
    )


async def approve_or_reject_workflow(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(
        arguments,
        {"approval_id", "decision", "reason", "dry_run", "approval_confirmed"},
    )
    approval_id = _required_str(arguments, "approval_id", max_length=2048)
    decision = _required_str(arguments, "decision", max_length=20)
    if decision not in {"grant", "reject"}:
        raise ToolInputError("decision must be grant or reject")
    template = (
        routes.APPROVAL_GRANT_PATH if decision == "grant" else routes.APPROVAL_REJECT_PATH
    )
    api_path = _format_path(template, approval_id=approval_id)
    payload: dict[str, Any] = {}
    reason = _optional_str(arguments, "reason", max_length=500)
    if reason is not None:
        payload["reason"] = reason
    return await _post_or_propose(
        client,
        arguments,
        tool_name="approve_or_reject_workflow",
        api_path=api_path,
        payload=payload,
        operation_keys=("event_id", "correlation_id", "command_id"),
        reason=(
            "Approval decisions can unblock or stop workflows, so MCP defaults to "
            "dry_run and requires approval_confirmed=true before it submits the "
            "existing approval decision POST. The Gateway checks that the approval "
            "is open and that the authenticated user has deployment access."
        ),
    )


async def update_alert_rule(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"rule_id", "payload", "dry_run", "approval_confirmed"})
    rule_id = _required_str(arguments, "rule_id", max_length=120)
    payload = _required_object(arguments, "payload")
    path = _format_path(routes.ALERT_RULE_PATH, rule_id=rule_id)
    return await _post_or_propose(
        client,
        arguments,
        tool_name="update_alert_rule",
        api_path=path,
        payload=payload,
        operation_keys=("rule_id",),
        reason=(
            "Alert rule updates persist operational policy, so MCP defaults to dry_run "
            "and requires approval_confirmed=true before it submits the existing "
            "alert-rule PATCH. Gateway admin-session and request-model validation "
            "remain authoritative."
        ),
        method="PATCH",
    )


async def disable_alert_rule(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"rule_id", "dry_run", "approval_confirmed"})
    rule_id = _required_str(arguments, "rule_id", max_length=120)
    path = _format_path(routes.ALERT_RULE_PATH, rule_id=rule_id)
    return await _post_or_propose(
        client,
        arguments,
        tool_name="disable_alert_rule",
        api_path=path,
        payload={"enabled": False},
        operation_keys=("rule_id",),
        reason=(
            "Disabling an alert rule is implemented as the existing alert-rule PATCH "
            "with enabled=false, not as deletion. MCP defaults to dry_run and requires "
            "approval_confirmed=true before submission; Gateway admin-session checks "
            "still decide whether the request is allowed."
        ),
        method="PATCH",
    )


async def cancel_command_request(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    return await _command_control_request(
        client,
        arguments,
        tool_name="cancel_command_request",
        route_template=routes.COMMAND_CANCEL_PATH,
        action_label="cancel",
    )


async def retry_command_request(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    return await _command_control_request(
        client,
        arguments,
        tool_name="retry_command_request",
        route_template=routes.COMMAND_RETRY_PATH,
        action_label="retry",
    )


async def _command_control_request(
    client: ManagementApiClient,
    arguments: dict[str, Any],
    *,
    tool_name: str,
    route_template: str,
    action_label: str,
) -> dict[str, Any]:
    _reject_unknown(
        arguments,
        {"command_id", "idempotency_key", "reason", "dry_run", "approval_confirmed"},
    )
    command_id = _required_str(arguments, "command_id", max_length=200)
    idempotency_key = _idempotency_key(arguments)
    reason = _optional_str(arguments, "reason", max_length=500)
    payload: dict[str, Any] = {}
    if reason is not None:
        payload["reason"] = reason
    path = _format_path(route_template, command_id=command_id)
    return await _post_or_propose(
        client,
        arguments,
        tool_name=tool_name,
        api_path=path,
        payload=payload,
        operation_keys=(
            "command_id",
            "event_id",
            "audit_event_id",
            "correlation_id",
            "attempt_id",
        ),
        reason=(
            f"Command {action_label} changes command lifecycle state, so MCP defaults "
            "to dry_run, requires approval_confirmed=true before submission, and "
            "sends the caller-supplied Idempotency-Key to the existing command control "
            "API. The Gateway re-checks deployment access, command state, and agent "
            "capabilities."
        ),
        headers={IDEMPOTENCY_KEY_HEADER: idempotency_key},
    )


async def ack_alert_event(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"event_id", "dry_run", "approval_confirmed"})
    event_id = _required_str(arguments, "event_id", max_length=120)
    path = _format_path(routes.ALERT_EVENT_ACK_PATH, event_id=event_id)
    return await _post_or_propose(
        client,
        arguments,
        tool_name="ack_alert_event",
        api_path=path,
        payload={},
        operation_keys=("event_id", "incident_id"),
        reason=(
            "Acknowledging an alert event changes alert lifecycle state, so MCP "
            "defaults to dry_run and requires approval_confirmed=true before it "
            "submits the existing alert-event ack POST. The Gateway records the "
            "authenticated actor and rejects invalid state transitions."
        ),
    )


async def promote_alert_incident(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"event_id", "dry_run", "approval_confirmed"})
    event_id = _required_str(arguments, "event_id", max_length=120)
    path = _format_path(routes.ALERT_EVENT_PROMOTE_INCIDENT_PATH, event_id=event_id)
    return await _post_or_propose(
        client,
        arguments,
        tool_name="promote_alert_incident",
        api_path=path,
        payload={},
        operation_keys=("incident_id", "event_id", "correlation_id"),
        reason=(
            "Promoting an alert event creates an incident linkage through the existing "
            "alert API, so MCP defaults to dry_run and requires approval_confirmed=true "
            "before submission. The Gateway checks event existence and records the "
            "authenticated actor."
        ),
    )


async def propose_manifest_change(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(
        arguments,
        {"resource_id", "payload", "reason", "dry_run", "approval_confirmed"},
    )
    resource_id = _required_str(arguments, "resource_id", max_length=255)
    payload = _required_object(arguments, "payload")
    reason_text = _required_str(arguments, "reason", max_length=500)
    if len(reason_text) < 3:
        raise ToolInputError("reason must be at least 3 characters")
    preview_path = _format_path(routes.RESOURCE_MANIFEST_PREVIEW_PATH, resource_id=resource_id)
    approve_path = _format_path(routes.RESOURCE_MANIFEST_APPROVE_PATH, resource_id=resource_id)
    approve_payload = {**payload, "confirmed": True, "reason": reason_text}
    _validate_json_payload(approve_payload, "payload")
    proposal = _write_proposal("POST", approve_path, approve_payload)
    dry_run = _optional_bool(arguments, "dry_run", default=True)
    if dry_run:
        preview = _redact_manifest_preview_data(await client.post_json(preview_path, payload))
        return {
            "tool": "propose_manifest_change",
            "data": preview,
            "safety": {
                "mutating": False,
                "dry_run": True,
                "proposal": proposal,
                "approval_required": True,
                "operation_id": None,
                "api_path": preview_path,
                "reason": (
                    "The dry run calls only the existing manifest preview API to obtain "
                    "Gateway validation and diff data. Submitting the same approved "
                    "change would call the Safe PR approve API, which creates a PR "
                    "workflow rather than applying directly to the cluster."
                ),
            },
        }
    if not _optional_bool(arguments, "approval_confirmed", default=False):
        raise ToolInputError("approval_confirmed must be true when dry_run is false")
    if not client.settings.writes_enabled:
        raise ToolInputError(
            f"{OPSIA_MCP_ENABLE_WRITES_ENV}=true is required before MCP write tools can submit"
        )
    data = await client.post_json(approve_path, approve_payload)
    return {
        "tool": "propose_manifest_change",
        "data": data,
        "safety": {
            "mutating": True,
            "dry_run": False,
            "proposal": proposal,
            "approval_required": False,
            "operation_id": _operation_id_from_response(
                data,
                ("event_id", "correlation_id", "workflow_run_id", "approval_id"),
            ),
            "api_path": approve_path,
            "reason": (
                "The approved submission uses the existing manifest approve API. That "
                "API emits a Safe PR workflow and does not apply the manifest directly "
                "to the cluster."
            ),
        },
    }


async def create_release_plan(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"payload", "dry_run", "approval_confirmed"})
    payload = _required_object(arguments, "payload")
    return await _post_or_propose(
        client,
        arguments,
        tool_name="create_release_plan",
        api_path=routes.RELEASE_PLANS_PATH,
        payload=payload,
        operation_keys=("plan_id", "plan.plan_id"),
        reason=(
            "Release plan creation is persistent deployment configuration, so MCP "
            "defaults to dry_run and requires approval_confirmed=true before it "
            "submits the existing release-plan POST. Gateway application manage "
            "permissions and plan validation remain authoritative."
        ),
    )


async def start_release_run(
    client: ManagementApiClient, arguments: dict[str, Any]
) -> dict[str, Any]:
    _reject_unknown(arguments, {"payload", "dry_run", "approval_confirmed"})
    payload = _required_object(arguments, "payload")
    return await _post_or_propose(
        client,
        arguments,
        tool_name="start_release_run",
        api_path=routes.RELEASE_PLAN_START_PATH,
        payload=payload,
        operation_keys=("run_id", "run.run_id"),
        reason=(
            "Starting a release can dispatch deployment work, so MCP defaults to "
            "dry_run and requires approval_confirmed=true before it submits the "
            "existing release-plan start POST. Gateway blocker checks, application "
            "permissions, and production approval-evidence checks still apply."
        ),
    )


def _read_result(tool_name: str, api_path: str, data: Any) -> dict[str, Any]:
    return {
        "tool": tool_name,
        "data": data,
        "safety": {
            "mutating": False,
            "dry_run": None,
            "proposal": None,
            "approval_required": False,
            "operation_id": None,
            "api_path": api_path,
            "reason": (
                "This read-only MCP tool only issues an authenticated GET request to the "
                "existing Opsia API Gateway. There is no mutation to preview, approve, "
                "or track as an operation."
            ),
        },
    }


async def _post_or_propose(
    client: ManagementApiClient,
    arguments: dict[str, Any],
    *,
    tool_name: str,
    api_path: str,
    payload: dict[str, Any],
    operation_keys: tuple[str, ...],
    reason: str,
    method: str = "POST",
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    if method not in WRITE_METHODS:
        raise ToolInputError(f"unsupported MCP write method: {method}")
    _validate_json_payload(payload, "payload")
    dry_run = _optional_bool(arguments, "dry_run", default=True)
    approval_confirmed = _optional_bool(arguments, "approval_confirmed", default=False)
    proposal = _write_proposal(method, api_path, payload, headers=headers)
    if dry_run:
        return {
            "tool": tool_name,
            "data": None,
            "safety": {
                "mutating": False,
                "dry_run": True,
                "proposal": proposal,
                "approval_required": True,
                "operation_id": None,
                "api_path": api_path,
                "reason": reason,
            },
        }
    if not approval_confirmed:
        raise ToolInputError("approval_confirmed must be true when dry_run is false")
    if not client.settings.writes_enabled:
        raise ToolInputError(
            f"{OPSIA_MCP_ENABLE_WRITES_ENV}=true is required before MCP write tools can submit"
        )
    if method == "POST":
        data = await client.post_json(api_path, payload, headers=headers)
    else:
        data = await client.patch_json(api_path, payload, headers=headers)
    return {
        "tool": tool_name,
        "data": data,
        "safety": {
            "mutating": True,
            "dry_run": False,
            "proposal": proposal,
            "approval_required": False,
            "operation_id": _operation_id_from_response(
                data,
                operation_keys,
            ),
            "api_path": api_path,
            "reason": reason,
        },
    }


def _write_proposal(
    method: str,
    api_path: str,
    payload: dict[str, Any],
    *,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    redacted_body = _redact_proposal_value(payload)
    proposal: dict[str, Any] = {
        "method": method,
        "api_path": api_path,
        "body": redacted_body,
        "body_redacted": redacted_body != payload,
        "uses_existing_gateway_api": True,
    }
    if headers:
        proposal["headers"] = _redact_proposal_headers(headers)
    return proposal


def _redact_proposal_headers(headers: dict[str, str]) -> dict[str, str]:
    return {key: REDACTED_VALUE for key in headers}


def _redact_manifest_preview_data(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    redacted = deepcopy(data)
    if isinstance(redacted.get("diff"), str) and redacted["diff"]:
        redacted["diff"] = REDACTED_VALUE
        redacted["diff_redacted"] = True
    return _redact_response_strings(redacted)


def _redact_response_strings(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _redact_response_strings(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_redact_response_strings(item) for item in value]
    if isinstance(value, str):
        return redact_log_line(value)
    return deepcopy(value)


def _operation_id_from_response(
    data: Any,
    keys: tuple[str, ...],
) -> str | None:
    if isinstance(data, dict):
        for key in keys:
            value = _response_value(data, key)
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
    return None


def _response_value(data: dict[str, Any], key: str) -> Any:
    current: Any = data
    for part in key.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _list_from_response(data: Any, key: str) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        return []
    values = data.get(key)
    if not isinstance(values, list):
        return []
    return [dict(item) for item in values if isinstance(item, dict)]


def _find_mapping_by_key(
    values: list[dict[str, Any]],
    key: str,
    expected: str,
) -> dict[str, Any] | None:
    for value in values:
        if str(value.get(key) or "") == expected:
            return value
    return None


def _unique_strings(values: Any) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        unique.append(text)
        seen.add(text)
    return unique


def _pending_runs(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [value for value in values if _has_pending_approval(value)]


def _has_pending_approval(value: dict[str, Any]) -> bool:
    if str(value.get("approval_status") or "") == PENDING_APPROVAL_STATUS:
        return True
    if str(value.get("status") or value.get("derived_status") or "") == WAITING_FOR_APPROVAL_STATUS:
        return True
    approvals = value.get("approvals")
    if isinstance(approvals, list) and any(
        isinstance(item, dict) and str(item.get("status") or "") == PENDING_APPROVAL_STATUS
        for item in approvals
    ):
        return True
    steps = value.get("steps")
    return isinstance(steps, list) and any(
        isinstance(item, dict) and str(item.get("status") or "") == WAITING_FOR_APPROVAL_STATUS
        for item in steps
    )


def _idempotency_key(arguments: dict[str, Any]) -> str:
    value = _required_str(arguments, "idempotency_key", max_length=200)
    if len(value) < 8:
        raise ToolInputError("idempotency_key must be at least 8 characters")
    return value


def _redact_proposal_value(value: Any) -> Any:
    if isinstance(value, dict):
        has_sensitive_marker = _has_sensitive_proposal_marker(value)
        redacted: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            if _is_sensitive_proposal_key(key_text) or (
                has_sensitive_marker and _is_sensitive_marker_value_key(key_text)
            ):
                redacted[key_text] = REDACTED_VALUE
            else:
                redacted[key_text] = _redact_proposal_value(item)
        return redacted
    if isinstance(value, list):
        return [_redact_proposal_value(item) for item in value]
    if isinstance(value, str):
        return redact_log_line(value)
    return deepcopy(value)


def _is_sensitive_proposal_key(key: str) -> bool:
    normalized = _normalized_proposal_identifier(key)
    if normalized in SENSITIVE_PROPOSAL_EXACT_KEYS:
        return True
    return _contains_sensitive_proposal_part(normalized)


def _has_sensitive_proposal_marker(value: dict[Any, Any]) -> bool:
    for key, item in value.items():
        if (
            _normalized_proposal_identifier(str(key)) in SENSITIVE_PROPOSAL_MARKER_KEYS
            and isinstance(item, str)
            and _contains_sensitive_proposal_part(_normalized_proposal_identifier(item))
        ):
            return True
    return False


def _is_sensitive_marker_value_key(key: str) -> bool:
    return _normalized_proposal_identifier(key) in SENSITIVE_PROPOSAL_MARKER_VALUE_KEYS


def _contains_sensitive_proposal_part(value: str) -> bool:
    compact = value.replace("_", "")
    return any(
        part in value or part.replace("_", "") in compact
        for part in SENSITIVE_PROPOSAL_KEY_PARTS
    )


def _normalized_proposal_identifier(value: str) -> str:
    return value.casefold().replace("-", "_").replace(".", "_").replace(" ", "_")


def _schema(
    *,
    properties: dict[str, Any],
    required: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required or [],
        "additionalProperties": False,
    }


def _string(description: str, *, max_length: int, default: str | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "type": "string",
        "description": description,
        "minLength": 1,
        "maxLength": max_length,
    }
    if default is not None:
        schema["default"] = default
    return schema


def _object(description: str) -> dict[str, Any]:
    return {
        "type": "object",
        "description": description,
        "additionalProperties": True,
    }


def _boolean(description: str, *, default: bool) -> dict[str, Any]:
    return {
        "type": "boolean",
        "description": description,
        "default": default,
    }


def _integer(
    description: str,
    *,
    minimum: int,
    maximum: int,
    default: int,
) -> dict[str, Any]:
    return {
        "type": "integer",
        "description": description,
        "minimum": minimum,
        "maximum": maximum,
        "default": default,
    }


def _reject_unknown(arguments: dict[str, Any], allowed: set[str]) -> None:
    unknown = sorted(set(arguments) - allowed)
    if unknown:
        raise ToolInputError(f"unknown arguments: {', '.join(unknown)}")


def _required_str(arguments: dict[str, Any], name: str, *, max_length: int) -> str:
    value = _optional_str(arguments, name, max_length=max_length)
    if value is None:
        raise ToolInputError(f"{name} is required")
    return value


def _required_object(arguments: dict[str, Any], name: str) -> dict[str, Any]:
    value = arguments.get(name)
    if not isinstance(value, dict):
        raise ToolInputError(f"{name} must be an object")
    return _validate_json_payload(value, name)


def _optional_str(arguments: dict[str, Any], name: str, *, max_length: int) -> str | None:
    value = arguments.get(name)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolInputError(f"{name} must be a string")
    text = value.strip()
    if not text:
        return None
    if _has_control_character(text):
        raise ToolInputError(f"{name} contains unsafe control characters")
    if len(text) > max_length:
        raise ToolInputError(f"{name} must be at most {max_length} characters")
    return text


def _bounded_int(
    arguments: dict[str, Any],
    name: str,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    value = arguments.get(name, default)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ToolInputError(f"{name} must be an integer")
    if value < minimum or value > maximum:
        raise ToolInputError(f"{name} must be between {minimum} and {maximum}")
    return value


def _optional_bool(arguments: dict[str, Any], name: str, *, default: bool) -> bool:
    value = arguments.get(name, default)
    if not isinstance(value, bool):
        raise ToolInputError(f"{name} must be a boolean")
    return value


def _validate_json_payload(value: dict[str, Any], name: str) -> dict[str, Any]:
    try:
        encoded = json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{name} must be a finite JSON object") from exc
    if len(encoded) > MAX_WRITE_PAYLOAD_BYTES:
        raise ToolInputError(
            f"{name} must be at most {MAX_WRITE_PAYLOAD_BYTES} bytes when encoded as JSON"
        )
    return deepcopy(value)


def _reject_direct_execution_flags(payload: dict[str, Any]) -> None:
    if DIRECT_EXECUTION_KEYS.intersection(payload):
        raise ToolInputError(
            "create_command_request cannot set direct execution confirmation flags"
        )


def _format_path(template: str, **values: str) -> str:
    escaped = {key: quote(value, safe="") for key, value in values.items()}
    return template.format(**escaped)


def _has_control_character(value: str) -> bool:
    return any(ord(character) < 32 or ord(character) == 127 for character in value)


def dumps_tool_result(result: dict[str, Any]) -> str:
    return json.dumps(result, ensure_ascii=False, sort_keys=True)
