"""HTTP boundary for the read-only Helm release projection."""

from __future__ import annotations

import asyncio
from collections.abc import Iterable, Mapping
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.command.events import CommandRequestedBody
from domains.command.repository import AgentCommandCapacityExceeded
from domains.command.router import (
    COMMAND_PRIORITY_HIGH,
    accept_command_with_receipt_stage,
    announce_staged_operation_event,
    command_accepted_response,
    new_command_id,
    publish_accepted_operation,
)
from domains.gitops.events import Diff
from domains.helm.release_projection import helm_release_detail, helm_release_list
from domains.helm.repository import HelmOwnedResourceObservationBatch
from domains.identity.dependencies import require_session, resolve_allowed_cluster_ids
from packages.config.constants import RiskLevel
from packages.config.helm import helm_owned_resource_query_limit
from packages.contracts.auth import Actor
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.helm import (
    HELM_ARTIFACT_MAX_ACTIVE_PER_CLUSTER,
    HELM_RELEASE_ARTIFACT_READ_ACTION,
    HELM_RELEASE_ARTIFACT_READ_CAPABILITY,
    HelmArtifactCommandPayload,
    HelmArtifactReadRequest,
)
from packages.contracts.helm.releases import HelmReleaseDetailResponse, HelmReleaseListResponse
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.contracts.parity import CommandReceipt
from packages.runtime.dependencies import get_db, get_events, get_operation_events

router = APIRouter()

INVALID_SCOPE_DETAIL = "Helm release scope is invalid"
SCOPE_NOT_FOUND_DETAIL = "Helm release scope not found"
RELEASE_NOT_FOUND_DETAIL = "Helm release not found"
ARTIFACT_AGENT_UNAVAILABLE_DETAIL = "Helm artifact reader is unavailable"
ARTIFACT_CAPACITY_DETAIL = "too many active Helm artifact reads"
MAX_SCOPE_VALUES = 200


