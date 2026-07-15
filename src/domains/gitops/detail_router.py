"""Read-only, provider-neutral GitOps application detail API.

This router deliberately has no webhook HMAC dependency: it is a browser
projection guarded by the normal session and resource-authorization boundary.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.gitops.detail_projection import gitops_application_detail
from domains.identity.dependencies import (
    require_resource_access,
    require_session,
    resolve_allowed_application_ids,
    resolve_allowed_cluster_ids,
)
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gitops.detail import GitOpsApplicationDetailResponse
from packages.contracts.identity import (
    DEFAULT_WORKSPACE_ID,
    AccessResourceType,
    Permission,
)
from packages.runtime.dependencies import get_db

router = APIRouter()


@router.get(
    gateway_routes.GITOPS_APPLICATION_DETAIL_PATH,
    response_model=GitOpsApplicationDetailResponse,
)
async def get_gitops_application_detail(
    application_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> GitOpsApplicationDetailResponse:
    """Return observed source/workflow evidence without impersonating a provider.

    ``refresh`` and ``sync`` are capabilities, not action endpoints in this
    slice.  They stay disabled until a provider-neutral command executor has
    been integrated and can issue an auditable ``CommandReceipt``.
    """

    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_resource_access(
        db,
        current,
        workspace_id,
        AccessResourceType.APPLICATION.value,
        application_id,
        Permission.APPLICATION_READ.value,
    )
    application = await asyncio.to_thread(db.get_application, workspace_id, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="application not found")

    all_bindings = await asyncio.to_thread(
        db.list_application_deployment_bindings,
        workspace_id,
        application_id,
        limit=500,
    )
    inventory_clusters = await asyncio.to_thread(
        resolve_allowed_cluster_ids,
        db,
        current,
        workspace_id,
        Permission.INVENTORY_READ.value,
    )
    visible_bindings = _visible_bindings(all_bindings, inventory_clusters)
    visible_runs = await _visible_runs(
        db,
        workspace_id=workspace_id,
        application_id=application_id,
        allowed_cluster_ids=inventory_clusters,
    )
    actions_authorized = await asyncio.to_thread(
        _actions_authorized,
        db,
        current,
        workspace_id,
        application_id,
        all_bindings,
    )
    return gitops_application_detail(
        application,
        bindings=visible_bindings,
        runs=visible_runs,
        can_refresh=actions_authorized,
        can_sync=actions_authorized,
    )


async def _visible_runs(
    db: Any,
    *,
    workspace_id: str,
    application_id: str,
    allowed_cluster_ids: set[str],
) -> list[Mapping[str, Any]]:
    runs = await asyncio.to_thread(
        db.list_application_workflow_runs,
        workspace_id,
        application_id,
        limit=100,
    )
    return [
        run
        for run in runs
        if isinstance(run, Mapping) and str(run.get("cluster_id") or "") in allowed_cluster_ids
    ]


def _visible_bindings(
    bindings: object,
    allowed_cluster_ids: set[str],
) -> list[Mapping[str, Any]]:
    if not isinstance(bindings, list):
        return []
    return [
        binding
        for binding in bindings
        if isinstance(binding, Mapping)
        and str(binding.get("cluster_id") or "") in allowed_cluster_ids
    ]


def _actions_authorized(
    db: Any,
    current: Any,
    workspace_id: str,
    application_id: str,
    bindings: object,
) -> bool:
    manageable_applications = resolve_allowed_application_ids(
        db,
        current,
        workspace_id,
        Permission.APPLICATION_MANAGE.value,
    )
    if application_id not in manageable_applications:
        return False
    bound_cluster_ids = {
        str(binding.get("cluster_id") or "").strip()
        for binding in bindings
        if isinstance(binding, Mapping) and str(binding.get("cluster_id") or "").strip()
    }
    if not bound_cluster_ids:
        return False
    deployable_clusters = resolve_allowed_cluster_ids(
        db,
        current,
        workspace_id,
        Permission.DEPLOY_RUN.value,
    )
    return bound_cluster_ids.issubset(deployable_clusters)
