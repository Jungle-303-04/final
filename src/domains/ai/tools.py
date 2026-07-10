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
RISK_ORDER = {"low": 0, "medium": 1, "high": 2}
ROUTE_ORDER = {"auto": 0, "command": 1, "draft_pr": 2, "approval_required": 3}
RECOMMENDABLE_RISKS = {"low", "medium"}
AUTOMATION_ROUTES = {"auto", "command"}
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


def _string_set(value: Any) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, str):
        return {value} if value else set()
    if isinstance(value, (list, tuple, set)):
        return {str(item) for item in value if item not in (None, "")}
    return {str(value)}


def _plan_payload(record: dict[str, Any] | None) -> dict[str, Any]:
    payload = record.get("payload") if isinstance(record, dict) else None
    return payload if isinstance(payload, dict) else {}


def _candidate_draft(candidate: dict[str, Any]) -> dict[str, Any]:
    draft = candidate.get("draft")
    return draft if isinstance(draft, dict) else {}


def _candidate_action_type(candidate: dict[str, Any]) -> str:
    draft = _candidate_draft(candidate)
    return str(draft.get("action_type") or candidate.get("action_type") or "")


def _candidate_sort_key(candidate: dict[str, Any]) -> tuple[int, int, int, float, str]:
    risk = str(candidate.get("risk_level") or "").lower()
    route = str(candidate.get("route") or "")
    rank = candidate.get("rank")
    score = candidate.get("score")
    try:
        rank_value = int(rank)
    except (TypeError, ValueError):
        rank_value = 999
    try:
        score_value = float(score)
    except (TypeError, ValueError):
        score_value = 0.0
    return (
        RISK_ORDER.get(risk, 99),
        1 if candidate.get("approval_required") else 0,
        ROUTE_ORDER.get(route, 99),
        rank_value,
        f"{-score_value:.8f}:{candidate.get('action_id') or ''}",
    )


def _matching_command_action(action_type: str) -> Any | None:
    for spec in registered_command_actions():
        if spec.action == action_type or action_type in spec.recovery_aliases:
            return spec
    return None


def _target_is_explicit(plan: dict[str, Any], candidate: dict[str, Any]) -> bool:
    target = plan.get("target") if isinstance(plan.get("target"), dict) else {}
    draft = _candidate_draft(candidate)
    return bool(
        target.get("cluster_id")
        and (
            target.get("resource_name")
            or target.get("name")
            or draft.get("resource_name")
            or candidate.get("resource_name")
        )
    )


def _namespace_allowed(candidate: dict[str, Any]) -> bool:
    draft = _candidate_draft(candidate)
    namespace = str(draft.get("namespace") or "")
    spec = _matching_command_action(_candidate_action_type(candidate))
    if spec is None:
        return False
    allowed = set(spec.allowed_namespaces)
    return bool(namespace and namespace in allowed)


