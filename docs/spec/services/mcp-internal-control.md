---
source_commit: ee837d0c
status: synced
---

# internal-control MCP — Opsia Gateway 를 보수적으로 호출하는 내부 제어 MCP 서버

> 소스: `src/services/mcp/internal_control/` · 테스트: `tests/test_internal_mcp.py`

## 책임 (Responsibility)

- AI 클라이언트가 Opsia 관리 평면을 읽고, 제한된 쓰기 요청을 제안·승인 흐름으로 보낼 수 있게 MCP stdio 서버를 제공한다.
- 읽기 도구는 인증된 사용자 권한으로 기존 [api-gateway](gateway-api-gateway.md) GET 라우트만 호출한다.
- 쓰기 도구는 기본 `dry_run=true` 제안만 반환한다. 실제 POST 는 `dry_run=false`, `approval_confirmed=true`, `OPSIA_MCP_ENABLE_WRITES=true`가 모두 맞을 때만 기존 Gateway API로 전달한다.
- 하지 않는 것: DB 직접 접근, Kubernetes/Docker/subprocess 실행, service-admin trusted proxy secret 사용, Gateway RBAC·감사·workflow 상태 검사를 우회하는 mutation.
- 서버 이름은 `opsia-internal-control`, MCP protocol version 은 `2025-11-25`, 전송은 newline-delimited JSON-RPC over stdio 다.

## 먼저 이해할 것

이 MCP 서버는 새 권한 시스템이나 새 자동화 엔진이 아니다. AI가 직접 DB나 클러스터를 만지는 대신, 사람이 쓰는 Opsia Gateway API를 같은 인증 경계 안에서 호출하게 해 주는 얇은 adapter다.

```text
AI client
  -> MCP stdio(JSON-RPC)
  -> internal-control MCP tool
  -> Opsia api-gateway HTTP route
  -> 기존 domain router / RBAC / audit / workflow
```

그래서 이 문서를 읽을 때 가장 중요한 질문은 "AI가 무엇을 할 수 있나?"가 아니라 "AI가 기존 어떤 Gateway API를, 어떤 안전장치와 함께 호출하나?"다.

