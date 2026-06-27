from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request
from redis.asyncio import Redis
from settings import (
    AUTHENTICATION_REQUIRED_MESSAGE,
    AUTHORIZATION_HEADER,
    BEARER_PREFIX,
    DEFAULT_RATE_LIMIT,
    INVALID_CREDENTIALS_MESSAGE,
    OAUTH_AUTHORIZE_BASE_URL,
    OAUTH_STATE_KEY_PREFIX,
    OAUTH_STATE_TTL_SECONDS,
    OWNER_ROLE,
    RATE_LIMIT_EXCEEDED_MESSAGE,
    RATE_LIMIT_KEY_PREFIX,
    RATE_LIMIT_WINDOW_SECONDS,
    REDIS_NOT_CONNECTED_MESSAGE,
    REDIS_URL_ENV,
    SESSION_KEY_PREFIX,
    SESSION_TOKEN_BYTES,
    SESSION_TOKEN_HEADER,
    SESSION_TTL_ENV,
    USER_STATUS_ACTIVE,
)

from packages.config.constants import (
    DEFAULT_REDIS_URL,
    DEFAULT_SESSION_TTL_SECONDS,
    SESSION_COOKIE_NAME,
)
from packages.config.settings import env
from packages.contracts.interfaces import OAuthAccountStore, SessionStore, UserStore


PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_NAME = "sha256"
PASSWORD_HASH_ITERATIONS = 260000
PASSWORD_SALT_BYTES = 16


