from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from copy import deepcopy
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from packages.contracts.gateway import routes
from packages.security.log_lines import REDACTED_VALUE, redact_log_line
from services.mcp.internal_control.api_client import ManagementApiClient, ManagementApiError
from services.mcp.internal_control.config import OPSIA_MCP_ENABLE_WRITES_ENV

ToolHandler = Callable[[ManagementApiClient, dict[str, Any]], Awaitable[dict[str, Any]]]

DEFAULT_LIST_CLUSTERS_LIMIT = 100
DEFAULT_LIST_RESOURCES_LIMIT = 200
DEFAULT_RECENT_INCIDENT_LIMIT = 20
DEFAULT_RELATED_LIMIT = 100
DEFAULT_EVENT_LIMIT = 50
MAX_LIST_LIMIT = 1000
MAX_QUERY_LIMIT = 200
MAX_WRITE_PAYLOAD_BYTES = 64 * 1024
LOG_EVIDENCE_SOURCE = "logs"
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
WRITE_HTTP_METHOD = "POST"
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
SENSITIVE_PROPOSAL_EXACT_KEYS = frozenset({"data", "stringdata"})
SENSITIVE_PROPOSAL_MARKER_KEYS = frozenset({"key", "name"})
SENSITIVE_PROPOSAL_MARKER_VALUE_KEYS = frozenset({"default", "literal", "value"})
DIRECT_EXECUTION_KEYS = frozenset(
    {"confirmation", "direct_execution", "direct_execution_confirmed"}
)


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
) -> dict[str, Any]:
    _validate_json_payload(payload, "payload")
    dry_run = _optional_bool(arguments, "dry_run", default=True)
    approval_confirmed = _optional_bool(arguments, "approval_confirmed", default=False)
    proposal = _write_proposal(api_path, payload)
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
    data = await client.post_json(api_path, payload)
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


def _write_proposal(api_path: str, payload: dict[str, Any]) -> dict[str, Any]:
    redacted_body = _redact_proposal_value(payload)
    return {
        "method": WRITE_HTTP_METHOD,
        "api_path": api_path,
        "body": redacted_body,
        "body_redacted": redacted_body != payload,
        "uses_existing_gateway_api": True,
    }


def _operation_id_from_response(
    data: Any,
    keys: tuple[str, ...],
) -> str | None:
    if isinstance(data, dict):
        for key in keys:
            value = data.get(key)
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
    return None


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
