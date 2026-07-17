from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx

from packages.contracts.gateway import evidence as gateway_evidence
from packages.contracts.gateway import limits as gateway_limits
from packages.contracts.gateway import params as gateway_params
from packages.contracts.gateway import routes
from packages.security.trusted_proxy import TRUSTED_PROXY_AUTH_SECRET_ENV
from services.mcp.internal_control import tools as mcp_tools
from services.mcp.internal_control.api_client import ManagementApiClient, ManagementApiError
from services.mcp.internal_control.config import (
    MANAGEMENT_BASE_URL_ENV,
    OPSIA_MCP_ALLOW_INSECURE_HTTP_ENV,
    OPSIA_MCP_API_BASE_URL_ENV,
    OPSIA_MCP_BEARER_TOKEN_ENV,
    OPSIA_MCP_COOKIE_ENV,
    OPSIA_MCP_ENABLE_WRITES_ENV,
    OPSIA_MCP_MAX_RESPONSE_BYTES_ENV,
    OPSIA_MCP_SESSION_COOKIE_ENV,
    OPSIA_MCP_SESSION_COOKIE_NAME_ENV,
    OPSIA_MCP_TIMEOUT_SECONDS_ENV,
    OPSIA_MCP_TRUSTED_PROXY_SECRET_ENV,
    McpConfigurationError,
    McpSettings,
    load_settings,
)
from services.mcp.internal_control.server import InternalControlMcpServer
from services.mcp.internal_control.tools import default_tool_registry

MCP_ENV_NAMES = (
    OPSIA_MCP_API_BASE_URL_ENV,
    OPSIA_MCP_BEARER_TOKEN_ENV,
    OPSIA_MCP_COOKIE_ENV,
    OPSIA_MCP_ENABLE_WRITES_ENV,
    OPSIA_MCP_ALLOW_INSECURE_HTTP_ENV,
    OPSIA_MCP_SESSION_COOKIE_ENV,
    OPSIA_MCP_SESSION_COOKIE_NAME_ENV,
    OPSIA_MCP_TRUSTED_PROXY_SECRET_ENV,
    OPSIA_MCP_TIMEOUT_SECONDS_ENV,
    OPSIA_MCP_MAX_RESPONSE_BYTES_ENV,
    MANAGEMENT_BASE_URL_ENV,
    TRUSTED_PROXY_AUTH_SECRET_ENV,
)


def test_mcp_read_tool_bounds_use_gateway_contract_limits() -> None:
    assert mcp_tools.DEFAULT_LIST_CLUSTERS_LIMIT == gateway_limits.CLUSTER_LIST_DEFAULT_LIMIT
    assert mcp_tools.MAX_LIST_CLUSTERS_LIMIT == gateway_limits.CLUSTER_LIST_MAX_LIMIT
    assert mcp_tools.DEFAULT_LIST_RESOURCES_LIMIT == gateway_limits.INVENTORY_RESOURCE_DEFAULT_LIMIT
    assert mcp_tools.MAX_LIST_RESOURCES_LIMIT == gateway_limits.INVENTORY_RESOURCE_MAX_LIMIT
    assert mcp_tools.DEFAULT_RELATED_LIMIT == gateway_limits.INVENTORY_RELATED_DEFAULT_LIMIT
    assert mcp_tools.MAX_RELATED_LIMIT == gateway_limits.INVENTORY_RELATED_MAX_LIMIT
    assert mcp_tools.DEFAULT_EVENT_LIMIT == gateway_limits.INVENTORY_EVENT_DEFAULT_LIMIT
    assert mcp_tools.MAX_EVENT_LIMIT == gateway_limits.INVENTORY_EVENT_MAX_LIMIT
    assert mcp_tools.DEFAULT_RECENT_INCIDENT_LIMIT == gateway_limits.RCA_QUERY_DEFAULT_LIMIT
    assert mcp_tools.MAX_QUERY_LIMIT == gateway_limits.RCA_QUERY_MAX_LIMIT
    assert mcp_tools.DEFAULT_APPLICATION_LIMIT == gateway_limits.APPLICATION_LIST_DEFAULT_LIMIT
    assert mcp_tools.MAX_APPLICATION_LIMIT == gateway_limits.APPLICATION_LIST_MAX_LIMIT
    assert (
        mcp_tools.DEFAULT_APPLICATION_DEPLOYMENT_LIMIT
        == gateway_limits.APPLICATION_DEPLOYMENT_DEFAULT_LIMIT
    )
    assert (
        mcp_tools.MAX_APPLICATION_DEPLOYMENT_LIMIT
        == gateway_limits.APPLICATION_DEPLOYMENT_MAX_LIMIT
    )
    assert mcp_tools.DEFAULT_ALERT_EVENT_LIMIT == gateway_limits.ALERT_EVENT_DEFAULT_LIMIT
    assert mcp_tools.MAX_ALERT_EVENT_LIMIT == gateway_limits.ALERT_EVENT_MAX_LIMIT
    assert mcp_tools.MAX_GRAPH_NODE_LIMIT == gateway_limits.RESOURCE_GRAPH_MAX_NODE_LIMIT
    assert mcp_tools.MAX_GRAPH_EDGE_LIMIT == gateway_limits.RESOURCE_GRAPH_MAX_EDGE_LIMIT
    assert mcp_tools.DEFAULT_DEAD_LETTER_LIMIT == gateway_limits.DEAD_LETTER_DEFAULT_LIMIT
    assert mcp_tools.MAX_DEAD_LETTER_LIMIT == gateway_limits.DEAD_LETTER_MAX_LIMIT
    assert mcp_tools.DEFAULT_RCA_ISSUE_LIMIT == gateway_limits.DASHBOARD_RCA_DEFAULT_LIMIT
    assert mcp_tools.MAX_RCA_ISSUE_LIMIT == gateway_limits.DASHBOARD_RCA_MAX_LIMIT
    assert mcp_tools.DEFAULT_RESOURCE_ISSUE_LIMIT == gateway_limits.RESOURCE_ISSUE_DEFAULT_LIMIT
    assert (
        mcp_tools.MAX_APPLICATION_WORKFLOW_RUN_LIMIT
        == gateway_limits.APPLICATION_WORKFLOW_RUN_MAX_LIMIT
    )
    assert mcp_tools.MAX_RELEASE_PLAN_LIMIT == gateway_limits.RELEASE_PLAN_MAX_LIMIT
    assert mcp_tools.MAX_RELEASE_RUN_LIMIT == gateway_limits.RELEASE_RUN_MAX_LIMIT
    assert mcp_tools.MAX_RELEASE_AUDIT_LIMIT == gateway_limits.RELEASE_AUDIT_MAX_LIMIT
    assert mcp_tools.DEFAULT_AUDIT_TIMELINE_LIMIT == gateway_limits.AUDIT_TIMELINE_DEFAULT_LIMIT
    assert mcp_tools.MAX_AUDIT_TIMELINE_LIMIT == gateway_limits.AUDIT_TIMELINE_MAX_LIMIT
    assert mcp_tools.MIN_CHANGE_BUCKET_MS == gateway_limits.CHANGE_TIMELINE_MIN_BUCKET_MS
    assert mcp_tools.MAX_CHANGE_BUCKET_MS == gateway_limits.CHANGE_TIMELINE_MAX_BUCKET_MS
    assert mcp_tools.MAX_CHANGE_RANGE_MS == gateway_limits.CHANGE_TIMELINE_MAX_RANGE_MS
    assert mcp_tools.MAX_CHANGE_BUCKETS == gateway_limits.CHANGE_TIMELINE_MAX_BUCKETS
    assert mcp_tools.MAX_EPOCH_MILLISECONDS == gateway_limits.CHANGE_TIMELINE_MAX_EPOCH_MS


def test_settings_fail_closed_without_auth() -> None:
    settings = McpSettings(api_base_url="https://opsia.test")

    try:
        settings.validate()
    except McpConfigurationError as exc:
        assert "required" in str(exc)
    else:
        raise AssertionError("MCP settings must require an authentication mechanism")


def test_load_settings_ignores_global_trusted_proxy_secret(monkeypatch: Any) -> None:
    for name in MCP_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv(MANAGEMENT_BASE_URL_ENV, "https://opsia.test")
    monkeypatch.setenv(TRUSTED_PROXY_AUTH_SECRET_ENV, "x" * 32)

    try:
        load_settings()
    except McpConfigurationError as exc:
        assert "exactly one" in str(exc)
    else:
        raise AssertionError("load_settings must not borrow the Gateway trusted proxy secret")


def test_load_settings_uses_explicit_mcp_environment(monkeypatch: Any) -> None:
    for name in MCP_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv(OPSIA_MCP_API_BASE_URL_ENV, "https://opsia.test/api/")
    monkeypatch.setenv(OPSIA_MCP_BEARER_TOKEN_ENV, " token-1 ")
    monkeypatch.setenv(OPSIA_MCP_ENABLE_WRITES_ENV, "true")
    monkeypatch.setenv(OPSIA_MCP_TIMEOUT_SECONDS_ENV, "5")
    monkeypatch.setenv(OPSIA_MCP_MAX_RESPONSE_BYTES_ENV, "4096")

    settings = load_settings()

    assert settings.api_base_url == "https://opsia.test/api"
    assert settings.bearer_token == "token-1"
    assert settings.writes_enabled is True
    assert settings.timeout_seconds == 5
    assert settings.max_response_bytes == 4096


