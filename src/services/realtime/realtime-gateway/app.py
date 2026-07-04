"""realtime-gateway — cluster-agent live stream 을 browser 로 fan-out 하는 실시간 게이트웨이.

경로: cluster-agent --(outbound WS /live/agent)--> hub cache --(WS /live/browser)--> browser.
node-collector 는 여기 연결하지 않음 — /metrics 는 Prometheus scrape 경로를 유지함.
agent 인증은 api-gateway 와 동일한 per-cluster 토큰(x-agent-token 해시 → DB 조회)을 재사용함.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import PlainTextResponse
from hub import BrowserClient, RealtimeHub

from domains.identity.dependencies import AGENT_TOKEN_HEADER, hash_agent_token
from packages.config.logs import CONTEXT_KEY, get_logger
from packages.contracts.gateway.fields import Gateway
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


def database_authenticator(db: Database) -> AgentAuthenticator:
    """api-gateway 의 require_cluster_agent 와 동일한 인증 경로(해시 조회) 재사용."""

    def authenticate(token: str) -> Any:
        if not token:
            return None
        return db.authenticate_cluster_agent(hash_agent_token(token))

    return authenticate


def create_app(
    db: Database | None = None,
    authenticate_agent: AgentAuthenticator | None = None,
) -> FastAPI:
    if authenticate_agent is None:
        db = db or Database()
        authenticate_agent = database_authenticator(db)

    hub = RealtimeHub()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if db is not None:
            await wait_for_database(db)
        yield

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
        if identity is None:
            await websocket.close(code=CLOSE_UNAUTHORIZED)
            return
        cluster_id = str(identity[Gateway.CLUSTER_ID])
        requested_cluster = websocket.query_params.get(Gateway.CLUSTER_ID, cluster_id)
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