def _automatic_recommendation(plan: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    route = str(candidate.get("route") or "")
    risk = str(candidate.get("risk_level") or "").lower()
    draft = _candidate_draft(candidate)
    explicit_target = _target_is_explicit(plan, candidate)
    namespace_allowed = _namespace_allowed(candidate)
    has_recovery_path = bool(candidate.get("rollback_plan") or candidate.get("validation_checks"))
    eligible = bool(
        risk == "low"
        and not candidate.get("approval_required")
        and route in AUTOMATION_ROUTES
        and namespace_allowed
        and explicit_target
        and has_recovery_path
    )
    return {
        "eligible": eligible,
        "why_safe": [
            reason
            for condition, reason in (
                (risk == "low", "risk_level이 low입니다."),
                (
                    not candidate.get("approval_required"),
                    "approval_required가 false입니다.",
                ),
                (route in AUTOMATION_ROUTES, "route가 자동/명령 실행 경로입니다."),
                (namespace_allowed, "대상 namespace가 허용 범위 안입니다."),
                (explicit_target, "대상 리소스가 명확합니다."),
                (
                    has_recovery_path,
                    "검증 또는 rollback/recovery 경로가 정의되어 있습니다.",
                ),
            )
            if condition
        ],
        "blocking_reasons": [
            reason
            for condition, reason in (
                (risk == "low", "risk_level이 low가 아닙니다."),
                (
                    not candidate.get("approval_required"),
                    "승인이 필요한 조치입니다.",
                ),
                (route in AUTOMATION_ROUTES, "자동/명령 실행 경로가 아닙니다."),
                (namespace_allowed, "대상 namespace가 허용 범위 밖이거나 확인되지 않았습니다."),
                (explicit_target, "대상 리소스가 명확하지 않습니다."),
                (
                    has_recovery_path,
                    "검증 또는 rollback/recovery 경로가 없습니다.",
                ),
            )
            if not condition
        ],
        "expected_impact": [
            f"{draft.get('resource_kind') or 'resource'} {draft.get('resource_name') or 'target'}에 {candidate.get('title') or candidate.get('action_id')} 조치를 적용합니다.",
            "Manifest나 Config 변경 여부는 recovery candidate의 route/action_type 기준으로 검토해야 합니다.",
        ],
        "pre_checks": list(candidate.get("prerequisites") or [])
        + list(candidate.get("validation_checks") or []),
        "rollback_or_recovery": [candidate.get("rollback_plan")]
        if candidate.get("rollback_plan")
        else [],
    }


def _candidate_summary(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "action_id": candidate.get("action_id"),
        "title": candidate.get("title"),
        "description": candidate.get("description"),
        "route": candidate.get("route"),
        "risk_level": candidate.get("risk_level"),
        "approval_required": candidate.get("approval_required"),
        "rank": candidate.get("rank"),
        "score": candidate.get("score"),
        "action_type": _candidate_action_type(candidate),
    }


def _recommendation_reason(candidate: dict[str, Any]) -> str:
    risk = candidate.get("risk_level") or "unknown"
    route = candidate.get("route") or "unknown"
    approval = "승인이 필요합니다" if candidate.get("approval_required") else "승인 없이 진행 가능한 후보입니다"
    return (
        f"{candidate.get('title') or candidate.get('action_id')} 후보가 현재 recovery plan에서 "
        f"risk_level={risk}, route={route}이며 {approval}."
    )


def _recommendation_summary(candidate: dict[str, Any], automation: dict[str, Any]) -> str:
    title = candidate.get("title") or candidate.get("action_id")
    suffix = "자동 실행 후보입니다." if automation["eligible"] else "검토 후 진행할 후보입니다."
    return f"추천 조치는 {title}입니다. {suffix}"


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
    name="recommend_recovery_action",
    description="Recommend the safest recovery action from a recovery plan without creating requests or executing commands.",
    parameters={
        "correlation_id": {
            "type": "string",
            "description": "incident correlation id; defaults to chat context",
        },
        "plan_id": {
            "type": "string",
            "description": "recovery plan id; preferred when available",
        },
        "exclude_action_ids": {
            "type": "array",
            "description": "recovery action ids to exclude from recommendation",
        },
        "exclude_action_types": {
            "type": "array",
            "description": "recovery action types to exclude, e.g. rollout_restart",
        },
    },
)
async def recommend_recovery_action(
    context: ToolContext,
    correlation_id: str = "",
    plan_id: str = "",
    exclude_action_ids: list[str] | None = None,
    exclude_action_types: list[str] | None = None,
) -> dict[str, Any]:
    resolved_plan_id = _ctx_or_arg(plan_id, "")
    resolved_correlation = _ctx_or_arg(correlation_id, _context_value(context, "correlation_id"))
    record = None
    if resolved_plan_id:
        record = await context.db.get_recovery_plan(resolved_plan_id, context.workspace_id)
    if record is None and resolved_correlation:
        record = await context.db.get_recovery_plan_by_correlation(
            resolved_correlation, context.workspace_id
        )
    if record is None:
        return {
            "found": False,
            "error": "plan_id or correlation_id is required and must match a recovery plan",
        }

    plan = _plan_payload(record)
    if not plan:
        return {"found": False, "error": "recovery plan payload is missing"}

    excluded_ids = _string_set(exclude_action_ids)
    excluded_types = _string_set(exclude_action_types)
    candidates = [dict(candidate) for candidate in plan.get("candidates", []) if isinstance(candidate, dict)]
    excluded = [
        candidate
        for candidate in candidates
        if str(candidate.get("action_id") or "") in excluded_ids
        or _candidate_action_type(candidate) in excluded_types
    ]
    available = [candidate for candidate in candidates if candidate not in excluded]
    high_risk = [
        candidate
        for candidate in available
        if str(candidate.get("risk_level") or "").lower() not in RECOMMENDABLE_RISKS
    ]
    recommendable = [candidate for candidate in available if candidate not in high_risk]
    preferred_id = str(plan.get("recommended_action_id") or "")
    recommended = next(
        (candidate for candidate in recommendable if str(candidate.get("action_id") or "") == preferred_id),
        None,
    )
    if recommended is None and recommendable:
        recommended = sorted(recommendable, key=_candidate_sort_key)[0]

    alternatives = [
        _candidate_summary(candidate)
        for candidate in sorted(recommendable, key=_candidate_sort_key)
        if candidate is not recommended
    ]
    not_recommended = [
        {
            **_candidate_summary(candidate),
            "reason": "high risk 또는 알 수 없는 risk_level 후보라 수동 검토가 필요합니다.",
        }
        for candidate in high_risk
    ] + [
        {
            **_candidate_summary(candidate),
            "reason": "사용자 요청으로 추천 후보에서 제외되었습니다.",
        }
        for candidate in excluded
    ]

    if recommended is None:
        return {
            "found": True,
            "plan_id": plan.get("plan_id") or record.get("plan_id"),
            "correlation_id": record.get("correlation_id") or resolved_correlation,
            "summary": "추천 가능한 recovery action이 없습니다.",
            "reasoning": {
                "current_context": plan.get("summary"),
                "evidence": [],
                "why_recommended": [],
                "risk_notes": ["남은 후보가 없거나 high risk/manual review 대상입니다."],
            },
            "next_checks": [],
            "possible_actions": {
                "recommended": None,
                "alternatives": alternatives,
                "not_recommended": not_recommended,
            },
            "caution": {
                "risk_level": None,
                "approval_required": None,
                "automatic_candidate": False,
                "automation": {"eligible": False, "why_safe": [], "blocking_reasons": []},
            },
        }

    automation = _automatic_recommendation(plan, recommended)
    recommendation = {
        **_candidate_summary(recommended),
        "automatic_candidate": automation["eligible"],
    }
    return {
        "found": True,
        "plan_id": plan.get("plan_id") or record.get("plan_id"),
        "correlation_id": record.get("correlation_id") or resolved_correlation,
        "status": record.get("status"),
        "target": plan.get("target"),
        "summary": _recommendation_summary(recommended, automation),
        "reasoning": {
            "current_context": plan.get("summary"),
            "evidence": list(recommended.get("evidence_refs") or []),
            "why_recommended": [_recommendation_reason(recommended)] + automation["why_safe"],
            "risk_notes": [
                note
                for note in (
                    recommended.get("blast_radius"),
                    recommended.get("description"),
                    "medium risk 후보는 승인 필요 여부와 영향 범위를 함께 검토해야 합니다."
                    if str(recommended.get("risk_level") or "").lower() == "medium"
                    else None,
                )
                if note
            ],
        },
        "next_checks": automation["pre_checks"],
        "possible_actions": {
            "recommended": recommendation,
            "alternatives": alternatives,
            "not_recommended": not_recommended,
        },
        "caution": {
            "risk_level": recommended.get("risk_level"),
            "approval_required": recommended.get("approval_required"),
            "automatic_candidate": automation["eligible"],
            "expected_impact": automation["expected_impact"],
            "automation": {
                "eligible": automation["eligible"],
                "why_safe": automation["why_safe"],
                "blocking_reasons": automation["blocking_reasons"],
                "handoff": {
                    "next_step": "create_command_request" if automation["eligible"] else None,
                    "requires_user_confirmation": True,
                },
            },
        },
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