def test_settings_reject_invalid_write_enable_flag(monkeypatch: Any) -> None:
    for name in MCP_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv(OPSIA_MCP_API_BASE_URL_ENV, "https://opsia.test")
    monkeypatch.setenv(OPSIA_MCP_BEARER_TOKEN_ENV, "token-1")
    monkeypatch.setenv(OPSIA_MCP_ENABLE_WRITES_ENV, "maybe")

    try:
        load_settings()
    except McpConfigurationError as exc:
        assert OPSIA_MCP_ENABLE_WRITES_ENV in str(exc)
        assert "boolean" in str(exc)
    else:
        raise AssertionError("invalid MCP write enable flag should fail closed")


def test_settings_validate_api_base_url_and_session_cookie_auth() -> None:
    settings = McpSettings(
        api_base_url="https://opsia.test/api/",
        session_cookie="session-token",
    ).validate()

    headers = settings.auth_headers()

    assert settings.api_base_url == "https://opsia.test/api"
    assert headers["cookie"] == "service_session=session-token"
    assert "x-kubeheal-internal-auth" not in headers
    assert "session-token" not in repr(settings)


def test_settings_reject_mixed_auth_and_unsafe_url_or_header_values() -> None:
    invalid_settings = [
        McpSettings(
            api_base_url="https://opsia.test",
            session_cookie="session-token",
            trusted_proxy_secret="x" * 32,
        ),
        McpSettings(api_base_url="ftp://opsia.test", bearer_token="token-1"),
        McpSettings(api_base_url="http://user:pass@opsia.test", bearer_token="token-1"),
        McpSettings(api_base_url="http://opsia.test/api?debug=true", bearer_token="token-1"),
        McpSettings(api_base_url="https://opsia.test", bearer_token="token-1\r\nx-test: y"),
        McpSettings(api_base_url="https://opsia.test", trusted_proxy_secret="x" * 32),
        McpSettings(api_base_url="https://opsia.test", bearer_token="token-1", timeout_seconds=61),
        McpSettings(
            api_base_url="https://opsia.test",
            bearer_token="token-1",
            max_response_bytes=9 * 1024 * 1024,
        ),
        McpSettings(
            api_base_url="https://opsia.test",
            session_cookie="session-token",
            session_cookie_name="bad cookie",
        ),
    ]

    for settings in invalid_settings:
        try:
            settings.validate()
        except McpConfigurationError:
            pass
        else:
            raise AssertionError(f"settings should have been rejected: {settings!r}")


def test_trusted_proxy_auth_is_not_available_to_mcp() -> None:
    settings = McpSettings(
        api_base_url="https://opsia.test",
        bearer_token="token-1",
        trusted_proxy_secret="x" * 32,
    )

    try:
        settings.validate()
    except McpConfigurationError as exc:
        assert OPSIA_MCP_TRUSTED_PROXY_SECRET_ENV in str(exc)
        assert "not supported" in str(exc)
    else:
        raise AssertionError("MCP must not accept trusted proxy service-admin authentication")


def test_settings_reject_remote_http_without_explicit_opt_in() -> None:
    try:
        McpSettings(api_base_url="http://opsia.test", bearer_token="token-1").validate()
    except McpConfigurationError as exc:
        assert OPSIA_MCP_ALLOW_INSECURE_HTTP_ENV in str(exc)
        assert "https" in str(exc)
    else:
        raise AssertionError("remote MCP HTTP must fail closed")

    local = McpSettings(
        api_base_url="http://127.0.0.1:8000/api/",
        bearer_token="token-1",
    ).validate()
    localhost = McpSettings(
        api_base_url="http://localhost:8000/api/",
        bearer_token="token-1",
    ).validate()
    localhost_subdomain = McpSettings(
        api_base_url="http://api.localhost:8000/api/",
        bearer_token="token-1",
    ).validate()
    explicit = McpSettings(
        api_base_url="http://opsia.test/api/",
        bearer_token="token-1",
        allow_insecure_http=True,
    ).validate()

    assert local.api_base_url == "http://127.0.0.1:8000/api"
    assert localhost.api_base_url == "http://localhost:8000/api"
    assert localhost_subdomain.api_base_url == "http://api.localhost:8000/api"
    assert explicit.api_base_url == "http://opsia.test/api"


def test_load_settings_allows_remote_http_with_explicit_opt_in(monkeypatch: Any) -> None:
    for name in MCP_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv(OPSIA_MCP_API_BASE_URL_ENV, "http://api-gateway:8000/api/")
    monkeypatch.setenv(OPSIA_MCP_BEARER_TOKEN_ENV, "token-1")
    monkeypatch.setenv(OPSIA_MCP_ALLOW_INSECURE_HTTP_ENV, "true")

    settings = load_settings()

    assert settings.api_base_url == "http://api-gateway:8000/api"
    assert settings.allow_insecure_http is True


def test_registry_exposes_expected_tools_with_safety_annotations() -> None:
    tools = default_tool_registry().list_tools()
    names = {tool["name"] for tool in tools}

    assert names == {
        "ack_alert_event",
        "approve_or_reject_workflow",
        "cancel_command_request",
        "create_alert_rule",
        "create_command_request",
        "create_release_plan",
        "disable_alert_rule",
        "get_alert_rule",
        "get_application_drift",
        "get_application_detail",
        "get_cluster_connection_status",
        "get_cluster_inventory_summary",
        "get_cluster_summary",
        "get_command_status",
        "get_fleet_summary",
        "get_log_evidence",
        "get_rca_incident",
        "get_release_plan",
        "get_release_run_report",
        "get_release_run_summary",
        "get_recovery_plan",
        "get_resource_capabilities",
        "get_resource_detail",
        "get_resource_graph",
        "get_workflow_run",
        "list_alert_events",
        "list_alert_rules",
        "list_application_deployments",
        "list_applications",
        "list_audit_timeline",
        "list_dead_letters",
        "list_evidence_windows",
        "list_clusters",
        "list_metric_query_presets",
        "list_pending_approvals",
        "list_rca_issues",
        "list_recent_incidents",
        "list_recent_changes",
        "list_release_audit",
        "list_release_plans",
        "list_resource_issues",
        "list_resources",
        "list_workflow_runs",
        "promote_alert_incident",
        "propose_manifest_change",
        "request_recovery_action",
        "retry_command_request",
        "run_metric_query_preset",
        "start_release_run",
        "update_alert_rule",
    }
    assert all(tool["inputSchema"]["additionalProperties"] is False for tool in tools)
    read_tools = {
        "get_alert_rule",
        "get_application_drift",
        "get_application_detail",
        "get_cluster_connection_status",
        "get_cluster_inventory_summary",
        "get_cluster_summary",
        "get_command_status",
        "get_fleet_summary",
        "get_log_evidence",
        "get_rca_incident",
        "get_release_plan",
        "get_release_run_report",
        "get_release_run_summary",
        "get_recovery_plan",
        "get_resource_capabilities",
        "get_resource_detail",
        "get_resource_graph",
        "get_workflow_run",
        "list_alert_events",
        "list_alert_rules",
        "list_application_deployments",
        "list_applications",
        "list_audit_timeline",
        "list_dead_letters",
        "list_evidence_windows",
        "list_clusters",
        "list_metric_query_presets",
        "list_pending_approvals",
        "list_rca_issues",
        "list_recent_incidents",
        "list_recent_changes",
        "list_release_audit",
        "list_release_plans",
        "list_resource_issues",
        "list_resources",
        "list_workflow_runs",
    }
    write_tools = names - read_tools
    annotations_by_name = {tool["name"]: tool["annotations"] for tool in tools}
    assert all(
        annotations_by_name[name] == {
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
        }
        for name in read_tools
    )
    assert all(
        annotations_by_name[name] == {
            "readOnlyHint": False,
            "destructiveHint": True,
            "idempotentHint": False,
        }
        for name in write_tools
    )
    schemas_by_name = {tool["name"]: tool["inputSchema"] for tool in tools}
    assert (
        schemas_by_name["list_clusters"]["properties"]["limit"]["maximum"]
        == gateway_limits.CLUSTER_LIST_MAX_LIMIT
    )

    tools[0]["inputSchema"]["additionalProperties"] = True
    assert default_tool_registry().list_tools()[0]["inputSchema"]["additionalProperties"] is False


