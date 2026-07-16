from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx

from packages.contracts.gateway import routes
from packages.security.trusted_proxy import TRUSTED_PROXY_AUTH_SECRET_ENV
from services.mcp.internal_control.api_client import ManagementApiClient, ManagementApiError
from services.mcp.internal_control.config import (
    MANAGEMENT_BASE_URL_ENV,
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
    OPSIA_MCP_SESSION_COOKIE_ENV,
    OPSIA_MCP_SESSION_COOKIE_NAME_ENV,
    OPSIA_MCP_TRUSTED_PROXY_SECRET_ENV,
    OPSIA_MCP_TIMEOUT_SECONDS_ENV,
    OPSIA_MCP_MAX_RESPONSE_BYTES_ENV,
    MANAGEMENT_BASE_URL_ENV,
    TRUSTED_PROXY_AUTH_SECRET_ENV,
)


def test_settings_fail_closed_without_auth() -> None:
    settings = McpSettings(api_base_url="http://opsia.test")

    try:
        settings.validate()
    except McpConfigurationError as exc:
        assert "required" in str(exc)
    else:
        raise AssertionError("MCP settings must require an authentication mechanism")


def test_load_settings_ignores_global_trusted_proxy_secret(monkeypatch: Any) -> None:
    for name in MCP_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv(MANAGEMENT_BASE_URL_ENV, "http://opsia.test")
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
    monkeypatch.setenv(OPSIA_MCP_API_BASE_URL_ENV, "http://opsia.test/api/")
    monkeypatch.setenv(OPSIA_MCP_BEARER_TOKEN_ENV, " token-1 ")
    monkeypatch.setenv(OPSIA_MCP_ENABLE_WRITES_ENV, "true")
    monkeypatch.setenv(OPSIA_MCP_TIMEOUT_SECONDS_ENV, "5")
    monkeypatch.setenv(OPSIA_MCP_MAX_RESPONSE_BYTES_ENV, "4096")

    settings = load_settings()

    assert settings.api_base_url == "http://opsia.test/api"
    assert settings.bearer_token == "token-1"
    assert settings.writes_enabled is True
    assert settings.timeout_seconds == 5
    assert settings.max_response_bytes == 4096


def test_settings_reject_invalid_write_enable_flag(monkeypatch: Any) -> None:
    for name in MCP_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv(OPSIA_MCP_API_BASE_URL_ENV, "http://opsia.test")
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
        api_base_url="http://opsia.test/api/",
        session_cookie="session-token",
    ).validate()

    headers = settings.auth_headers()

    assert settings.api_base_url == "http://opsia.test/api"
    assert headers["cookie"] == "service_session=session-token"
    assert "x-kubeheal-internal-auth" not in headers
    assert "session-token" not in repr(settings)