| 알고 싶은 것 | 먼저 볼 곳 | 같이 확인할 것 |
|---|---|---|
| MCP tool 목록과 입력값 | [tools.py](#toolspy) | 읽기/쓰기 tool handler 표 |
| 실제 권한 판정 위치 | [api-gateway](gateway-api-gateway.md) | 각 route의 session/admin/cluster access 규칙 |
| 인증·env 설정 | [config.py](#configpy) | [설정](#설정-settings), [불변식·오류](#불변식오류-invariants--errors) |
| MCP protocol 처리 | [server.py](#serverpy) | [프로토콜](#프로토콜-json-rpc--mcp) |
| 테스트를 어디에 추가할지 | `tests/test_internal_mcp.py` | [검증](#검증-tests) |

## 작업자별 읽는 법

| 작업자 | 읽을 부분 | 판단 기준 |
|---|---|---|
| Frontend / AI 패널 | `tool`, `data`, `safety`, `proposal`, `operation_id` 구조 | 화면은 `safety.approval_required=true`이면 사용자 승인 UI를 먼저 보여주고, `operation_id`는 실제 POST 후 Gateway 응답에 있을 때만 표시한다. |
| Backend / Gateway | Gateway route mapping, `ManagementApiClient`, `_post_or_propose` 흐름 | MCP가 새 domain 로직을 만들지 않고 기존 route 상수와 기존 router 권한 검사를 재사용하는지 본다. |
| Security / Ops | 인증 env, trusted proxy 금지, HTTP opt-in, redaction, byte limit | user-scoped token/cookie만 허용되고, service-admin secret·원문 credential·무제한 payload가 새지 않는지 본다. |
| QA / 테스트 | `tests/test_internal_mcp.py`, 기존 Gateway 회귀 테스트 | dry-run은 네트워크 POST가 없어야 하고, 실제 쓰기는 승인·env·Gateway 권한을 모두 통과해야 한다. |

## 용어

| 용어 | 이 문서에서의 의미 |
|---|---|
| MCP | AI client가 tool을 발견하고 호출하게 하는 Model Context Protocol 서버. 여기서는 stdio JSON-RPC 서버다. |
| Gateway | Opsia의 기존 HTTP 진입점. 인증, RBAC, 감사, workflow 상태 검사의 권위가 여기에 있다. |
| read tool | 기존 Gateway GET만 호출하는 tool. `mutating=false`, `approval_required=false`다. |
| write tool | 기존 Gateway POST를 보낼 수 있는 tool. 기본은 dry-run proposal이며 곧장 실행하지 않는다. |
| `dry_run` | 네트워크 write 없이 "이런 POST를 보내려 한다"는 proposal만 반환하는 모드. 기본값은 `true`다. |
| `proposal` | 실제 보낼 method/path/body를 redaction 해서 보여주는 제안서. 사용자 승인 UI나 감사 설명에 쓴다. |
| `approval_confirmed` | 사용자가 proposal을 보고 승인했다는 MCP 입력. Gateway의 실제 승인/RBAC 검사를 대체하지 않는다. |
| `approval_required` | caller가 사용자 승인 단계를 거쳐야 함을 알려주는 safety 출력 필드. |
| `operation_id` | 실제 POST 뒤 Gateway 응답에서만 추출하는 추적 ID. MCP가 새로 만들지 않는다. |

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.contracts.gateway.routes` | [../../packages/contracts.md](../packages/contracts.md) | 기존 Gateway route 상수만 사용해 GET/POST 경로 구성 |
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `env`, `Auth.SESSION_COOKIE_NAME` |
| import | `packages.security.log_lines` | [../../packages/security.md](../packages/security.md) | error/proposal 문자열 redaction |
| 외부 | Opsia api-gateway HTTP | [gateway-api-gateway.md](gateway-api-gateway.md) | 인증 헤더를 포함한 GET/POST 호출 |
| 외부 | MCP host stdio | — | JSON-RPC request/response 라인 송수신 |
| 테스트 | `httpx.MockTransport` | — | Gateway 호출을 실제 네트워크 없이 검증 |

## 공개 인터페이스 (Public API)

### app.py

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `main` | `src/services/mcp/internal_control/app.py :: main` | `src/services/mcp/internal_control/server.py :: main`을 import해 `SystemExit(main())`로 실행하는 모듈 진입점. `python -m services.mcp.internal_control.app` 형태의 stdio 실행을 담당한다. |

### config.py

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `McpConfigurationError` | `src/services/mcp/internal_control/config.py :: McpConfigurationError` | 안전하게 시작할 수 없는 MCP 설정 오류. `amain()`은 이 오류를 stderr로 쓰고 exit code `2`를 반환한다. |
| `McpSettings` | `src/services/mcp/internal_control/config.py :: McpSettings` | Gateway base URL, 인증 방식, write enable flag, timeout, 응답 크기 상한을 담는 frozen dataclass. |
| `McpSettings.validate()` | `src/services/mcp/internal_control/config.py :: McpSettings.validate` | base URL, 인증 방식, header 값, timeout/response 크기, trusted proxy secret 금지 규칙을 fail-closed로 검증하고 trim된 설정을 반환한다. |
| `McpSettings.has_authentication()` | `src/services/mcp/internal_control/config.py :: McpSettings.has_authentication` | 설정된 인증 방식이 하나 이상 있는지 반환한다. 실제 유효성은 `validate()`가 정확히 하나인지 검사한다. |
| `McpSettings.auth_mechanisms()` | `src/services/mcp/internal_control/config.py :: McpSettings.auth_mechanisms` | `bearer`, `cookie`, `session_cookie` 중 설정된 인증 방식을 반환한다. 정확히 하나만 허용된다. |
| `McpSettings.auth_headers()` | `src/services/mcp/internal_control/config.py :: McpSettings.auth_headers` | `accept: application/json`과 user-scoped `authorization` 또는 `cookie` 헤더를 만든다. `OPSIA_MCP_TRUSTED_PROXY_SECRET`은 여기서도 금지된다. |
| `load_settings()` | `src/services/mcp/internal_control/config.py :: load_settings` | env를 읽어 `McpSettings(...).validate()`를 반환한다. `OPSIA_MCP_API_BASE_URL`이 `MANAGEMENT_BASE_URL`보다 우선한다. |

설정 상수:

| 상수 | 값/의미 |
|---|---|
| `OPSIA_MCP_API_BASE_URL_ENV` | `"OPSIA_MCP_API_BASE_URL"` |
| `MANAGEMENT_BASE_URL_ENV` | `"MANAGEMENT_BASE_URL"` fallback base URL |
| `OPSIA_MCP_BEARER_TOKEN_ENV` / `OPSIA_MCP_COOKIE_ENV` / `OPSIA_MCP_SESSION_COOKIE_ENV` | user-scoped 인증 입력. 셋 중 정확히 하나만 허용 |
| `OPSIA_MCP_SESSION_COOKIE_NAME_ENV` | session cookie 이름. 기본 `Auth.SESSION_COOKIE_NAME` |
| `OPSIA_MCP_TRUSTED_PROXY_SECRET_ENV` | 입력돼도 금지. MCP는 service-admin trusted proxy 인증을 쓰지 않는다 |
| `OPSIA_MCP_ENABLE_WRITES_ENV` | `"true"`일 때만 승인된 쓰기 POST 제출 허용 |
| `OPSIA_MCP_ALLOW_INSECURE_HTTP_ENV` | loopback 외 `http://` base URL을 명시 허용할 때만 `"true"` |
| `OPSIA_MCP_TIMEOUT_SECONDS_ENV` | Gateway request timeout. 기본 `10.0`, 상한 `60.0` |
| `OPSIA_MCP_MAX_RESPONSE_BYTES_ENV` | Gateway response body 상한. 기본 `2 MiB`, 상한 `8 MiB` |
| `DEFAULT_TIMEOUT_SECONDS` / `MAX_TIMEOUT_SECONDS` | `10.0` / `60.0` |
| `DEFAULT_MAX_RESPONSE_BYTES` / `MAX_RESPONSE_BYTES_CAP` | `2 * 1024 * 1024` / `8 * 1024 * 1024` |
| `SUPPORTED_API_BASE_URL_SCHEMES` | `{"http", "https"}` |
| `COOKIE_NAME_RE` | session cookie 이름 허용 문자 정규식 |

### api_client.py

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `ManagementApiError` | `src/services/mcp/internal_control/api_client.py :: ManagementApiError` | Gateway 호출 실패를 `status_code`, redacted `detail`로 나타내는 예외. |
| `ManagementApiClient` | `src/services/mcp/internal_control/api_client.py :: ManagementApiClient` | 검증된 `McpSettings`와 `httpx.AsyncClient`로 Gateway JSON API를 호출하는 클라이언트. |
| `ManagementApiClient.get_json(path, params=None)` | `src/services/mcp/internal_control/api_client.py :: ManagementApiClient.get_json` | 안전한 상대 path와 query만 허용해 GET JSON을 수행한다. |
| `ManagementApiClient.post_json(path, body, params=None)` | `src/services/mcp/internal_control/api_client.py :: ManagementApiClient.post_json` | 안전한 상대 path와 query만 허용해 POST JSON을 수행한다. 쓰기 정책은 tools 레이어가 먼저 판정한다. |
| `ManagementApiClient.aclose()` | `src/services/mcp/internal_control/api_client.py :: ManagementApiClient.aclose` | 자체 생성한 httpx client만 닫는다. |

api client 상수:

| 상수 | 값/의미 |
|---|---|
| `MAX_ERROR_DETAIL_LENGTH` | `500` — Gateway error detail redaction 후 최대 길이 |
| `SUPPORTED_MANAGEMENT_API_METHODS` | `{"GET", "POST"}` — MCP client가 허용하는 HTTP method |

### tools.py

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `ToolInputError` | `src/services/mcp/internal_control/tools.py :: ToolInputError` | MCP tool argument 검증 실패. JSON-RPC error가 아니라 tool result `isError=true`로 반환된다. |
| `McpTool` | `src/services/mcp/internal_control/tools.py :: McpTool` | MCP tool 정의 dataclass. `as_protocol_tool()`이 protocol tool object를 만든다. |
| `McpTool.as_protocol_tool()` | `src/services/mcp/internal_control/tools.py :: McpTool.as_protocol_tool` | MCP `tools/list` 응답에 들어갈 name/title/description/inputSchema/annotations dict를 만든다. |
| `ToolRegistry` | `src/services/mcp/internal_control/tools.py :: ToolRegistry` | tool 이름 중복을 금지하고 `list_tools()`/`call()`을 제공한다. |
| `ToolRegistry.list_tools()` | `src/services/mcp/internal_control/tools.py :: ToolRegistry.list_tools` | tool 이름 정렬 순서로 protocol tool 목록을 반환한다. |
| `ToolRegistry.call(name, arguments, client)` | `src/services/mcp/internal_control/tools.py :: ToolRegistry.call` | 등록된 handler를 찾아 실행한다. 알 수 없는 이름은 `ToolInputError`로 닫는다. |
| `default_tool_registry()` | `src/services/mcp/internal_control/tools.py :: default_tool_registry` | 현재 노출하는 11개 tool을 생성한다. |
| `dumps_tool_result(result)` | `src/services/mcp/internal_control/tools.py :: dumps_tool_result` | `structuredContent`와 같은 내용을 text fallback으로 직렬화한다. |

tool 상수:

| 상수 | 값/의미 |
|---|---|
| `ToolHandler` | `Callable[[ManagementApiClient, dict[str, Any]], Awaitable[dict[str, Any]]]` |
| `DEFAULT_LIST_CLUSTERS_LIMIT` | `100` |
| `DEFAULT_LIST_RESOURCES_LIMIT` | `200` |
| `DEFAULT_RECENT_INCIDENT_LIMIT` | `20` |
| `DEFAULT_RELATED_LIMIT` / `DEFAULT_EVENT_LIMIT` | `100` / `50` |
| `MAX_LIST_LIMIT` / `MAX_QUERY_LIMIT` | `1000` / `200` |
| `MAX_WRITE_PAYLOAD_BYTES` | `64 * 1024` |
| `LOG_EVIDENCE_SOURCE` | `"logs"` |
| `READ_ONLY_TOOL_ANNOTATIONS` | `readOnlyHint=true`, `destructiveHint=false`, `idempotentHint=true` |
| `WRITE_TOOL_ANNOTATIONS` | `readOnlyHint=false`, `destructiveHint=false`, `idempotentHint=false` |
| `WRITE_HTTP_METHOD` | `"POST"` |
| `SENSITIVE_PROPOSAL_KEY_PARTS` / `SENSITIVE_PROPOSAL_EXACT_KEYS` | proposal redaction 대상 key 조각과 exact key(`data`, `stringdata`) |
| `SENSITIVE_PROPOSAL_MARKER_KEYS` / `SENSITIVE_PROPOSAL_MARKER_VALUE_KEYS` | `{name|key: sensitive-name, value|default|literal: secret}` 형태 redaction marker |
| `DIRECT_EXECUTION_KEYS` | `confirmation`, `direct_execution`, `direct_execution_confirmed` |

읽기 tool handler:

| tool | handler 앵커 | Gateway route | 권한/동작 |
|---|---|---|---|
| `list_clusters` | `src/services/mcp/internal_control/tools.py :: list_clusters` | `CLUSTERS_PATH` = `/clusters` | 세션이 볼 수 있는 cluster 목록. `limit` 상한 200 |
| `get_cluster_summary` | `src/services/mcp/internal_control/tools.py :: get_cluster_summary` | `CLUSTER_SUMMARY_PATH` = `/clusters/{cluster_id}/summary` | 기존 fleet drill-down summary |
| `list_resources` | `src/services/mcp/internal_control/tools.py :: list_resources` | `CLUSTER_INVENTORY_RESOURCES_PATH` | inventory resource 목록. cluster, resource_type, namespace, include_deleted, limit만 허용 |
| `get_resource_detail` | `src/services/mcp/internal_control/tools.py :: get_resource_detail` | `CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH` | 단일 inventory resource detail, related, events 조회 |
| `list_recent_incidents` | `src/services/mcp/internal_control/tools.py :: list_recent_incidents` | `RCA_REPORTS_PATH` | RCA report 목록. correlation/time/cursor pagination만 허용 |
| `list_evidence_windows` | `src/services/mcp/internal_control/tools.py :: list_evidence_windows` | `EVIDENCE_WINDOWS_PATH` | 기존 evidence window key 목록 |
| `get_log_evidence` | `src/services/mcp/internal_control/tools.py :: get_log_evidence` | `EVIDENCE_WINDOW_PATH` + `source=logs` | logs source만 조회. logs source 404이고 window 자체가 있으면 invented payload 없이 unavailable 구조 반환 |

쓰기 tool handler:

| tool | handler 앵커 | Gateway route | 보수적 제어 |
|---|---|---|---|
| `create_alert_rule` | `src/services/mcp/internal_control/tools.py :: create_alert_rule` | `ALERT_RULES_PATH` = `/alert-rules` | admin alert rule POST를 proposal 후 승인된 경우에만 전달 |
| `request_recovery_action` | `src/services/mcp/internal_control/tools.py :: request_recovery_action` | `RCA_RECOVERY_ACTION_SELECT_PATH` 또는 `RCA_RECOVERY_ACTION_SELECT_BY_CORRELATION_PATH` | 기존 recovery plan/action 선택만 전달. `plan_id`와 `correlation_id`는 정확히 하나만 허용 |
| `create_command_request` | `src/services/mcp/internal_control/tools.py :: create_command_request` | `COMMANDS_PATH` = `/commands` | command request POST. `confirmation`, `direct_execution`, `direct_execution_confirmed` payload key는 항상 거부 |
| `approve_or_reject_workflow` | `src/services/mcp/internal_control/tools.py :: approve_or_reject_workflow` | `APPROVAL_GRANT_PATH` 또는 `APPROVAL_REJECT_PATH` | 기존 approval grant/reject POST. decision은 `grant`/`reject`만 허용 |

### server.py

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `JsonRpcError` | `src/services/mcp/internal_control/server.py :: JsonRpcError` | JSON-RPC protocol 오류. |
| `InternalControlMcpServer` | `src/services/mcp/internal_control/server.py :: InternalControlMcpServer` | JSON-RPC message를 MCP initialize/ping/tools/list/tools/call로 dispatch한다. |
| `InternalControlMcpServer.handle(message)` | `src/services/mcp/internal_control/server.py :: InternalControlMcpServer.handle` | JSON-RPC envelope 검증, notification 무응답 처리, 내부 예외 detail 은 노출하지 않고 `"internal MCP server error"`로 축약한다. |
| `run_stdio(server, stdin=sys.stdin, stdout=sys.stdout)` | `src/services/mcp/internal_control/server.py :: run_stdio` | stdin 한 줄을 JSON-RPC request로 처리하고 stdout 한 줄로 response를 쓴다. |
| `create_default_server()` | `src/services/mcp/internal_control/server.py :: create_default_server` | `load_settings()` + `default_tool_registry()` + `ManagementApiClient`로 기본 서버를 만든다. |
| `amain()` / `main()` | `src/services/mcp/internal_control/server.py :: amain`, `src/services/mcp/internal_control/server.py :: main` | stdio server 수명주기와 exit code를 관리한다. |

JSON-RPC 상수:

| 상수 | 값 |
|---|---|
| `JSONRPC_VERSION` | `"2.0"` |
| `SUPPORTED_PROTOCOL_VERSION` | `"2025-11-25"` |
| `SERVER_NAME` / `SERVER_VERSION` | `"opsia-internal-control"` / `"0.1.0"` |
| `MAX_JSONRPC_LINE_BYTES` | `256 KiB` |
| `PARSE_ERROR`, `INVALID_REQUEST`, `METHOD_NOT_FOUND`, `INVALID_PARAMS`, `INTERNAL_ERROR` | JSON-RPC 표준 error code |

## 데이터 모델 (Data Model)

자체 DB 테이블 없음. 모든 데이터는 Gateway 응답 또는 tool safety envelope 이다.

### 공통 tool result

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

### 읽기 safety

읽기 도구의 `safety`는 항상:

| 필드 | 값 |
|---|---|
| `mutating` | `false` |
| `dry_run` | `null` |
| `proposal` | `null` |
| `approval_required` | `false` |
| `operation_id` | `null` |
| `api_path` | 실제 호출한 Gateway path |

### 쓰기 safety

쓰기 도구는 `_post_or_propose` 단일 경로를 통과한다.

| 조건 | HTTP 호출 | safety |
|---|---|---|
| `dry_run=true` 또는 생략 | 없음 | `mutating=false`, `approval_required=true`, redacted `proposal` 반환 |
| `dry_run=false`, `approval_confirmed` 누락/false | 없음 | `ToolInputError` |
| `dry_run=false`, `approval_confirmed=true`, `OPSIA_MCP_ENABLE_WRITES` false | 없음 | `ToolInputError` |
| 세 조건 모두 충족 | 기존 Gateway POST | `mutating=true`, `approval_required=false`, Gateway 응답에서만 `operation_id` 추출 |

`proposal` 구조:

```json
{
  "method": "POST",
  "api_path": "/gateway/path",
  "body": "<redacted payload>",
  "body_redacted": true,
  "uses_existing_gateway_api": true
}
```

## 프로토콜 (JSON-RPC / MCP)

| method | params | result |
|---|---|---|
| `initialize` | `protocolVersion` 선택 | `protocolVersion`, tools capability, `serverInfo`, 안전 지침 |
| `ping` | `{}` | `{}` |
| `tools/list` | `{}` | `{"tools": [...]}` |
| `tools/call` | `{"name": str, "arguments": object?}` | MCP content text fallback + `structuredContent` |
| `notifications/*` | request id 없음 | 응답 없음 |

tool call 오류는 JSON-RPC error가 아니라 MCP tool result로 닫는다:

| 오류 | `structuredContent.error` | 노출 정보 |
|---|---|---|
| argument/schema 오류 | `invalid_tool_input` | `ToolInputError` 메시지 |
| Gateway 오류 | `management_api_error` | HTTP status code + redacted detail |
| 서버 내부 예외 | JSON-RPC `-32603` | 상세 exception message 비노출 |

## 동작 (Behavior)

### 설정 검증

1. `load_settings()`는 `OPSIA_MCP_API_BASE_URL`, 없으면 `MANAGEMENT_BASE_URL`을 읽는다.
2. base URL은 `http` 또는 `https`만 허용하고, credentials/query/fragment/공백/control/backslash를 금지한다.
3. `http://`는 loopback host(`localhost`, `*.localhost`, loopback IP)만 기본 허용한다. 그 외 private network HTTP는 `OPSIA_MCP_ALLOW_INSECURE_HTTP=true`가 있어야 한다.
4. `OPSIA_MCP_BEARER_TOKEN`, `OPSIA_MCP_COOKIE`, `OPSIA_MCP_SESSION_COOKIE` 중 정확히 하나만 허용한다.
5. `OPSIA_MCP_TRUSTED_PROXY_SECRET`은 항상 거부한다. MCP가 Gateway의 service-admin 신뢰 프록시 권한을 빌려 쓰지 못하게 하는 핵심 불변식이다.

### Gateway 호출

1. `ManagementApiClient`는 호출 직전 `McpSettings.auth_headers()`를 사용한다.
2. path는 `/`로 시작하는 상대 경로만 허용한다. `//`, `://`, query, fragment, 공백/control/backslash가 있으면 fail-closed.
3. query key/value는 문자열화하되 unsafe character가 있으면 거부한다. bool은 `"true"`/`"false"`로 보낸다.
4. response body는 `OPSIA_MCP_MAX_RESPONSE_BYTES` 상한까지 streaming read 한다.
5. HTTP 실패 detail은 JSON `detail`을 우선 사용하되 `redact_log_line`과 길이 상한 500자로 정리한다.

### 읽기 도구

1. `_reject_unknown`으로 schema 외 argument를 거부한다.
2. string argument는 trim, 빈 문자열은 missing 처리, control character와 길이 초과를 거부한다.
3. path parameter는 `_format_path(..., quote(..., safe=""))`로 percent-encode한다.
4. GET 결과는 Gateway 응답 그대로 `data`에 담는다. 도구가 없는 값을 추측하거나 합성하지 않는다.
5. `get_log_evidence`만 logs source가 없는 evidence window를 구분하기 위해 `source=logs` 404 후 window 존재 여부를 한 번 더 GET 한다. window가 있으면 `available=false`, `payload=null`을 반환하고, window 자체가 없으면 Gateway 404를 유지한다.

### 쓰기 도구

1. 모든 쓰기는 `_post_or_propose`를 통과한다.
2. payload는 `json.dumps(..., allow_nan=False)`로 finite JSON인지 확인하고 UTF-8 인코딩 기준 `64 KiB`를 넘으면 거부한다.
3. dry-run proposal은 payload를 deep-copy/redaction한 뒤 반환한다. 원본 payload는 실제 POST 전까지 변형하지 않는다.
4. redaction은 `authorization`, `cookie`, `credential`, `password`, `secret`, `token`, `private_key`, `ssh_key`, `api_key` 류 key와 `data`/`stringData` exact key를 가린다. 또한 `{name|key: "...PASSWORD|TOKEN|SECRET...", value|default|literal: ...}` 형태의 marker value를 가린다.
5. 실제 POST는 사용자가 dry-run proposal을 본 뒤 `approval_confirmed=true`를 준 경우에만 가능하며, MCP 프로세스 설정도 `OPSIA_MCP_ENABLE_WRITES=true`여야 한다.
6. `operation_id`는 Gateway 응답의 `rule_id`, `command_id`, `event_id`, `correlation_id`, `audit_event_id` 등 각 tool별 허용 key에서만 추출한다. MCP가 임의 operation id를 만들지 않는다.

## 불변식·오류 (Invariants & Errors)

- Gateway가 단일 권한 판정 지점이다. MCP는 인증 헤더를 전달할 뿐, RBAC·workspace·cluster access를 자체로 확장하지 않는다.
- trusted proxy secret은 MCP 설정과 `auth_headers()` 양쪽에서 금지한다.
- 쓰기 도구는 기본적으로 network write를 하지 않는다(`dry_run=true`).
- `approval_confirmed=true`는 user approval 사실을 나타내는 MCP 입력이고, Gateway의 실제 승인/감사 상태 검사를 대체하지 않는다.
- `create_command_request`는 direct execution 관련 flag key를 값과 무관하게 거부한다.
- `additionalProperties=false` tool schema와 `_reject_unknown` 런타임 검증을 같이 둔다.
- JSON-RPC line은 `256 KiB`, 쓰기 payload는 `64 KiB`, Gateway response는 설정된 byte 상한으로 제한한다.
- 서버 내부 예외 message는 JSON-RPC 응답에 노출하지 않는다.
- 에러 detail, proposal 문자열, repr에는 credential 원문이 남지 않아야 한다.

## 설정 (Settings)

| 환경변수 / 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `OPSIA_MCP_API_BASE_URL` | str | — | MCP가 호출할 Opsia Gateway base URL. 있으면 `MANAGEMENT_BASE_URL`보다 우선 |
| `MANAGEMENT_BASE_URL` | str | — | 기존 배포 env fallback. MCP에서는 base URL로만 사용 |
| `OPSIA_MCP_BEARER_TOKEN` | str | — | `Authorization: Bearer ...` user-scoped 인증 |
| `OPSIA_MCP_COOKIE` | str | — | 전체 Cookie header user-scoped 인증 |
| `OPSIA_MCP_SESSION_COOKIE` | str | — | session token 값. `OPSIA_MCP_SESSION_COOKIE_NAME`과 조합해 Cookie header 생성 |
| `OPSIA_MCP_SESSION_COOKIE_NAME` | str | `Auth.SESSION_COOKIE_NAME` | session cookie 이름. RFC cookie token 문자만 허용 |
| `OPSIA_MCP_TRUSTED_PROXY_SECRET` | str | — | 금지. 설정되면 MCP 시작 실패 |
| `OPSIA_MCP_ENABLE_WRITES` | bool | `false` | `true`일 때만 승인된 쓰기 tool이 Gateway POST를 제출 |
| `OPSIA_MCP_ALLOW_INSECURE_HTTP` | bool | `false` | loopback 외 `http://` base URL 허용 opt-in. 신뢰된 private network에서만 사용 |
| `OPSIA_MCP_REQUEST_TIMEOUT_SECONDS` | float | `10.0` | Gateway HTTP timeout. `0 < value <= 60` |
| `OPSIA_MCP_MAX_RESPONSE_BYTES` | int | `2097152` | Gateway response body read 상한. `0 < value <= 8388608` |

## 검증 (Tests)

- `tests/test_internal_mcp.py`가 설정 fail-closed, trusted proxy 금지, tool registry/schema, read-only GET route, write dry-run/approval/write-enable gate, proposal redaction, direct execution flag 차단, response size bound, JSON-RPC error handling을 검증한다.
- 기존 Gateway 계약 회귀는 `tests/test_alert_rules.py`, `tests/test_command_router.py`, `tests/test_gitops_approval_router.py`, `tests/test_rca_recovery_router.py`로 같이 확인한다.
