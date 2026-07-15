"""Temporal inventory projection writer and workspace-wide filter queries."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from collections.abc import Collection, Mapping, Sequence
from dataclasses import replace
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import Integer, Select, and_, case, cast, func, literal, or_, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.gitops.models import Application, DeploymentBinding, ManifestArtifact, WorkflowRun
from domains.identity.models import ClusterRegistration
from domains.inventory.models import ClusterInventoryResourceRecord, ClusterUsageSampleRecord
from domains.inventory_filter.models import (
    InventoryFilterRevision,
    InventoryResourceApplicationVersion,
    InventoryResourceLabelVersion,
    InventoryResourceVersion,
)
from domains.inventory_filter.query import ResourceFilters
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gitops import (
    DeploymentBindingStatus,
    ManifestArtifactStatus,
    WorkflowRunStatus,
)
from packages.storage.engine import DatabaseConnection, iso_or_none

PROJECTION_WRITE_CHUNK = 500
UNKNOWN_PROVIDER = "unknown"
KNOWN_PROVIDERS = frozenset({"eks", "gke", "aks", "onprem", "kind", UNKNOWN_PROVIDER})
PHYSICAL_TOPOLOGY_PODS_PER_SERVER = 12


def inventory_snapshot_lock_key(workspace_id: str, cluster_id: str) -> int:
    digest = hashlib.sha256(f"inventory-snapshot|{workspace_id}|{cluster_id}".encode()).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=True)


def inventory_filter_projection_lock_key(workspace_id: str) -> int:
    """Serialize only revisions whose cursor scope can observe one another."""
    return inventory_snapshot_lock_key("inventory-filter-projection", workspace_id)


def sync_inventory_filter_projection(
    conn: Any,
    *,
    workspace_id: str,
    cluster_id: str,
    snapshot_id: str,
    observed_at: datetime,
    labels_complete: bool,
    resources_complete: bool,
    partial_reason_codes: Sequence[str],
) -> int:
    """Advance one cluster's immutable filter revision in the snapshot transaction."""
    revision_table = InventoryFilterRevision.__table__
    version_table = InventoryResourceVersion.__table__
    label_table = InventoryResourceLabelVersion.__table__
    application_table = InventoryResourceApplicationVersion.__table__
    current_table = ClusterInventoryResourceRecord.__table__

    # Sequence allocation happens before commit. Cursors are workspace-bound, so a
    # workspace transaction lock preserves visible ordering without serializing tenants.
    conn.execute(
        select(func.pg_advisory_xact_lock(inventory_filter_projection_lock_key(workspace_id)))
    )

    revision_id = int(
        conn.execute(
            pg_insert(revision_table)
            .values(
                snapshot_id=snapshot_id,
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                observed_at=observed_at,
                labels_complete=labels_complete,
                resources_complete=resources_complete,
                application_bindings_complete=False,
                partial_reason_codes=sorted(set(partial_reason_codes)),
            )
            .returning(revision_table.c.revision_id)
        ).scalar_one()
    )
    current_rows = [
        dict(row)
        for row in conn.execute(
            select(current_table).where(
                current_table.c.workspace_id == workspace_id,
                current_table.c.cluster_id == cluster_id,
                current_table.c.deleted_at.is_(None),
            )
        )
        .mappings()
        .all()
    ]
    application_ids_by_identity, application_binding_complete = (
        _application_ids_by_resource_identity(
            conn,
            workspace_id=workspace_id,
            cluster_id=cluster_id,
        )
    )
    revision_reasons = set(partial_reason_codes)
    if not application_binding_complete:
        revision_reasons.add("application_bindings_incomplete")
    conn.execute(
        update(revision_table)
        .where(revision_table.c.revision_id == revision_id)
        .values(
            application_bindings_complete=application_binding_complete,
            partial_reason_codes=sorted(revision_reasons),
        )
    )
    active_rows = {
        str(row["inventory_key"]): dict(row)
        for row in conn.execute(
            select(version_table).where(
                version_table.c.workspace_id == workspace_id,
                version_table.c.cluster_id == cluster_id,
                version_table.c.valid_to_revision.is_(None),
            )
        )
        .mappings()
        .all()
    }

    desired_rows: list[JsonObject] = []
    desired_labels: dict[str, dict[str, str]] = {}
    desired_applications: dict[str, tuple[str, ...]] = {}
    current_keys: set[str] = set()
    close_ids: set[int] = set()

    for resource in current_rows:
        inventory_key = str(resource["inventory_key"])
        current_keys.add(inventory_key)
        identity = _resource_identity(resource)
        application_ids = tuple(sorted(application_ids_by_identity.get(identity, set())))
        labels = _normalized_labels(resource.get("labels"))
        row = _version_row(
            resource,
            revision_id=revision_id,
            snapshot_id=snapshot_id,
            labels=labels,
            application_ids=application_ids,
            application_binding_complete=application_binding_complete,
        )
        active = active_rows.get(inventory_key)
        if active is not None and active.get("content_hash") == row["content_hash"]:
            continue
        if active is not None:
            close_ids.add(int(active["version_id"]))
        desired_rows.append(row)
        desired_labels[inventory_key] = labels
        desired_applications[inventory_key] = application_ids

    for inventory_key, active in active_rows.items():
        if inventory_key not in current_keys:
            close_ids.add(int(active["version_id"]))

    if close_ids:
        conn.execute(
            update(version_table)
            .where(
                version_table.c.version_id.in_(close_ids),
                version_table.c.valid_to_revision.is_(None),
            )
            .values(
                valid_to_revision=revision_id,
                valid_to_observed_at=observed_at,
            )
        )

    for start in range(0, len(desired_rows), PROJECTION_WRITE_CHUNK):
        chunk = desired_rows[start : start + PROJECTION_WRITE_CHUNK]
        inserted = conn.execute(
            pg_insert(version_table)
            .values(chunk)
            .returning(version_table.c.version_id, version_table.c.inventory_key)
        ).all()
        label_rows: list[JsonObject] = []
        application_rows: list[JsonObject] = []
        for version_id, inventory_key_value in inserted:
            inventory_key = str(inventory_key_value)
            for key, value in desired_labels[inventory_key].items():
                label_rows.append(
                    {
                        "version_id": int(version_id),
                        "workspace_id": workspace_id,
                        "cluster_id": cluster_id,
                        "key": key,
                        "value": value,
                        "selector": f"{key}={value}".casefold(),
                    }
                )
            for application_id in desired_applications[inventory_key]:
                application_rows.append(
                    {
                        "version_id": int(version_id),
                        "workspace_id": workspace_id,
                        "cluster_id": cluster_id,
                        "application_id": application_id,
                    }
                )
        if label_rows:
            conn.execute(pg_insert(label_table).values(label_rows))
        if application_rows:
            conn.execute(pg_insert(application_table).values(application_rows))
    return revision_id