def test_all_read_tools_call_existing_gateway_routes_with_get_only() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if request.url.path == routes.ALERT_RULES_PATH:
                return httpx.Response(200, json={"rules": [{"rule_id": "rule-1"}]})
            if request.url.path == routes.APPLICATIONS_PATH:
                return httpx.Response(200, json={"applications": [{"id": "app-1"}]})
            if request.url.path == routes.GITOPS_FILTER_RESULTS_PATH:
                return httpx.Response(
                    200,
                    json={"items": [{"change_id": "change-1", "application_id": "app-1"}]},
                )
            if request.url.path.endswith("/runs") or request.url.path == routes.RELEASE_RUNS_PATH:
                return httpx.Response(
                    200,
                    json={
                        "runs": [
                            {
                                "workflow_run_id": "workflow-1",
                                "run_id": "run-1",
                                "approval_status": "requested",
                            }
                        ]
                    },
                )
            return httpx.Response(200, json={"ok": True})

        registry = default_tool_registry()
        client = _client(handler)

        await registry.call("list_clusters", {}, client)
        await registry.call("get_fleet_summary", {}, client)
        await registry.call("get_cluster_summary", {"cluster_id": "cluster-1"}, client)
        await registry.call(
            "get_cluster_connection_status",
            {"cluster_id": "cluster-1"},
            client,
        )
        await registry.call(
            "get_cluster_inventory_summary",
            {"cluster_id": "cluster-1"},
            client,
        )
        await registry.call("list_resources", {"cluster_id": "cluster-1"}, client)
        await registry.call(
            "get_resource_detail",
            {
                "cluster_id": "cluster-1",
                "resource_type": "pod",
                "kind": "Pod",
                "namespace": "shop",
                "name": "api",
            },
            client,
        )
        await registry.call("list_recent_incidents", {}, client)
        await registry.call("list_dead_letters", {}, client)
        await registry.call("list_rca_issues", {}, client)
        await registry.call("get_rca_incident", {"incident_id": "incident-1"}, client)
        await registry.call(
            "list_resource_issues",
            {"cluster_id": "cluster-1", "kind": "Pod", "name": "api"},
            client,
        )
        await registry.call("list_evidence_windows", {}, client)
        await registry.call("get_log_evidence", {"evidence_key": "evidence-1"}, client)
        await registry.call("get_command_status", {"command_id": "cmd-1"}, client)
        await registry.call("list_alert_rules", {}, client)
        await registry.call("get_alert_rule", {"rule_id": "rule-1"}, client)
        await registry.call("list_alert_events", {}, client)
        await registry.call("get_recovery_plan", {"correlation_id": "corr-1"}, client)
        await registry.call("list_applications", {"limit": 2}, client)
        await registry.call("get_application_detail", {"application_id": "app-1"}, client)
        await registry.call("get_application_drift", {"application_id": "app-1"}, client)
        await registry.call(
            "list_application_deployments",
            {"application_id": "app-1"},
            client,
        )
        await registry.call("list_audit_timeline", {"correlation_id": "corr-1"}, client)
        await registry.call("list_workflow_runs", {"application_id": "app-1"}, client)
        await registry.call(
            "get_workflow_run",
            {"application_id": "app-1", "run_id": "workflow-1"},
            client,
        )
        await registry.call("get_workflow_run", {"run_id": "run-1"}, client)
        await registry.call("get_release_run_report", {"run_id": "run-1"}, client)
        await registry.call("list_release_plans", {}, client)
        await registry.call("get_release_plan", {"plan_id": "plan-1"}, client)
        await registry.call("get_release_run_summary", {}, client)
        await registry.call("list_release_audit", {}, client)
        await registry.call("list_pending_approvals", {}, client)
        await registry.call("get_resource_capabilities", {"resource": "resource-1"}, client)
        await registry.call("get_resource_graph", {}, client)
        await registry.call(
            "list_recent_changes",
            {
                "from_ms": 1_700_000_000_000,
                "to_ms": 1_700_003_600_000,
                "bucket_ms": 60_000,
            },
            client,
        )
        await registry.call(
            "list_metric_query_presets",
            {"cluster_id": "cluster-1"},
            client,
        )

        expected_paths = [
            routes.CLUSTERS_PATH,
            routes.FLEET_SUMMARY_PATH,
            routes.CLUSTER_SUMMARY_PATH.format(cluster_id="cluster-1"),
            routes.CLUSTER_CONNECTION_STATUS_PATH.format(cluster_id="cluster-1"),
            routes.CLUSTER_INVENTORY_SUMMARY_PATH.format(cluster_id="cluster-1"),
            routes.CLUSTER_INVENTORY_RESOURCES_PATH.format(cluster_id="cluster-1"),
            routes.CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH.format(cluster_id="cluster-1"),
            routes.RCA_REPORTS_PATH,
            routes.DEAD_LETTERS_PATH,
            routes.DASHBOARD_RCA_ISSUES_PATH,
            routes.DASHBOARD_RCA_INCIDENT_PATH.format(incident_id="incident-1"),
            routes.RESOURCE_RCA_ISSUES_PATH,
            routes.EVIDENCE_WINDOWS_PATH,
            routes.EVIDENCE_WINDOW_PATH.format(evidence_key="evidence-1"),
            routes.COMMAND_STATUS_PATH.format(command_id="cmd-1"),
            routes.ALERT_RULES_PATH,
            routes.ALERT_RULES_PATH,
            routes.ALERT_EVENTS_PATH,
            routes.RCA_RECOVERY_PLAN_BY_CORRELATION_PATH.format(correlation_id="corr-1"),
            routes.APPLICATIONS_PATH,
            routes.APPLICATION_PATH.format(application_id="app-1"),
            routes.APPLICATION_DRIFT_PATH.format(application_id="app-1"),
            routes.APPLICATION_DEPLOYMENTS_PATH.format(application_id="app-1"),
            routes.AUDIT_TIMELINE_PATH,
            routes.APPLICATION_RUNS_PATH.format(application_id="app-1"),
            routes.APPLICATION_RUNS_PATH.format(application_id="app-1"),
            routes.RELEASE_RUN_PATH.format(run_id="run-1"),
            routes.RELEASE_RUN_REPORT_PATH.format(run_id="run-1"),
            routes.RELEASE_PLANS_PATH,
            routes.RELEASE_PLAN_PATH.format(plan_id="plan-1"),
            routes.RELEASE_RUN_SUMMARY_PATH,
            routes.RELEASE_AUDIT_PATH,
            routes.GITOPS_FILTER_RESULTS_PATH,
            routes.APPLICATION_RUNS_PATH.format(application_id="app-1"),
            routes.RELEASE_RUNS_PATH,
            routes.RESOURCE_CAPABILITIES_PATH,
            routes.RESOURCES_GRAPH_PATH,
            routes.CHANGES_PATH,
            routes.CLUSTER_METRIC_QUERY_PRESETS_PATH.format(cluster_id="cluster-1"),
        ]
        assert [request.method for request in seen] == ["GET"] * len(expected_paths)
        assert [request.url.path for request in seen] == expected_paths
        assert all(request.content == b"" for request in seen)

    asyncio.run(run())


def test_new_read_tools_forward_gateway_query_aliases_without_mutation() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"ok": True})

        registry = default_tool_registry()
        client = _client(handler)

        await registry.call(
            "list_alert_events",
            {
                "from_time": "2026-07-16T00:00:00Z",
                "to_time": "2026-07-16T01:00:00Z",
                "rule_id": "rule-1",
                "severity": "high",
                "status": "open",
                "limit": 25,
            },
            client,
        )
        await registry.call(
            "get_resource_graph",
            {
                "clusters": "cluster-1",
                "namespaces": "shop",
                "applications": "app-1",
                "resource_types": "pod,service",
                "health": "degraded",
                "labels": "team=checkout",
                "query": "api",
                "include_deleted": True,
                "snapshot_revision": 7,
                "max_nodes": 20,
                "max_edges": 40,
            },
            client,
        )
        await registry.call(
            "list_recent_changes",
            {
                "from_ms": 1_700_000_000_000,
                "to_ms": 1_700_000_060_000,
                "bucket_ms": 10_000,
                "clusters": "cluster-1",
                "namespaces": "shop",
                "applications": "app-1",
                "resource_types": "deployment",
                "health": "healthy",
                "labels": "team=checkout",
                "query": "api",
            },
            client,
        )

        assert [request.method for request in seen] == ["GET", "GET", "GET"]
        assert seen[0].url.params == httpx.QueryParams(
            {
                gateway_params.TIME_RANGE_FROM_QUERY: "2026-07-16T00:00:00Z",
                gateway_params.TIME_RANGE_TO_QUERY: "2026-07-16T01:00:00Z",
                "rule_id": "rule-1",
                "severity": "high",
                "status": "open",
                "limit": "25",
            }
        )
        assert seen[1].url.params == httpx.QueryParams(
            {
                "clusters": "cluster-1",
                "namespaces": "shop",
                "applications": "app-1",
                gateway_params.RESOURCE_TYPES_QUERY: "pod,service",
                gateway_params.RESOURCE_HEALTH_QUERY: "degraded",
                "labels": "team=checkout",
                gateway_params.RESOURCE_SEARCH_QUERY: "api",
                gateway_params.RESOURCE_INCLUDE_DELETED_QUERY: "true",
                "snapshot_revision": "7",
                "max_nodes": "20",
                "max_edges": "40",
            }
        )
        assert seen[2].url.params == httpx.QueryParams(
            {
                gateway_params.TIME_RANGE_FROM_QUERY: "1700000000000",
                gateway_params.TIME_RANGE_TO_QUERY: "1700000060000",
                gateway_params.CHANGE_BUCKET_QUERY: "10000",
                "clusters": "cluster-1",
                "namespaces": "shop",
                "applications": "app-1",
                gateway_params.RESOURCE_TYPES_QUERY: "deployment",
                gateway_params.RESOURCE_HEALTH_QUERY: "healthy",
                "labels": "team=checkout",
                gateway_params.RESOURCE_SEARCH_QUERY: "api",
            }
        )
        assert all(request.content == b"" for request in seen)

    asyncio.run(run())


