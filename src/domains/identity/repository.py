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
    DEFAULT_WORKSPACE_ID,
    DEFAULT_WORKSPACE_NAME,
    AccountRole,
    ClusterRegistrationStatus,
    UserStatus,
    WorkspaceRole,
    WorkspaceStatus,
)
from packages.storage.engine import DatabaseConnection


class WorkspaceAccessRepository(DatabaseConnection):
    """워크스페이스와 클러스터 등록용 repository 골격."""

    # TODO(identity): SSO/email login과 account deactivation 포함 user lifecycle 구현
    user_table = UserAccount.__table__
    # TODO(identity): workspace role hierarchy와 permission inheritance를 단일 policy port에서 적용
    workspace_table = Workspace.__table__
    member_table = WorkspaceMember.__table__
    # TODO(target): cluster를 agent identity, token rotation, environment tier, RBAC scope와 연결
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
        # TODO(identity): registration 전 명시적 workspace owner/admin permission 요구
        user_id = payload["user_id"]
        workspace_id = payload["workspace_id"]
        with self.connection() as conn:
            conn.execute(self._user_upsert(user_id))
            conn.execute(self._workspace_upsert(workspace_id, workspace_id))
            conn.execute(self._member_upsert(workspace_id, user_id, WorkspaceRole.MEMBER.value))
            conn.execute(self._cluster_upsert(payload))
        return payload

    def ensure_default_workspace(self) -> JsonObject:
        workspace_table = Workspace.__table__
        statement = self._workspace_upsert(DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME).returning(
            workspace_table.c.workspace_id,
            workspace_table.c.name,
            workspace_table.c.slug,
            workspace_table.c.status,
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return (
            dict(row)
            if row is not None
            else {
                "workspace_id": DEFAULT_WORKSPACE_ID,
                "name": DEFAULT_WORKSPACE_NAME,
                "slug": DEFAULT_WORKSPACE_ID,
                "status": WorkspaceStatus.ACTIVE.value,
            }
        )

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

    def complete_email_verification(self, user_id: str) -> JsonObject | None:
        table = UserAccount.__table__
        with self.connection() as conn:
            conn.execute(self._workspace_upsert(DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME))
            is_first_owner = not self._has_workspace_owner(conn, DEFAULT_WORKSPACE_ID)
            status = (
                UserStatus.ACTIVE.value if is_first_owner else UserStatus.PENDING_APPROVAL.value
            )
            role = AccountRole.ADMIN.value if is_first_owner else AccountRole.MEMBER.value
            statement = (
                table.update()
                .where(
                    table.c.user_id == user_id,
                    table.c.status == UserStatus.PENDING_EMAIL_VERIFICATION.value,
                )
                .values(status=status, role=role, updated_at=func.now())
                .returning(
                    table.c.user_id,
                    table.c.email,
                    table.c.password_hash,
                    table.c.display_name,
                    table.c.status,
                    table.c.role,
                )
            )
            row = conn.execute(statement).mappings().first()
            if row is not None and is_first_owner:
                conn.execute(
                    self._member_upsert(
                        DEFAULT_WORKSPACE_ID,
                        user_id,
                        WorkspaceRole.OWNER.value,
                    )
                )
        return dict(row) if row is not None else None

    def approve_user(self, user_id: str, workspace_id: str) -> JsonObject | None:
        table = UserAccount.__table__
        statement = (
            table.update()
            .where(
                table.c.user_id == user_id,
                table.c.status == UserStatus.PENDING_APPROVAL.value,
            )
            .values(
                status=UserStatus.ACTIVE.value,
                role=AccountRole.MEMBER.value,
                updated_at=func.now(),
            )
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
            conn.execute(self._workspace_upsert(workspace_id, workspace_id))
            row = conn.execute(statement).mappings().first()
            if row is not None:
                conn.execute(self._member_upsert(workspace_id, user_id, WorkspaceRole.MEMBER.value))
        if row is None:
            return None
        data = dict(row)
        data["workspace_id"] = workspace_id
        return data

    def get_default_workspace_id_for_user(self, user_id: str) -> str | None:
        table = WorkspaceMember.__table__
        statement = (
            select(table.c.workspace_id)
            .where(
                table.c.user_id == user_id,
                table.c.status == WorkspaceStatus.ACTIVE.value,
            )
            .order_by(table.c.created_at)
            .limit(1)
        )
        with self.connection() as conn:
            value = conn.execute(statement).scalar_one_or_none()
        return str(value) if value is not None else None

    @staticmethod
    def _has_workspace_owner(conn: Any, workspace_id: str) -> bool:
        table = WorkspaceMember.__table__
        statement = select(func.count()).where(
            table.c.workspace_id == workspace_id,
            table.c.role == WorkspaceRole.OWNER.value,
            table.c.status == WorkspaceStatus.ACTIVE.value,
        )
        return int(conn.execute(statement).scalar_one()) > 0

    @staticmethod
    def _user_upsert(user_id: str) -> Any:
        table = UserAccount.__table__
        insert = pg_insert(table).values(
            user_id=user_id,
            display_name=user_id,
            status=UserStatus.ACTIVE.value,
            role=AccountRole.MEMBER.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.user_id],
            set_={"status": UserStatus.ACTIVE.value, "updated_at": func.now()},
        )

    @staticmethod
    def _workspace_upsert(workspace_id: str, name: str) -> Any:
        table = Workspace.__table__
        insert = pg_insert(table).values(
            workspace_id=workspace_id,
            name=name,
            slug=workspace_id,
            status=WorkspaceStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id],
            set_={"status": WorkspaceStatus.ACTIVE.value, "updated_at": func.now()},
        )

    @staticmethod
    def _member_upsert(workspace_id: str, user_id: str, role: str) -> Any:
        table = WorkspaceMember.__table__
        insert = pg_insert(table).values(
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
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
