from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.identity.models import (
    ClusterRegistration,
    UserAccount,
    Workspace,
    WorkspaceMember,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.identity import (
    AccountRole,
    ClusterRegistrationStatus,
    UserStatus,
    WorkspaceRole,
    WorkspaceStatus,
)
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

    def has_user_accounts(self) -> bool:
        table = UserAccount.__table__
        statement = select(func.count()).select_from(table)
        with self.connection() as conn:
            return int(conn.execute(statement).scalar_one()) > 0

    def get_user_by_email(self, email: str) -> JsonObject | None:
        table = UserAccount.__table__
        statement = (
            select(
                table.c.user_id,
                table.c.email,
                table.c.password_hash,
                table.c.display_name,
                table.c.status,
                table.c.role,
            )
            .where(table.c.email == email)
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row is not None else None

    def create_user(
        self,
        user_id: str,
        email: str,
        password_hash: str,
        display_name: str,
        status: str,
        role: str,
    ) -> JsonObject | None:
        table = UserAccount.__table__
        statement = (
            pg_insert(table)
            .values(
                user_id=user_id,
                email=email,
                password_hash=password_hash,
                display_name=display_name,
                status=status,
                role=role,
                updated_at=func.now(),
            )
            .on_conflict_do_nothing(index_elements=[table.c.email])
            .returning(
                table.c.user_id,
                table.c.email,
                table.c.password_hash,
                table.c.display_name,
                table.c.status,
                table.c.role,
            )
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row is not None else None

    def activate_user(self, user_id: str) -> JsonObject | None:
        table = UserAccount.__table__
        statement = (
            table.update()
            .where(table.c.user_id == user_id)
            .values(status=UserStatus.ACTIVE.value, updated_at=func.now())
            .returning(
                table.c.user_id,
                table.c.email,
                table.c.password_hash,
                table.c.display_name,
                table.c.status,
                table.c.role,
            )
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row is not None else None

    @staticmethod
    def _user_upsert(user_id: str) -> Any:
        table = UserAccount.__table__
        insert = pg_insert(table).values(
            user_id=user_id,
            display_name=user_id,
            status=UserStatus.ACTIVE.value,
            role=AccountRole.ADMIN.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.user_id],
            set_={"status": UserStatus.ACTIVE.value, "updated_at": func.now()},
        )

    @staticmethod
    def _workspace_upsert(workspace_id: str) -> Any:
        table = Workspace.__table__
        insert = pg_insert(table).values(
            workspace_id=workspace_id,
            name=workspace_id,
            slug=workspace_id,
            status=WorkspaceStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id],
            set_={"status": WorkspaceStatus.ACTIVE.value, "updated_at": func.now()},
        )

    @staticmethod
    def _member_upsert(workspace_id: str, user_id: str) -> Any:
        table = WorkspaceMember.__table__
        insert = pg_insert(table).values(
            workspace_id=workspace_id,
            user_id=user_id,
            role=WorkspaceRole.OWNER.value,
            permissions={"target": ["register", "install"]},
            status=WorkspaceStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id, table.c.user_id],
            set_={
                "role": insert.excluded.role,
                "permissions": insert.excluded.permissions,
                "status": WorkspaceStatus.ACTIVE.value,
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
            status=ClusterRegistrationStatus.REGISTERED.value,
            settings=payload["settings"],
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id, table.c.cluster_id],
            set_={
                "name": insert.excluded.name,
                "environment": insert.excluded.environment,
                "status": ClusterRegistrationStatus.REGISTERED.value,
                "settings": insert.excluded.settings,
                "updated_at": func.now(),
            },
        )
