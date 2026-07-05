from __future__ import annotations

from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.identity.models import (
    ClusterRegistration,
    Group,
    GroupMember,
    MemberResourceRole,
    Organization,
    OrganizationMember,
    ResourceAccessGrant,
    ResourceAssignment,
    RolePermission,
    UserAccount,
    Workspace,
    WorkspaceMember,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.identity import (
    ACCESS_ROLE_ACTIONS,
    ACTION_PERMISSION_ALIASES,
    DEFAULT_GROUP_ID,
    DEFAULT_GROUP_NAME,
    DEFAULT_ORGANIZATION_ID,
    DEFAULT_ORGANIZATION_NAME,
    DEFAULT_ROLE_PERMISSION_ROWS,
    DEFAULT_WORKSPACE_ID,
    DEFAULT_WORKSPACE_NAME,
    GLOBAL_ROLE_POLICY_ORGANIZATION_ID,
    RESOURCE_ROLE_PERMISSIONS,
    AccessResourceType,
    AccessRole,
    AccessStatus,
    AccessSubjectType,
    AccountRole,
    ClusterRegistrationStatus,
    GroupRole,
    OrganizationRole,
    ResourceRole,
    ServiceRole,
    UserStatus,
    WorkspaceRole,
    WorkspaceStatus,
    access_role_allows_action,
    normalize_resource_role,
)
from packages.storage.engine import DatabaseConnection


class IdentityAccessRepository(DatabaseConnection):
    """Identity, organization, group, and resource access repository."""

    user_table = UserAccount.__table__
    workspace_table = Workspace.__table__
    member_table = WorkspaceMember.__table__
    access_table = ResourceAccessGrant.__table__
    organization_table = Organization.__table__
    organization_member_table = OrganizationMember.__table__
    group_table = Group.__table__
    group_member_table = GroupMember.__table__
    resource_assignment_table = ResourceAssignment.__table__
    member_resource_role_table = MemberResourceRole.__table__
    role_permission_table = RolePermission.__table__
    cluster_table = ClusterRegistration.__table__

    @staticmethod
    def required_tables() -> set[str]:
        return {
            UserAccount.__tablename__,
            Workspace.__tablename__,
            WorkspaceMember.__tablename__,
            ResourceAccessGrant.__tablename__,
            Organization.__tablename__,
            OrganizationMember.__tablename__,
            Group.__tablename__,
            GroupMember.__tablename__,
            ResourceAssignment.__tablename__,
            MemberResourceRole.__tablename__,
            RolePermission.__tablename__,
            ClusterRegistration.__tablename__,
        }

    def ensure_default_workspace(self) -> JsonObject:
        table = Workspace.__table__
        statement = self._workspace_upsert(DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME).returning(
            table.c.workspace_id,
            table.c.name,
            table.c.slug,
            table.c.status,
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

    def ensure_default_organization(self) -> JsonObject:
        table = Organization.__table__
        statement = self._organization_upsert(
            DEFAULT_ORGANIZATION_ID,
            DEFAULT_ORGANIZATION_NAME,
        ).returning(
            table.c.organization_id,
            table.c.name,
            table.c.slug,
            table.c.status,
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
            conn.execute(
                self._group_upsert(DEFAULT_GROUP_ID, DEFAULT_ORGANIZATION_ID, DEFAULT_GROUP_NAME)
            )
        return (
            dict(row)
            if row is not None
            else {
                "organization_id": DEFAULT_ORGANIZATION_ID,
                "name": DEFAULT_ORGANIZATION_NAME,
                "slug": DEFAULT_ORGANIZATION_ID,
                "status": AccessStatus.ACTIVE.value,
            }
        )

    def ensure_default_role_permissions(self) -> list[JsonObject]:
        table = RolePermission.__table__
        rows: list[JsonObject] = []
        new_roles = set(RESOURCE_ROLE_PERMISSIONS)
        managed_resource_types = {
            resource_type
            for _scope, resource_type, _role, _permission, _status in DEFAULT_ROLE_PERMISSION_ROWS
        }
        with self.connection() as conn:
            if managed_resource_types:
                conn.execute(
                    table.update()
                    .where(
                        table.c.organization_id == GLOBAL_ROLE_POLICY_ORGANIZATION_ID,
                        table.c.resource_type.in_(managed_resource_types),
                        table.c.role.notin_(new_roles),
                        table.c.status == AccessStatus.ACTIVE.value,
                    )
                    .values(status=AccessStatus.DISABLED.value, updated_at=func.now())
                )
            for (
                organization_id,
                resource_type,
                role,
                permission,
                status,
            ) in DEFAULT_ROLE_PERMISSION_ROWS:
                row = (
                    conn.execute(
                        self._role_permission_upsert(
                            organization_id,
                            resource_type,
                            role,
                            permission,
                            status,
                        ).returning(table)
                    )
                    .mappings()
                    .first()
                )
                if row is not None:
                    rows.append(dict(row))
        return rows

    def register_target_cluster(self, payload: JsonObject) -> JsonObject:
        user_id = str(payload["user_id"])
        workspace_id = str(payload["workspace_id"])
        organization_id = str(payload.get("organization_id") or workspace_id)
        group_id = self._default_group_id(organization_id)
        cluster_id = str(payload["cluster_id"])
        assignment_id = self._resource_assignment_id(
            organization_id,
            AccessResourceType.CLUSTER.value,
            cluster_id,
        )
        with self.connection() as conn:
            conn.execute(self._user_upsert(user_id))
            conn.execute(self._workspace_upsert(workspace_id, workspace_id))
            conn.execute(self._member_upsert(workspace_id, user_id, WorkspaceRole.OWNER.value))
            conn.execute(self._organization_upsert(organization_id, organization_id))
            conn.execute(
                self._organization_member_upsert(
                    organization_id,
                    user_id,
                    OrganizationRole.OWNER.value,
                )
            )
            conn.execute(self._group_upsert(group_id, organization_id, DEFAULT_GROUP_NAME))
            conn.execute(self._group_member_upsert(group_id, user_id, GroupRole.MANAGER.value))
            conn.execute(
                self._resource_assignment_upsert(
                    assignment_id,
                    organization_id,
                    group_id,
                    AccessResourceType.CLUSTER.value,
                    cluster_id,
                )
            )
            conn.execute(
                self._member_resource_role_upsert(
                    assignment_id,
                    user_id,
                    ResourceRole.CLUSTER_STEWARD.value,
                )
            )
            conn.execute(
                self._access_grant_upsert(
                    workspace_id=workspace_id,
                    subject_id=user_id,
                    resource_type=AccessResourceType.CLUSTER.value,
                    resource_id=cluster_id,
                    role=AccessRole.MAINTAINER.value,
                )
            )
            conn.execute(self._cluster_upsert(payload))
        return payload

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

    def upsert_admin_account(
        self,
        user_id: str,
        email: str,
        password_hash: str,
        display_name: str,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> JsonObject:
        organization_id = workspace_id
        group_id = self._default_group_id(organization_id)
        with self.connection() as conn:
            conn.execute(self._workspace_upsert(workspace_id, DEFAULT_WORKSPACE_NAME))
            conn.execute(self._organization_upsert(organization_id, DEFAULT_ORGANIZATION_NAME))
            conn.execute(self._group_upsert(group_id, organization_id, DEFAULT_GROUP_NAME))
            row = (
                conn.execute(
                    self._admin_user_upsert(
                        user_id=user_id,
                        email=email,
                        password_hash=password_hash,
                        display_name=display_name,
                    )
                )
                .mappings()
                .one()
            )
            conn.execute(
                self._member_upsert(
                    workspace_id,
                    str(row["user_id"]),
                    WorkspaceRole.OWNER.value,
                )
            )
            conn.execute(
                self._organization_member_upsert(
                    organization_id,
                    str(row["user_id"]),
                    OrganizationRole.OWNER.value,
                )
            )
            conn.execute(
                self._group_member_upsert(group_id, str(row["user_id"]), GroupRole.MANAGER.value)
            )
        return dict(row)

    def complete_email_verification(self, user_id: str) -> JsonObject | None:
        table = UserAccount.__table__
        group_id = self._default_group_id(DEFAULT_ORGANIZATION_ID)
        with self.connection() as conn:
            conn.execute(self._workspace_upsert(DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME))
            conn.execute(
                self._organization_upsert(DEFAULT_ORGANIZATION_ID, DEFAULT_ORGANIZATION_NAME)
            )
            conn.execute(self._group_upsert(group_id, DEFAULT_ORGANIZATION_ID, DEFAULT_GROUP_NAME))
            is_first_admin = not self._has_service_admin(conn)
            status = (
                UserStatus.ACTIVE.value if is_first_admin else UserStatus.PENDING_APPROVAL.value
            )
            role = AccountRole.ADMIN.value if is_first_admin else AccountRole.MEMBER.value
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
            if row is not None and is_first_admin:
                conn.execute(
                    self._member_upsert(
                        DEFAULT_WORKSPACE_ID,
                        user_id,
                        WorkspaceRole.OWNER.value,
                    )
                )
                conn.execute(
                    self._organization_member_upsert(
                        DEFAULT_ORGANIZATION_ID,
                        user_id,
                        OrganizationRole.OWNER.value,
                    )
                )
                conn.execute(self._group_member_upsert(group_id, user_id, GroupRole.MANAGER.value))
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
        organization_id = workspace_id
        with self.connection() as conn:
            conn.execute(self._workspace_upsert(workspace_id, workspace_id))
            conn.execute(self._organization_upsert(organization_id, organization_id))
            row = conn.execute(statement).mappings().first()
            if row is not None:
                conn.execute(self._member_upsert(workspace_id, user_id, WorkspaceRole.MEMBER.value))
                conn.execute(
                    self._organization_member_upsert(
                        organization_id,
                        user_id,
                        OrganizationRole.MEMBER.value,
                    )
                )
        if row is None:
            return None
        data = dict(row)
        data["workspace_id"] = workspace_id
        return data

    def get_default_workspace_id_for_user(self, user_id: str) -> str | None:
        if self.is_service_admin(user_id):
            return DEFAULT_WORKSPACE_ID
        organization_member = OrganizationMember.__table__
        statement = (
            select(organization_member.c.organization_id)
            .where(
                organization_member.c.user_id == user_id,
                organization_member.c.status == AccessStatus.ACTIVE.value,
            )
            .order_by(organization_member.c.created_at)
            .limit(1)
        )
        with self.connection() as conn:
            value = conn.execute(statement).scalar_one_or_none()
        if value is not None:
            return str(value)

        workspace_member = WorkspaceMember.__table__
        fallback = (
            select(workspace_member.c.workspace_id)
            .where(
                workspace_member.c.user_id == user_id,
                workspace_member.c.status == AccessStatus.ACTIVE.value,
            )
            .order_by(workspace_member.c.created_at)
            .limit(1)
        )
        with self.connection() as conn:
            fallback_value = conn.execute(fallback).scalar_one_or_none()
        return str(fallback_value) if fallback_value is not None else None

    def grant_resource_access(self, payload: JsonObject) -> JsonObject:
        organization_id = str(payload["workspace_id"])
        user_id = str(payload["subject_id"])
        resource_type = str(payload["resource_type"])
        resource_id = str(payload["resource_id"])
        requested_role = str(payload["role"])
        role = normalize_resource_role(requested_role)
        legacy_role = self._legacy_access_role_for(role, requested_role)
        group_id = str(payload.get("group_id") or self._default_group_id(organization_id))
        assignment_id = self._resource_assignment_id(organization_id, resource_type, resource_id)
        with self.connection() as conn:
            conn.execute(self._workspace_upsert(organization_id, organization_id))
            conn.execute(self._member_upsert(organization_id, user_id, WorkspaceRole.MEMBER.value))
            conn.execute(self._organization_upsert(organization_id, organization_id))
            conn.execute(
                self._organization_member_upsert(
                    organization_id,
                    user_id,
                    OrganizationRole.MEMBER.value,
                )
            )
            conn.execute(self._group_upsert(group_id, organization_id, DEFAULT_GROUP_NAME))
            conn.execute(self._group_member_upsert(group_id, user_id, GroupRole.MEMBER.value))
            conn.execute(
                self._resource_assignment_upsert(
                    assignment_id,
                    organization_id,
                    group_id,
                    resource_type,
                    resource_id,
                )
            )
            row = (
                conn.execute(
                    self._member_resource_role_upsert(
                        assignment_id,
                        user_id,
                        role,
                    ).returning(MemberResourceRole.__table__)
                )
                .mappings()
                .first()
            )
            conn.execute(
                self._access_grant_upsert(
                    workspace_id=organization_id,
                    subject_id=user_id,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    role=legacy_role,
                )
            )
        return dict(row) if row is not None else {**payload, "role": role}

    def is_service_admin(self, user_id: str) -> bool:
        table = UserAccount.__table__
        statement = select(func.count()).where(
            table.c.user_id == user_id,
            table.c.role.in_([ServiceRole.SERVICE_ADMIN.value, AccountRole.ADMIN.value]),
            table.c.status == UserStatus.ACTIVE.value,
        )
        with self.connection() as conn:
            return int(conn.execute(statement).scalar_one()) > 0

    def get_organization_member(self, organization_id: str, user_id: str) -> JsonObject | None:
        table = OrganizationMember.__table__
        statement = (
            select(table.c.organization_id, table.c.user_id, table.c.role, table.c.status)
            .where(
                table.c.organization_id == organization_id,
                table.c.user_id == user_id,
                table.c.status == AccessStatus.ACTIVE.value,
            )
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row is not None else None

    def get_group_member(self, group_id: str, user_id: str) -> JsonObject | None:
        table = GroupMember.__table__
        statement = (
            select(table.c.group_id, table.c.user_id, table.c.role, table.c.status)
            .where(
                table.c.group_id == group_id,
                table.c.user_id == user_id,
                table.c.status == AccessStatus.ACTIVE.value,
            )
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row is not None else None

    def get_resource_assignment_for_org(
        self,
        organization_id: str,
        resource_type: str,
        resource_id: str,
    ) -> JsonObject | None:
        assignment = ResourceAssignment.__table__
        group = Group.__table__
        statement = (
            select(
                assignment.c.resource_assignment_id,
                assignment.c.organization_id,
                assignment.c.group_id,
                assignment.c.resource_type,
                assignment.c.resource_id,
                assignment.c.status,
            )
            .select_from(assignment.join(group, assignment.c.group_id == group.c.group_id))
            .where(
                assignment.c.organization_id == organization_id,
                group.c.organization_id == organization_id,
                group.c.status == AccessStatus.ACTIVE.value,
                assignment.c.resource_type == resource_type,
                assignment.c.resource_id == resource_id,
                assignment.c.status == AccessStatus.ACTIVE.value,
            )
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row is not None else None

    def get_member_resource_role(
        self,
        resource_assignment_id: str,
        user_id: str,
    ) -> JsonObject | None:
        table = MemberResourceRole.__table__
        statement = (
            select(table.c.resource_assignment_id, table.c.user_id, table.c.role, table.c.status)
            .where(
                table.c.resource_assignment_id == resource_assignment_id,
                table.c.user_id == user_id,
                table.c.status == AccessStatus.ACTIVE.value,
            )
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row is not None else None

    def get_role_permissions(
        self,
        resource_type: str,
        role: str,
        organization_id: str | None = None,
    ) -> list[str]:
        table = RolePermission.__table__
        with self.connection() as conn:
            scope = self._role_policy_scope(conn, organization_id, resource_type, role)
            statement = (
                select(table.c.permission)
                .where(
                    table.c.organization_id == scope,
                    table.c.resource_type == resource_type,
                    table.c.role == role,
                    table.c.status == AccessStatus.ACTIVE.value,
                )
                .order_by(table.c.permission)
            )
            permissions = conn.execute(statement).scalars().all()
        return [str(permission) for permission in permissions]

    def role_has_permission(
        self,
        resource_type: str,
        role: str,
        permission: str,
        organization_id: str | None = None,
    ) -> bool:
        table = RolePermission.__table__
        with self.connection() as conn:
            scope = self._role_policy_scope(conn, organization_id, resource_type, role)
            statement = select(func.count()).where(
                table.c.organization_id == scope,
                table.c.resource_type == resource_type,
                table.c.role == role,
                table.c.permission == permission,
                table.c.status == AccessStatus.ACTIVE.value,
            )
            return int(conn.execute(statement).scalar_one()) > 0

    def can_access(
        self,
        user_id: str,
        organization_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        if self.is_service_admin(user_id):
            return True
        if self.get_organization_member(organization_id, user_id) is None:
            return False
        assignment = self.get_resource_assignment_for_org(
            organization_id,
            resource_type,
            resource_id,
        )
        if assignment is None:
            return False
        if self.get_group_member(str(assignment["group_id"]), user_id) is None:
            return False
        member_resource_role = self.get_member_resource_role(
            str(assignment["resource_assignment_id"]),
            user_id,
        )
        if member_resource_role is None:
            return False
        return self.role_has_permission(
            resource_type,
            str(member_resource_role["role"]),
            permission,
            organization_id,
        )

    def user_has_resource_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
    ) -> bool:
        if self._is_account_admin(user_id) or self._is_workspace_owner(user_id, workspace_id):
            return True

        legacy_allowed_roles = [
            role for role, actions in ACCESS_ROLE_ACTIONS.items() if action in actions
        ]
        if legacy_allowed_roles:
            table = ResourceAccessGrant.__table__
            statement = select(table.c.role).where(
                table.c.workspace_id == workspace_id,
                table.c.subject_type == AccessSubjectType.USER.value,
                table.c.subject_id == user_id,
                table.c.resource_type == resource_type,
                table.c.resource_id == resource_id,
                table.c.role.in_(legacy_allowed_roles),
                table.c.status == AccessStatus.ACTIVE.value,
            )
            with self.connection() as conn:
                legacy_roles = conn.execute(statement).scalars().all()
            if any(access_role_allows_action(str(role), action) for role in legacy_roles):
                return True

        permission = ACTION_PERMISSION_ALIASES.get(action, action)
        return self.can_access(user_id, workspace_id, resource_type, resource_id, permission)

    def accessible_resource_ids(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        action: str,
    ) -> set[str] | None:
        if self._is_account_admin(user_id) or self._is_workspace_owner(user_id, workspace_id):
            return None

        legacy_allowed_roles = [
            role for role, actions in ACCESS_ROLE_ACTIONS.items() if action in actions
        ]
        if legacy_allowed_roles:
            table = ResourceAccessGrant.__table__
            statement = (
                select(table.c.resource_id)
                .where(
                    table.c.workspace_id == workspace_id,
                    table.c.subject_type == AccessSubjectType.USER.value,
                    table.c.subject_id == user_id,
                    table.c.resource_type == resource_type,
                    table.c.role.in_(legacy_allowed_roles),
                    table.c.status == AccessStatus.ACTIVE.value,
                )
                .order_by(table.c.resource_id)
            )
            with self.connection() as conn:
                legacy_ids = conn.execute(statement).scalars().all()
            if legacy_ids:
                return {str(resource_id) for resource_id in legacy_ids}

        permission = ACTION_PERMISSION_ALIASES.get(action, action)
        if self.get_organization_member(workspace_id, user_id) is None:
            return set()
        allowed_roles = [
            role
            for role in RESOURCE_ROLE_PERMISSIONS
            if self.role_has_permission(resource_type, role, permission, workspace_id)
        ]
        if not allowed_roles:
            return set()

        assignment = ResourceAssignment.__table__
        group = Group.__table__
        group_member = GroupMember.__table__
        member_role = MemberResourceRole.__table__
        statement = (
            select(assignment.c.resource_id)
            .select_from(
                assignment.join(group, assignment.c.group_id == group.c.group_id)
                .join(group_member, group.c.group_id == group_member.c.group_id)
                .join(
                    member_role,
                    assignment.c.resource_assignment_id == member_role.c.resource_assignment_id,
                )
            )
            .where(
                assignment.c.organization_id == workspace_id,
                assignment.c.resource_type == resource_type,
                assignment.c.status == AccessStatus.ACTIVE.value,
                group.c.organization_id == workspace_id,
                group.c.status == AccessStatus.ACTIVE.value,
                group_member.c.user_id == user_id,
                group_member.c.status == AccessStatus.ACTIVE.value,
                member_role.c.user_id == user_id,
                member_role.c.role.in_(allowed_roles),
                member_role.c.status == AccessStatus.ACTIVE.value,
            )
        )
        with self.connection() as conn:
            resource_ids = conn.execute(statement).scalars().all()
        return {str(resource_id) for resource_id in resource_ids}

    @staticmethod
    def _has_service_admin(conn: Any) -> bool:
        table = UserAccount.__table__
        statement = select(func.count()).where(
            table.c.role.in_([ServiceRole.SERVICE_ADMIN.value, AccountRole.ADMIN.value]),
            table.c.status == UserStatus.ACTIVE.value,
        )
        return int(conn.execute(statement).scalar_one()) > 0

    def _is_account_admin(self, user_id: str) -> bool:
        return self.is_service_admin(user_id)

    def _is_workspace_owner(self, user_id: str, workspace_id: str) -> bool:
        table = WorkspaceMember.__table__
        statement = select(func.count()).where(
            table.c.workspace_id == workspace_id,
            table.c.user_id == user_id,
            table.c.role == WorkspaceRole.OWNER.value,
            table.c.status == AccessStatus.ACTIVE.value,
        )
        with self.connection() as conn:
            return int(conn.execute(statement).scalar_one()) > 0

    @staticmethod
    def _role_policy_scope(
        conn: Any,
        organization_id: str | None,
        resource_type: str,
        role: str,
    ) -> str:
        if organization_id is None:
            return GLOBAL_ROLE_POLICY_ORGANIZATION_ID
        table = RolePermission.__table__
        statement = select(func.count()).where(
            table.c.organization_id == organization_id,
            table.c.resource_type == resource_type,
            table.c.role == role,
        )
        if int(conn.execute(statement).scalar_one()) > 0:
            return organization_id
        return GLOBAL_ROLE_POLICY_ORGANIZATION_ID

    @staticmethod
    def _default_group_id(organization_id: str) -> str:
        return (
            DEFAULT_GROUP_ID
            if organization_id == DEFAULT_ORGANIZATION_ID
            else f"{organization_id}:ops"
        )

    @staticmethod
    def _resource_assignment_id(
        organization_id: str,
        resource_type: str,
        resource_id: str,
    ) -> str:
        return f"ra:{organization_id}:{resource_type}:{resource_id}"

    @staticmethod
    def _legacy_access_role_for(resource_role: str, requested_role: str) -> str:
        if requested_role in ACCESS_ROLE_ACTIONS:
            return requested_role
        return {
            ResourceRole.OBSERVER.value: AccessRole.VIEWER.value,
            ResourceRole.RELEASE_OPERATOR.value: AccessRole.DEPLOYER.value,
            ResourceRole.INCIDENT_OPERATOR.value: AccessRole.MAINTAINER.value,
            ResourceRole.CLUSTER_STEWARD.value: AccessRole.OWNER.value,
        }.get(resource_role, AccessRole.VIEWER.value)

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
    def _admin_user_upsert(
        user_id: str,
        email: str,
        password_hash: str,
        display_name: str,
    ) -> Any:
        table = UserAccount.__table__
        insert = pg_insert(table).values(
            user_id=user_id,
            email=email,
            password_hash=password_hash,
            display_name=display_name,
            status=UserStatus.ACTIVE.value,
            role=ServiceRole.SERVICE_ADMIN.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.email],
            set_={
                "password_hash": insert.excluded.password_hash,
                "display_name": insert.excluded.display_name,
                "status": UserStatus.ACTIVE.value,
                "role": ServiceRole.SERVICE_ADMIN.value,
                "updated_at": func.now(),
            },
        ).returning(
            table.c.user_id,
            table.c.email,
            table.c.password_hash,
            table.c.display_name,
            table.c.status,
            table.c.role,
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
            status=AccessStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id, table.c.user_id],
            set_={
                "role": case(
                    (insert.excluded.role == WorkspaceRole.OWNER.value, insert.excluded.role),
                    (table.c.role == WorkspaceRole.OWNER.value, table.c.role),
                    else_=insert.excluded.role,
                ),
                "permissions": case(
                    (
                        insert.excluded.role == WorkspaceRole.OWNER.value,
                        insert.excluded.permissions,
                    ),
                    (table.c.role == WorkspaceRole.OWNER.value, table.c.permissions),
                    else_=insert.excluded.permissions,
                ),
                "status": AccessStatus.ACTIVE.value,
                "updated_at": func.now(),
            },
        )

    @staticmethod
    def _organization_upsert(organization_id: str, name: str) -> Any:
        table = Organization.__table__
        insert = pg_insert(table).values(
            organization_id=organization_id,
            name=name,
            slug=organization_id,
            status=AccessStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.organization_id],
            set_={"status": AccessStatus.ACTIVE.value, "updated_at": func.now()},
        )

    @staticmethod
    def _organization_member_upsert(organization_id: str, user_id: str, role: str) -> Any:
        table = OrganizationMember.__table__
        insert = pg_insert(table).values(
            organization_id=organization_id,
            user_id=user_id,
            role=role,
            status=AccessStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.organization_id, table.c.user_id],
            set_={
                "role": case(
                    (insert.excluded.role == OrganizationRole.OWNER.value, insert.excluded.role),
                    (table.c.role == OrganizationRole.OWNER.value, table.c.role),
                    else_=insert.excluded.role,
                ),
                "status": AccessStatus.ACTIVE.value,
                "updated_at": func.now(),
            },
        )

    @staticmethod
    def _group_upsert(group_id: str, organization_id: str, name: str) -> Any:
        table = Group.__table__
        insert = pg_insert(table).values(
            group_id=group_id,
            organization_id=organization_id,
            name=name,
            slug=group_id,
            status=AccessStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.group_id],
            set_={"status": AccessStatus.ACTIVE.value, "updated_at": func.now()},
        )

    @staticmethod
    def _group_member_upsert(group_id: str, user_id: str, role: str) -> Any:
        table = GroupMember.__table__
        insert = pg_insert(table).values(
            group_id=group_id,
            user_id=user_id,
            role=role,
            status=AccessStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.group_id, table.c.user_id],
            set_={
                "role": case(
                    (insert.excluded.role == GroupRole.MANAGER.value, insert.excluded.role),
                    (table.c.role == GroupRole.MANAGER.value, table.c.role),
                    else_=insert.excluded.role,
                ),
                "status": AccessStatus.ACTIVE.value,
                "updated_at": func.now(),
            },
        )

    @staticmethod
    def _resource_assignment_upsert(
        resource_assignment_id: str,
        organization_id: str,
        group_id: str,
        resource_type: str,
        resource_id: str,
    ) -> Any:
        table = ResourceAssignment.__table__
        insert = pg_insert(table).values(
            resource_assignment_id=resource_assignment_id,
            organization_id=organization_id,
            group_id=group_id,
            resource_type=resource_type,
            resource_id=resource_id,
            status=AccessStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.resource_assignment_id],
            set_={
                "group_id": insert.excluded.group_id,
                "status": AccessStatus.ACTIVE.value,
                "updated_at": func.now(),
            },
        )

    @staticmethod
    def _member_resource_role_upsert(
        resource_assignment_id: str,
        user_id: str,
        role: str,
    ) -> Any:
        table = MemberResourceRole.__table__
        insert = pg_insert(table).values(
            resource_assignment_id=resource_assignment_id,
            user_id=user_id,
            role=role,
            status=AccessStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.resource_assignment_id, table.c.user_id],
            set_={
                "role": insert.excluded.role,
                "status": AccessStatus.ACTIVE.value,
                "updated_at": func.now(),
            },
        )

    @staticmethod
    def _role_permission_upsert(
        organization_id: str,
        resource_type: str,
        role: str,
        permission: str,
        status: str,
    ) -> Any:
        table = RolePermission.__table__
        insert = pg_insert(table).values(
            organization_id=organization_id,
            resource_type=resource_type,
            role=role,
            permission=permission,
            status=status,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[
                table.c.organization_id,
                table.c.resource_type,
                table.c.role,
                table.c.permission,
            ],
            set_={
                "status": insert.excluded.status,
                "updated_at": func.now(),
            },
        )

    @staticmethod
    def _access_grant_upsert(
        workspace_id: str,
        subject_id: str,
        resource_type: str,
        resource_id: str,
        role: str,
    ) -> Any:
        table = ResourceAccessGrant.__table__
        permissions = {"actions": sorted(ACCESS_ROLE_ACTIONS.get(role, set()))}
        insert = pg_insert(table).values(
            workspace_id=workspace_id,
            subject_type=AccessSubjectType.USER.value,
            subject_id=subject_id,
            resource_type=resource_type,
            resource_id=resource_id,
            role=role,
            permissions=permissions,
            status=AccessStatus.ACTIVE.value,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[
                table.c.workspace_id,
                table.c.subject_type,
                table.c.subject_id,
                table.c.resource_type,
                table.c.resource_id,
            ],
            set_={
                "role": insert.excluded.role,
                "permissions": insert.excluded.permissions,
                "status": AccessStatus.ACTIVE.value,
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
            agent_token_hash=payload["agent_token_hash"],
            settings=payload["settings"],
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id, table.c.cluster_id],
            set_={
                "name": insert.excluded.name,
                "environment": insert.excluded.environment,
                "status": ClusterRegistrationStatus.REGISTERED.value,
                "agent_token_hash": insert.excluded.agent_token_hash,
                "settings": insert.excluded.settings,
                "updated_at": func.now(),
            },
        )

    def authenticate_cluster_agent(self, token_hash: str) -> JsonObject | None:
        if not token_hash:
            return None
        table = ClusterRegistration.__table__
        statement = select(table.c.workspace_id, table.c.cluster_id).where(
            table.c.agent_token_hash == token_hash
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row is not None else None


WorkspaceAccessRepository = IdentityAccessRepository