def test_recent_changes_requires_explicit_bucket_without_http_request() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        try:
            await default_tool_registry().call(
                "list_recent_changes",
                {
                    "from_ms": 1_700_000_000_000,
                    "to_ms": 1_700_000_060_000,
                },
                _client(lambda request: seen.append(request) or httpx.Response(500)),
            )
        except ValueError as exc:
            assert "bucket_ms is required" in str(exc)
        else:
            raise AssertionError("list_recent_changes must require an explicit bucket_ms")

        assert seen == []

    asyncio.run(run())


def test_recent_changes_rejects_unbounded_windows_without_http_request() -> None:
    async def run() -> None:
        cases = [
            (
                {
                    "from_ms": 1_700_000_000_000,
                    "to_ms": 1_700_000_000_000,
                    "bucket_ms": 1_000,
                },
                "to_ms must be greater than from_ms",
            ),
            (
                {
                    "from_ms": 1_700_000_000_000,
                    "to_ms": 1_700_086_400_001,
                    "bucket_ms": 60_000,
                },
                "24 hours or less",
            ),
            (
                {
                    "from_ms": 1_700_000_000_000,
                    "to_ms": 1_700_000_060_000,
                    "bucket_ms": 120_000,
                },
                "bucket_ms must not be greater",
            ),
            (
                {
                    "from_ms": 1_700_000_000_000,
                    "to_ms": 1_700_086_400_000,
                    "bucket_ms": 30_000,
                },
                "bucket count",
            ),
        ]

        for payload, expected_error in cases:
            seen: list[httpx.Request] = []
            try:
                await default_tool_registry().call(
                    "list_recent_changes",
                    payload,
                    _client(
                        lambda request, seen=seen: seen.append(request)
                        or httpx.Response(500)
                    ),
                )
            except ValueError as exc:
                assert expected_error in str(exc)
            else:
                raise AssertionError(f"expected list_recent_changes to reject {payload!r}")
            assert seen == []

    asyncio.run(run())


def test_workflow_runs_use_source_specific_gateway_limits() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []
        registry = default_tool_registry()
        client = _client(
            lambda request: seen.append(request)
            or httpx.Response(200, json={"runs": []})
        )

        await registry.call(
            "list_workflow_runs",
            {"application_id": "app-1", "limit": 500},
            client,
        )
        try:
            await registry.call("list_workflow_runs", {"limit": 500}, client)
        except ValueError as exc:
            assert "limit must be between 1 and 200" in str(exc)
        else:
            raise AssertionError("release run listing must use the Gateway release-run limit")

        assert len(seen) == 1
        assert seen[0].url.path == routes.APPLICATION_RUNS_PATH.format(
            application_id="app-1"
        )
        assert seen[0].url.params == httpx.QueryParams({"limit": "500"})

    asyncio.run(run())


def test_alert_events_default_limit_matches_gateway_contract() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        await default_tool_registry().call(
            "list_alert_events",
            {},
            _client(
                lambda request: seen.append(request)
                or httpx.Response(200, json=[])
            ),
        )

        assert len(seen) == 1
        assert seen[0].method == "GET"
        assert seen[0].url.path == routes.ALERT_EVENTS_PATH
        assert seen[0].url.params == httpx.QueryParams(
            {"limit": str(gateway_limits.ALERT_EVENT_DEFAULT_LIMIT)}
        )
        assert seen[0].content == b""

    asyncio.run(run())


def test_operational_read_tools_forward_existing_gateway_filters_only() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []
        registry = default_tool_registry()
        client = _client(
            lambda request: seen.append(request) or httpx.Response(200, json={"ok": True})
        )

        await registry.call("list_dead_letters", {"limit": 9}, client)
        await registry.call(
            "list_rca_issues",
            {"cluster_id": "cluster-1", "limit": 12},
            client,
        )
        await registry.call(
            "get_rca_incident",
            {"incident_id": "incident-1", "cluster_id": "cluster-1"},
            client,
        )
        await registry.call(
            "list_resource_issues",
            {
                "cluster_id": "cluster-1",
                "kind": "Pod",
                "name": "api",
                "namespace": "shop",
                "limit": 7,
            },
            client,
        )
        await registry.call("list_release_plans", {"limit": 11}, client)
        await registry.call("get_release_run_summary", {"plan_id": "plan-1"}, client)
        await registry.call(
            "list_release_audit",
            {
                "plan_id": "plan-1",
                "run_id": "run-1",
                "event_type": "release.started",
                "limit": 21,
            },
            client,
        )

        assert [request.method for request in seen] == ["GET"] * 7
        assert seen[0].url.path == routes.DEAD_LETTERS_PATH
        assert seen[0].url.params == httpx.QueryParams({"limit": "9"})
        assert seen[1].url.path == routes.DASHBOARD_RCA_ISSUES_PATH
        assert seen[1].url.params == httpx.QueryParams(
            {"cluster_id": "cluster-1", "limit": "12"}
        )
        assert seen[2].url.path == routes.DASHBOARD_RCA_INCIDENT_PATH.format(
            incident_id="incident-1"
        )
        assert seen[2].url.params == httpx.QueryParams({"cluster_id": "cluster-1"})
        assert seen[3].url.path == routes.RESOURCE_RCA_ISSUES_PATH
        assert seen[3].url.params == httpx.QueryParams(
            {
                "cluster_id": "cluster-1",
                "kind": "Pod",
                "name": "api",
                "namespace": "shop",
                "limit": "7",
            }
        )
        assert seen[4].url.path == routes.RELEASE_PLANS_PATH
        assert seen[4].url.params == httpx.QueryParams({"limit": "11"})
        assert seen[5].url.path == routes.RELEASE_RUN_SUMMARY_PATH
        assert seen[5].url.params == httpx.QueryParams({"plan_id": "plan-1"})
        assert seen[6].url.path == routes.RELEASE_AUDIT_PATH
        assert seen[6].url.params == httpx.QueryParams(
            {
                "plan_id": "plan-1",
                "run_id": "run-1",
                "event_type": "release.started",
                "limit": "21",
            }
        )
        assert all(request.content == b"" for request in seen)

    asyncio.run(run())


def test_resource_graph_without_optional_arguments_forwards_no_default_query() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        await default_tool_registry().call(
            "get_resource_graph",
            {},
            _client(
                lambda request: seen.append(request)
                or httpx.Response(200, json={"ok": True})
            ),
        )

        assert len(seen) == 1
        assert seen[0].method == "GET"
        assert seen[0].url.path == routes.RESOURCES_GRAPH_PATH
        assert seen[0].url.params == httpx.QueryParams()
        assert seen[0].content == b""

    asyncio.run(run())


def test_write_tools_dry_run_returns_proposal_without_http_request() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []
        payload = {
            "name": "CPU high",
            "scope": {"clusters": ["cluster-1"]},
            "metric": "cpu_pct",
            "comparator": ">=",
            "threshold": 90,
            "for_seconds": 300,
            "severity": "high",
            "channels": [],
            "enabled": True,
        }
        client = _client(lambda request: seen.append(request) or httpx.Response(500))

        result = await default_tool_registry().call(
            "create_alert_rule",
            {"payload": payload},
            client,
        )

        assert seen == []
        assert result["data"] is None
        assert result["safety"]["mutating"] is False
        assert result["safety"]["dry_run"] is True
        assert result["safety"]["approval_required"] is True
        assert result["safety"]["operation_id"] is None
        assert result["safety"]["proposal"] == {
            "method": "POST",
            "api_path": routes.ALERT_RULES_PATH,
            "body": payload,
            "body_redacted": False,
            "uses_existing_gateway_api": True,
        }

    asyncio.run(run())


def test_write_execution_requires_explicit_mcp_write_enable() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []
        payload = {
            "name": "CPU high",
            "scope": {"clusters": ["cluster-1"]},
            "metric": "cpu_pct",
            "comparator": ">=",
            "threshold": 90,
            "for_seconds": 300,
            "severity": "high",
            "channels": [],
            "enabled": True,
        }

        try:
            await default_tool_registry().call(
                "create_alert_rule",
                {
                    "payload": payload,
                    "dry_run": False,
                    "approval_confirmed": True,
                },
                _client(lambda request: seen.append(request) or httpx.Response(500)),
            )
        except ValueError as exc:
            assert OPSIA_MCP_ENABLE_WRITES_ENV in str(exc)
        else:
            raise AssertionError("MCP write execution must be disabled by default")

        assert seen == []

    asyncio.run(run())