def _application_ids_by_resource_identity(
    conn: Any,
    *,
    workspace_id: str,
    cluster_id: str,
) -> tuple[dict[tuple[str, str, str | None, str], set[str]], bool]:
    statement = authoritative_application_resource_statement(workspace_id, cluster_id)
    applications: dict[tuple[str, str, str | None, str], set[str]] = defaultdict(set)
    covered_binding_ids: set[str] = set()
    for row in conn.execute(statement).mappings().all():
        covered_binding_ids.add(str(row["binding_id"]))
        api_version = str(row.get("api_version") or "")
        kind = str(row.get("kind") or "").casefold()
        name = str(row.get("name") or "")
        application_id = str(row.get("application_id") or "")
        if not kind or not name or not application_id:
            continue
        namespace_value = row.get("namespace")
        namespace = str(namespace_value) if namespace_value is not None else None
        applications[(api_version, kind, namespace, name)].add(application_id)
    binding = DeploymentBinding.__table__
    active_binding_ids = {
        str(value)
        for value in conn.execute(
            select(binding.c.binding_id).where(
                binding.c.workspace_id == workspace_id,
                binding.c.cluster_id == cluster_id,
                binding.c.status == DeploymentBindingStatus.ACTIVE.value,
            )
        ).scalars()
    }
    return applications, active_binding_ids.issubset(covered_binding_ids)


def authoritative_application_resource_statement(
    workspace_id: str,
    cluster_id: str,
) -> Select[Any]:
    run = WorkflowRun.__table__
    binding = DeploymentBinding.__table__
    artifact = ManifestArtifact.__table__
    application = Application.__table__
    ranked_runs = (
        select(
            run.c.workspace_id,
            run.c.binding_id,
            run.c.application_id,
            run.c.cluster_id,
            run.c.commit_sha,
            func.row_number()
            .over(
                partition_by=(run.c.workspace_id, run.c.binding_id),
                order_by=(run.c.updated_at.desc(), run.c.workflow_run_id.desc()),
            )
            .label("rank"),
        )
        .where(
            run.c.workspace_id == workspace_id,
            run.c.cluster_id == cluster_id,
            run.c.status == WorkflowRunStatus.SUCCEEDED.value,
        )
        .cte("latest_successful_inventory_runs")
    )
    rendered = artifact.c.rendered_manifest
    manifest_namespace = rendered["metadata"]["namespace"].astext
    return (
        select(
            binding.c.binding_id,
            application.c.application_id,
            rendered["apiVersion"].astext.label("api_version"),
            rendered["kind"].astext.label("kind"),
            func.coalesce(manifest_namespace, binding.c.namespace).label("namespace"),
            rendered["metadata"]["name"].astext.label("name"),
        )
        .select_from(
            ranked_runs.join(
                binding,
                and_(
                    binding.c.workspace_id == ranked_runs.c.workspace_id,
                    binding.c.binding_id == ranked_runs.c.binding_id,
                    binding.c.cluster_id == ranked_runs.c.cluster_id,
                ),
            )
            .join(
                application,
                and_(
                    application.c.workspace_id == binding.c.workspace_id,
                    application.c.repository_id == binding.c.repository_id,
                    application.c.name == binding.c.app_name,
                    application.c.application_id == ranked_runs.c.application_id,
                ),
            )
            .join(
                artifact,
                and_(
                    artifact.c.workspace_id == ranked_runs.c.workspace_id,
                    artifact.c.binding_id == ranked_runs.c.binding_id,
                    artifact.c.commit_sha == ranked_runs.c.commit_sha,
                ),
            )
        )
        .where(
            ranked_runs.c.rank == 1,
            binding.c.status == DeploymentBindingStatus.ACTIVE.value,
            artifact.c.status == ManifestArtifactStatus.RENDERED.value,
            artifact.c.rendered_manifest.is_not(None),
            func.jsonb_typeof(artifact.c.rendered_manifest) == "object",
        )
    )


def _resource_identity(resource: Mapping[str, Any]) -> tuple[str, str, str | None, str]:
    namespace_value = resource.get("namespace")
    return (
        str(resource.get("api_version") or ""),
        str(resource.get("kind") or "").casefold(),
        str(namespace_value) if namespace_value is not None else None,
        str(resource.get("name") or ""),
    )


def _normalized_labels(value: object) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {
        str(key): str(label_value)
        for key, label_value in sorted(value.items(), key=lambda item: str(item[0]))
        if str(key)
    }


def _version_row(
    resource: Mapping[str, Any],
    *,
    revision_id: int,
    snapshot_id: str,
    labels: dict[str, str],
    application_ids: tuple[str, ...],
    application_binding_complete: bool,
) -> JsonObject:
    meaningful = {
        "inventory_key": resource["inventory_key"],
        "resource_type": resource["resource_type"],
        "api_version": resource["api_version"],
        "kind": resource["kind"],
        "namespace": resource.get("namespace"),
        "name": resource["name"],
        "uid": resource.get("uid"),
        "resource_version": resource.get("resource_version"),
        "status": resource["status"],
        "health": resource["health"],
        "labels": labels,
        "summary": dict(resource.get("summary") or {}),
        "application_ids": application_ids,
        "application_binding_complete": application_binding_complete,
    }
    encoded = json.dumps(
        meaningful,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
        default=str,
    )
    namespace = resource.get("namespace")
    search_parts = (
        str(resource.get("name") or ""),
        str(resource.get("kind") or ""),
        str(namespace or ""),
        str(resource.get("resource_type") or ""),
    )
    return {
        "inventory_key": str(resource["inventory_key"]),
        "source_snapshot_id": snapshot_id,
        "workspace_id": str(resource["workspace_id"]),
        "cluster_id": str(resource["cluster_id"]),
        "valid_from_revision": revision_id,
        "valid_to_revision": None,
        "valid_to_observed_at": None,
        "content_hash": hashlib.sha256(encoded.encode()).hexdigest(),
        "resource_type": str(resource["resource_type"]),
        "api_version": str(resource["api_version"]),
        "kind": str(resource["kind"]),
        "namespace": str(namespace) if namespace is not None else None,
        "name": str(resource["name"]),
        "uid": str(resource["uid"]) if resource.get("uid") is not None else None,
        "resource_version": (
            str(resource["resource_version"])
            if resource.get("resource_version") is not None
            else None
        ),
        "status": str(resource["status"]),
        "health": str(resource["health"]),
        "labels": labels,
        "summary": dict(resource.get("summary") or {}),
        "observed_at": resource["observed_at"],
        "first_seen_at": resource["first_seen_at"],
        "application_binding_complete": application_binding_complete,
        "search_text": " ".join(search_parts).casefold(),
    }


