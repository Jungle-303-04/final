"""Inventory HTTP routes for agent ingestion."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.identity.dependencies import ClusterAgentIdentity, require_cluster_agent
from domains.inventory.events import InventorySnapshotRecordedBody
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import InventorySnapshotRequest
from packages.contracts.gateway.responses import InventorySnapshotResponse
from packages.runtime.dependencies import get_db, get_events
from packages.storage.engine import unit_of_work_or_null

router = APIRouter()


@router.post(
    gateway_routes.AGENT_INVENTORY_SNAPSHOTS_PATH,
    response_model=InventorySnapshotResponse,
)
async def record_inventory_snapshot(
    payload: InventorySnapshotRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> InventorySnapshotResponse:
    if payload.cluster_id != identity.cluster_id:
        raise HTTPException(status_code=403, detail="cluster_id does not match agent identity")
    with unit_of_work_or_null(db):
        result = db.save_inventory_snapshot(
            workspace_id=identity.workspace_id,
            cluster_id=identity.cluster_id,
            agent_id=payload.agent_id,
            payload=payload.model_dump(),
        )
        await events.accept_body(
            InventorySnapshotRecordedBody(
                workspace_id=identity.workspace_id,
                cluster_id=identity.cluster_id,
                snapshot_id=result["snapshot_id"],
                agent_id=payload.agent_id,
                resource_count=result["resource_count"],
                resource_types=result["resource_types"],
            )
        )
    return InventorySnapshotResponse(**result)