def test_write_proposal_redacts_sensitive_payload_values_without_changing_post_body() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []
        payload = {
            "cluster_id": "cluster-1",
            "action": "apply_manifest",
            "namespace": "shop",
            "reason": "Authorization: Bearer secret-token",
            "diff": {
                "kind": "Secret",
                "metadata": {"name": "api-secret"},
                "data": {"password": "plain-secret"},
                "stringData": {"api_key": "token-value"},
                "spec": {
                    "template": {
                        "spec": {
                            "containers": [
                                {
                                    "name": "api",
                                    "env": [
                                        {"name": "DB_PASSWORD", "value": "db-pass"},
                                        {"name": "LOG_LEVEL", "value": "debug"},
                                        {
                                            "name": "API_TOKEN",
                                            "valueFrom": {
                                                "secretKeyRef": {
                                                    "name": "api-secret",
                                                    "key": "token",
                                                }
                                            },
                                        },
                                    ],
                                }
                            ]
                        }
                    }
                },
            },
        }

        dry_run = await default_tool_registry().call(
            "create_command_request",
            {"payload": payload},
            _client(lambda request: seen.append(request) or httpx.Response(500)),
        )

        proposal = dry_run["safety"]["proposal"]
        assert seen == []
        assert proposal["body_redacted"] is True
        assert proposal["body"]["reason"] == "Authorization: Bearer [REDACTED]"
        assert proposal["body"]["diff"]["metadata"] == {"name": "api-secret"}
        assert proposal["body"]["diff"]["data"] == "[REDACTED]"
        assert proposal["body"]["diff"]["stringData"] == "[REDACTED]"
        env = proposal["body"]["diff"]["spec"]["template"]["spec"]["containers"][0]["env"]
        assert env[0] == {"name": "DB_PASSWORD", "value": "[REDACTED]"}
        assert env[1] == {"name": "LOG_LEVEL", "value": "debug"}
        assert env[2]["valueFrom"] == {"secretKeyRef": "[REDACTED]"}
        assert "plain-secret" not in json.dumps(proposal, ensure_ascii=False)
        assert "token-value" not in json.dumps(proposal, ensure_ascii=False)
        assert "db-pass" not in json.dumps(proposal, ensure_ascii=False)

        approved = await default_tool_registry().call(
            "create_command_request",
            {
                "payload": payload,
                "dry_run": False,
                "approval_confirmed": True,
            },
            _client(
                lambda request: seen.append(request)
                or httpx.Response(
                    200,
                    json={
                        "accepted": True,
                        "command_id": "cmd-1",
                        "event_id": "event-1",
                        "audit_event_id": "event-1",
                        "correlation_id": "corr-1",
                        "status": "queued",
                        "token": "queued-secret",
                        "details": {
                            "credential_ref": "github-token-ref",
                            "message": "authorization: Bearer response-secret",
                        },
                    },
                ),
                writes_enabled=True,
            ),
        )

        assert json.loads(seen[0].content) == payload
        approved_json = json.dumps(approved, ensure_ascii=False)
        for leaked in ("queued-secret", "github-token-ref", "response-secret"):
            assert leaked not in approved_json
        assert approved["data"]["token"] == "[REDACTED]"
        assert approved["data"]["details"]["credential_ref"] == "[REDACTED]"
        assert approved["safety"]["operation_id"] == "cmd-1"

    asyncio.run(run())