class InventoryFilterRepository(DatabaseConnection):
    def list_workspace_application_ids(self, workspace_id: str) -> set[str]:
        if not workspace_id:
            return set()
        table = Application.__table__
        with self.connection() as conn:
            values = conn.execute(
                select(table.c.application_id).where(table.c.workspace_id == workspace_id)
            ).scalars()
            return {str(value) for value in values.all()}

    def resolve_filter_clusters(
        self,
        workspace_id: str,
        cluster_ids: Collection[str],
    ) -> dict[str, JsonObject]:
        requested = _ids(cluster_ids)
        if not workspace_id or not requested:
            return {}
        table = ClusterRegistration.__table__
        with self.connection() as conn:
            rows = conn.execute(
                select(table.c.cluster_id, table.c.name, table.c.settings).where(
                    table.c.workspace_id == workspace_id,
                    table.c.cluster_id.in_(requested),
                )
            ).mappings()
            return {
                str(row["cluster_id"]): {
                    "cluster_id": str(row["cluster_id"]),
                    "name": str(row["name"]),
                    "provider": _provider(row.get("settings")),
                }
                for row in rows
            }

    def resolve_filter_applications(
        self,
        workspace_id: str,
        application_ids: Collection[str],
    ) -> dict[str, JsonObject]:
        requested = _ids(application_ids)
        if not workspace_id or not requested:
            return {}
        table = Application.__table__
        with self.connection() as conn:
            rows = conn.execute(
                select(table.c.application_id, table.c.name).where(
                    table.c.workspace_id == workspace_id,
                    table.c.application_id.in_(requested),
                )
            ).mappings()
            return {str(row["application_id"]): {"name": str(row["name"])} for row in rows}

    def resolve_filter_namespaces(
        self,
        workspace_id: str,
        allowed_cluster_ids: Collection[str],
        snapshot_revision: int,
        namespace_refs: Collection[tuple[str, str]],
    ) -> set[tuple[str, str]]:
        cluster_ids = _ids(allowed_cluster_ids)
        requested = tuple(sorted(set(namespace_refs)))
        if not workspace_id or not cluster_ids or snapshot_revision <= 0 or not requested:
            return set()
        current = _current_versions(
            workspace_id,
            cluster_ids,
            snapshot_revision,
            include_deleted=False,
        )
        statement = (
            select(current.c.cluster_id, current.c.namespace)
            .where(
                current.c.rank == 1,
                current.c.namespace.is_not(None),
                or_(
                    *(
                        and_(
                            current.c.cluster_id == cluster_id,
                            current.c.namespace == namespace,
                        )
                        for cluster_id, namespace in requested
                    )
                ),
            )
            .distinct()
        )
        with self.connection() as conn:
            return {
                (str(row["cluster_id"]), str(row["namespace"]))
                for row in conn.execute(statement).mappings()
            }

    def filter_snapshot_context(
        self,
        workspace_id: str,
        allowed_cluster_ids: Collection[str],
        *,
        at_revision: int | None = None,
    ) -> JsonObject:
        cluster_ids = _ids(allowed_cluster_ids)
        if not workspace_id or not cluster_ids:
            return {
                "snapshot_revision": 0,
                "observed_at": None,
                "labels_complete": True,
                "resources_complete": True,
                "application_bindings_complete": True,
                "partial_reason_codes": [],
            }
        table = InventoryFilterRevision.__table__
        ranked = (
            select(
                table,
                func.row_number()
                .over(
                    partition_by=table.c.cluster_id,
                    order_by=table.c.revision_id.desc(),
                )
                .label("rank"),
            )
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id.in_(cluster_ids),
                *((table.c.revision_id <= at_revision,) if at_revision is not None else ()),
            )
            .cte("latest_inventory_filter_revisions")
        )
        statement = select(ranked).where(ranked.c.rank == 1)
        with self.connection() as conn:
            rows = [dict(row) for row in conn.execute(statement).mappings().all()]
        reasons = {
            str(reason) for row in rows for reason in (row.get("partial_reason_codes") or [])
        }
        if len(rows) != len(cluster_ids):
            reasons.add("missing_inventory_projection")
        observed = max((row["observed_at"] for row in rows), default=None)
        return {
            "snapshot_revision": max((int(row["revision_id"]) for row in rows), default=0),
            "observed_at": iso_or_none(observed),
            "labels_complete": len(rows) == len(cluster_ids)
            and all(bool(row["labels_complete"]) for row in rows),
            "resources_complete": len(rows) == len(cluster_ids)
            and all(bool(row["resources_complete"]) for row in rows),
            "application_bindings_complete": len(rows) == len(cluster_ids)
            and all(bool(row["application_bindings_complete"]) for row in rows),
            "partial_reason_codes": sorted(reasons),
        }

    def list_filter_clusters(
        self,
        workspace_id: str,
        allowed_cluster_ids: Collection[str],
        *,
        position: Mapping[str, Any] | None,
        limit: int,
    ) -> JsonObject:
        cluster_ids = _ids(allowed_cluster_ids)
        if not workspace_id or not cluster_ids:
            return _empty_page()
        effective_limit = max(1, min(limit, 200))
        table = ClusterRegistration.__table__
        statement = (
            select(
                table.c.cluster_id,
                table.c.name,
                table.c.settings,
            )
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id.in_(cluster_ids),
            )
            .order_by(table.c.cluster_id)
        )
        if position:
            statement = statement.where(table.c.cluster_id > _facet_position(position))
        statement = statement.limit(effective_limit + 1)
        with self.connection() as conn:
            rows = [dict(row) for row in conn.execute(statement).mappings().all()]
        has_more = len(rows) > effective_limit
        rows = rows[:effective_limit]
        return {
            "items": [
                {
                    "cluster_id": str(row["cluster_id"]),
                    "name": str(row["name"]),
                    "provider": _provider(row.get("settings")),
                }
                for row in rows
            ],
            "has_more": has_more,
            "next_position": (
                {"value": str(rows[-1]["cluster_id"])} if has_more and rows else None
            ),
        }

    def list_filter_applications(
        self,
        workspace_id: str,
        allowed_application_ids: Collection[str],
        *,
        position: Mapping[str, Any] | None,
        limit: int,
    ) -> JsonObject:
        application_ids = _ids(allowed_application_ids)
        if not workspace_id or not application_ids:
            return _empty_page()
        effective_limit = max(1, min(limit, 200))
        table = Application.__table__
        statement = (
            select(table.c.application_id, table.c.name)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.application_id.in_(application_ids),
            )
            .order_by(table.c.application_id)
        )
        if position:
            statement = statement.where(table.c.application_id > _facet_position(position))
        statement = statement.limit(effective_limit + 1)
        with self.connection() as conn:
            rows = [dict(row) for row in conn.execute(statement).mappings().all()]
        has_more = len(rows) > effective_limit
        rows = rows[:effective_limit]
        return {
            "items": rows,
            "has_more": has_more,
            "next_position": (
                {"value": str(rows[-1]["application_id"])} if has_more and rows else None
            ),
        }

    def list_filter_namespaces(
        self,
        workspace_id: str,
        allowed_cluster_ids: Collection[str],
        snapshot_revision: int,
        *,
        position: Mapping[str, Any] | None,
        limit: int,
    ) -> JsonObject:
        cluster_ids = _ids(allowed_cluster_ids)
        if not workspace_id or not cluster_ids or snapshot_revision <= 0:
            return _empty_page()
        effective_limit = max(1, min(limit, 200))
        current = _current_versions(
            workspace_id,
            cluster_ids,
            snapshot_revision,
            include_deleted=False,
        )
        statement = (
            select(current.c.cluster_id, current.c.namespace)
            .where(
                current.c.rank == 1,
                current.c.namespace.is_not(None),
            )
            .distinct()
            .order_by(current.c.cluster_id, current.c.namespace)
        )
        if position:
            statement = statement.where(
                tuple_(current.c.cluster_id, current.c.namespace)
                > _namespace_position_tuple(position)
            )
        statement = statement.limit(effective_limit + 1)
        with self.connection() as conn:
            rows = [dict(row) for row in conn.execute(statement).mappings().all()]
        has_more = len(rows) > effective_limit
        rows = rows[:effective_limit]
        return {
            "items": rows,
            "has_more": has_more,
            "next_position": (
                {
                    "cluster_id": str(rows[-1]["cluster_id"]),
                    "namespace": str(rows[-1]["namespace"]),
                }
                if has_more and rows
                else None
            ),
        }

    def list_global_filter_facets(
        self,
        *,
        workspace_id: str,
        allowed_cluster_ids: Collection[str],
        allowed_application_ids: Collection[str],
        filters: ResourceFilters,
        snapshot_revision: int,
        query: str | None,
        limit: int,
    ) -> JsonObject:
        """Return bounded, server-counted suggestions for the product-wide filter bar."""
        cluster_ids = _ids(allowed_cluster_ids)
        application_ids = _ids(allowed_application_ids)
        if not workspace_id or not cluster_ids:
            return _empty_global_filter_facets()
        effective_limit = max(1, min(limit, 20))
        normalized_query = (query or "").strip().casefold()
        pattern = f"%{_escape_like(normalized_query)}%"
        current = _current_versions(
            workspace_id,
            cluster_ids,
            snapshot_revision,
            include_deleted=False,
        )
        base = select(current).where(current.c.rank == 1).cte("global_filter_base")

        def filtered(name: str, selected: ResourceFilters) -> Any:
            return _apply_resource_filters(
                base,
                filters=replace(selected, query=None, include_deleted=False),
                allowed_application_ids=application_ids,
            ).cte(name)

        cluster_matches = filtered(
            "global_cluster_matches",
            replace(filters, clusters=()),
        )
        namespace_matches = filtered(
            "global_namespace_matches",
            replace(filters, namespaces=()),
        )
        application_matches = filtered(
            "global_application_matches",
            replace(filters, applications=()),
        )
        resource_type_matches = filtered(
            "global_resource_type_matches",
            replace(filters, resource_types=()),
        )
        selected_matches = filtered("global_selected_matches", filters)

        cluster = ClusterRegistration.__table__
        cluster_statement = (
            select(
                cluster.c.cluster_id.label("id"),
                cluster.c.name.label("label"),
                func.count(func.distinct(cluster_matches.c.version_id)).label("count"),
            )
            .select_from(
                cluster.outerjoin(
                    cluster_matches,
                    cluster_matches.c.cluster_id == cluster.c.cluster_id,
                )
            )
            .where(
                cluster.c.workspace_id == workspace_id,
                cluster.c.cluster_id.in_(cluster_ids),
            )
            .group_by(cluster.c.cluster_id, cluster.c.name)
        )
        if normalized_query:
            cluster_statement = cluster_statement.where(
                or_(
                    func.lower(cluster.c.cluster_id).like(pattern, escape="\\"),
                    func.lower(cluster.c.name).like(pattern, escape="\\"),
                )
            )
        cluster_statement = cluster_statement.order_by(
            func.count(func.distinct(cluster_matches.c.version_id)).desc(),
            cluster.c.name,
            cluster.c.cluster_id,
        ).limit(effective_limit)

        namespace_statement = (
            select(
                (
                    namespace_matches.c.cluster_id + literal("/") + namespace_matches.c.namespace
                ).label("id"),
                namespace_matches.c.namespace.label("label"),
                namespace_matches.c.cluster_id,
                func.count(func.distinct(namespace_matches.c.version_id)).label("count"),
            )
            .where(namespace_matches.c.namespace.is_not(None))
            .group_by(namespace_matches.c.cluster_id, namespace_matches.c.namespace)
        )
        if normalized_query:
            namespace_statement = namespace_statement.where(
                func.lower(namespace_matches.c.namespace).like(pattern, escape="\\")
            )
        namespace_statement = namespace_statement.order_by(
            func.count(func.distinct(namespace_matches.c.version_id)).desc(),
            namespace_matches.c.namespace,
            namespace_matches.c.cluster_id,
        ).limit(effective_limit)

        application = Application.__table__
        application_link = InventoryResourceApplicationVersion.__table__
        application_counts = (
            select(
                application_link.c.application_id,
                func.count(func.distinct(application_matches.c.version_id)).label("count"),
            )
            .select_from(
                application_link.join(
                    application_matches,
                    and_(
                        application_link.c.workspace_id == application_matches.c.workspace_id,
                        application_link.c.version_id == application_matches.c.version_id,
                    ),
                )
            )
            .where(application_link.c.application_id.in_(application_ids))
            .group_by(application_link.c.application_id)
            .cte("global_application_counts")
        )
        application_statement = (
            select(
                application.c.application_id.label("id"),
                application.c.name.label("label"),
                func.coalesce(application_counts.c.count, 0).label("count"),
            )
            .select_from(
                application.outerjoin(
                    application_counts,
                    application_counts.c.application_id == application.c.application_id,
                )
            )
            .where(
                application.c.workspace_id == workspace_id,
                application.c.application_id.in_(application_ids),
            )
        )
        if normalized_query:
            application_statement = application_statement.where(
                or_(
                    func.lower(application.c.application_id).like(pattern, escape="\\"),
                    func.lower(application.c.name).like(pattern, escape="\\"),
                )
            )
        application_statement = application_statement.order_by(
            func.coalesce(application_counts.c.count, 0).desc(),
            application.c.name,
            application.c.application_id,
        ).limit(effective_limit)

        resource_type_statement = select(
            resource_type_matches.c.resource_type.label("id"),
            resource_type_matches.c.resource_type.label("label"),
            func.count(func.distinct(resource_type_matches.c.version_id)).label("count"),
        ).group_by(resource_type_matches.c.resource_type)
        if normalized_query:
            resource_type_statement = resource_type_statement.where(
                func.lower(resource_type_matches.c.resource_type).like(pattern, escape="\\")
            )
        resource_type_statement = resource_type_statement.order_by(
            func.count(func.distinct(resource_type_matches.c.version_id)).desc(),
            resource_type_matches.c.resource_type,
        ).limit(effective_limit)

        label = InventoryResourceLabelVersion.__table__
        label_statement = (
            select(
                label.c.key,
                label.c.value,
                func.count(func.distinct(selected_matches.c.version_id)).label("count"),
            )
            .select_from(
                selected_matches.join(
                    label,
                    and_(
                        label.c.workspace_id == selected_matches.c.workspace_id,
                        label.c.version_id == selected_matches.c.version_id,
                    ),
                )
            )
            .where(label.c.selector.like(pattern, escape="\\"))
            .group_by(label.c.key, label.c.value)
            .order_by(
                func.count(func.distinct(selected_matches.c.version_id)).desc(),
                label.c.key,
                label.c.value,
            )
            .limit(effective_limit)
        )
        resource_statement = (
            select(
                selected_matches.c.inventory_key.label("id"),
                selected_matches.c.name.label("label"),
                selected_matches.c.kind,
                literal(1).label("count"),
            )
            .where(selected_matches.c.search_text.like(pattern, escape="\\"))
            .order_by(
                selected_matches.c.name,
                selected_matches.c.kind,
                selected_matches.c.inventory_key,
            )
            .limit(effective_limit)
        )

        with self.connection() as conn:
            clusters = [dict(row) for row in conn.execute(cluster_statement).mappings()]
            namespaces = [dict(row) for row in conn.execute(namespace_statement).mappings()]
            applications = [dict(row) for row in conn.execute(application_statement).mappings()]
            resource_types = [dict(row) for row in conn.execute(resource_type_statement).mappings()]
            labels = (
                [dict(row) for row in conn.execute(label_statement).mappings()]
                if normalized_query
                else []
            )
            resources = (
                [dict(row) for row in conn.execute(resource_statement).mappings()]
                if normalized_query
                else []
            )
        return {
            "clusters": _serialize_global_facets(clusters),
            "namespaces": _serialize_global_facets(namespaces),
            "applications": _serialize_global_facets(applications),
            "resource_types": [
                {
                    "id": str(row["id"]),
                    "label": str(row["label"]).replace("_", " ").replace("-", " ").title(),
                    "count": int(row["count"]),
                }
                for row in resource_types
            ],
            "labels": [
                {"key": str(row["key"]), "value": str(row["value"]), "count": int(row["count"])}
                for row in labels
            ],
            "resources": _serialize_global_facets(resources),
        }

    def list_filtered_resources(
        self,
        *,
        workspace_id: str,
        allowed_cluster_ids: Collection[str],
        allowed_application_ids: Collection[str],
        filters: ResourceFilters,
        snapshot_revision: int,
        position: Mapping[str, Any] | None,
        limit: int,
        graph_priority: bool = False,
    ) -> JsonObject:
        cluster_ids = _ids(allowed_cluster_ids)
        application_ids = _ids(allowed_application_ids)
        if not workspace_id or not cluster_ids or snapshot_revision <= 0:
            return _empty_page()
        effective_limit = max(1, min(limit, 200))
        current = _current_versions(
            workspace_id,
            cluster_ids,
            snapshot_revision,
            include_deleted=filters.include_deleted,
        )
        base = select(current).where(current.c.rank == 1)
        base_cte = base.cte("authorized_inventory_versions")
        filtered = _apply_resource_filters(
            base_cte,
            filters=filters,
            allowed_application_ids=application_ids,
        ).cte("filtered_inventory_versions")
        unfiltered_count = select(func.count()).select_from(base_cte).scalar_subquery()
        filtered_count = select(func.count()).select_from(filtered).scalar_subquery()
        page = select(
            filtered,
            filtered_count.label("filtered_count"),
            unfiltered_count.label("unfiltered_count"),
        )
        if graph_priority and position:
            raise ValueError("graph-priority resource pages do not support a cursor position")
        if position:
            page = page.where(_sort_tuple(filtered) > _position_tuple(position))
        order = _sort_columns(filtered)
        if graph_priority:
            order = (
                case(
                    (
                        filtered.c.resource_type.in_(
                            ("workload", "pod", "node", "service", "endpoint")
                        ),
                        0,
                    ),
                    else_=1,
                ),
                *order,
            )
        page = page.order_by(*order).limit(effective_limit + 1)
        with self.connection() as conn:
            rows = [dict(row) for row in conn.execute(page).mappings().all()]
            has_more = len(rows) > effective_limit
            rows = rows[:effective_limit]
            version_ids = [int(row["version_id"]) for row in rows]
            applications_by_version = _applications_for_versions(
                conn,
                version_ids,
                allowed_application_ids=application_ids,
            )
            clusters_by_id = _clusters_for_page(
                conn,
                workspace_id,
                {str(row["cluster_id"]) for row in rows},
            )
        filtered_total = int(rows[0]["filtered_count"]) if rows else _count(filtered_count, self)
        unfiltered_total = (
            int(rows[0]["unfiltered_count"]) if rows else _count(unfiltered_count, self)
        )
        items = [
            _serialize_version_row(
                row,
                snapshot_revision=snapshot_revision,
                application_scope=applications_by_version.get(
                    int(row["version_id"]),
                    ([], False),
                ),
                cluster=clusters_by_id.get(str(row["cluster_id"])),
            )
            for row in rows
        ]
        next_position = _position(rows[-1]) if has_more and rows else None
        return {
            "items": items,
            "filtered_count": filtered_total,
            "unfiltered_count": unfiltered_total,
            "has_more": has_more,
            "next_position": next_position,
        }

    def list_resource_metric_history(
        self,
        *,
        workspace_id: str,
        allowed_cluster_ids: Collection[str],
        allowed_application_ids: Collection[str],
        filters: ResourceFilters,
        snapshot_revision: int,
        resource_ids: Collection[str],
        window_seconds: int,
        limit: int,
    ) -> JsonObject:
        """Resolve requested pods inside the filtered cut, then read bounded real samples."""
        cluster_ids = _ids(allowed_cluster_ids)
        application_ids = _ids(allowed_application_ids)
        requested = _ids(resource_ids)
        if not workspace_id or not cluster_ids or not requested or snapshot_revision <= 0:
            return {"resources": [], "samples_by_cluster": {}}
        resource_statement, _unused_sample_statement = _resource_metric_history_statements(
            workspace_id=workspace_id,
            cluster_ids=cluster_ids,
            allowed_application_ids=application_ids,
            filters=filters,
            snapshot_revision=snapshot_revision,
            resource_ids=requested,
            window_seconds=window_seconds,
            limit=limit,
        )
        with self.connection() as conn:
            resources = [dict(row) for row in conn.execute(resource_statement).mappings().all()]
            # Fail closed before touching time-series rows when any supplied id is not in
            # the exact authorized + filtered + pinned resource cut.
            if {str(row["resource_id"]) for row in resources} != set(requested):
                return {"resources": resources, "samples_by_cluster": {}}
            metric_cluster_ids = _ids({str(row["cluster_id"]) for row in resources})
            _unused_resource_statement, sample_statement = _resource_metric_history_statements(
                workspace_id=workspace_id,
                cluster_ids=metric_cluster_ids,
                allowed_application_ids=application_ids,
                filters=filters,
                snapshot_revision=snapshot_revision,
                resource_ids=requested,
                window_seconds=window_seconds,
                limit=limit,
            )
            rows = [dict(row) for row in conn.execute(sample_statement).mappings().all()]
        samples_by_cluster: dict[str, list[JsonObject]] = defaultdict(list)
        for row in rows:
            samples_by_cluster[str(row["cluster_id"])].append(
                {
                    "sampled_at": iso_or_none(row.get("sampled_at")),
                    "usage": dict(row.get("usage") or {}),
                }
            )
        return {
            "resources": resources,
            "samples_by_cluster": dict(samples_by_cluster),
        }

    def list_physical_topology_resources(
        self,
        *,
        workspace_id: str,
        allowed_cluster_ids: Collection[str],
        allowed_application_ids: Collection[str],
        filters: ResourceFilters,
        snapshot_revision: int,
    ) -> JsonObject:
        """Return bounded node/pod placement plus server-evaluated filter membership."""
        cluster_ids = _ids(allowed_cluster_ids)
        application_ids = _ids(allowed_application_ids)
        if not workspace_id or len(cluster_ids) != 1 or snapshot_revision <= 0:
            return {
                "servers": [],
                "pods": [],
                "pod_counts_by_node_name": {},
                "truncated_by_node_name": {},
                "unassigned_truncated_count": 0,
                "filtered_count": 0,
                "unfiltered_count": 0,
            }
        server_statement, pod_statement, count_statement = _physical_topology_statements(
            workspace_id=workspace_id,
            cluster_ids=cluster_ids,
            allowed_application_ids=application_ids,
            filters=filters,
            snapshot_revision=snapshot_revision,
        )
        with self.connection() as conn:
            servers = [dict(row) for row in conn.execute(server_statement).mappings().all()]
            pods = [dict(row) for row in conn.execute(pod_statement).mappings().all()]
            counts = dict(conn.execute(count_statement).mappings().one())

        truncated_by_node_name: dict[str, int] = {}
        pod_counts_by_node_name: dict[str, JsonObject] = {}
        unassigned_truncated_count = 0
        for row in pods:
            total = int(row.get("placement_pod_count") or 0)
            node_name = str(row.get("placement_node_name") or "")
            pod_counts_by_node_name[node_name] = {
                "matched": int(row.get("matched_pod_count") or 0),
                "total": total,
            }
            omitted = max(0, total - PHYSICAL_TOPOLOGY_PODS_PER_SERVER)
            if omitted <= 0:
                continue
            if node_name:
                truncated_by_node_name[node_name] = omitted
            else:
                unassigned_truncated_count = omitted
        return {
            "servers": servers,
            "pods": pods,
            "pod_counts_by_node_name": pod_counts_by_node_name,
            "truncated_by_node_name": truncated_by_node_name,
            "unassigned_truncated_count": unassigned_truncated_count,
            "filtered_count": int(counts.get("filtered_count") or 0),
            "unfiltered_count": int(counts.get("unfiltered_count") or 0),
        }

    def list_label_facets(
        self,
        *,
        workspace_id: str,
        allowed_cluster_ids: Collection[str],
        allowed_application_ids: Collection[str],
        filters: ResourceFilters,
        snapshot_revision: int,
        facet_query: str | None,
        position: Mapping[str, Any] | None,
        limit: int,
    ) -> JsonObject:
        cluster_ids = _ids(allowed_cluster_ids)
        application_ids = _ids(allowed_application_ids)
        if not workspace_id or not cluster_ids or snapshot_revision <= 0:
            return {**_empty_page(), "selected_match_counts": []}
        effective_limit = max(1, min(limit, 200))
        current = _current_versions(
            workspace_id,
            cluster_ids,
            snapshot_revision,
            include_deleted=filters.include_deleted,
        )
        base = select(current).where(current.c.rank == 1)
        base_cte = base.cte("authorized_inventory_versions")
        filtered = _apply_resource_filters(
            base_cte,
            filters=filters,
            allowed_application_ids=application_ids,
        ).cte("filtered_inventory_versions")
        selected_base = _apply_resource_filters(
            base_cte,
            filters=replace(filters, labels=()),
            allowed_application_ids=application_ids,
        ).cte("selected_label_base_versions")
        label = InventoryResourceLabelVersion.__table__
        filtered_count = select(func.count()).select_from(filtered).scalar_subquery()
        unfiltered_count = select(func.count()).select_from(base_cte).scalar_subquery()
        statement = (
            select(
                label.c.key,
                label.c.value,
                func.count(func.distinct(filtered.c.version_id)).label("match_count"),
                filtered_count.label("filtered_count"),
                unfiltered_count.label("unfiltered_count"),
            )
            .select_from(
                filtered.join(
                    label,
                    and_(
                        label.c.workspace_id == filtered.c.workspace_id,
                        label.c.version_id == filtered.c.version_id,
                    ),
                )
            )
            .group_by(label.c.key, label.c.value)
        )
        normalized_query = (facet_query or "").strip().casefold()
        if normalized_query:
            statement = statement.where(
                label.c.selector.like(f"%{_escape_like(normalized_query)}%", escape="\\")
            )
        if position:
            if not isinstance(position.get("key"), str) or not isinstance(
                position.get("value"), str
            ):
                raise ValueError("cursor position is invalid")
            statement = statement.having(
                tuple_(label.c.key, label.c.value)
                > tuple_(str(position["key"]), str(position["value"]))
            )
        statement = statement.order_by(label.c.key, label.c.value).limit(effective_limit + 1)
        with self.connection() as conn:
            rows = [dict(row) for row in conn.execute(statement).mappings().all()]
            if rows:
                filtered_total = int(rows[0]["filtered_count"])
                unfiltered_total = int(rows[0]["unfiltered_count"])
            else:
                filtered_total = int(conn.execute(select(filtered_count)).scalar_one())
                unfiltered_total = int(conn.execute(select(unfiltered_count)).scalar_one())
            selected_match_counts = _selected_label_match_counts(
                conn,
                selected_base=selected_base,
                labels=filters.labels,
            )
        has_more = len(rows) > effective_limit
        rows = rows[:effective_limit]
        return {
            "items": [
                {
                    "key": str(row["key"]),
                    "value": str(row["value"]),
                    "match_count": int(row["match_count"]),
                }
                for row in rows
            ],
            "filtered_count": filtered_total,
            "unfiltered_count": unfiltered_total,
            "selected_match_counts": [
                {"key": key, "value": value, "match_count": count}
                for (key, value), count in sorted(selected_match_counts.items())
            ],
            "has_more": has_more,
            "next_position": (
                {"key": str(rows[-1]["key"]), "value": str(rows[-1]["value"])}
                if has_more and rows
                else None
            ),
        }


