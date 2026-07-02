from __future__ import annotations

import hashlib
from dataclasses import dataclass

from fastapi import HTTPException
from passwords import normalize_email
from settings import Settings

from packages.contracts.interfaces import SessionStore
from packages.storage.sessions import RateLimitExceeded


@dataclass(frozen=True)
class AuthRateLimitPolicy:
    scope: str
    email_limit: int
    client_limit: int
    window_seconds: int
    lock_steps_seconds: tuple[int, ...]
    strike_ttl_seconds: int

    def email_key(self, email: str) -> str:
        return f"auth:{self.scope}:email:{stable_rate_key(normalize_email(email))}"

    def client_key(self, client_key: str) -> str:
        return f"auth:{self.scope}:client:{stable_rate_key(client_key)}"


class AuthRateLimiter:
    def __init__(self, sessions: SessionStore) -> None:
        self.sessions = sessions

    async def check(self, policy: AuthRateLimitPolicy, email: str, client_key: str) -> None:
        try:
            await self.sessions.check_escalating_rate_limit(
                policy.email_key(email),
                policy.email_limit,
                policy.window_seconds,
                policy.lock_steps_seconds,
                policy.strike_ttl_seconds,
            )
            await self.sessions.check_escalating_rate_limit(
                policy.client_key(client_key),
                policy.client_limit,
                policy.window_seconds,
                policy.lock_steps_seconds,
                policy.strike_ttl_seconds,
            )
        except RateLimitExceeded:
            raise HTTPException(
                status_code=429, detail=Settings.RATE_LIMIT_EXCEEDED_MESSAGE
            ) from None


def signup_rate_limit_policy() -> AuthRateLimitPolicy:
    return _auth_policy(
        scope="signup",
        email_limit=Settings.SIGNUP_EMAIL_RATE_LIMIT,
        client_limit=Settings.SIGNUP_IP_RATE_LIMIT,
    )


def resend_verification_rate_limit_policy() -> AuthRateLimitPolicy:
    return _auth_policy(
        scope="resend",
        email_limit=Settings.RESEND_EMAIL_RATE_LIMIT,
        client_limit=Settings.RESEND_IP_RATE_LIMIT,
    )


def _auth_policy(scope: str, email_limit: int, client_limit: int) -> AuthRateLimitPolicy:
    return AuthRateLimitPolicy(
        scope=scope,
        email_limit=email_limit,
        client_limit=client_limit,
        window_seconds=Settings.AUTH_ABUSE_RATE_WINDOW_SECONDS,
        lock_steps_seconds=(
            Settings.AUTH_ABUSE_FIRST_LOCK_SECONDS,
            Settings.AUTH_ABUSE_SECOND_LOCK_SECONDS,
            Settings.AUTH_ABUSE_THIRD_LOCK_SECONDS,
        ),
        strike_ttl_seconds=Settings.AUTH_ABUSE_STRIKE_TTL_SECONDS,
    )


def stable_rate_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
