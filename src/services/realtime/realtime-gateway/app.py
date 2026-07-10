"""realtime-gateway — cluster-agent live stream 을 browser 로 fan-out 하는 실시간 게이트웨이.

경로: cluster-agent --(outbound WS /live/agent)--> hub cache --(WS /live/browser)--> browser.
node-collector 는 여기 연결하지 않음 — /metrics 는 Prometheus scrape 경로를 유지함.
agent 인증은 api-gateway 와 동일한 per-cluster 토큰(x-agent-token 해시 → DB 조회)을 재사용함.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from hub import BrowserClient, RealtimeHub

from domains.identity.dependencies import (
    AGENT_TOKEN_HEADER,
    development_cluster_agent_identity,
    hash_agent_token,
)
from packages.config.constants import Auth
from packages.config.constants import Redis as RedisConfig
from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.security import (
    development_bypass_workspace_id,
    development_security_bypass_enabled,
    development_session_bypass_enabled,
)
from packages.config.settings import env
from packages.contracts.gateway.fields import Gateway
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, ServiceRole
from packages.contracts.realtime import (
    AGENT_LIVE_PATH,
    BROWSER_LIVE_PATH,
    HelloMessage,
    LiveSummaryMessage,
    PingMessage,
    ResourceDelta,
    Subscription,
    delta_key_parts,
    parse_realtime_message,
)
from packages.runtime.service import FastApiService
from packages.storage.database import Database, wait_for_database
from packages.storage.sessions import RedisSessionStore, RedisSessionStoreConfig

LOGGER = get_logger(__name__)

GATEWAY_NAME = "realtime-gateway"

# browser 로 보낼 것이 없을 때 keepalive ping 주기.
BROWSER_PING_INTERVAL_SECONDS = 15.0

# WebSocket close code — 1008(policy violation)은 표준, 44xx 는 애플리케이션 정의.
CLOSE_BAD_REQUEST = 4400
CLOSE_UNAUTHORIZED = 4401
CLOSE_PROTOCOL_VIOLATION = 1008

# authenticate: 원문 토큰 → {"workspace_id", "cluster_id"} | None (fail-closed)
AgentAuthenticator = Callable[[str], Any]
DevelopmentAgentAuthenticator = Callable[[str], Any]
BrowserSessionAuthenticator = Callable[[str | None], Awaitable[Any]]

REDIS_URL_ENV = "REDIS_URL"
SESSION_KEY_PREFIX = "session"
RATE_LIMIT_KEY_PREFIX = "rate"
EMAIL_VERIFICATION_KEY_PREFIX = "email_verify"
SESSION_TOKEN_BYTES = 32
EMAIL_VERIFICATION_TOKEN_BYTES = 32
DEFAULT_RATE_LIMIT = 120
RATE_LIMIT_WINDOW_SECONDS = 60
EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60
SESSION_TOKEN_HEADER = "x-session-token"
AUTHORIZATION_HEADER = "authorization"
BEARER_PREFIX = "bearer "


def database_authenticator(db: Database) -> AgentAuthenticator:
    """api-gateway 의 require_cluster_agent 와 동일한 인증 경로(해시 조회) 재사용."""

    def authenticate(token: str) -> Any:
        if not token:
            return None
        return db.authenticate_cluster_agent(hash_agent_token(token))

    return authenticate


def database_development_authenticator(db: Database) -> DevelopmentAgentAuthenticator:
    """등록 레지스트리만 신뢰하는 test 환경 agent identity 조회기."""

    def authenticate(cluster_id: str) -> Any:
        identity = development_cluster_agent_identity(db, cluster_id)
        if identity is None:
            return None
        return {
            Gateway.WORKSPACE_ID: identity.workspace_id,
            Gateway.CLUSTER_ID: identity.cluster_id,
        }

    return authenticate


def session_store_config() -> RedisSessionStoreConfig:
    return RedisSessionStoreConfig(
        url=env(REDIS_URL_ENV, RedisConfig.DEFAULT_URL),
        ttl_seconds=int(env(Auth.SESSION_TTL_ENV, Auth.DEFAULT_SESSION_TTL_SECONDS)),
        key_prefix=SESSION_KEY_PREFIX,
        token_bytes=SESSION_TOKEN_BYTES,
        default_roles=(ServiceRole.USER.value,),
        default_workspace_id=DEFAULT_WORKSPACE_ID,
        rate_limit_key_prefix=RATE_LIMIT_KEY_PREFIX,
        rate_limit=DEFAULT_RATE_LIMIT,
        rate_limit_window_seconds=RATE_LIMIT_WINDOW_SECONDS,
        email_verification_key_prefix=EMAIL_VERIFICATION_KEY_PREFIX,
        email_verification_ttl_seconds=EMAIL_VERIFICATION_TTL_SECONDS,
        email_verification_token_bytes=EMAIL_VERIFICATION_TOKEN_BYTES,
    )


def redis_session_authenticator(session_store: RedisSessionStore) -> BrowserSessionAuthenticator:
    async def authenticate(token: str | None) -> Any:
        return await session_store.get_session(token)

    return authenticate


def create_app(
    db: Database | None = None,
    authenticate_agent: AgentAuthenticator | None = None,
    authenticate_browser: BrowserSessionAuthenticator | None = None,
    authenticate_development_agent: DevelopmentAgentAuthenticator | None = None,
) -> FastAPI:
    if authenticate_agent is None:
        db = db or Database()
        authenticate_agent = database_authenticator(db)
    if authenticate_development_agent is None and db is not None:
        authenticate_development_agent = database_development_authenticator(db)
    browser_session_store: RedisSessionStore | None = None
    if authenticate_browser is None:
        browser_session_store = RedisSessionStore(session_store_config())
        authenticate_browser = redis_session_authenticator(browser_session_store)

    hub = RealtimeHub()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if db is not None:
            await wait_for_database(db)
        if browser_session_store is not None:
            await browser_session_store.connect()
        try:
            yield
        finally:
            if browser_session_store is not None:
                await browser_session_store.close()

    app = FastAPI(title=GATEWAY_NAME, lifespan=lifespan)
    app.state.hub = hub

    @app.get("/healthz", response_class=PlainTextResponse)
    async def healthz() -> str:
        return "ok"

    @app.get("/readyz", response_class=PlainTextResponse)
    async def readyz() -> str:
        return "ok"

    @app.websocket(AGENT_LIVE_PATH)
    async def agent_live(websocket: WebSocket) -> None:
        await websocket.accept()
        token = websocket.headers.get(AGENT_TOKEN_HEADER, "")
        identity = authenticate_agent(token)
        requested_cluster = websocket.query_params.get(Gateway.CLUSTER_ID, "")
        if (
            identity is None
            and development_security_bypass_enabled()
            and authenticate_development_agent is not None
        ):
            identity = authenticate_development_agent(requested_cluster)
        if identity is None:
            await websocket.close(code=CLOSE_UNAUTHORIZED)
            return
        cluster_id = str(identity[Gateway.CLUSTER_ID])
        requested_cluster = requested_cluster or cluster_id
        if requested_cluster != cluster_id:
            # 토큰의 클러스터가 권위 — 다른 클러스터로의 발행 시도는 차단(크로스 테넌트 금지).
            await websocket.close(code=CLOSE_UNAUTHORIZED)
            return

        await websocket.send_json(HelloMessage().model_dump(mode="json"))
        LOGGER.info("agent_stream_connected", extra={CONTEXT_KEY: {Gateway.CLUSTER_ID: cluster_id}})
        try:
            while True:
                payload = await websocket.receive_json()
                if not _ingest(hub, cluster_id, payload):
                    await websocket.close(code=CLOSE_PROTOCOL_VIOLATION)
                    return
        except WebSocketDisconnect:
            LOGGER.info(
                "agent_stream_disconnected", extra={CONTEXT_KEY: {Gateway.CLUSTER_ID: cluster_id}}
            )

    @app.websocket(BROWSER_LIVE_PATH)
    async def browser_live(websocket: WebSocket) -> None:
        await websocket.accept()
        # query param 이름은 Subscription 계약 필드가 단일 출처(별도 리터럴 금지).
        params = {name: websocket.query_params.get(name, "") for name in Subscription.model_fields}
        if not params[Gateway.WORKSPACE_ID]:
            await websocket.close(code=CLOSE_BAD_REQUEST)
            return
        session = await authenticate_browser(browser_session_token(websocket))
        if session is None and development_session_bypass_enabled():
            session = {Gateway.WORKSPACE_ID: development_bypass_workspace_id(DEFAULT_WORKSPACE_ID)}
        session_workspace = session_workspace_id(session)
        if not session_workspace or params[Gateway.WORKSPACE_ID] != session_workspace:
            await websocket.close(code=CLOSE_UNAUTHORIZED)
            return
        subscription = Subscription(**params)
        client = hub.register_browser(subscription)
        sender = asyncio.create_task(_browser_send_loop(websocket, hub, client))
        try:
            # 수신 내용은 쓰지 않지만, receive 가 disconnect 감지의 유일한 방법임.
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            hub.unregister_browser(client)
            sender.cancel()
            with suppress(asyncio.CancelledError):
                await sender

    return app


def browser_session_token(websocket: WebSocket) -> str | None:
    authorization = websocket.headers.get(AUTHORIZATION_HEADER, "")
    if authorization.lower().startswith(BEARER_PREFIX):
        return authorization.split(" ", 1)[1].strip()
    if websocket.headers.get(SESSION_TOKEN_HEADER):
        return websocket.headers[SESSION_TOKEN_HEADER]
    return websocket.cookies.get(Auth.SESSION_COOKIE_NAME)


def session_workspace_id(session: Any) -> str:
    if session is None:
        return ""
    if isinstance(session, dict):
        return str(session.get(Gateway.WORKSPACE_ID, ""))
    return str(getattr(session, Gateway.WORKSPACE_ID, ""))


def _ingest(hub: RealtimeHub, cluster_id: str, payload: Any) -> bool:
    """agent 수신 1건 처리. 계약 위반/권한 밖 클러스터는 False(연결 종료)."""
    try:
        message = parse_realtime_message(payload)
    except ValueError:
        LOGGER.warning(
            "agent_message_invalid", extra={CONTEXT_KEY: {Gateway.CLUSTER_ID: cluster_id}}
        )
        return False
    if isinstance(message, PingMessage):
        return True
    if isinstance(message, LiveSummaryMessage):
        if message.cluster_id != cluster_id or message.summary.cluster_id != cluster_id:
            return False
        hub.publish_summary(message.summary)
        return True
    if isinstance(message, ResourceDelta):
        if delta_key_parts(message.key)[0] != cluster_id:
            return False
        hub.publish_delta(message)
        return True
    return False  # hello/snapshot 은 gateway → client 방향 전용


async def _browser_send_loop(websocket: WebSocket, hub: RealtimeHub, client: BrowserClient) -> None:
    """접속 인사(hello + snapshot) 후 queue 를 소비. 한가하면 ping 으로 keepalive."""
    await websocket.send_json(HelloMessage().model_dump(mode="json"))
    await websocket.send_json(hub.snapshot_for(client.subscription).model_dump(mode="json"))
    while True:
        try:
            message = await asyncio.wait_for(
                client.queue.get(), timeout=BROWSER_PING_INTERVAL_SECONDS
            )
        except TimeoutError:
            await websocket.send_json(PingMessage(ts=time.time()).model_dump(mode="json"))
            continue
        await websocket.send_json(message.model_dump(mode="json"))


def main() -> None:
    FastApiService(GATEWAY_NAME, create_app).run()


if __name__ == "__main__":
    main()