def _count(scalar_statement: Any, repository: DatabaseConnection) -> int:
    with repository.connection() as conn:
        return int(conn.execute(select(scalar_statement)).scalar_one())


def _selected_label_match_counts(
    conn: Any,
    *,
    selected_base: Any,
    labels: tuple[tuple[str, str], ...],
) -> dict[tuple[str, str], int]:
    if not labels:
        return {}
    label = InventoryResourceLabelVersion.__table__
    statement = (
        select(
            label.c.key,
            label.c.value,
            func.count(func.distinct(selected_base.c.version_id)).label("match_count"),
        )
        .select_from(
            selected_base.join(
                label,
                and_(
                    label.c.workspace_id == selected_base.c.workspace_id,
                    label.c.version_id == selected_base.c.version_id,
                ),
            )
        )
        .where(or_(*(and_(label.c.key == key, label.c.value == value) for key, value in labels)))
        .group_by(label.c.key, label.c.value)
    )
    observed = {
        (str(row["key"]), str(row["value"])): int(row["match_count"])
        for row in conn.execute(statement).mappings()
    }
    return {selector: observed.get(selector, 0) for selector in labels}


def _current_versions(
    workspace_id: str,
    cluster_ids: tuple[str, ...],
    snapshot_revision: int,
    *,
    include_deleted: bool,
) -> Any:
    table = InventoryResourceVersion.__table__
    revision = InventoryFilterRevision.__table__
    ranked_revisions = (
        select(
            revision.c.workspace_id,
            revision.c.cluster_id,
            revision.c.snapshot_id,
            revision.c.observed_at,
            func.row_number()
            .over(
                partition_by=revision.c.cluster_id,
                order_by=revision.c.revision_id.desc(),
            )
            .label("rank"),
        )
        .where(
            revision.c.workspace_id == workspace_id,
            revision.c.cluster_id.in_(cluster_ids),
            revision.c.revision_id <= snapshot_revision,
        )
        .cte("ranked_inventory_revisions_at_cursor")
    )
    latest_revisions = (
        select(ranked_revisions)
        .where(ranked_revisions.c.rank == 1)
        .cte("inventory_revisions_at_cursor")
    )
    predicates = [
        table.c.workspace_id == workspace_id,
        table.c.cluster_id.in_(cluster_ids),
        table.c.valid_from_revision <= snapshot_revision,
    ]
    if not include_deleted:
        predicates.append(
            or_(
                table.c.valid_to_revision.is_(None),
                table.c.valid_to_revision > snapshot_revision,
            )
        )
    rank = (
        func.row_number()
        .over(
            partition_by=table.c.inventory_key,
            order_by=table.c.valid_from_revision.desc(),
        )
        .label("rank")
        if include_deleted
        else literal(1).label("rank")
    )
    return (
        select(
            table,
            latest_revisions.c.snapshot_id.label("as_of_snapshot_id"),
            latest_revisions.c.observed_at.label("as_of_observed_at"),
            rank,
        )
        .select_from(
            table.join(
                latest_revisions,
                and_(
                    latest_revisions.c.workspace_id == table.c.workspace_id,
                    latest_revisions.c.cluster_id == table.c.cluster_id,
                ),
            )
        )
        .where(*predicates)
        .cte("inventory_versions_at_revision")
    )


