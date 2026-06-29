from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from auth import OAuthAuthService, RedisSessionStore
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from settings import Settings

from domains.command.router import router as command_router
from domains.identity.router import router as identity_router
from domains.projection.router import router as projection_router
from domains.rca.router import router as rca_router
from packages.config.constants import CommandStatus
from packages.config.settings import env
from packages.contracts.event_bus.bodies import (
    GitWebhookReceivedBody,
)
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway
from packages.contracts.gateway.requests import (
    AgentConnectRequest,
    GitHubWebhookRequest,
)
from packages.events.bus import NatsEventBus
from packages.runtime.gateway import ApiEventGateway
from packages.runtime.metrics import render_labeled_counter, render_prometheus_metrics
from packages.storage.database import Database, wait_for_database


class ApiGateway:
    def __init__(self) -> None:
        self.db = Database()
        self.bus = NatsEventBus()
        self.events = ApiEventGateway(self.bus, self.db, Settings.SERVICE_NAME)
        self.sessions = RedisSessionStore()
        self.auth = OAuthAuthService(self.db, self.sessions)
        self.app = FastAPI(
            title=Settings.APP_TITLE, version=Settings.APP_VERSION, lifespan=self.lifespan
        )
        # 도메인 router 가 Depends 로 가져갈 공유 객체(클로저 대신 DI).
        self.app.state.db = self.db
        self.app.state.events = self.events
        self.app.state.auth = self.auth
        self.configure_routes()

    @asynccontextmanager
    async def lifespan(self, _app: FastAPI) -> AsyncIterator[None]:
        await wait_for_database(self.db)
        await self.sessions.connect()
        await self.bus.connect()
        try:
            yield
        finally:
            await self.bus.close()
            await self.sessions.close()
            await self.db.dispose_async()
            self.db.dispose()

    def configure_routes(self) -> None:
        # 라우트는 도메인별로 등록(가독성). 각 그룹은 self 클로저로 events/db/auth 사용.
        app = self.app
        self._register_health_routes(app)
        app.include_router(identity_router)  # identity 도메인 라우터(DI + 가드)
        self._register_ingest_routes(app)
        app.include_router(rca_router)  # rca 도메인 라우터(agent evidence)
        app.include_router(command_router)  # command 도메인 라우터(+agent 가드 필터)
        self._register_dead_letter_routes(app)
        app.include_router(projection_router)  # projection 도메인 라우터(대시보드)
        self._register_metrics_routes(app)
        self._register_error_handler(app)

    def _register_health_routes(self, app: FastAPI) -> None:
        @app.get(gateway_routes.HEALTHZ_PATH)
        async def healthz() -> dict[str, str]:
            return {Gateway.STATUS: Gateway.STATUS_OK, Gateway.SERVICE: Settings.SERVICE_NAME}

        @app.get(gateway_routes.READYZ_PATH)
        async def readyz() -> dict[str, str]:
            self.db.init()
            return {Gateway.STATUS: Gateway.STATUS_READY}

    def _require_agent(self, request: Request) -> None:
        # fail-closed: AGENT_TOKEN 미설정이면 약한 기본값으로 열지 않고 거부.
        expected = env(Settings.AGENT_TOKEN_ENV, "")
        if not expected:
            raise HTTPException(status_code=503, detail=Settings.AGENT_AUTH_NOT_CONFIGURED_MESSAGE)
        if request.headers.get(Settings.AGENT_TOKEN_HEADER) != expected:
            raise HTTPException(status_code=401, detail=Settings.AGENT_AUTH_REQUIRED_MESSAGE)

    def _register_ingest_routes(self, app: FastAPI) -> None:
        @app.post(gateway_routes.GITHUB_WEBHOOK_PATH)
        async def github_webhook(payload: GitHubWebhookRequest) -> dict[str, Any]:
            accepted = await self.events.accept_body(GitWebhookReceivedBody(**payload.model_dump()))
            return accepted.response(include_event=True)

        @app.post(gateway_routes.AGENT_CONNECT_PATH)
        async def agent_connect(request: Request, payload: AgentConnectRequest) -> dict[str, Any]:
            self._require_agent(request)
            accepted = await self.events.accept(EventSubject.AGENT_CONNECTED, payload.model_dump())
            return accepted.response()

    def _register_dead_letter_routes(self, app: FastAPI) -> None:
        @app.get(gateway_routes.DEAD_LETTERS_PATH)
        async def dead_letters(
            request: Request, limit: int = Settings.DEFAULT_DEAD_LETTER_LIMIT
        ) -> dict[str, Any]:
            await self.auth.require_session(request)
            bounded_limit = max(1, min(limit, Settings.MAX_DEAD_LETTER_LIMIT))
            return {Gateway.DEAD_LETTERS: self.db.list_dead_letters(bounded_limit)}

        @app.post(gateway_routes.DEAD_LETTER_REPLAY_PATH)
        async def replay_dead_letter(request: Request, dead_letter_id: int) -> dict[str, Any]:
            await self.auth.require_session(request)
            dead_letter = self.db.get_dead_letter(dead_letter_id)
            if dead_letter is None:
                raise HTTPException(
                    status_code=Settings.COMMAND_NOT_FOUND_STATUS_CODE,
                    detail=Settings.DEAD_LETTER_NOT_FOUND_MESSAGE,
                )
            if dead_letter[Gateway.STATUS] == Gateway.STATUS_REPLAYED:
                raise HTTPException(
                    status_code=Settings.CONFLICT_STATUS_CODE,
                    detail=Settings.DEAD_LETTER_REPLAYED_MESSAGE,
                )

            accepted = await self.events.accept(
                dead_letter["original_subject"],
                dead_letter[Gateway.PAYLOAD],
                dead_letter[Gateway.CORRELATION_ID],
                dead_letter["original_event_id"],
            )
            self.db.mark_dead_letter_replayed(dead_letter_id, accepted.event.event_id)
            return {
                Gateway.ACCEPTED: True,
                Gateway.DEAD_LETTER_ID: dead_letter_id,
                Gateway.REPLAY_EVENT: accepted.event,
            }

    def _register_metrics_routes(self, app: FastAPI) -> None:
        @app.get("/metrics")
        async def metrics() -> PlainTextResponse:
            scalar_metrics = {
                "event_dead_letters_open_total": self.db.open_dead_letter_count(),
                "outbox_pending_total": self.db.outbox_pending_count(),
                "command_queue_oldest_age_seconds": self.db.oldest_command_age_seconds(
                    CommandStatus.QUEUED
                ),
                "command_leased_oldest_age_seconds": self.db.oldest_command_age_seconds(
                    CommandStatus.LEASED
                ),
            }
            body = render_prometheus_metrics(scalar_metrics)
            body += render_labeled_counter(
                "event_processing_status_total",
                self.db.event_processing_status_counts(),
                "status",
            )
            body += render_labeled_counter(
                "command_status_total", self.db.command_status_counts(), "status"
            )
            return PlainTextResponse(body, media_type="text/plain; version=0.0.4")

    def _register_error_handler(self, app: FastAPI) -> None:
        @app.exception_handler(Exception)
        async def unhandled(_request: Request, exc: Exception) -> JSONResponse:
            print(f"gateway error: {exc}", flush=True)
            return JSONResponse(
                status_code=Settings.GATEWAY_ERROR_STATUS_CODE, content={Gateway.ERROR: str(exc)}
            )


def create_app() -> FastAPI:
    return ApiGateway().app
