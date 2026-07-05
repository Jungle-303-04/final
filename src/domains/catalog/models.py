"""서비스 카탈로그 테이블."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Index, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import (
    Base,
    created_at_column,
    jsonb_column,
    text_column,
    updated_at_column,
)


class CatalogItemRecord(Base):
    __tablename__ = "catalog_items"
    __table_args__ = (UniqueConstraint("slug"),)

    item_id: Mapped[str] = mapped_column(Text, primary_key=True)
    slug: Mapped[str] = text_column()
    name: Mapped[str] = text_column()
    category: Mapped[str] = text_column()
    description: Mapped[str] = text_column()
    default_version: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    metadata_: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False)
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class CatalogItemVersionRecord(Base):
    __tablename__ = "catalog_item_versions"
    __table_args__ = (UniqueConstraint("item_id", "version"),)

    version_id: Mapped[str] = mapped_column(Text, primary_key=True)
    item_id: Mapped[str] = text_column()
    version: Mapped[str] = text_column()
    package_type: Mapped[str] = text_column()
    package_ref: Mapped[str] = text_column()
    values_schema: Mapped[dict[str, Any]] = jsonb_column()
    template: Mapped[dict[str, Any]] = jsonb_column()
    status: Mapped[str] = text_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class CatalogInstallRunRecord(Base):
    __tablename__ = "catalog_install_runs"
    __table_args__ = (
        Index("ix_catalog_install_runs_scope", "workspace_id", "cluster_id", "created_at"),
    )

    install_id: Mapped[str] = mapped_column(Text, primary_key=True)
    workspace_id: Mapped[str] = text_column()
    item_id: Mapped[str] = text_column()
    version: Mapped[str] = text_column()
    cluster_id: Mapped[str] = text_column()
    namespace: Mapped[str] = text_column()
    application_name: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    requested_by: Mapped[str] = text_column()
    values: Mapped[dict[str, Any]] = jsonb_column()
    plan: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()