@router.get(gateway_routes.HELM_RELEASES_PATH, response_model=HelmReleaseListResponse)
async def get_helm_releases(
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> HelmReleaseListResponse:
    """List only releases inferred from authorized inventory label metadata."""

    requested_clusters = _scope_values(clusters)
    requested_namespaces = _scope_values(namespaces)
    workspace_id = _workspace_id(current)
    allowed_clusters = await asyncio.to_thread(
        resolve_allowed_cluster_ids,
        db,
        current,
        workspace_id,
        Permission.INVENTORY_READ.value,
    )
    _require_requested_clusters(requested_clusters, allowed_clusters)
    selected_clusters = requested_clusters or tuple(sorted(allowed_clusters))
    contexts, agent_statuses, storage_rows = await asyncio.gather(
        asyncio.to_thread(
            db.helm_release_observation_contexts,
            workspace_id=workspace_id,
            cluster_ids=selected_clusters,
        ),
        asyncio.to_thread(
            db.latest_cluster_agent_statuses,
            workspace_id,
            set(selected_clusters),
        ),
        asyncio.to_thread(
            db.list_helm_storage_observations,
            workspace_id=workspace_id,
            cluster_ids=selected_clusters,
            namespaces=requested_namespaces,
        ),
    )
    owned_resources = await _owned_resource_observations(
        db,
        workspace_id=workspace_id,
        storage_rows=storage_rows,
    )
    return helm_release_list(
        storage_rows,
        contexts=contexts,
        agent_statuses=agent_statuses,
        selected_cluster_ids=selected_clusters,
        owned_resource_rows=owned_resources.rows,
        owned_resources_truncated=owned_resources.truncated,
    )


@router.get(
    gateway_routes.HELM_RELEASE_PATH,
    response_model=HelmReleaseDetailResponse,
)
async def get_helm_release(
    namespace: str,
    release_name: str,
    cluster_id: str = Query(min_length=1),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> HelmReleaseDetailResponse:
    """Read one exact authorized storage scope; no provider fallback is attempted."""

    selected_namespace = _single_scope_value(namespace)
    selected_release = _single_scope_value(release_name)
    selected_cluster = _single_scope_value(cluster_id)
    workspace_id = _workspace_id(current)
    allowed_clusters = await asyncio.to_thread(
        resolve_allowed_cluster_ids,
        db,
        current,
        workspace_id,
        Permission.INVENTORY_READ.value,
    )
    _require_requested_clusters((selected_cluster,), allowed_clusters)
    contexts, agent_statuses, storage_rows, owned_resources = await asyncio.gather(
        asyncio.to_thread(
            db.helm_release_observation_contexts,
            workspace_id=workspace_id,
            cluster_ids=(selected_cluster,),
        ),
        asyncio.to_thread(
            db.latest_cluster_agent_statuses,
            workspace_id,
            {selected_cluster},
        ),
        asyncio.to_thread(
            db.list_helm_storage_observations,
            workspace_id=workspace_id,
            cluster_ids=(selected_cluster,),
            namespaces=(selected_namespace,),
        ),
        asyncio.to_thread(
            db.list_helm_owned_resource_observations,
            workspace_id=workspace_id,
            release_scopes=((selected_cluster, selected_namespace, selected_release),),
            limit=helm_owned_resource_query_limit(),
        ),
    )
    detail = helm_release_detail(
        storage_rows,
        contexts=contexts,
        agent_statuses=agent_statuses,
        selected_cluster_id=selected_cluster,
        namespace=selected_namespace,
        release_name=selected_release,
        owned_resource_rows=owned_resources.rows,
        owned_resources_truncated=owned_resources.truncated,
    )
    if detail is None:
        raise HTTPException(status_code=404, detail=RELEASE_NOT_FOUND_DETAIL)
    return detail


@router.post(
    gateway_routes.HELM_RELEASE_ARTIFACT_PATH,
    response_model=CommandReceipt,
    response_model_exclude_none=True,
    status_code=202,
)
async def create_helm_artifact_read(
    namespace: str,
    release_name: str,
    payload: HelmArtifactReadRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
    operation_events: Any = Depends(get_operation_events),
) -> CommandReceipt:
    """Queue a revision-bound read; only the agent-sanitized artifact crosses the boundary."""

    selected_namespace = _single_scope_value(namespace)
    selected_release = _single_scope_value(release_name)
    selected_cluster = _single_scope_value(payload.cluster_id)
    workspace_id = _workspace_id(current)
    allowed_clusters = await asyncio.to_thread(
        resolve_allowed_cluster_ids,
        db,
        current,
        workspace_id,
        Permission.INVENTORY_READ.value,
    )
    _require_requested_clusters((selected_cluster,), allowed_clusters)
    storage_rows = await asyncio.to_thread(
        db.list_helm_storage_observations,
        workspace_id=workspace_id,
        cluster_ids=(selected_cluster,),
        namespaces=(selected_namespace,),
    )
    if not _release_is_observed(storage_rows, selected_release):
        raise HTTPException(status_code=404, detail=RELEASE_NOT_FOUND_DETAIL)
    if not await asyncio.to_thread(
        _agent_supports_artifact_reads,
        db,
        workspace_id,
        selected_cluster,
    ):
        raise HTTPException(status_code=409, detail=ARTIFACT_AGENT_UNAVAILABLE_DETAIL)

    command_payload = HelmArtifactCommandPayload(
        **payload.model_dump(),
        namespace=selected_namespace,
        release_name=selected_release,
    )
    command = CommandRequestedBody(
        cluster_id=selected_cluster,
        action=HELM_RELEASE_ARTIFACT_READ_ACTION,
        namespace=selected_namespace,
        reason=f"read sanitized Helm {payload.artifact}",
        diff=Diff(
            workspace_id=workspace_id,
            cluster_id=selected_cluster,
            resource=f"helm-release/{selected_namespace}/{selected_release}",
            namespace=selected_namespace,
            desired_image="",
            actual_image="revision-observed",
            risk=RiskLevel.REVIEW_REQUIRED,
            status=HELM_RELEASE_ARTIFACT_READ_ACTION,
            basis={
                "artifact": payload.artifact,
                "revision": payload.revision,
                "comparison_revision": payload.comparison_revision,
                "all_values": payload.all_values,
            },
        ),
        command_id=new_command_id(),
        payload=command_payload.model_dump(mode="json"),
        workspace_id=workspace_id,
        priority=COMMAND_PRIORITY_HIGH,
        requested_by=str(getattr(current, "user_id", "")),
        direct_execution=False,
        direct_execution_confirmed=False,
    )
    try:
        accepted, receipt_event = await accept_command_with_receipt_stage(
            events,
            command,
            actor=Actor(
                str(getattr(current, "user_id", "")),
                tuple(getattr(current, "roles", ()) or ()),
            ),
            max_active_per_action=HELM_ARTIFACT_MAX_ACTIVE_PER_CLUSTER,
        )
    except AgentCommandCapacityExceeded as error:
        raise HTTPException(
            status_code=429,
            detail=ARTIFACT_CAPACITY_DETAIL,
            headers={"Retry-After": "2"},
        ) from error
    response = command_accepted_response(command, accepted)
    if not await announce_staged_operation_event(
        operation_events,
        receipt_event,
        workspace_id=workspace_id,
    ):
        await publish_accepted_operation(operation_events, command, response)
    return response


def _workspace_id(current: Any) -> str:
    return str(getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID) or DEFAULT_WORKSPACE_ID)


def _scope_values(value: str | None) -> tuple[str, ...]:
    if value is None:
        return ()
    values = tuple(sorted({part.strip() for part in value.split(",") if part.strip()}))
    if not values or len(values) > MAX_SCOPE_VALUES:
        raise HTTPException(status_code=422, detail=INVALID_SCOPE_DETAIL)
    return values


def _single_scope_value(value: str) -> str:
    values = _scope_values(value)
    if len(values) != 1:
        raise HTTPException(status_code=422, detail=INVALID_SCOPE_DETAIL)
    return values[0]


def _require_requested_clusters(requested: Iterable[str], allowed: set[str]) -> None:
    if not set(requested).issubset(allowed):
        raise HTTPException(status_code=404, detail=SCOPE_NOT_FOUND_DETAIL)


async def _owned_resource_observations(
    db: Any,
    *,
    workspace_id: str,
    storage_rows: list[dict[str, Any]],
) -> HelmOwnedResourceObservationBatch:
    release_scopes: set[tuple[str, str, str]] = set()
    for row in storage_rows:
        cluster_id = str(row.get("cluster_id") or "").strip()
        namespace = str(row.get("namespace") or "").strip()
        labels = row.get("labels")
        release_name = str(labels.get("name") or "").strip() if isinstance(labels, dict) else ""
        if cluster_id and namespace and release_name:
            release_scopes.add((cluster_id, namespace, release_name))
    if not release_scopes:
        return HelmOwnedResourceObservationBatch(rows=(), truncated=False)
    return await asyncio.to_thread(
        db.list_helm_owned_resource_observations,
        workspace_id=workspace_id,
        release_scopes=tuple(sorted(release_scopes)),
        limit=helm_owned_resource_query_limit(),
    )


def _release_is_observed(rows: list[dict[str, Any]], release_name: str) -> bool:
    for row in rows:
        labels = row.get("labels")
        if isinstance(labels, Mapping) and str(labels.get("name") or "").strip() == release_name:
            return True
    return False


def _agent_supports_artifact_reads(
    db: Any,
    workspace_id: str,
    cluster_id: str,
) -> bool:
    reader = getattr(db, "list_cluster_agent_statuses", None)
    if not callable(reader):
        return False
    statuses = reader(workspace_id, cluster_id)
    return any(
        isinstance(item, Mapping)
        and str(item.get("status") or "").casefold() == "connected"
        and HELM_RELEASE_ARTIFACT_READ_CAPABILITY in tuple(item.get("capabilities") or ())
        for item in statuses
    )
