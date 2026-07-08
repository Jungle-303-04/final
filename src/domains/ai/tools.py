"""플랫폼 조회 도구 — LLM 이 대화 중 호출 가능한 읽기 전용 능력을 @ai.tool 로 등록.

모든 도구는 안전(읽기 전용)하고 JSON 직렬화 가능한 dict 를 반환함.
저장소 접근은 ToolContext.db(AsyncDb)로만 — 도구가 연결/트랜잭션을 직접 알지 않음.
새 도구 추가 = 이 파일(또는 다른 도메인의 tools.py)에 함수 1개(엔진 수정 없음).
"""

from __future__ import annotations

from typing import Any

from domains.command.actions import registered_command_actions
from domains.rca.report_projection import rca_report_summary
from packages.ai.tools import ToolContext, ai

DEFAULT_INCIDENT_LIMIT = 5
DEFAULT_MESSAGE_LIMIT = 10
MAX_ROWS = 20
CONTENT_PREVIEW_CHARS = 300
INVENTORY_PUBLIC_FIELDS = (
    "inventory_key",
    "workspace_id",
    "cluster_id",
    "resource_type",
    "api_version",
    "kind",
    "namespace",
    "name",
    "uid",
    "status",
    "health",
    "labels",
    "annotations",
    "summary",
    "observed_at",
    "last_seen_at",
)


def _clamp(value: Any, default: int) -> int:
    try:
        return max(1, min(int(value), MAX_ROWS))
    except (TypeError, ValueError):
        return default


def _ctx_or_arg(value: str | None, fallback: str | None) -> str:
    return str(value or fallback or "").strip()


def _context_value(context: ToolContext, key: str) -> str:
    value = getattr(context, key, None)
    if value not in (None, ""):
        return str(value).strip()
    resource_context = context.resource_context or {}
    raw = resource_context.get(key)
    return str(raw).strip() if raw not in (None, "") else ""


def _public_inventory_resource(row: dict[str, Any]) -> dict[str, Any]:
    return {key: row.get(key) for key in INVENTORY_PUBLIC_FIELDS if key in row}


def _row_payload(row: dict[str, Any]) -> dict[str, Any]:
    payload = row.get("payload")
    return payload if isinstance(payload, dict) else {}


def _report_matches_context(row: dict[str, Any], context: ToolContext) -> bool:
    payload = _row_payload(row)
    cluster_id = row.get("cluster_id") or payload.get("cluster_id")
    if context.cluster_id and cluster_id and str(cluster_id) != context.cluster_id:
        return False
    if not context.name:
        return True
    incident = payload.get("incident") if isinstance(payload.get("incident"), dict) else {}
    detail = payload.get("rca_detail") if isinstance(payload.get("rca_detail"), dict) else {}
    candidates = [
        row.get("resource_name"),
        row.get("resource"),
        incident.get("resource_name"),
        incident.get("resource"),
        detail.get("resource_name"),
    ]
    return any(str(candidate) == context.name for candidate in candidates if candidate)


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
    name="get_inventory_resource_detail",
    description="Kubernetes inventory detail for the current or requested resource, including related pods and involvedObject events.",
    parameters={
        "cluster_id": {"type": "string", "description": "cluster id; defaults to chat context"},
        "resource_type": {
            "type": "string",
            "description": "pod/node/service/workload; defaults to chat context",
        },
        "kind": {"type": "string", "description": "Kubernetes kind; defaults to chat context"},
        "name": {"type": "string", "description": "resource name; defaults to chat context"},
        "namespace": {"type": "string", "description": "namespace for namespaced resources"},
    },
)
async def get_inventory_resource_detail(
    context: ToolContext,
    cluster_id: str = "",
    resource_type: str = "",
    kind: str = "",
    name: str = "",
    namespace: str = "",
) -> dict[str, Any]:
    resolved_cluster = _ctx_or_arg(cluster_id, context.cluster_id)
    resolved_type = _ctx_or_arg(resource_type, context.resource_type)
    resolved_kind = _ctx_or_arg(kind, context.kind)
    resolved_name = _ctx_or_arg(name, context.name)
    resolved_namespace = _ctx_or_arg(namespace, context.namespace) or None
    if not all((resolved_cluster, resolved_type, resolved_kind, resolved_name)):
        return {
            "found": False,
            "error": "cluster_id, resource_type, kind and name are required",
        }
    resource = await context.db.get_inventory_resource(
        workspace_id=context.workspace_id,
        cluster_id=resolved_cluster,
        resource_type=resolved_type,
        kind=resolved_kind,
        namespace=resolved_namespace,
        name=resolved_name,
    )
    if resource is None:
        return {
            "found": False,
            "identity": {
                "cluster_id": resolved_cluster,
                "resource_type": resolved_type,
                "kind": resolved_kind,
                "namespace": resolved_namespace,
                "name": resolved_name,
            },
        }
    related = await context.db.list_related_inventory_resources(
        workspace_id=context.workspace_id,
        cluster_id=resolved_cluster,
        resource=resource,
        limit=20,
    )
    events = await context.db.list_resource_events(
        workspace_id=context.workspace_id,
        cluster_id=resolved_cluster,
        resource=resource,
        limit=20,
    )
    return {
        "found": True,
        "resource": _public_inventory_resource(dict(resource)),
        "related": {
            group: [_public_inventory_resource(dict(item)) for item in rows[:20]]
            for group, rows in related.items()
        },
        "events": [_public_inventory_resource(dict(item)) for item in events[:20]],
    }


