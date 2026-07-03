"""플랫폼 조회 도구 — LLM 이 대화 중 호출 가능한 읽기 전용 능력을 @ai.tool 로 등록.

모든 도구는 안전(읽기 전용)하고 JSON 직렬화 가능한 dict 를 반환함.
저장소 접근은 ToolContext.db(AsyncDb)로만 — 도구가 연결/트랜잭션을 직접 알지 않음.
새 도구 추가 = 이 파일(또는 다른 도메인의 tools.py)에 함수 1개(엔진 수정 없음).
"""

from __future__ import annotations

from typing import Any

from domains.command.actions import registered_command_actions
from packages.ai.tools import ToolContext, ai

DEFAULT_INCIDENT_LIMIT = 5
DEFAULT_MESSAGE_LIMIT = 10
MAX_ROWS = 20
CONTENT_PREVIEW_CHARS = 300


def _clamp(value: Any, default: int) -> int:
    try:
        return max(1, min(int(value), MAX_ROWS))
    except (TypeError, ValueError):
        return default


@ai.tool(
    name="list_recent_incidents",
    description="Recent RCA reports (root cause, recommended action) for this workspace.",
    parameters={
        "limit": {"type": "integer", "description": f"max rows (1-{MAX_ROWS}, default 5)"},
    },
)
async def list_recent_incidents(
    context: ToolContext, limit: int = DEFAULT_INCIDENT_LIMIT
) -> dict[str, Any]:
    rows = await context.db.list_rca_reports(
        context.workspace_id, limit=_clamp(limit, DEFAULT_INCIDENT_LIMIT)
    )
    return {
        "incidents": [
            {
                "root_cause": row.get("root_cause"),
                "action": row.get("action"),
                "correlation_id": row.get("correlation_id"),
                "created_at": str(row.get("created_at") or ""),
            }
            for row in rows
        ]
    }


@ai.tool(
    name="get_conversation_summary",
    description="Recent messages of an AI conversation in this workspace.",
    parameters={
        "conversation_id": {
            "type": "string",
            "description": "conversation id (e.g. aic-...)",
            "required": True,
        },
        "limit": {"type": "integer", "description": f"max messages (1-{MAX_ROWS}, default 10)"},
    },
)
async def get_conversation_summary(
    context: ToolContext, conversation_id: str, limit: int = DEFAULT_MESSAGE_LIMIT
) -> dict[str, Any]:
    rows = await context.db.list_ai_messages(
        context.workspace_id,
        str(conversation_id),
        newest=_clamp(limit, DEFAULT_MESSAGE_LIMIT),
    )
    return {
        "conversation_id": str(conversation_id),
        "messages": [
            {
                "role": row.get("role"),
                "content": str(row.get("content") or "")[:CONTENT_PREVIEW_CHARS],
                "created_at": str(row.get("created_at") or ""),
            }
            for row in rows
        ],
    }


@ai.tool(
    name="list_command_actions",
    description="Registered platform command actions with their policy metadata.",
)
async def list_command_actions(context: ToolContext) -> dict[str, Any]:
    return {
        "actions": [
            {
                "action": spec.action,
                "recovery_aliases": list(spec.recovery_aliases),
                "allowed_namespaces": list(spec.allowed_namespaces),
                "requires_approval": spec.requires_approval,
            }
            for spec in registered_command_actions()
        ]
    }