def _apply_resource_filters(
    table: Any,
    *,
    filters: ResourceFilters,
    allowed_application_ids: tuple[str, ...],
) -> Select[Any]:
    statement = select(table)
    if filters.clusters:
        statement = statement.where(table.c.cluster_id.in_(filters.clusters))
    if filters.namespaces:
        statement = statement.where(
            or_(
                *(
                    and_(table.c.cluster_id == cluster_id, table.c.namespace == namespace)
                    for cluster_id, namespace in filters.namespaces
                )
            )
        )
    if filters.resource_types:
        statement = statement.where(table.c.resource_type.in_(filters.resource_types))
    if filters.health:
        statement = statement.where(table.c.health.in_(filters.health))
    if filters.query:
        statement = statement.where(
            table.c.search_text.like(
                f"%{_escape_like(filters.query.casefold())}%",
                escape="\\",
            )
        )
    for index, (key, value) in enumerate(filters.labels):
        label = InventoryResourceLabelVersion.__table__.alias(f"selected_label_{index}")
        statement = statement.where(
            select(literal(1))
            .select_from(label)
            .where(
                label.c.version_id == table.c.version_id,
                label.c.workspace_id == table.c.workspace_id,
                label.c.key == key,
                label.c.value == value,
            )
            .exists()
        )
    if filters.applications:
        requested = tuple(sorted(set(filters.applications).intersection(allowed_application_ids)))
        application = InventoryResourceApplicationVersion.__table__
        statement = statement.where(
            select(literal(1))
            .select_from(application)
            .where(
                application.c.version_id == table.c.version_id,
                application.c.workspace_id == table.c.workspace_id,
                application.c.application_id.in_(requested),
            )
            .exists()
        )
    return statement