def test_create_alert_rule_requires_confirmation_then_posts_existing_admin_api() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []
        payload = {
            "name": "Pod restarts",
            "scope": {"clusters": ["cluster-1"], "namespaces": ["cluster-1/shop"]},
            "metric": "restart_count",
            "comparator": ">=",
            "threshold": 3,
            "for_seconds": 120,
            "severity": "medium",
            "channels": ["ops-webhook"],
            "enabled": True,
        }

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(201, json={"rule_id": "rule-1"})

        registry = default_tool_registry()
        client = _client(handler, writes_enabled=True)

        try:
            await registry.call(
                "create_alert_rule",
                {"payload": payload, "dry_run": False},
                client,
            )
        except ValueError as exc:
            assert "approval_confirmed" in str(exc)
        else:
            raise AssertionError("write tools must require explicit approval confirmation")

        result = await registry.call(
            "create_alert_rule",
            {
                "payload": payload,
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )

        assert len(seen) == 1
        assert seen[0].method == "POST"
        assert seen[0].url.path == routes.ALERT_RULES_PATH
        assert json.loads(seen[0].content) == payload
        assert result["data"] == {"rule_id": "rule-1"}
        assert result["safety"]["mutating"] is True
        assert result["safety"]["dry_run"] is False
        assert result["safety"]["approval_required"] is False
        assert result["safety"]["operation_id"] == "rule-1"

    asyncio.run(run())


def test_update_and_disable_alert_rule_use_existing_patch_api() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            body = json.loads(request.content)
            return httpx.Response(200, json={"rule_id": "rule-1", **body})

        registry = default_tool_registry()
        client = _client(handler, writes_enabled=True)

        dry_run = await registry.call(
            "disable_alert_rule",
            {"rule_id": "rule-1"},
            client,
        )
        assert seen == []
        assert dry_run["safety"]["proposal"]["method"] == "PATCH"
        assert dry_run["safety"]["proposal"]["body"] == {"enabled": False}

        result = await registry.call(
            "update_alert_rule",
            {
                "rule_id": "rule-1",
                "payload": {"threshold": 95, "enabled": True},
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )
        await registry.call(
            "disable_alert_rule",
            {
                "rule_id": "rule-1",
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )

        assert [request.method for request in seen] == ["PATCH", "PATCH"]
        assert [request.url.path for request in seen] == [
            routes.ALERT_RULE_PATH.format(rule_id="rule-1"),
            routes.ALERT_RULE_PATH.format(rule_id="rule-1"),
        ]
        assert json.loads(seen[0].content) == {"threshold": 95, "enabled": True}
        assert json.loads(seen[1].content) == {"enabled": False}
        assert result["safety"]["operation_id"] == "rule-1"

    asyncio.run(run())


def test_command_control_tools_post_existing_api_with_idempotency_key() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(
                202,
                json={
                    "command_id": "cmd-1",
                    "event_id": "event-1",
                    "audit_event_id": "event-1",
                    "correlation_id": "corr-1",
                    "status": "cancel_requested",
                },
            )

        registry = default_tool_registry()
        client = _client(handler, writes_enabled=True)

        dry_run = await registry.call(
            "cancel_command_request",
            {
                "command_id": "cmd-1",
                "idempotency_key": "cancel-1",
                "reason": "wrong target",
            },
            client,
        )
        assert seen == []
        assert dry_run["safety"]["proposal"]["headers"] == {"Idempotency-Key": "[REDACTED]"}

        result = await registry.call(
            "cancel_command_request",
            {
                "command_id": "cmd-1",
                "idempotency_key": "cancel-1",
                "reason": "wrong target",
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )
        await registry.call(
            "retry_command_request",
            {
                "command_id": "cmd-1",
                "idempotency_key": "retry-01",
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )

        assert [request.method for request in seen] == ["POST", "POST"]
        assert seen[0].url.path == routes.COMMAND_CANCEL_PATH.format(command_id="cmd-1")
        assert seen[1].url.path == routes.COMMAND_RETRY_PATH.format(command_id="cmd-1")
        assert seen[0].headers["Idempotency-Key"] == "cancel-1"
        assert seen[1].headers["Idempotency-Key"] == "retry-01"
        assert json.loads(seen[0].content) == {"reason": "wrong target"}
        assert json.loads(seen[1].content) == {}
        assert result["safety"]["operation_id"] == "cmd-1"

    asyncio.run(run())


def test_request_recovery_action_posts_existing_selection_api() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(
                200,
                json={
                    "accepted": True,
                    "event_id": "event-1",
                    "correlation_id": "corr-1",
                },
            )

        result = await default_tool_registry().call(
            "request_recovery_action",
            {
                "correlation_id": "corr-1",
                "expected_plan_id": "plan-1",
                "action_id": "action-1",
                "reason": "operator approved recovery",
                "dry_run": False,
                "approval_confirmed": True,
            },
            _client(handler, writes_enabled=True),
        )

        assert seen[0].method == "POST"
        assert seen[0].url.path == routes.RCA_RECOVERY_ACTION_SELECT_BY_CORRELATION_PATH.format(
            correlation_id="corr-1"
        )
        assert json.loads(seen[0].content) == {
            "expected_plan_id": "plan-1",
            "action_id": "action-1",
            "reason": "operator approved recovery",
        }
        assert result["safety"]["operation_id"] == "event-1"

        await default_tool_registry().call(
            "request_recovery_action",
            {
                "plan_id": "plan-2",
                "action_id": "action-2",
                "reason": "select existing recovery candidate",
                "dry_run": False,
                "approval_confirmed": True,
            },
            _client(handler, writes_enabled=True),
        )

        assert seen[1].method == "POST"
        assert seen[1].url.path == routes.RCA_RECOVERY_ACTION_SELECT_PATH.format(
            plan_id="plan-2",
            action_id="action-2",
        )
        assert json.loads(seen[1].content) == {
            "reason": "select existing recovery candidate",
        }

    asyncio.run(run())


def test_create_command_request_blocks_direct_execution_and_posts_command_api() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []
        payload = {
            "cluster_id": "cluster-1",
            "action": "apply_manifest",
            "namespace": "shop",
            "reason": "roll out reviewed manifest",
            "diff": {"kind": "Deployment", "name": "api"},
            "approval_ref": "approval-1",
        }

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(
                200,
                json={
                    "accepted": True,
                    "command_id": "cmd-1",
                    "event_id": "event-1",
                    "audit_event_id": "event-1",
                    "correlation_id": "corr-1",
                    "status": "queued",
                },
            )

        registry = default_tool_registry()
        client = _client(handler, writes_enabled=True)

        try:
            await registry.call(
                "create_command_request",
                {
                    "payload": {**payload, "confirmation": True},
                    "dry_run": False,
                    "approval_confirmed": True,
                },
                client,
            )
        except ValueError as exc:
            assert "direct execution" in str(exc)
        else:
            raise AssertionError("MCP command requests must not allow direct execution")

        try:
            await registry.call(
                "create_command_request",
                {
                    "payload": {**payload, "direct_execution": False},
                    "dry_run": False,
                    "approval_confirmed": True,
                },
                client,
            )
        except ValueError as exc:
            assert "direct execution" in str(exc)
        else:
            raise AssertionError("MCP command requests must reject direct flag keys")

        try:
            await registry.call(
                "create_command_request",
                {
                    "payload": {
                        **payload,
                        "metadata": {
                            "policy": {
                                "direct_execution_confirmed": True,
                            }
                        },
                    },
                    "dry_run": False,
                    "approval_confirmed": True,
                },
                client,
            )
        except ValueError as exc:
            assert "direct execution" in str(exc)
        else:
            raise AssertionError("MCP command requests must reject nested direct flags")

        result = await registry.call(
            "create_command_request",
            {
                "payload": payload,
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )

        assert seen[0].method == "POST"
        assert seen[0].url.path == routes.COMMANDS_PATH
        assert json.loads(seen[0].content) == payload
        assert result["safety"]["operation_id"] == "cmd-1"

    asyncio.run(run())


def test_approve_or_reject_workflow_posts_existing_approval_api() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(
                200,
                json={
                    "accepted": True,
                    "event_id": "event-2",
                    "correlation_id": "corr-2",
                },
            )

        registry = default_tool_registry()
        client = _client(handler, writes_enabled=True)

        dry_run = await registry.call(
            "approve_or_reject_workflow",
            {
                "approval_id": "approval-1",
                "decision": "reject",
                "reason": "needs review",
            },
            client,
        )
        assert seen == []
        assert dry_run["safety"]["approval_required"] is True

        result = await registry.call(
            "approve_or_reject_workflow",
            {
                "approval_id": "approval-1",
                "decision": "reject",
                "reason": "needs review",
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )

        assert seen[0].method == "POST"
        assert seen[0].url.path == routes.APPROVAL_REJECT_PATH.format(
            approval_id="approval-1"
        )
        assert json.loads(seen[0].content) == {"reason": "needs review"}
        assert result["safety"]["operation_id"] == "event-2"

    asyncio.run(run())


def test_alert_lifecycle_tools_post_existing_gateway_apis() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if request.url.path.endswith("/promote-incident"):
                return httpx.Response(200, json={"incident_id": "incident-1"})
            return httpx.Response(200, json={"event_id": "alert-1", "status": "acked"})

        registry = default_tool_registry()
        client = _client(handler, writes_enabled=True)

        await registry.call(
            "ack_alert_event",
            {
                "event_id": "alert-1",
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )
        result = await registry.call(
            "promote_alert_incident",
            {
                "event_id": "alert-1",
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )

        assert [request.method for request in seen] == ["POST", "POST"]
        assert seen[0].url.path == routes.ALERT_EVENT_ACK_PATH.format(event_id="alert-1")
        assert seen[1].url.path == routes.ALERT_EVENT_PROMOTE_INCIDENT_PATH.format(
            event_id="alert-1"
        )
        assert all(json.loads(request.content) == {} for request in seen)
        assert result["safety"]["operation_id"] == "incident-1"

    asyncio.run(run())


def test_manifest_change_preview_and_safe_pr_submission_are_separate() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []
        payload = {
            "application_id": "app-1",
            "base_sha": "a" * 40,
            "source_sha256": f"sha256:{'b' * 64}",
            "edited_yaml": "apiVersion: v1\nkind: Secret\nstringData:\n  password: plain\n",
        }

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if request.url.path.endswith("/preview"):
                return httpx.Response(
                    200,
                    json={
                        "valid": True,
                        "changed": True,
                        "base_sha": "a" * 40,
                        "source_sha256": f"sha256:{'b' * 64}",
                        "desired_sha256": f"sha256:{'c' * 64}",
                        "diff": "--- old\n+++ new\n+  password: plain\n",
                        "errors": [],
                        "warnings": [],
                    },
                )
            return httpx.Response(
                200,
                json={
                    "accepted": True,
                    "event_id": "event-1",
                    "correlation_id": "corr-1",
                    "workflow_run_id": "workflow-1",
                    "approval_id": "approval-1",
                    "sync_state": "awaiting_pr_merge",
                    "credential_ref": "github-token-ref",
                    "payload": {
                        "kind": "Secret",
                        "metadata": {"name": "api-secret"},
                        "data": {"password": "submitted-secret"},
                        "token": "approval-secret",
                    },
                    "message": "password=db-pass admin@example.com",
                },
            )

        registry = default_tool_registry()
        preview = await registry.call(
            "propose_manifest_change",
            {
                "resource_id": "resource-1",
                "payload": payload,
                "reason": "reviewed yaml edit",
            },
            _client(handler),
        )

        assert len(seen) == 1
        assert seen[0].method == "POST"
        assert seen[0].url.path == routes.RESOURCE_MANIFEST_PREVIEW_PATH.format(
            resource_id="resource-1"
        )
        assert json.loads(seen[0].content) == payload
        assert preview["data"]["valid"] is True
        assert preview["data"]["diff"] == "[REDACTED]"
        assert preview["data"]["diff_redacted"] is True
        assert "plain" not in json.dumps(preview["data"], ensure_ascii=False)
        assert preview["safety"]["mutating"] is False
        assert preview["safety"]["approval_required"] is True
        assert preview["safety"]["proposal"]["api_path"] == routes.RESOURCE_MANIFEST_APPROVE_PATH.format(
            resource_id="resource-1"
        )
        assert preview["safety"]["proposal"]["body"]["edited_yaml"] == "[REDACTED]"

        result = await registry.call(
            "propose_manifest_change",
            {
                "resource_id": "resource-1",
                "payload": payload,
                "reason": "reviewed yaml edit",
                "dry_run": False,
                "approval_confirmed": True,
            },
            _client(handler, writes_enabled=True),
        )

        assert seen[1].url.path == routes.RESOURCE_MANIFEST_APPROVE_PATH.format(
            resource_id="resource-1"
        )
        assert json.loads(seen[1].content) == {
            **payload,
            "confirmed": True,
            "reason": "reviewed yaml edit",
        }
        assert result["safety"]["operation_id"] == "event-1"
        result_json = json.dumps(result, ensure_ascii=False)
        for leaked in (
            "github-token-ref",
            "submitted-secret",
            "approval-secret",
            "db-pass",
            "admin@example.com",
        ):
            assert leaked not in result_json
        assert result["data"]["credential_ref"] == "[REDACTED]"
        assert result["data"]["payload"]["data"] == "[REDACTED]"
        assert result["data"]["payload"]["token"] == "[REDACTED]"

    asyncio.run(run())


def test_metric_query_and_release_tools_use_controlled_existing_apis() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []
        plan_payload = {
            "name": "backend release",
            "steps": [{"application_id": "app-1", "position": 0}],
        }

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if request.url.path.endswith("/run"):
                return httpx.Response(
                    200,
                    json={"accepted": True, "command_id": "cmd-metric", "correlation_id": "corr-1"},
                )
            if request.url.path == routes.RELEASE_PLANS_PATH:
                return httpx.Response(200, json={"plan": {"plan_id": "plan-1"}})
            return httpx.Response(200, json={"run": {"run_id": "run-1"}})

        registry = default_tool_registry()
        client = _client(handler, writes_enabled=True)

        dry_run = await registry.call(
            "run_metric_query_preset",
            {"cluster_id": "cluster-1", "preset_id": "cpu-high"},
            client,
        )
        assert seen == []
        assert dry_run["safety"]["approval_required"] is True

        metric = await registry.call(
            "run_metric_query_preset",
            {
                "cluster_id": "cluster-1",
                "preset_id": "cpu-high",
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )
        created = await registry.call(
            "create_release_plan",
            {
                "payload": plan_payload,
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )
        started = await registry.call(
            "start_release_run",
            {
                "payload": {**plan_payload, "plan_id": "plan-1"},
                "dry_run": False,
                "approval_confirmed": True,
            },
            client,
        )

        assert [request.url.path for request in seen] == [
            routes.CLUSTER_METRIC_QUERY_PRESET_RUN_PATH.format(
                cluster_id="cluster-1",
                preset_id="cpu-high",
            ),
            routes.RELEASE_PLANS_PATH,
            routes.RELEASE_PLAN_START_PATH,
        ]
        assert metric["safety"]["operation_id"] == "cmd-metric"
        assert created["safety"]["operation_id"] == "plan-1"
        assert started["safety"]["operation_id"] == "run-1"

    asyncio.run(run())


def test_write_operation_id_only_uses_gateway_response_ids() -> None:
    async def run() -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"accepted": True})

        result = await default_tool_registry().call(
            "approve_or_reject_workflow",
            {
                "approval_id": "approval-1",
                "decision": "grant",
                "dry_run": False,
                "approval_confirmed": True,
            },
            _client(handler, writes_enabled=True),
        )

        assert result["safety"]["operation_id"] is None

    asyncio.run(run())


def test_write_payloads_must_be_finite_bounded_json() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        try:
            await default_tool_registry().call(
                "create_alert_rule",
                {"payload": {"threshold": float("nan")}},
                _client(lambda request: seen.append(request) or httpx.Response(500)),
            )
        except ValueError as exc:
            assert "finite JSON object" in str(exc)
        else:
            raise AssertionError("write payloads must reject NaN")

        try:
            await default_tool_registry().call(
                "create_alert_rule",
                {"payload": {"body": "x" * (65 * 1024)}},
                _client(lambda request: seen.append(request) or httpx.Response(500)),
            )
        except ValueError as exc:
            assert "at most" in str(exc)
        else:
            raise AssertionError("oversized write payloads must fail closed")

        assert seen == []

    asyncio.run(run())


def test_list_clusters_calls_existing_gateway_with_auth_and_safety_metadata() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"clusters": [{"cluster_id": "cluster-1"}]})

        client = _client(handler)
        result = await default_tool_registry().call("list_clusters", {"limit": 3}, client)

        assert seen[0].method == "GET"
        assert seen[0].url.path == "/clusters"
        assert dict(seen[0].url.params) == {"limit": "3"}
        assert seen[0].headers["authorization"] == "Bearer token-1"
        assert result["data"]["clusters"][0]["cluster_id"] == "cluster-1"
        assert result["safety"] == {
            "mutating": False,
            "dry_run": None,
            "proposal": None,
            "approval_required": False,
            "operation_id": None,
            "api_path": "/clusters",
            "reason": (
                "This read-only MCP tool only issues an authenticated GET request to the "
                "existing Opsia API Gateway. There is no mutation to preview, approve, "
                "or track as an operation."
            ),
        }

    asyncio.run(run())


def test_resource_tools_use_inventory_routes_and_actual_arguments() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if request.url.path.endswith("/inventory/resources"):
                return httpx.Response(200, json={"resources": [{"name": "api"}]})
            return httpx.Response(200, json={"resource": {"name": "api"}, "related": {}, "events": []})

        registry = default_tool_registry()
        client = _client(handler)

        await registry.call(
            "list_resources",
            {
                "cluster_id": "cluster-1",
                "resource_type": "pod",
                "namespace": "shop",
                "limit": 7,
            },
            client,
        )
        await registry.call(
            "get_resource_detail",
            {
                "cluster_id": "cluster-1",
                "resource_type": "pod",
                "kind": "Pod",
                "namespace": "shop",
                "name": "api",
            },
            client,
        )

        assert seen[0].url.path == "/clusters/cluster-1/inventory/resources"
        assert dict(seen[0].url.params) == {
            "resource_type": "pod",
            "namespace": "shop",
            "include_deleted": "false",
            "limit": "7",
        }
        assert seen[1].url.path == "/clusters/cluster-1/inventory/resource-detail"
        assert dict(seen[1].url.params)["kind"] == "Pod"
        assert dict(seen[1].url.params)["name"] == "api"

    asyncio.run(run())


def test_list_pending_approvals_uses_gitops_filter_then_existing_run_apis() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if request.url.path == routes.GITOPS_FILTER_RESULTS_PATH:
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            {"change_id": "change-1", "application_id": "app-1"},
                            {"change_id": "change-2", "application_id": "app-1"},
                            {"change_id": "change-3", "application_id": "app-2"},
                        ],
                        "has_more": False,
                    },
                )
            if request.url.path == routes.APPLICATION_RUNS_PATH.format(application_id="app-1"):
                return httpx.Response(
                    200,
                    json={
                        "runs": [
                            {
                                "workflow_run_id": "workflow-1",
                                "approval_id": "approval-1",
                                "approval_status": "requested",
                            },
                            {
                                "workflow_run_id": "workflow-done",
                                "approval_status": "granted",
                            },
                        ]
                    },
                )
            if request.url.path == routes.APPLICATION_RUNS_PATH.format(application_id="app-2"):
                return httpx.Response(
                    200,
                    json={
                        "runs": [
                            {
                                "workflow_run_id": "workflow-2",
                                "approval_id": "approval-2",
                                "approvals": [{"status": "requested"}],
                            }
                        ]
                    },
                )
            return httpx.Response(
                200,
                json={
                    "runs": [
                        {
                            "run_id": "release-run-1",
                            "steps": [{"status": "waiting_for_approval"}],
                        }
                    ]
                },
            )

        result = await default_tool_registry().call(
            "list_pending_approvals",
            {"limit": 3},
            _client(handler),
        )

        assert [request.url.path for request in seen] == [
            routes.GITOPS_FILTER_RESULTS_PATH,
            routes.APPLICATION_RUNS_PATH.format(application_id="app-1"),
            routes.APPLICATION_RUNS_PATH.format(application_id="app-2"),
            routes.RELEASE_RUNS_PATH,
        ]
        assert dict(seen[0].url.params) == {
            gateway_params.GITOPS_APPROVAL_QUERY: "requested",
            "limit": "3",
        }
        assert dict(seen[3].url.params) == {
            "status": "waiting_for_approval",
            "limit": "3",
        }
        assert result["data"]["source"] == "gitops_filter_application_runs_release_runs"
        assert [run["approval_id"] for run in result["data"]["application_runs"]] == [
            "approval-1",
            "approval-2",
        ]
        assert result["data"]["release_runs"][0]["run_id"] == "release-run-1"
        assert result["data"]["pending_count"] == 3
        assert result["data"]["gitops_pending_count"] == 3

    asyncio.run(run())


def test_incident_and_log_tools_use_sanitized_read_apis() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if request.url.path == "/rca-reports":
                return httpx.Response(200, json={"items": [{"correlation_id": "corr-1"}]})
            if request.url.path == "/evidence/windows":
                return httpx.Response(200, json={"items": [{"evidence_key": "ws:cluster:evidence-1"}]})
            return httpx.Response(200, json={"payload": {"logs": [{"line": "observed"}]}})

        registry = default_tool_registry()
        client = _client(handler)

        await registry.call("list_recent_incidents", {"limit": 5, "correlation_id": "corr-1"}, client)
        await registry.call("list_evidence_windows", {"limit": 4}, client)
        await registry.call("get_log_evidence", {"evidence_key": "ws:cluster:evidence-1"}, client)

        assert seen[0].url.path == "/rca-reports"
        assert dict(seen[0].url.params) == {"correlation_id": "corr-1", "limit": "5", "offset": "0"}
        assert seen[1].url.path == "/evidence/windows"
        assert dict(seen[1].url.params) == {"limit": "4", "offset": "0"}
        assert str(seen[2].url).startswith(
            "https://opsia.test/evidence/windows/ws%3Acluster%3Aevidence-1"
        )
        assert dict(seen[2].url.params) == {
            "source": gateway_evidence.EVIDENCE_SOURCE_LOGS
        }

    asyncio.run(run())


def test_get_log_evidence_rejects_source_override() -> None:
    async def run() -> None:
        registry = default_tool_registry()
        client = _client(lambda _: httpx.Response(200, json={}))

        try:
            await registry.call(
                "get_log_evidence",
                {"evidence_key": "evidence-1", "source": "kubernetes"},
                client,
            )
        except ValueError as exc:
            assert "unknown arguments: source" in str(exc)
        else:
            raise AssertionError("get_log_evidence must not allow non-log source overrides")

    asyncio.run(run())


def test_get_log_evidence_returns_unavailable_without_invented_payload_when_window_has_no_logs() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            if (
                dict(request.url.params).get("source")
                == gateway_evidence.EVIDENCE_SOURCE_LOGS
            ):
                return httpx.Response(404, json={"detail": "source unavailable"})
            return httpx.Response(200, json={"evidence_key": "evidence-1", "payload": {"metrics": []}})

        result = await default_tool_registry().call(
            "get_log_evidence",
            {"evidence_key": "evidence-1"},
            _client(handler),
        )

        assert result["data"] == {
            "evidence_key": "evidence-1",
            "source": gateway_evidence.EVIDENCE_SOURCE_LOGS,
            "available": False,
            "payload": None,
        }
        assert len(seen) == 2
        assert result["safety"]["mutating"] is False

    asyncio.run(run())


def test_get_log_evidence_keeps_missing_window_as_api_error() -> None:
    async def run() -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, json={"detail": "Evidence window not found"})

        try:
            await default_tool_registry().call(
                "get_log_evidence",
                {"evidence_key": "missing-window"},
                _client(handler),
            )
        except ManagementApiError as exc:
            assert exc.status_code == 404
            assert exc.detail == "Evidence window not found"
        else:
            raise AssertionError("missing evidence windows must remain API errors")

    asyncio.run(run())


def test_management_api_error_detail_is_redacted() -> None:
    async def run() -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                500,
                json={
                    "detail": (
                        "authorization: Bearer secret-token "
                        "cookie: service_session=session-token "
                        "admin@example.com token=plain-secret"
                    )
                },
            )

        try:
            await _client(handler).get_json("/clusters")
        except ManagementApiError as exc:
            assert "secret-token" not in exc.detail
            assert "session-token" not in exc.detail
            assert "admin@example.com" not in exc.detail
            assert "plain-secret" not in exc.detail
            assert "[REDACTED]" in exc.detail
        else:
            raise AssertionError("management API errors should be raised")

    asyncio.run(run())


def test_management_api_non_json_error_detail_is_redacted_from_limited_body() -> None:
    async def run() -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                502,
                text=(
                    "upstream failure authorization: Bearer secret-token "
                    "cookie: service_session=session-token password=plain-secret"
                ),
            )

        try:
            await _client(handler).get_json("/clusters")
        except ManagementApiError as exc:
            assert exc.status_code == 502
            assert "secret-token" not in exc.detail
            assert "session-token" not in exc.detail
            assert "plain-secret" not in exc.detail
            assert "[REDACTED]" in exc.detail
        else:
            raise AssertionError("management API errors should be raised")

    asyncio.run(run())


def test_mcp_read_results_redact_sensitive_gateway_payloads() -> None:
    async def run() -> None:
        sensitive_response = {
            "dead_letters": [
                {
                    "dead_letter_id": 7,
                    "original_subject": "command.requested",
                    "consumer": "command-worker",
                    "payload": {
                        "kind": "Secret",
                        "metadata": {"name": "db-secret"},
                        "data": {"password": "plain-secret"},
                        "stringData": {"api_key": "token-value"},
                        "token": "top-secret-token",
                        "raw": "authorization: Bearer raw-secret cookie: session=raw-cookie",
                        "env": [
                            {"name": "DATABASE_PASSWORD", "value": "env-secret"},
                            {"key": "api_token", "literal": "literal-secret"},
                        ],
                    },
                    "error": "password=db-pass admin@example.com",
                    "credential_ref": "github-token-ref",
                }
            ]
        }

        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=sensitive_response)

        registry = default_tool_registry()
        direct = await registry.call("list_dead_letters", {}, _client(handler))
        server = InternalControlMcpServer(registry, _client(handler))
        response = await server.handle(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "list_dead_letters", "arguments": {}},
            }
        )

        direct_json = json.dumps(direct, ensure_ascii=False)
        server_json = json.dumps(response, ensure_ascii=False)
        for leaked in (
            "plain-secret",
            "token-value",
            "top-secret-token",
            "raw-secret",
            "raw-cookie",
            "db-pass",
            "env-secret",
            "literal-secret",
            "admin@example.com",
            "github-token-ref",
        ):
            assert leaked not in direct_json
            assert leaked not in server_json
        assert direct["data"]["dead_letters"][0]["payload"]["data"] == "[REDACTED]"
        assert direct["data"]["dead_letters"][0]["payload"]["stringData"] == "[REDACTED]"
        assert direct["data"]["dead_letters"][0]["payload"]["token"] == "[REDACTED]"
        assert direct["data"]["dead_letters"][0]["payload"]["raw"] == "[REDACTED]"
        assert direct["data"]["dead_letters"][0]["payload"]["env"][0]["value"] == "[REDACTED]"
        assert (
            direct["data"]["dead_letters"][0]["payload"]["env"][1]["literal"]
            == "[REDACTED]"
        )
        assert direct["data"]["dead_letters"][0]["credential_ref"] == "[REDACTED]"
        assert "[REDACTED]" in server_json

    asyncio.run(run())