def test_settings_reject_mixed_auth_and_unsafe_url_or_header_values() -> None:
    invalid_settings = [
        McpSettings(
            api_base_url="http://opsia.test",
            session_cookie="session-token",
            trusted_proxy_secret="x" * 32,
        ),
        McpSettings(api_base_url="ftp://opsia.test", bearer_token="token-1"),
        McpSettings(api_base_url="http://user:pass@opsia.test", bearer_token="token-1"),
        McpSettings(api_base_url="http://opsia.test/api?debug=true", bearer_token="token-1"),
        McpSettings(api_base_url="http://opsia.test", bearer_token="token-1\r\nx-test: y"),
        McpSettings(api_base_url="http://opsia.test", trusted_proxy_secret="x" * 32),
        McpSettings(api_base_url="http://opsia.test", bearer_token="token-1", timeout_seconds=61),
        McpSettings(
            api_base_url="http://opsia.test",
            bearer_token="token-1",
            max_response_bytes=9 * 1024 * 1024,
        ),
        McpSettings(
            api_base_url="http://opsia.test",
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
        api_base_url="http://opsia.test",
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


def test_registry_exposes_expected_tools_with_safety_annotations() -> None:
    tools = default_tool_registry().list_tools()
    names = {tool["name"] for tool in tools}

    assert names == {
        "approve_or_reject_workflow",
        "create_alert_rule",
        "create_command_request",
        "get_cluster_summary",
        "get_log_evidence",
        "get_resource_detail",
        "list_evidence_windows",
        "list_clusters",
        "list_recent_incidents",
        "list_resources",
        "request_recovery_action",
    }
    assert all(tool["inputSchema"]["additionalProperties"] is False for tool in tools)
    read_tools = {
        "get_cluster_summary",
        "get_log_evidence",
        "get_resource_detail",
        "list_evidence_windows",
        "list_clusters",
        "list_recent_incidents",
        "list_resources",
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
            "destructiveHint": False,
            "idempotentHint": False,
        }
        for name in write_tools
    )

    tools[0]["inputSchema"]["additionalProperties"] = True
    assert default_tool_registry().list_tools()[0]["inputSchema"]["additionalProperties"] is False


def test_all_read_tools_call_existing_gateway_routes_with_get_only() -> None:
    async def run() -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200, json={"ok": True})

        registry = default_tool_registry()
        client = _client(handler)

        await registry.call("list_clusters", {}, client)
        await registry.call("get_cluster_summary", {"cluster_id": "cluster-1"}, client)
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
        await registry.call("list_evidence_windows", {}, client)
        await registry.call("get_log_evidence", {"evidence_key": "evidence-1"}, client)

        expected_paths = [
            routes.CLUSTERS_PATH,
            routes.CLUSTER_SUMMARY_PATH.format(cluster_id="cluster-1"),
            routes.CLUSTER_INVENTORY_RESOURCES_PATH.format(cluster_id="cluster-1"),
            routes.CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH.format(cluster_id="cluster-1"),
            routes.RCA_REPORTS_PATH,
            routes.EVIDENCE_WINDOWS_PATH,
            routes.EVIDENCE_WINDOW_PATH.format(evidence_key="evidence-1"),
        ]
        assert [request.method for request in seen] == ["GET"] * len(expected_paths)
        assert [request.url.path for request in seen] == expected_paths
        assert all(request.content == b"" for request in seen)

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
        assert proposal["body"]["diff"]["data"] == "[REDACTED]"
        assert proposal["body"]["diff"]["stringData"] == "[REDACTED]"
        assert "plain-secret" not in json.dumps(proposal, ensure_ascii=False)
        assert "token-value" not in json.dumps(proposal, ensure_ascii=False)

        await default_tool_registry().call(
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
                    },
                ),
                writes_enabled=True,
            ),
        )

        assert json.loads(seen[0].content) == payload

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
            "http://opsia.test/evidence/windows/ws%3Acluster%3Aevidence-1"
        )
        assert dict(seen[2].url.params) == {"source": "logs"}

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
            if dict(request.url.params).get("source") == "logs":
                return httpx.Response(404, json={"detail": "source unavailable"})
            return httpx.Response(200, json={"evidence_key": "evidence-1", "payload": {"metrics": []}})

        result = await default_tool_registry().call(
            "get_log_evidence",
            {"evidence_key": "evidence-1"},
            _client(handler),
        )

        assert result["data"] == {
            "evidence_key": "evidence-1",
            "source": "logs",
            "available": False,
            "payload": None,
            "reason": "logs evidence source is not available for this evidence window",
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


def test_management_api_response_size_is_bounded() -> None:
    async def run() -> None:
        transport = httpx.MockTransport(
            lambda _request: httpx.Response(200, json={"items": ["x" * 200]})
        )
        http_client = httpx.AsyncClient(transport=transport)
        settings = McpSettings(
            api_base_url="http://opsia.test",
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
            assert "request body is only allowed for POST" in exc.detail
        else:
            raise AssertionError("GET request bodies should fail closed")

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
        api_base_url="http://opsia.test",
        bearer_token="token-1",
        writes_enabled=writes_enabled,
    ).validate()
    return ManagementApiClient(settings, http_client=http_client)
