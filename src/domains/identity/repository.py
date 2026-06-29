from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.identity.models import (
    OAuthAccount,
    TokenVault,
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
