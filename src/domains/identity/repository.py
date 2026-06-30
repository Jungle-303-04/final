from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.identity.models import (
    ClusterRegistration,
    UserAccount,
    Workspace,
    WorkspaceMember,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import DatabaseConnection


class WorkspaceAccessRepository(DatabaseConnection):
    """워크스페이스와 클러스터 등록용 repository 골격."""

    # TODO(identity): implement user lifecycle with SSO/email login and account deactivation.
    user_table = UserAccount.__table__
    # TODO(identity): enforce workspace role hierarchy and permission inheritance in one policy port.
    workspace_table = Workspace.__table__
    member_table = WorkspaceMember.__table__
    # TODO(target): connect clusters to agent identity, token rotation, environment tier, and RBAC scope.
    cluster_table = ClusterRegistration.__table__

    @staticmethod
    def required_tables() -> set[str]:
        return {
            UserAccount.__tablename__,
            Workspace.__tablename__,
            WorkspaceMember.__tablename__,
            ClusterRegistration.__tablename__,
        }

    def register_target_cluster(self, payload: JsonObject) -> JsonObject:
        # TODO(identity): require an explicit workspace owner/admin permission before registration.
        user_id = payload["user_id"]
        workspace_id = payload["workspace_id"]
        with self.connection() as conn:
            conn.execute(self._user_upsert(user_id))
            conn.execute(self._workspace_upsert(workspace_id))
            conn.execute(self._member_upsert(workspace_id, user_id))
            conn.execute(self._cluster_upsert(payload))
        return payload

    @staticmethod
    def _user_upsert(user_id: str) -> Any:
        table = UserAccount.__table__
        insert = pg_insert(table).values(
            user_id=user_id,
            display_name=user_id,
            status="active",
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.user_id],
            set_={"display_name": insert.excluded.display_name, "updated_at": func.now()},
        )

    @staticmethod
    def _workspace_upsert(workspace_id: str) -> Any:
        table = Workspace.__table__
        insert = pg_insert(table).values(
            workspace_id=workspace_id,
            name=workspace_id,
            slug=workspace_id,
            status="active",
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id],
            set_={"status": "active", "updated_at": func.now()},
        )

    @staticmethod
    def _member_upsert(workspace_id: str, user_id: str) -> Any:
        table = WorkspaceMember.__table__
        insert = pg_insert(table).values(
            workspace_id=workspace_id,
            user_id=user_id,
            role="owner",
            permissions={"target": ["register", "install"]},
            status="active",
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id, table.c.user_id],
            set_={
                "role": insert.excluded.role,
                "permissions": insert.excluded.permissions,
                "status": "active",
                "updated_at": func.now(),
            },
        )

    @staticmethod
    def _cluster_upsert(payload: JsonObject) -> Any:
        table = ClusterRegistration.__table__
        insert = pg_insert(table).values(
            workspace_id=payload["workspace_id"],
            cluster_id=payload["cluster_id"],
            name=payload["name"],
            environment=payload["environment"],
            status="registered",
            settings=payload["settings"],
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id, table.c.cluster_id],
            set_={
                "name": insert.excluded.name,
                "environment": insert.excluded.environment,
                "status": "registered",
                "settings": insert.excluded.settings,
                "updated_at": func.now(),
            },
        )
