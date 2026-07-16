from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from copy import deepcopy
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from packages.contracts.gateway import routes
from services.mcp.internal_control.api_client import ManagementApiClient, ManagementApiError

ToolHandler = Callable[[ManagementApiClient, dict[str, Any]], Awaitable[dict[str, Any]]]

DEFAULT_LIST_CLUSTERS_LIMIT = 100
DEFAULT_LIST_RESOURCES_LIMIT = 200
DEFAULT_RECENT_INCIDENT_LIMIT = 20
DEFAULT_RELATED_LIMIT = 100
DEFAULT_EVENT_LIMIT = 50
MAX_LIST_LIMIT = 1000
MAX_QUERY_LIMIT = 200
LOG_EVIDENCE_SOURCE = "logs"
READ_ONLY_TOOL_ANNOTATIONS = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
}


class ToolInputError(ValueError):
    """The model supplied invalid tool arguments."""


@dataclass(frozen=True)
class McpTool:
    name: str
    title: str
    description: str
    input_schema: dict[str, Any]
    handler: ToolHandler

    def as_protocol_tool(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "title": self.title,
            "description": self.description,
            "inputSchema": deepcopy(self.input_schema),
            "annotations": dict(READ_ONLY_TOOL_ANNOTATIONS),
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


def _format_path(template: str, **values: str) -> str:
    escaped = {key: quote(value, safe="") for key, value in values.items()}
    return template.format(**escaped)


def _has_control_character(value: str) -> bool:
    return any(ord(character) < 32 or ord(character) == 127 for character in value)


def dumps_tool_result(result: dict[str, Any]) -> str:
    return json.dumps(result, ensure_ascii=False, sort_keys=True)
