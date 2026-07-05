"""Service catalog repository and bootstrap catalog definitions."""

from __future__ import annotations

import hashlib
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.catalog.models import (
    CatalogInstallRunRecord,
    CatalogItemRecord,
    CatalogItemVersionRecord,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.storage.engine import DatabaseConnection, iso_or_none

CATALOG_STATUS_ACTIVE = "active"
CATALOG_INSTALL_STATUS_PLANNED = "planned"
DEFAULT_CATALOG_VERSION = "1.0.0"

BOOTSTRAP_CATALOG_ITEMS: tuple[JsonObject, ...] = (
    {
        "item_id": "catalog-postgresql",
        "slug": "postgresql",
        "name": "PostgreSQL",
        "category": "database",
        "description": "Stateful PostgreSQL database recipe for Kubernetes.",
        "default_version": DEFAULT_CATALOG_VERSION,
        "status": CATALOG_STATUS_ACTIVE,
        "metadata": {"tags": ["database", "sql", "stateful"]},
        "versions": [
            {
                "version": DEFAULT_CATALOG_VERSION,
                "package_type": "helm",
                "package_ref": "oci://registry-1.docker.io/bitnamicharts/postgresql",
                "values_schema": {
                    "type": "object",
                    "properties": {
                        "auth.database": {"type": "string"},
                        "primary.persistence.size": {"type": "string", "default": "8Gi"},
                    },
                },
                "template": {"runner": "helm", "release": "postgresql"},
                "status": CATALOG_STATUS_ACTIVE,
            }
        ],
    },
    {
        "item_id": "catalog-redis",
        "slug": "redis",
        "name": "Redis",
        "category": "database",
        "description": "Redis cache recipe for Kubernetes.",
        "default_version": DEFAULT_CATALOG_VERSION,
        "status": CATALOG_STATUS_ACTIVE,
        "metadata": {"tags": ["cache", "key-value"]},
        "versions": [
            {
                "version": DEFAULT_CATALOG_VERSION,
                "package_type": "helm",
                "package_ref": "oci://registry-1.docker.io/bitnamicharts/redis",
                "values_schema": {"type": "object", "properties": {}},
                "template": {"runner": "helm", "release": "redis"},
                "status": CATALOG_STATUS_ACTIVE,
            }
        ],
    },
    {
        "item_id": "catalog-fastapi-template",
        "slug": "fastapi-template",
        "name": "FastAPI Service",
        "category": "application",
        "description": "Python FastAPI application scaffold recipe.",
        "default_version": DEFAULT_CATALOG_VERSION,
        "status": CATALOG_STATUS_ACTIVE,
        "metadata": {"tags": ["python", "api", "template"]},
        "versions": [
            {
                "version": DEFAULT_CATALOG_VERSION,
                "package_type": "template",
                "package_ref": "builtin://templates/fastapi",
                "values_schema": {
                    "type": "object",
                    "properties": {"image": {"type": "string"}, "replicas": {"type": "integer"}},
                },
                "template": {"runner": "manifest-renderer", "kind": "Deployment"},
                "status": CATALOG_STATUS_ACTIVE,
            }
        ],
    },
    {
        "item_id": "catalog-nextjs-template",
        "slug": "nextjs-template",
        "name": "Next.js Web App",
        "category": "application",
        "description": "Next.js web application scaffold recipe.",
        "default_version": DEFAULT_CATALOG_VERSION,
        "status": CATALOG_STATUS_ACTIVE,
        "metadata": {"tags": ["node", "frontend", "template"]},
        "versions": [
            {
                "version": DEFAULT_CATALOG_VERSION,
                "package_type": "template",
                "package_ref": "builtin://templates/nextjs",
                "values_schema": {
                    "type": "object",
                    "properties": {"image": {"type": "string"}, "replicas": {"type": "integer"}},
                },
                "template": {"runner": "manifest-renderer", "kind": "Deployment"},
                "status": CATALOG_STATUS_ACTIVE,
            }
        ],
    },
)


def catalog_item_version_id(item_id: str, version: str) -> str:
    raw = f"{item_id}|{version}"
    return f"catalog-version-{hashlib.sha256(raw.encode()).hexdigest()[:32]}"


def item_without_versions(item: JsonObject) -> JsonObject:
    return {key: value for key, value in item.items() if key != "versions"}


def serialize_catalog_item(row: Any) -> JsonObject:
    item = dict(row)
    item["metadata"] = dict(item.get("metadata") or {})
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["updated_at"] = iso_or_none(item.get("updated_at"))
    return item


def serialize_catalog_version(row: Any) -> JsonObject:
    item = dict(row)
    item["values_schema"] = dict(item.get("values_schema") or {})
    item["template"] = dict(item.get("template") or {})
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["updated_at"] = iso_or_none(item.get("updated_at"))
    return item


def serialize_install_run(row: Any) -> JsonObject:
    item = dict(row)
    item["values"] = dict(item.get("values") or {})
    item["plan"] = dict(item.get("plan") or {})
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["updated_at"] = iso_or_none(item.get("updated_at"))
    return item


class CatalogRepository(DatabaseConnection):
    def list_catalog_items(self) -> list[JsonObject]:
        table = CatalogItemRecord.__table__
        statement = (
            select(
                table.c.item_id,
                table.c.slug,
                table.c.name,
                table.c.category,
                table.c.description,
                table.c.default_version,
                table.c.status,
                table.c.metadata,
                table.c.created_at,
                table.c.updated_at,
            )
            .where(table.c.status == CATALOG_STATUS_ACTIVE)
            .order_by(table.c.category, table.c.name)
        )
        with self.connection() as conn:
            rows = [serialize_catalog_item(row) for row in conn.execute(statement).mappings()]
        stored_ids = {item["item_id"] for item in rows}
        bootstrap = [
            item_without_versions(item)
            for item in BOOTSTRAP_CATALOG_ITEMS
            if item["item_id"] not in stored_ids
        ]
        return sorted([*rows, *bootstrap], key=lambda item: (item["category"], item["name"]))

    def get_catalog_item(self, item_id_or_slug: str) -> JsonObject | None:
        item = self._stored_catalog_item(item_id_or_slug) or self._bootstrap_catalog_item(
            item_id_or_slug
        )
        if item is None:
            return None
        versions = self.list_catalog_item_versions(str(item["item_id"]))
        if not versions:
            versions = list(self._bootstrap_catalog_versions(str(item["item_id"])))
        return {**item, "versions": versions}

    def _stored_catalog_item(self, item_id_or_slug: str) -> JsonObject | None:
        table = CatalogItemRecord.__table__
        statement = (
            select(
                table.c.item_id,
                table.c.slug,
                table.c.name,
                table.c.category,
                table.c.description,
                table.c.default_version,
                table.c.status,
                table.c.metadata,
                table.c.created_at,
                table.c.updated_at,
            )
            .where(
                (table.c.item_id == item_id_or_slug) | (table.c.slug == item_id_or_slug),
                table.c.status == CATALOG_STATUS_ACTIVE,
            )
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return serialize_catalog_item(row) if row else None

    def _bootstrap_catalog_item(self, item_id_or_slug: str) -> JsonObject | None:
        for item in BOOTSTRAP_CATALOG_ITEMS:
            if item["item_id"] == item_id_or_slug or item["slug"] == item_id_or_slug:
                return item_without_versions(item)
        return None

    def _bootstrap_catalog_versions(self, item_id: str) -> tuple[JsonObject, ...]:
        for item in BOOTSTRAP_CATALOG_ITEMS:
            if item["item_id"] == item_id:
                return tuple(
                    {
                        **version,
                        "version_id": catalog_item_version_id(item_id, str(version["version"])),
                        "item_id": item_id,
                    }
                    for version in item["versions"]
                )
        return ()

    def list_catalog_item_versions(self, item_id: str) -> list[JsonObject]:
        table = CatalogItemVersionRecord.__table__
        statement = (
            select(
                table.c.version_id,
                table.c.item_id,
                table.c.version,
                table.c.package_type,
                table.c.package_ref,
                table.c.values_schema,
                table.c.template,
                table.c.status,
                table.c.created_at,
                table.c.updated_at,
            )
            .where(table.c.item_id == item_id, table.c.status == CATALOG_STATUS_ACTIVE)
            .order_by(table.c.version)
        )
        with self.connection() as conn:
            return [serialize_catalog_version(row) for row in conn.execute(statement).mappings()]

    def record_catalog_install_run(
        self,
        *,
        workspace_id: str,
        item_id: str,
        version: str,
        cluster_id: str,
        namespace: str,
        application_name: str,
        requested_by: str,
        values: JsonObject,
        plan: JsonObject,
    ) -> JsonObject:
        install_id = str(uuid.uuid4())
        table = CatalogInstallRunRecord.__table__
        statement = (
            pg_insert(table)
            .values(
                install_id=install_id,
                workspace_id=workspace_id or DEFAULT_WORKSPACE_ID,
                item_id=item_id,
                version=version,
                cluster_id=cluster_id,
                namespace=namespace,
                application_name=application_name,
                status=CATALOG_INSTALL_STATUS_PLANNED,
                requested_by=requested_by,
                values=values,
                plan=plan,
                updated_at=func.now(),
            )
            .returning(table)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().one()
        return serialize_install_run(row)