def _physical_topology_statements(
    *,
    workspace_id: str,
    cluster_ids: tuple[str, ...],
    allowed_application_ids: tuple[str, ...],
    filters: ResourceFilters,
    snapshot_revision: int,
) -> tuple[Select[Any], Select[Any], Select[Any]]:
    """Build PostgreSQL statements for a bounded, snapshot-consistent physical view."""
    current = _current_versions(
        workspace_id,
        cluster_ids,
        snapshot_revision,
        include_deleted=filters.include_deleted,
    )
    base = select(current).where(current.c.rank == 1).cte("physical_topology_inventory")
    filtered = _apply_resource_filters(
        base,
        filters=filters,
        allowed_application_ids=allowed_application_ids,
    ).cte("physical_topology_filter_matches")

    server_statement = (
        select(base)
        .where(base.c.resource_type == "node")
        .order_by(base.c.name, base.c.inventory_key)
    )

    matches_filter = (
        select(literal(1))
        .select_from(filtered)
        .where(filtered.c.version_id == base.c.version_id)
        .exists()
    )
    pods = (
        select(base, matches_filter.label("matches_filter"))
        .where(base.c.resource_type == "pod")
        .cte("physical_topology_pods")
    )
    pod_node_name = func.coalesce(pods.c.summary["node_name"].astext, "")
    known_server_names = select(base.c.name).where(base.c.resource_type == "node")
    placement_node_name = case(
        (pod_node_name.in_(known_server_names), pod_node_name),
        else_="",
    )
    restart_text = func.coalesce(pods.c.summary["restart_total"].astext, "0")
    restart_count = case(
        (restart_text.op("~")(r"^[0-9]+$"), cast(restart_text, Integer)),
        else_=0,
    )
    healthy_last = case(
        (
            and_(
                func.lower(pods.c.status) == "running",
                func.lower(pods.c.health) == "healthy",
                restart_count == 0,
            ),
            1,
        ),
        else_=0,
    )
    ranked_pods = select(
        pods,
        placement_node_name.label("placement_node_name"),
        func.row_number()
        .over(
            partition_by=placement_node_name,
            order_by=(
                healthy_last,
                restart_count.desc(),
                pods.c.namespace,
                pods.c.name,
                pods.c.inventory_key,
            ),
        )
        .label("placement_rank"),
        func.count().over(partition_by=placement_node_name).label("placement_pod_count"),
        func.sum(case((pods.c.matches_filter.is_(True), 1), else_=0))
        .over(partition_by=placement_node_name)
        .label("matched_pod_count"),
    ).cte("ranked_physical_topology_pods")
    pod_statement = (
        select(ranked_pods)
        .where(ranked_pods.c.placement_rank <= PHYSICAL_TOPOLOGY_PODS_PER_SERVER)
        .order_by(
            ranked_pods.c.placement_node_name,
            ranked_pods.c.placement_rank,
            ranked_pods.c.inventory_key,
        )
    )

    count_statement = select(
        select(func.count()).select_from(filtered).scalar_subquery().label("filtered_count"),
        select(func.count()).select_from(base).scalar_subquery().label("unfiltered_count"),
    )
    return server_statement, pod_statement, count_statement