def test_management_api_response_size_is_bounded() -> None:
    async def run() -> None:
        transport = httpx.MockTransport(
            lambda _request: httpx.Response(200, json={"items": ["x" * 200]})
        )
        http_client = httpx.AsyncClient(transport=transport)
        settings = McpSettings(
            api_base_url="https://opsia.test",
            bearer_token="token-1",
            max_response_bytes=32,
        ).validate()
        client = ManagementApiClient(settings, http_client=http_client)

        try:
            await client.get_json("/clusters")
        except ManagementApiError as exc:
            assert "exceeded 32 bytes" in exc.detail
        else:
            raise AssertionError("oversized management API responses should fail closed")

    asyncio.run(run())


def test_management_api_rejects_unsafe_paths_and_query_values() -> None:
    async def run() -> None:
        client = _client(lambda _: httpx.Response(200, json={}))

        for path in ("clusters", "//evil.test/clusters", "/clusters?debug=true", "/clusters\nx"):
            try:
                await client.get_json(path)
            except ManagementApiError as exc:
                assert "unsafe management API path" in exc.detail
            else:
                raise AssertionError(f"unsafe path should fail closed: {path!r}")

        try:
            await client.get_json("/clusters", {"cluster_id": "cluster-1\nx"})
        except ManagementApiError as exc:
            assert "unsafe management API query parameter value" in exc.detail
        else:
            raise AssertionError("unsafe query values should fail closed")

        try:
            await client._request_json("DELETE", "/clusters")  # noqa: SLF001
        except ManagementApiError as exc:
            assert "unsupported management API method" in exc.detail
        else:
            raise AssertionError("unsupported management API methods should fail closed")

        try:
            await client._request_json("GET", "/clusters", json_body={})  # noqa: SLF001
        except ManagementApiError as exc:
            assert "request body is only allowed for POST or PATCH" in exc.detail
        else:
            raise AssertionError("GET request bodies should fail closed")

        try:
            await client.post_json("/commands/cmd-1/cancel", {}, headers={"Host": "evil.test"})
        except ManagementApiError as exc:
            assert "unsupported management API extra header" in exc.detail
        else:
            raise AssertionError("arbitrary extra headers should fail closed")

        try:
            await client.post_json(
                "/commands/cmd-1/cancel",
                {},
                headers={"Authorization": "Bearer other"},
            )
        except ManagementApiError as exc:
            assert "unsupported management API extra header" in exc.detail
        else:
            raise AssertionError("auth header overrides should fail closed")

        try:
            await client.post_json(
                "/commands/cmd-1/cancel",
                {},
                headers={"Idempotency-Key": "bad\nkey"},
            )
        except ManagementApiError as exc:
            assert "unsafe management API header value" in exc.detail
        else:
            raise AssertionError("unsafe idempotency header should fail closed")

    asyncio.run(run())


