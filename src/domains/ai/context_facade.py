"""Evidence-bound, token-bounded reads for the product AI assistant.

This facade deliberately does not expose raw Kubernetes objects or ask the LLM
to invent a synchronous answer. It materializes only inventory facts that the
current user may read. Callers must use the canonical no-data response when no
such fact exists.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlencode

from fastapi import HTTPException

from domains.ai.alert_actions import AlertActionDecision, propose_alert_rule_action
from domains.identity.dependencies import resolve_allowed_cluster_ids
from domains.log_stream.service import read_log_stream_evidence
from packages.contracts.gateway.requests import AiAssistantContext
from packages.contracts.gateway.responses import (
    AI_NO_DATA_ANSWER,
    AiChatResponse,
    AiEvidenceLink,
    AiResourceSummary,
    AiSuggestion,
    AiSuggestionsResponse,
)
from packages.contracts.identity import Permission

AiResourceKind = Literal[
    "pods",
    "deployments",
    "statefulsets",
    "daemonsets",
    "workloads",
    "services",
    "nodes",
    "namespaces",
    "events",
]

MAX_AI_EVIDENCE = 5
MAX_AI_RESOURCE_SCAN = 1000


@dataclass(frozen=True)
class ResourceKindSpec:
    resource_type: str
    kubernetes_kind: str | None


RESOURCE_KIND_SPECS: dict[AiResourceKind, ResourceKindSpec] = {
    "pods": ResourceKindSpec("pod", "Pod"),
    "deployments": ResourceKindSpec("workload", "Deployment"),
    "statefulsets": ResourceKindSpec("workload", "StatefulSet"),
    "daemonsets": ResourceKindSpec("workload", "DaemonSet"),
    "workloads": ResourceKindSpec("workload", None),
    "services": ResourceKindSpec("service", "Service"),
    "nodes": ResourceKindSpec("node", "Node"),
    "namespaces": ResourceKindSpec("namespace", "Namespace"),
    "events": ResourceKindSpec("event", "Event"),
}

RESOURCE_TYPE_BY_KUBERNETES_KIND = {
    "pod": "pod",
    "deployment": "workload",
    "statefulset": "workload",
    "daemonset": "workload",
    "replicaset": "workload",
    "service": "service",
    "node": "node",
    "namespace": "namespace",
    "event": "event",
}
SUPPORTED_CONTEXT_RESOURCE_TYPES = frozenset(
    {spec.resource_type for spec in RESOURCE_KIND_SPECS.values()}
)


async def answer_from_context(
    db: Any,
    *,
    current: Any,
    workspace_id: str,
    context: AiAssistantContext,
    message: str,
) -> AiChatResponse:
    action_decision = propose_alert_rule_action(message, context)
    if context.log_stream_id is not None:
        evidence = await read_log_stream_evidence(
            db,
            current=current,
            workspace_id=workspace_id,
            stream_id=context.log_stream_id,
        )
        if not evidence:
            return _chat_response(
                default_answer=AI_NO_DATA_ANSWER,
                action_decision=action_decision,
                evidence=[],
            )
        lines = [
            f"{item.event.observed_at.isoformat()} "
            f"{item.event.pod}/{item.event.container}: {item.event.line[:300]}"
            for item in evidence
        ]
        answer = "현재 권한으로 확인한 로그 근거입니다: " + "; ".join(lines)
        return _chat_response(
            default_answer=answer[:4000],
            action_decision=action_decision,
            evidence=[
                AiEvidenceLink(
                    type="log-stream",
                    id=item.event.id,
                    label=(
                        f"{item.event.pod}/{item.event.container} "
                        f"@ {item.event.observed_at.isoformat()}"
                    ),
                    link=item.link,
                )
                for item in evidence
            ],
        )

    resources = evidence_resources(
        db,
        current=current,
        workspace_id=workspace_id,
        context=context,
        limit=MAX_AI_EVIDENCE,
    )
    if not resources:
        return _chat_response(
            default_answer=AI_NO_DATA_ANSWER,
            action_decision=action_decision,
            evidence=[],
        )

    facts = "; ".join(
        f"{item.kind} {_display_name(item)} — status {item.status}, health {item.health}"
        for item in resources
    )
    answer = f"현재 관측된 근거 {len(resources)}건입니다: {facts}."
    return _chat_response(
        default_answer=answer,
        action_decision=action_decision,
        evidence=[
            AiEvidenceLink(
                type="inventory-resource",
                id=item.id,
                label=f"{item.kind} {_display_name(item)}",
                link=item.link,
            )
            for item in resources
        ],
    )


def _chat_response(
    *,
    default_answer: str,
    action_decision: AlertActionDecision,
    evidence: list[AiEvidenceLink],
) -> AiChatResponse:
    if action_decision.clarification is not None:
        return AiChatResponse(answer=action_decision.clarification, evidence=evidence)
    if action_decision.action is not None:
        return AiChatResponse(
            answer="현재 화면 범위로 알림 규칙 초안을 제안합니다. 내용을 확인해 주세요.",
            evidence=evidence,
            action=action_decision.action,
        )
    return AiChatResponse(answer=default_answer, evidence=evidence)


def suggestions_for_context(context: AiAssistantContext) -> AiSuggestionsResponse:
    suggestions: list[AiSuggestion] = []
    if context.log_stream_id is not None:
        suggestions.append(
            AiSuggestion(
                id="log-stream-summary",
                label="현재 로그 요약",
                prompt="현재 로그 스트림에서 권한으로 확인 가능한 근거만 요약해 줘.",
            )
        )
    if context.selection is not None:
        suggestions.append(
            AiSuggestion(
                id="selected-resource-status",
                label="선택 리소스 상태",
                prompt="선택한 리소스의 현재 상태와 확인 가능한 근거를 요약해 줘.",
            )
        )
    if context.screen == "resources" and context.filters.resource_types:
        suggestions.extend(
            (
                AiSuggestion(
                    id="resource-health",
                    label="리소스 건강도",
                    prompt="현재 필터에 해당하는 리소스 health 값을 근거와 함께 보여 줘.",
                ),
                AiSuggestion(
                    id="resource-status",
                    label="현재 상태 요약",
                    prompt="현재 필터에 해당하는 리소스 상태를 근거와 함께 요약해 줘.",
                ),
            )
        )
    return AiSuggestionsResponse(suggestions=suggestions[:3])


def list_ai_resources(
    db: Any,
    *,
    current: Any,
    workspace_id: str,
    kind: AiResourceKind,
    cluster_id: str | None,
    namespace: str | None,
    limit: int,
) -> list[AiResourceSummary]:
    clusters = authorized_clusters(
        db,
        current=current,
        workspace_id=workspace_id,
        requested_cluster_id=cluster_id,
    )
    spec = RESOURCE_KIND_SPECS[kind]
    resources: list[AiResourceSummary] = []
    for allowed_cluster_id in clusters:
        rows = _list_inventory_rows(
            db,
            workspace_id=workspace_id,
            cluster_id=allowed_cluster_id,
            resource_type=spec.resource_type,
            namespace=namespace,
        )
        resources.extend(
            _resource_summary(row)
            for row in rows
            if _matches_kubernetes_kind(row, spec.kubernetes_kind)
        )
    resources.sort(
        key=lambda item: (
            item.cluster_id,
            item.namespace or "",
            item.kind,
            item.name,
            item.id,
        )
    )
    return resources[:limit]


def get_ai_resource(
    db: Any,
    *,
    current: Any,
    workspace_id: str,
    kind: AiResourceKind,
    cluster_id: str,
    namespace: str | None,
    name: str,
) -> AiResourceSummary:
    authorized_clusters(
        db,
        current=current,
        workspace_id=workspace_id,
        requested_cluster_id=cluster_id,
    )
    spec = RESOURCE_KIND_SPECS[kind]
    exact_reader = getattr(db, "get_inventory_resource", None)
    if spec.kubernetes_kind is not None and callable(exact_reader):
        row = exact_reader(
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            resource_type=spec.resource_type,
            kind=spec.kubernetes_kind,
            namespace=namespace,
            name=name,
        )
        if isinstance(row, dict):
            return _resource_summary(row)

    rows = _list_inventory_rows(
        db,
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type=spec.resource_type,
        namespace=namespace,
    )
    matches = [
        _resource_summary(row)
        for row in rows
        if str(row.get("name") or "") == name
        and _matches_kubernetes_kind(row, spec.kubernetes_kind)
    ]
    if not matches:
        raise HTTPException(status_code=404, detail="AI resource not found")
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail="AI resource identity is ambiguous")
    return matches[0]


def evidence_resources(
    db: Any,
    *,
    current: Any,
    workspace_id: str,
    context: AiAssistantContext,
    limit: int,
) -> list[AiResourceSummary]:
    # The current inventory projection cannot truthfully answer point-in-time
    # questions. Unsupported application/label filters are likewise not ignored.
    if context.time is not None:
        return []
    if context.selection is None and (context.filters.applications or context.filters.labels):
        return []

    allowed = authorized_clusters(
        db,
        current=current,
        workspace_id=workspace_id,
        requested_cluster_id=None,
    )
    requested_clusters = set(context.filters.clusters)
    clusters = [
        cluster for cluster in allowed if not requested_clusters or cluster in requested_clusters
    ]
    if not clusters:
        return []

    selection = _parse_resource_selection(
        context.selection.identity if context.selection is not None else None
    )
    if context.selection is not None and selection is None:
        return []

    resource_types = {
        value.strip().lower()
        for value in context.filters.resource_types
        if value.strip().lower() in SUPPORTED_CONTEXT_RESOURCE_TYPES
    }
    if selection is not None:
        selected_resource_type = RESOURCE_TYPE_BY_KUBERNETES_KIND.get(selection[0].lower())
        if selected_resource_type is None:
            return []
        resource_types = {selected_resource_type}
    if not resource_types:
        return []

    matches: list[AiResourceSummary] = []
    for cluster_id in clusters:
        for resource_type in sorted(resource_types):
            rows = _list_inventory_rows(
                db,
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                resource_type=resource_type,
                namespace=None,
            )
            for row in rows:
                if not _matches_context(
                    row, context=context, cluster_id=cluster_id, selection=selection
                ):
                    continue
                matches.append(_resource_summary(row))
                if len(matches) >= limit:
                    return matches
    return matches


def authorized_clusters(
    db: Any,
    *,
    current: Any,
    workspace_id: str,
    requested_cluster_id: str | None,
) -> list[str]:
    allowed = resolve_allowed_cluster_ids(
        db,
        current,
        workspace_id,
        Permission.INVENTORY_READ.value,
    )
    if requested_cluster_id is not None:
        if requested_cluster_id not in allowed:
            raise HTTPException(status_code=403, detail="resource access denied")
        return [requested_cluster_id]
    return sorted(allowed)


def _list_inventory_rows(
    db: Any,
    *,
    workspace_id: str,
    cluster_id: str,
    resource_type: str,
    namespace: str | None,
) -> list[dict[str, Any]]:
    reader = getattr(db, "list_inventory_resources", None)
    if not callable(reader):
        return []
    rows = reader(
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type=resource_type,
        namespace=namespace,
        include_deleted=False,
        limit=MAX_AI_RESOURCE_SCAN,
    )
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def _resource_summary(resource: dict[str, Any]) -> AiResourceSummary:
    return AiResourceSummary(
        id=str(resource["inventory_key"]),
        cluster_id=str(resource["cluster_id"]),
        resource_type=str(resource["resource_type"]),
        kind=str(resource["kind"]),
        namespace=(str(resource["namespace"]) if resource.get("namespace") is not None else None),
        name=str(resource["name"]),
        status=str(resource.get("status") or "unknown"),
        health=str(resource.get("health") or "unknown"),
        observed_at=(
            str(resource["observed_at"]) if resource.get("observed_at") is not None else None
        ),
        link=_resource_link(resource),
    )


def _resource_link(resource: dict[str, Any]) -> str:
    cluster_id = str(resource["cluster_id"])
    resource_type = str(resource["resource_type"])
    kind = str(resource["kind"])
    namespace = str(resource["namespace"]) if resource.get("namespace") is not None else "~"
    name = str(resource["name"])
    detail = "/".join((kind, namespace, name))
    query = urlencode(
        {
            "clusters": cluster_id,
            "resources.types": resource_type,
            "detail": detail,
        }
    )
    return f"/resources?{query}"


def _matches_kubernetes_kind(resource: dict[str, Any], expected: str | None) -> bool:
    return expected is None or str(resource.get("kind") or "").lower() == expected.lower()


def _matches_context(
    resource: dict[str, Any],
    *,
    context: AiAssistantContext,
    cluster_id: str,
    selection: tuple[str, str | None, str] | None,
) -> bool:
    if selection is not None:
        kind, namespace, name = selection
        if str(resource.get("kind") or "").lower() != kind.lower():
            return False
        if resource.get("namespace") != namespace or str(resource.get("name") or "") != name:
            return False

    namespace_filters = _namespaces_for_cluster(context.filters.namespaces, cluster_id)
    if context.filters.namespaces and not namespace_filters:
        return False
    if namespace_filters and resource.get("namespace") not in namespace_filters:
        return False

    health_filters = {value.lower() for value in context.filters.health}
    if health_filters and str(resource.get("health") or "").lower() not in health_filters:
        return False

    query = context.filters.query.strip().lower()
    if query:
        searchable = " ".join(
            str(resource.get(field) or "")
            for field in ("kind", "namespace", "name", "status", "health")
        ).lower()
        if query not in searchable:
            return False
    return True


def _namespaces_for_cluster(values: list[str], cluster_id: str) -> set[str]:
    namespaces: set[str] = set()
    for value in values:
        prefix, separator, namespace = value.partition("/")
        if separator and prefix == cluster_id and namespace:
            namespaces.add(namespace)
    return namespaces


def _parse_resource_selection(value: str | None) -> tuple[str, str | None, str] | None:
    if value is None:
        return None
    parts = value.split("/")
    if len(parts) != 3 or not all(parts):
        return None
    kind, namespace_token, name = parts
    namespace = None if namespace_token in {"_", "~"} else namespace_token
    return kind, namespace, name


def _display_name(resource: AiResourceSummary) -> str:
    return f"{resource.namespace}/{resource.name}" if resource.namespace else resource.name
