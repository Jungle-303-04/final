"""Read-only product projections for the Applications surface."""

from __future__ import annotations

from collections.abc import Collection
from typing import Any

from sqlalchemy import and_, func, select

from domains.dashboard.models import RcaTimeline
from domains.dashboard.repository import OPEN_INCIDENT_STATUSES
from domains.inventory_filter.models import (
    InventoryResourceApplicationVersion,
    InventoryResourceVersion,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import DatabaseConnection, iso_or_none


class ApplicationsProductRepository(DatabaseConnection):
    """Queries only allowlisted evidence needed by BQ-039 through BQ-042."""

    def get_application_inventory_evidence(
        self,
        *,
        workspace_id: str,
        application_id: str,
        allowed_cluster_ids: Collection[str],
    ) -> list[JsonObject]:
        cluster_ids = _ids(allowed_cluster_ids)
        if not workspace_id or not application_id or not cluster_ids:
            return []
        resource = InventoryResourceVersion.__table__
        application = InventoryResourceApplicationVersion.__table__
        statement = (
            select(
                resource.c.inventory_key,
                resource.c.cluster_id,
                resource.c.resource_type,
                resource.c.api_version,
                resource.c.kind,
                resource.c.namespace,
                resource.c.name,
                resource.c.uid,
                resource.c.status,
                resource.c.health,
                resource.c.labels,
                resource.c.summary,
                resource.c.application_binding_complete,
                resource.c.observed_at,
            )
            .select_from(
                resource.join(
                    application,
                    and_(
                        application.c.version_id == resource.c.version_id,
                        application.c.workspace_id == resource.c.workspace_id,
                        application.c.cluster_id == resource.c.cluster_id,
                    ),
                )
            )
            .where(
                resource.c.workspace_id == workspace_id,
                resource.c.cluster_id.in_(cluster_ids),
                resource.c.valid_to_revision.is_(None),
                application.c.application_id == application_id,
            )
            .order_by(
                resource.c.cluster_id,
                resource.c.resource_type,
                resource.c.kind,
                resource.c.namespace,
                resource.c.name,
                resource.c.inventory_key,
            )
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [
            {
                "id": str(row["inventory_key"]),
                "cluster_id": str(row["cluster_id"]),
                "resource_type": str(row["resource_type"]),
                "api_version": str(row["api_version"]),
                "kind": str(row["kind"]),
                "namespace": str(row["namespace"]) if row.get("namespace") is not None else None,
                "name": str(row["name"]),
                "uid": _optional_text(row.get("uid")),
                "status": str(row["status"]),
                "health": str(row["health"]),
                "labels": dict(row.get("labels") or {}),
                "summary": dict(row.get("summary") or {}),
                "binding_complete": bool(row["application_binding_complete"]),
                "observed_at": iso_or_none(row.get("observed_at")),
            }
            for row in rows
        ]

    def get_application_incident_evidence(
        self,
        *,
        workspace_id: str,
        application_id: str,
        allowed_cluster_ids: Collection[str],
        limit: int = 3,
    ) -> JsonObject:
        cluster_ids = _ids(allowed_cluster_ids)
        if not workspace_id or not application_id or not cluster_ids:
            return {"complete": False, "open_count": None, "items": []}
        table = RcaTimeline.__table__
        scope = (
            table.c.workspace_id == workspace_id,
            table.c.cluster_id.in_(cluster_ids),
            table.c.incident_id.is_not(None),
        )
        exact_application = and_(
            table.c.application_ids_complete.is_(True),
            table.c.application_ids.contains([application_id]),
        )
        item_statement = (
            select(
                table.c.incident_id,
                table.c.correlation_id,
                table.c.incident_symptom,
                table.c.root_cause,
                table.c.status,
                table.c.created_at,
                table.c.updated_at,
            )
            .where(*scope, exact_application)
            .order_by(table.c.updated_at.desc(), table.c.id.desc())
            .limit(max(1, min(limit, 3)))
        )
        open_count_statement = (
            select(func.count())
            .select_from(table)
            .where(
                *scope,
                exact_application,
                table.c.status.in_(OPEN_INCIDENT_STATUSES),
            )
        )
        incomplete_statement = (
            select(func.count())
            .select_from(table)
            .where(
                *scope,
                table.c.application_ids_complete.is_(False),
            )
        )
        with self.connection() as conn:
            rows = conn.execute(item_statement).mappings().all()
            incomplete = int(conn.execute(incomplete_statement).scalar_one()) > 0
            open_count = None
            if not incomplete:
                open_count = int(conn.execute(open_count_statement).scalar_one())
        return {
            "complete": not incomplete,
            "open_count": open_count,
            "items": [
                {
                    "id": str(row.get("incident_id") or row["correlation_id"]),
                    "title": _optional_text(row.get("incident_symptom") or row.get("root_cause")),
                    "status": str(row["status"]),
                    "started_at": iso_or_none(row.get("created_at")),
                    "updated_at": iso_or_none(row.get("updated_at")),
                }
                for row in rows
            ],
        }


def _ids(values: Collection[str]) -> tuple[str, ...]:
    return tuple(sorted({str(value) for value in values if str(value)}))


def _optional_text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None