def _resource_metric_history_statements(
    *,
    workspace_id: str,
    cluster_ids: tuple[str, ...],
    allowed_application_ids: tuple[str, ...],
    filters: ResourceFilters,
    snapshot_revision: int,
    resource_ids: tuple[str, ...],
    window_seconds: int,
    limit: int,
) -> tuple[Select[Any], Select[Any]]:
    """Build pinned Pod/Node resolution and revision-joined real usage history."""
    current = _current_versions(
        workspace_id,
        cluster_ids,
        snapshot_revision,
        include_deleted=filters.include_deleted,
    )
    base = select(current).where(current.c.rank == 1).cte("metric_history_inventory")
    filtered = _apply_resource_filters(
        base,
        filters=filters,
        allowed_application_ids=allowed_application_ids,
    ).cte("metric_history_filter_matches")
    resources = (
        select(
            filtered.c.inventory_key.label("resource_id"),
            filtered.c.cluster_id,
            filtered.c.resource_type,
            filtered.c.namespace,
            filtered.c.name,
        )
        .where(
            filtered.c.inventory_key.in_(resource_ids),
            filtered.c.resource_type.in_(("pod", "node")),
            or_(
                filtered.c.resource_type == "node",
                filtered.c.namespace.is_not(None),
            ),
        )
        .order_by(filtered.c.inventory_key)
    )

    usage = ClusterUsageSampleRecord.__table__
    revision = InventoryFilterRevision.__table__
    eligible = (
        select(
            usage.c.cluster_id,
            usage.c.sampled_at,
            usage.c.usage,
            func.max(usage.c.sampled_at)
            .over(partition_by=usage.c.cluster_id)
            .label("cluster_latest_sampled_at"),
            func.row_number()
            .over(partition_by=usage.c.cluster_id, order_by=usage.c.sampled_at.desc())
            .label("recency_rank"),
        )
        .select_from(
            usage.join(
                revision,
                and_(
                    revision.c.workspace_id == usage.c.workspace_id,
                    revision.c.cluster_id == usage.c.cluster_id,
                    revision.c.snapshot_id == usage.c.snapshot_id,
                ),
            )
        )
        .where(
            usage.c.workspace_id == workspace_id,
            usage.c.cluster_id.in_(cluster_ids),
            revision.c.revision_id <= snapshot_revision,
        )
        .cte("metric_history_eligible_samples")
    )
    history = (
        select(eligible.c.cluster_id, eligible.c.sampled_at, eligible.c.usage)
        .where(
            eligible.c.sampled_at
            >= eligible.c.cluster_latest_sampled_at
            - timedelta(seconds=max(60, min(window_seconds, 24 * 60 * 60))),
            eligible.c.recency_rank <= max(1, min(limit, 288)),
        )
        .order_by(eligible.c.cluster_id, eligible.c.sampled_at)
    )
    return resources, history


