from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.identity.models import (
    ClusterRegistration,
    OAuthAccount,
    RepoClusterBinding,
    RepositoryIntegration,
    TokenVault,
    UserAccount,
    Workspace,
    WorkspaceMember,
)
from packages.config.constants import Auth, GitHub, OAuth
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import (
    ACCOUNT_STATUS_CONNECTED,
    CREDENTIAL_STATUS_PENDING,
    CREDENTIAL_STATUS_READY,
    PLACEHOLDER_CREDENTIAL_NOTE,
    TOKEN_REF_PREFIX,
    DatabaseConnection,
)


class OAuthRepository(DatabaseConnection):
    def save_oauth_account(self, payload: JsonObject) -> JsonObject:
        provider = payload["provider"]
        user_id = payload.get("user_id", Auth.LOCAL_USER_ID)
        scopes = self._oauth_scopes(provider, payload)
        provider_user = payload.get("provider_user") or f"{provider}-{user_id}"
        token_ref = f"{TOKEN_REF_PREFIX}/{provider}/{user_id}/{uuid.uuid4()}"
        with self.connection() as conn:
            conn.execute(
                pg_insert(TokenVault.__table__).values(
                    token_ref=token_ref,
                    provider=provider,
                    encrypted_payload=self._credential_placeholder_payload(),
                )
            )
            conn.execute(
                self._oauth_account_upsert(user_id, provider, provider_user, scopes, token_ref)
            )
        return {
            "user_id": user_id,
            "provider": provider,
            "provider_user": provider_user,
            "scopes": scopes,
            "token_ref": token_ref,
        }

    @staticmethod
    def _oauth_scopes(provider: str, payload: JsonObject) -> list[str]:
        scopes = payload.get("scopes") or list(OAuth.DEFAULT_SCOPES)
        if provider == GitHub.PROVIDER and GitHub.REQUIRED_SCOPE not in scopes:
            scopes.append(GitHub.REQUIRED_SCOPE)
        return scopes

    @staticmethod
    def _credential_placeholder_payload() -> JsonObject:
        return {
            "note": PLACEHOLDER_CREDENTIAL_NOTE,
            "status": CREDENTIAL_STATUS_PENDING,
        }

    @staticmethod
    def _is_ready_provider_credential(payload: object) -> bool:
        return isinstance(payload, dict) and payload.get("status") == CREDENTIAL_STATUS_READY

    @staticmethod
    def _oauth_account_upsert(
        user_id: str, provider: str, provider_user: str, scopes: list[str], token_ref: str
    ) -> Any:
        table = OAuthAccount.__table__
        insert = pg_insert(table).values(
            user_id=user_id,
            provider=provider,
            provider_user=provider_user,
            scopes=scopes,
            token_ref=token_ref,
            status=ACCOUNT_STATUS_CONNECTED,
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.user_id, table.c.provider],
            set_={
                "provider_user": insert.excluded.provider_user,
                "scopes": insert.excluded.scopes,
                "token_ref": insert.excluded.token_ref,
                "status": ACCOUNT_STATUS_CONNECTED,
                "updated_at": func.now(),
            },
        )

    def latest_github_token_ref(self) -> str | None:
        account = OAuthAccount.__table__
        vault = TokenVault.__table__
        statement = (
            select(account.c.token_ref, vault.c.encrypted_payload)
            .join(vault, account.c.token_ref == vault.c.token_ref)
            .where(
                account.c.provider == GitHub.PROVIDER,
                account.c.status == ACCOUNT_STATUS_CONNECTED,
            )
            .order_by(account.c.updated_at.desc())
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        if not row or not self._is_ready_provider_credential(row["encrypted_payload"]):
            return None
        return row["token_ref"]


class WorkspaceAccessRepository(DatabaseConnection):
    """워크스페이스/레포/클러스터 권한 연결용 repository 골격."""

    # TODO(identity): implement user lifecycle with SSO/email login and account deactivation.
    user_table = UserAccount.__table__
    # TODO(identity): enforce workspace role hierarchy and permission inheritance in one policy port.
    workspace_table = Workspace.__table__
    member_table = WorkspaceMember.__table__
    # TODO(gitops): connect repository records to GitHub App installation credentials and branch policy.
    repository_table = RepositoryIntegration.__table__
    # TODO(target): connect clusters to agent identity, token rotation, environment tier, and RBAC scope.
    cluster_table = ClusterRegistration.__table__
    # TODO(gitops): use bindings as the only source of truth for repo -> cluster -> namespace deploy rights.
    binding_table = RepoClusterBinding.__table__

    @staticmethod
    def required_tables() -> set[str]:
        return {
            UserAccount.__tablename__,
            Workspace.__tablename__,
            WorkspaceMember.__tablename__,
            RepositoryIntegration.__tablename__,
            ClusterRegistration.__tablename__,
            RepoClusterBinding.__tablename__,
        }

    def register_target_cluster(self, payload: JsonObject) -> JsonObject:
        # TODO(identity): require an explicit workspace owner/admin permission before registration.
        # TODO(target): encrypt per-cluster bootstrap tokens through Token Broker, not DB placeholders.
        user_id = payload["user_id"]
        workspace_id = payload["workspace_id"]
        token_ref = payload["agent_token_ref"]
        with self.connection() as conn:
            conn.execute(self._user_upsert(user_id))
            conn.execute(self._workspace_upsert(workspace_id))
            conn.execute(self._member_upsert(workspace_id, user_id))
            conn.execute(
                pg_insert(TokenVault.__table__)
                .values(
                    token_ref=token_ref,
                    provider="target-agent",
                    encrypted_payload={
                        "status": CREDENTIAL_STATUS_READY,
                        "note": "agent token is supplied from management secret",
                    },
                    updated_at=func.now(),
                )
                .on_conflict_do_update(
                    index_elements=[TokenVault.__table__.c.token_ref],
                    set_={
                        "encrypted_payload": {
                            "status": CREDENTIAL_STATUS_READY,
                            "note": "agent token is supplied from management secret",
                        },
                        "updated_at": func.now(),
                    },
                )
            )
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
            agent_token_ref=payload["agent_token_ref"],
            status="registered",
            settings=payload["settings"],
            updated_at=func.now(),
        )
        return insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id, table.c.cluster_id],
            set_={
                "name": insert.excluded.name,
                "environment": insert.excluded.environment,
                "agent_token_ref": insert.excluded.agent_token_ref,
                "status": "registered",
                "settings": insert.excluded.settings,
                "updated_at": func.now(),
            },
        )