def _encode_token(raw: bytes) -> str:
    # DB에 넣기 쉽도록 salt/hash bytes를 URL-safe 문자열로 바꾼다.
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_token(value: str) -> bytes:
    # base64 padding을 저장하지 않기 때문에 검증할 때 다시 채워 넣는다.
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    # password 원문은 저장하지 않고, salt와 반복 해시 결과만 password_hash 컬럼에 저장한다.
    salt = secrets.token_bytes(PASSWORD_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        PASSWORD_HASH_NAME,
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return (
        f"{PASSWORD_HASH_ALGORITHM}"
        f"${PASSWORD_HASH_ITERATIONS}"
        f"${_encode_token(salt)}"
        f"${_encode_token(digest)}"
    )


def verify_password(password: str, password_hash: str) -> bool:
    # 로그인 실패 이유를 밖으로 자세히 드러내지 않도록 잘못된 hash 형식도 False로 처리한다.
    try:
        algorithm, iterations, salt_value, digest_value = password_hash.split("$", 3)
        if algorithm != PASSWORD_HASH_ALGORITHM:
            return False
        salt = _decode_token(salt_value)
        expected = _decode_token(digest_value)
        actual = hashlib.pbkdf2_hmac(
            PASSWORD_HASH_NAME,
            password.encode("utf-8"),
            salt,
            int(iterations),
        )
    except (binascii.Error, TypeError, ValueError):
        return False
    return hmac.compare_digest(actual, expected)


def extract_session_token(request: Request) -> str | None:
    # browser cookie, CLI bearer token, 테스트용 x-session-token을 같은 session으로 취급한다.
    authorization = request.headers.get(AUTHORIZATION_HEADER, "")
    if authorization.lower().startswith(BEARER_PREFIX):
        return authorization.split(" ", 1)[1].strip()
    if request.headers.get(SESSION_TOKEN_HEADER):
        return request.headers[SESSION_TOKEN_HEADER]
    if request.cookies.get(SESSION_COOKIE_NAME):
        return request.cookies[SESSION_COOKIE_NAME]
    return None


# 로그인된 사용자 정보를 담는 작은 상자
@dataclass(frozen=True)
class AuthSession:
    token: str  # 로그인 성공 후 발급되는 긴 랜덤 문자열
    user_id: str  # 우리 서비스 기준 로그인한 사용자 id
    roles: list[str]  # 로그인한 사용자의 권한 목록, 예: ["owner", "admin"]


class RedisSessionStore:  # Redis에 sesision과 OAuth state를 저장하고 꺼내는 역할
    # RedisSessionStore 생성자에서 Redis URL과 세션 TTL을 환경 변수에서 가져오거나 기본값을 사용
    def __init__(self) -> None:
        self.url = env(REDIS_URL_ENV, DEFAULT_REDIS_URL)
        self.ttl_seconds = int(env(SESSION_TTL_ENV, DEFAULT_SESSION_TTL_SECONDS))
        self.client: Redis | None = None

    async def connect(self) -> None:  # Redis에 연결하고 ping을 보내서 연결 확인
        self.client = Redis.from_url(self.url, decode_responses=True)
        await self.client.ping()

    async def close(self) -> None:  # Redis 연결을 닫음
        if self.client is not None:
            await self.client.aclose()

    async def create_session(  # 로그인 성공후 token 만들고 session을 만들어서
        self, user_id: str, roles: list[str] | None = None
    ) -> AuthSession:
        client = self._client()
        token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
        session = AuthSession(token=token, user_id=user_id, roles=roles or [OWNER_ROLE])
        await client.setex(
            f"{SESSION_KEY_PREFIX}:{token}",
            self.ttl_seconds,
            json.dumps({"user_id": session.user_id, "roles": session.roles}),
        )
        return session

    async def get_session(self, token: str | None) -> AuthSession | None:
        if not token:
            return None
        raw = await self._client().get(f"{SESSION_KEY_PREFIX}:{token}")
        if not raw:
            return None
        payload = json.loads(raw)
        return AuthSession(
            token=token,
            user_id=payload["user_id"],
            roles=list(payload.get("roles", [])),
        )

    async def delete_session(self, token: str) -> None:
        # logout은 Redis에 저장된 server-side session key를 지워서 즉시 무효화한다.
        await self._client().delete(f"{SESSION_KEY_PREFIX}:{token}")

    # OAuth 로그인 시작할 때 state를 Redis에 저장
    async def save_oauth_state(self, state: str, payload: dict[str, Any]) -> None:
        await self._client().setex(
            f"{OAUTH_STATE_KEY_PREFIX}:{state}",
            OAUTH_STATE_TTL_SECONDS,
            json.dumps(payload),
        )

    # 저장했던 state를 가져오고 Redis에서 삭제
    async def consume_oauth_state(self, state: str | None) -> dict[str, Any] | None:
        if not state:
            return None
        key = f"{OAUTH_STATE_KEY_PREFIX}:{state}"
        raw = await self._client().get(key)
        if raw:
            await self._client().delete(key)
            return dict(json.loads(raw))
        return None

    #  로그인한 사용자의 요청이 너무 많으면 rate limit을 걸어주는 역할
    async def check_rate_limit(
        self,
        key: str,
        limit: int = DEFAULT_RATE_LIMIT,
        window_seconds: int = RATE_LIMIT_WINDOW_SECONDS,
    ) -> None:
        redis_key = f"{RATE_LIMIT_KEY_PREFIX}:{key}"
        count = await self._client().incr(redis_key)
        if count == 1:
            await self._client().expire(redis_key, window_seconds)
        if count > limit:
            raise HTTPException(status_code=429, detail=RATE_LIMIT_EXCEEDED_MESSAGE)

    def _client(self) -> Redis:
        if self.client is None:
            raise RuntimeError(REDIS_NOT_CONNECTED_MESSAGE)
        return self.client


# OAuth 로그인 전체 흐름과 세션 관리를 담당하는 서비스
class OAuthAuthService:
    def __init__(self, db: OAuthAccountStore, sessions: SessionStore) -> None:
        self.db = db
        self.sessions = sessions

    async def start(
        self, provider: str, user_id: str, scopes: list[str]
    ) -> dict[str, Any]:
        state = str(uuid.uuid4())
        await self.sessions.save_oauth_state(
            state, {"provider": provider, "user_id": user_id, "scopes": scopes}
        )
        return {
            "provider": provider,
            "state": state,
            "authorization_url": f"{OAUTH_AUTHORIZE_BASE_URL}/{provider}/authorize?state={state}",
        }

    async def callback(self, provider: str, payload: dict[str, Any]) -> dict[str, Any]:
        state_payload = await self.sessions.consume_oauth_state(payload.get("state"))
        merged = {**(state_payload or {}), **payload, "provider": provider}
        account = self.db.save_oauth_account(merged)  # 깃허브 연결 계정 정보
        session = await self.sessions.create_session(
            account["user_id"], [OWNER_ROLE]
        )  # 우리 서비스용 로그인 티켓
        return {
            "account": account,
            "session": {
                "session_token": session.token,
                "user_id": session.user_id,
                "roles": session.roles,
            },
        }

    async def require_session(self, request: Request) -> AuthSession:
        token = self._extract_token(request)
        session = await self.sessions.get_session(token)
        if session is None:
            raise HTTPException(status_code=401, detail=AUTHENTICATION_REQUIRED_MESSAGE)
        await self.sessions.check_rate_limit(session.user_id)
        return session

    @staticmethod
    def _extract_token(request: Request) -> str | None:
        return extract_session_token(request)


class PasswordAuthService:
    # 우리 서비스 자체 계정(email/password)을 검증하는 담당이다.
    # OAuthAuthService는 provider 연결 흐름으로 남겨 두고, 자체 로그인 책임을 분리한다.
    def __init__(self, db: UserStore, sessions: SessionStore) -> None:
        self.db = db
        self.sessions = sessions

    async def login(self, email: str, password: str) -> AuthSession:
        user = self.db.get_user_by_email(email)
        if user is None or user["status"] != USER_STATUS_ACTIVE:
            raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS_MESSAGE)
        if not verify_password(password, str(user["password_hash"])):
            raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS_MESSAGE)

        # session에는 최소 정보만 넣는다. 권한은 다음 단계에서 DB membership으로 확장한다.
        return await self.sessions.create_session(str(user["id"]), [OWNER_ROLE])

    async def logout(self, token: str | None) -> None:
        # token이 없으면 지울 session도 없다. logout API는 idempotent하게 성공시킨다.
        if token:
            await self.sessions.delete_session(token)