def _sort_columns(table: Any) -> tuple[Any, ...]:
    return (
        table.c.cluster_id,
        func.coalesce(table.c.namespace, ""),
        table.c.resource_type,
        table.c.kind,
        table.c.name,
        table.c.inventory_key,
    )


def _sort_tuple(table: Any) -> Any:
    return tuple_(*_sort_columns(table))


def _position_tuple(position: Mapping[str, Any]) -> Any:
    required = ("cluster_id", "namespace", "resource_type", "kind", "name", "inventory_key")
    if any(key not in position or not isinstance(position[key], str) for key in required):
        raise ValueError("cursor position is invalid")
    return tuple_(*(str(position[key]) for key in required))


def _position(row: Mapping[str, Any]) -> JsonObject:
    return {
        "cluster_id": str(row["cluster_id"]),
        "namespace": str(row.get("namespace") or ""),
        "resource_type": str(row["resource_type"]),
        "kind": str(row["kind"]),
        "name": str(row["name"]),
        "inventory_key": str(row["inventory_key"]),
    }


def _facet_position(position: Mapping[str, Any]) -> str:
    value = position.get("value")
    if not isinstance(value, str) or not value:
        raise ValueError("cursor position is invalid")
    return value


def _namespace_position_tuple(position: Mapping[str, Any]) -> Any:
    cluster_id = position.get("cluster_id")
    namespace = position.get("namespace")
    if not isinstance(cluster_id, str) or not cluster_id:
        raise ValueError("cursor position is invalid")
    if not isinstance(namespace, str) or not namespace:
        raise ValueError("cursor position is invalid")
    return tuple_(cluster_id, namespace)


def _applications_for_versions(
    conn: Any,
    version_ids: list[int],
    *,
    allowed_application_ids: tuple[str, ...],
) -> dict[int, tuple[list[str], bool]]:
    if not version_ids:
        return {}
    table = InventoryResourceApplicationVersion.__table__
    allowed = set(allowed_application_ids)
    result: dict[int, tuple[list[str], bool]] = {}
    for row in conn.execute(
        select(table.c.version_id, table.c.application_id)
        .where(table.c.version_id.in_(version_ids))
        .order_by(table.c.version_id, table.c.application_id)
    ).mappings():
        version_id = int(row["version_id"])
        application_id = str(row["application_id"])
        visible, restricted = result.setdefault(version_id, ([], False))
        if application_id in allowed:
            visible.append(application_id)
        else:
            result[version_id] = (visible, True)
    return result


def _clusters_for_page(
    conn: Any,
    workspace_id: str,
    cluster_ids: set[str],
) -> dict[str, JsonObject]:
    if not cluster_ids:
        return {}
    table = ClusterRegistration.__table__
    rows = conn.execute(
        select(table.c.cluster_id, table.c.name, table.c.settings).where(
            table.c.workspace_id == workspace_id,
            table.c.cluster_id.in_(cluster_ids),
        )
    ).mappings()
    return {
        str(row["cluster_id"]): {
            "cluster_id": str(row["cluster_id"]),
            "name": str(row["name"]),
            "provider": _provider(row.get("settings")),
        }
        for row in rows
    }


def _serialize_version_row(
    row: Mapping[str, Any],
    *,
    snapshot_revision: int,
    application_scope: tuple[list[str], bool],
    cluster: JsonObject | None,
) -> JsonObject:
    application_ids, has_restricted_applications = application_scope
    observed = row.get("observed_at")
    valid_to_revision = row.get("valid_to_revision")
    deleted_at = (
        row.get("valid_to_observed_at")
        if isinstance(valid_to_revision, int) and valid_to_revision <= snapshot_revision
        else None
    )
    resource = {
        "inventory_key": str(row["inventory_key"]),
        "snapshot_id": str(row["source_snapshot_id"]),
        "workspace_id": str(row["workspace_id"]),
        "cluster_id": str(row["cluster_id"]),
        "resource_type": str(row["resource_type"]),
        "api_version": str(row["api_version"]),
        "kind": str(row["kind"]),
        "namespace": row.get("namespace"),
        "name": str(row["name"]),
        "uid": row.get("uid"),
        "resource_version": row.get("resource_version"),
        "status": str(row["status"]),
        "health": str(row["health"]),
        "labels": dict(row.get("labels") or {}),
        "annotations": {},
        "summary": dict(row.get("summary") or {}),
        "observed_at": iso_or_none(observed),
        "first_seen_at": iso_or_none(row.get("first_seen_at")),
        "last_seen_at": iso_or_none(observed),
        "deleted_at": iso_or_none(deleted_at),
        "created_at": iso_or_none(row.get("created_at")),
        "updated_at": iso_or_none(observed),
    }
    return {
        "resource": resource,
        "cluster": cluster
        or {
            "cluster_id": str(row["cluster_id"]),
            "name": str(row["cluster_id"]),
            "provider": UNKNOWN_PROVIDER,
        },
        "application_ids": application_ids,
        "application_binding_completeness": (
            "exact"
            if bool(row.get("application_binding_complete")) and not has_restricted_applications
            else "unavailable"
        ),
    }


def _ids(values: Collection[str]) -> tuple[str, ...]:
    return tuple(
        sorted({value.strip() for value in values if isinstance(value, str) and value.strip()})
    )


def _provider(settings: object) -> str:
    value = settings if isinstance(settings, dict) else {}
    provider = str(value.get("cloud_provider") or UNKNOWN_PROVIDER).strip().casefold()
    if provider in {"existing-k8s", "generic"}:
        return "onprem"
    return provider if provider in KNOWN_PROVIDERS else UNKNOWN_PROVIDER


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _serialize_global_facets(rows: Sequence[Mapping[str, Any]]) -> list[JsonObject]:
    items: list[JsonObject] = []
    for row in rows:
        item: JsonObject = {
            "id": str(row["id"]),
            "label": str(row.get("label") or row["id"]),
            "count": int(row["count"]),
        }
        if row.get("cluster_id") is not None:
            item["cluster_id"] = str(row["cluster_id"])
        if row.get("kind") is not None:
            item["kind"] = str(row["kind"])
        items.append(item)
    return items


def _empty_global_filter_facets() -> JsonObject:
    return {
        "clusters": [],
        "namespaces": [],
        "applications": [],
        "resource_types": [],
        "labels": [],
        "resources": [],
    }


def _empty_page() -> JsonObject:
    return {
        "items": [],
        "filtered_count": 0,
        "unfiltered_count": 0,
        "has_more": False,
        "next_position": None,
    }
