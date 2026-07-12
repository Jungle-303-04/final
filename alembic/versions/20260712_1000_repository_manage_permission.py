"""seed repository manage permission.

Revision ID: 20260712_1000
Revises: 20260710_0900
Create Date: 2026-07-12 10:00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260712_1000"
down_revision: str | None = "20260710_0900"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
        insert into role_permissions (
            organization_id, resource_type, role, permission, status, created_at, updated_at
        )
        select '__global__', 'repository', role, 'repository.manage', 'active', now(), now()
        from (
            values ('release_operator'), ('incident_operator'), ('cluster_steward')
        ) as roles(role)
        on conflict (organization_id, resource_type, role, permission)
        do update set status = 'active', updated_at = now()
        """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
        delete from role_permissions
        where organization_id = '__global__'
          and resource_type = 'repository'
          and permission = 'repository.manage'
          and role in ('release_operator', 'incident_operator', 'cluster_steward')
        """
        )
    )
