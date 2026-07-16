from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx

from services.mcp.internal_control.api_client import ManagementApiClient, ManagementApiError
from services.mcp.internal_control.config import McpConfigurationError, McpSettings
from services.mcp.internal_control.server import InternalControlMcpServer
from services.mcp.internal_control.tools import default_tool_registry


def test_settings_fail_closed_without_auth() -> None:
    settings = McpSettings(api_base_url="http://opsia.test")

    try:
        settings.validate()
    except McpConfigurationError as exc:
        assert "required" in str(exc)
    else:
        raise AssertionError("MCP settings must require an authentication mechanism")


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


def test_settings_support_explicit_trusted_proxy_auth_only() -> None:
    settings = McpSettings(
        api_base_url="http://opsia.test",
        trusted_proxy_secret="x" * 32,
    ).validate()

    headers = settings.auth_headers()

    assert headers["x-kubeheal-internal-auth"] == "x" * 32
    assert "authorization" not in headers
    assert "cookie" not in headers


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


def test_registry_exposes_only_read_tools() -> None:
    tools = default_tool_registry().list_tools()
    names = {tool["name"] for tool in tools}

    assert names == {
        "get_cluster_summary",
        "get_log_evidence",
        "get_resource_detail",
        "list_evidence_windows",
        "list_clusters",
        "list_recent_incidents",
        "list_resources",
    }
    assert all(tool["inputSchema"]["additionalProperties"] is False for tool in tools)


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


def test_get_log_evidence_returns_empty_when_window_has_no_logs() -> None:
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
            "payload": {"logs": []},
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


def _client(handler: Any) -> ManagementApiClient:
    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport)
    settings = McpSettings(
        api_base_url="http://opsia.test",
        bearer_token="token-1",
    ).validate()
    return ManagementApiClient(settings, http_client=http_client)
