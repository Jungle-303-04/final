"""Remove empty legacy access bridge tables from the versioned target.

Revision ID: 20260714_0415
Revises: 20260714_0345
Create Date: 2026-07-14 04:15:00

The preceding revision existed only to diagnose the first data-only cutover.
The approved cutover validates and transforms the one legacy membership row
directly into canonical identity roles, so a fresh target must not retain the
retired tables.  Upgrade is fail-closed if either bridge table contains data.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260714_0415"
down_revision: str | None = "20260714_0345"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM workspace_members LIMIT 1) THEN
                RAISE EXCEPTION
                    'workspace_members must be empty before retiring the legacy table';
            END IF;
            IF EXISTS (SELECT 1 FROM resource_access_grants LIMIT 1) THEN
                RAISE EXCEPTION
                    'resource_access_grants must be empty before retiring the legacy table';
            END IF;
        END
        $$
        """
    )
    op.drop_table("resource_access_grants")
    op.drop_table("workspace_members")


def downgrade() -> None:
    op.create_table(
        "workspace_members",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("permissions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["user_accounts.user_id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.workspace_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "user_id"),
    )
    op.create_table(
        "resource_access_grants",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("workspace_id", sa.Text(), nullable=False),
        sa.Column("subject_type", sa.Text(), nullable=False),
        sa.Column("subject_id", sa.Text(), nullable=False),
        sa.Column("resource_type", sa.Text(), nullable=False),
        sa.Column("resource_id", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("permissions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.workspace_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workspace_id",
            "subject_type",
            "subject_id",
            "resource_type",
            "resource_id",
        ),
    )