def test_server_internal_errors_do_not_expose_exception_details() -> None:
    async def run() -> None:
        class ExplodingRegistry:
            def list_tools(self) -> list[dict[str, Any]]:
                return []

            async def call(
                self,
                _name: str,
                _arguments: dict[str, Any],
                _client: ManagementApiClient,
            ) -> dict[str, Any]:
                raise RuntimeError("token=super-secret")

        server = InternalControlMcpServer(
            ExplodingRegistry(),  # type: ignore[arg-type]
            _client(lambda _: httpx.Response(200, json={})),
        )
        response = await server.handle(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "list_clusters", "arguments": {}},
            }
        )

        assert response["error"]["message"] == "internal MCP server error"
        assert "super-secret" not in json.dumps(response)

    asyncio.run(run())


def test_server_tools_call_returns_structured_content_and_text_fallback() -> None:
    async def run() -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"clusters": []})

        server = InternalControlMcpServer(default_tool_registry(), _client(handler))
        response = await server.handle(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "list_clusters", "arguments": {}},
            }
        )

        result = response["result"]
        text = result["content"][0]["text"]
        assert result["isError"] is False
        assert result["structuredContent"]["tool"] == "list_clusters"
        assert json.loads(text)["tool"] == "list_clusters"

    asyncio.run(run())


def test_server_reports_validation_errors_as_tool_errors() -> None:
    async def run() -> None:
        server = InternalControlMcpServer(default_tool_registry(), _client(lambda _: httpx.Response(500)))
        response = await server.handle(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "get_cluster_summary",
                    "arguments": {"cluster_id": ""},
                },
            }
        )

        result = response["result"]
        assert result["isError"] is True
        assert result["structuredContent"]["error"] == "invalid_tool_input"

    asyncio.run(run())


def test_server_validation_errors_redact_sensitive_input_details() -> None:
    async def run() -> None:
        response = await InternalControlMcpServer(
            default_tool_registry(),
            _client(lambda _: httpx.Response(500)),
        ).handle(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "list_clusters",
                    "arguments": {"authorization: Bearer secret-token": "ignored"},
                },
            }
        )

        payload = json.dumps(response, ensure_ascii=False)
        detail = response["result"]["structuredContent"]["detail"]
        assert response["result"]["isError"] is True
        assert response["result"]["structuredContent"]["error"] == "invalid_tool_input"
        assert "secret-token" not in payload
        assert "[REDACTED]" in detail

    asyncio.run(run())


def test_tool_arguments_reject_control_characters() -> None:
    async def run() -> None:
        response = await InternalControlMcpServer(
            default_tool_registry(),
            _client(lambda _: httpx.Response(500)),
        ).handle(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "get_cluster_summary",
                    "arguments": {"cluster_id": "cluster-1\nx"},
                },
            }
        )

        assert response["result"]["isError"] is True
        assert response["result"]["structuredContent"]["error"] == "invalid_tool_input"
        assert "unsafe control characters" in response["result"]["structuredContent"]["detail"]

    asyncio.run(run())


def test_server_rejects_invalid_params_and_arguments_types() -> None:
    async def run() -> None:
        server = InternalControlMcpServer(default_tool_registry(), _client(lambda _: httpx.Response(500)))

        invalid_params = await server.handle(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": [],
            }
        )
        invalid_arguments = await server.handle(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "list_clusters", "arguments": []},
            }
        )

        assert invalid_params["error"]["code"] == -32602
        assert invalid_arguments["error"]["code"] == -32602

    asyncio.run(run())


def _client(handler: Any, *, writes_enabled: bool = False) -> ManagementApiClient:
    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    settings = McpSettings(
        api_base_url="https://opsia.test",
        bearer_token="token-1",
        writes_enabled=writes_enabled,
    ).validate()
    return ManagementApiClient(settings, http_client=http_client)