@ai.tool(
    name="list_resource_rca_reports",
    description="Recent RCA reports filtered to the chat resource context when possible.",
    parameters={
        "limit": {"type": "integer", "description": f"max rows (1-{MAX_ROWS}, default 5)"},
    },
)
async def list_resource_rca_reports(
    context: ToolContext, limit: int = DEFAULT_INCIDENT_LIMIT
) -> dict[str, Any]:
    rows = await context.db.list_rca_reports(
        context.workspace_id, limit=_clamp(limit, DEFAULT_INCIDENT_LIMIT)
    )
    filtered = [dict(row) for row in rows if _report_matches_context(dict(row), context)]
    return {
        "reports": [
            {
                "root_cause": row.get("root_cause"),
                "action": row.get("action"),
                "correlation_id": row.get("correlation_id"),
                "created_at": str(row.get("created_at") or ""),
                "cluster_id": row.get("cluster_id") or _row_payload(row).get("cluster_id"),
            }
            for row in filtered[:MAX_ROWS]
        ]
    }


@ai.tool(
    name="get_incident_rca_context",
    description="RCA report and recovery plan for a specific incident correlation in the chat context.",
    parameters={
        "correlation_id": {
            "type": "string",
            "description": "incident correlation id; defaults to chat context",
        },
    },
)
async def get_incident_rca_context(
    context: ToolContext, correlation_id: str = ""
) -> dict[str, Any]:
    resolved = _ctx_or_arg(correlation_id, _context_value(context, "correlation_id"))
    if not resolved:
        return {"found": False, "error": "correlation_id is required"}
    rows = await context.db.list_rca_reports(context.workspace_id, limit=MAX_ROWS)
    reports = [
        rca_report_summary(dict(row))
        for row in rows
        if str(row.get("correlation_id") or "") == resolved
    ]
    recovery_record = await context.db.get_recovery_plan_by_correlation(
        resolved, context.workspace_id
    )
    plan = recovery_record.get("payload") if isinstance(recovery_record, dict) else None
    plan_payload = plan if isinstance(plan, dict) else {}
    return {
        "found": bool(reports or plan_payload),
        "correlation_id": resolved,
        "reports": reports,
        "recovery_plan": {
            "plan_id": plan_payload.get("plan_id"),
            "status": recovery_record.get("status") if isinstance(recovery_record, dict) else None,
            "recommended_action_id": plan_payload.get("recommended_action_id"),
            "selection_required": plan_payload.get("selection_required"),
            "target": plan_payload.get("target"),
            "candidates": [
                {
                    "action_id": candidate.get("action_id"),
                    "title": candidate.get("title"),
                    "description": candidate.get("description"),
                    "route": candidate.get("route"),
                    "risk_level": candidate.get("risk_level"),
                    "approval_required": candidate.get("approval_required"),
                }
                for candidate in plan_payload.get("candidates", [])
                if isinstance(candidate, dict)
            ],
        }
        if plan_payload
        else None,
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
