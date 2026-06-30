from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from auth import PasswordAuthService, SessionAuthService
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from settings import Settings

from domains.command.router import router as command_router
from domains.gitops.router import router as gitops_router
from domains.identity.dependencies import require_admin_session, require_agent
from domains.identity.router import router as identity_router
from domains.projection.router import router as projection_router
from domains.rca.router import router as rca_router
from domains.target.router import router as target_router
from packages.config.constants import Auth, CommandStatus
from packages.config.constants import Redis as RedisConfig
from packages.config.logs import CONTEXT_KEY, get_logger
from packages.config.settings import env
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway
from packages.contracts.gateway.requests import AgentConnectRequest
from packages.contracts.gateway.responses import (
    AcceptedResponse,
    DeadLetterReplayResponse,
    DeadLettersResponse,
    HealthResponse,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, AccountRole
from packages.events.bus import NatsEventBus
from packages.runtime.gateway import ApiEventGateway
from packages.runtime.metrics import render_labeled_counter, render_prometheus_metrics
from packages.storage.database import Database, wait_for_database
from packages.storage.sessions import RedisSessionStore, RedisSessionStoreConfig

LOGGER = get_logger(__name__)


class ApiGateway:
    def __init__(self) -> None:
        self.db = Database()
        self.bus = NatsEventBus()
        self.events = ApiEventGateway(self.bus, self.db, Settings.SERVICE_NAME)
        self.sessions = RedisSessionStore(self._session_store_config())
        self.auth = SessionAuthService(self.sessions)
        self.password_auth = PasswordAuthService(self.db, self.sessions)
        self.app = FastAPI(
            title=Settings.APP_TITLE, version=Settings.APP_VERSION, lifespan=self.lifespan
        )
        # 도메인 router 가 Depends 로 가져갈 공유 객체(클로저 대신 DI).
        self.app.state.db = self.db
        self.app.state.events = self.events
        self.app.state.auth = self.auth
        self.app.state.password_auth = self.password_auth
        self.configure_routes()

    @staticmethod
    def _session_store_config() -> RedisSessionStoreConfig:
        return RedisSessionStoreConfig(
            url=env(Settings.REDIS_URL_ENV, RedisConfig.DEFAULT_URL),
            ttl_seconds=int(env(Settings.SESSION_TTL_ENV, Auth.DEFAULT_SESSION_TTL_SECONDS)),
            key_prefix=Settings.SESSION_KEY_PREFIX,
            token_bytes=Settings.SESSION_TOKEN_BYTES,
            default_roles=(AccountRole.MEMBER.value,),
            default_workspace_id=DEFAULT_WORKSPACE_ID,
            rate_limit_key_prefix=Settings.RATE_LIMIT_KEY_PREFIX,
            rate_limit=Settings.DEFAULT_RATE_LIMIT,
            rate_limit_window_seconds=Settings.RATE_LIMIT_WINDOW_SECONDS,
            email_verification_key_prefix=Settings.EMAIL_VERIFICATION_KEY_PREFIX,
            email_verification_ttl_seconds=Settings.EMAIL_VERIFICATION_TTL_SECONDS,
            email_verification_token_bytes=Settings.EMAIL_VERIFICATION_TOKEN_BYTES,
        )

    @asynccontextmanager
    async def lifespan(self, _app: FastAPI) -> AsyncIterator[None]:
        await wait_for_database(self.db)
        self.db.init()  # 스키마 보장은 시작 시 1회만(readyz 프로브에서 DDL 돌리지 않도록).
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
        app.include_router(target_router)  # target 등록 → agent/RBAC 설치 manifest 생성/적용
        app.include_router(gitops_router)  # gitops 도메인 라우터(webhook + HMAC 서명 검증)
        self._register_ingest_routes(app)
        app.include_router(rca_router)  # rca 도메인 라우터(agent evidence)
        app.include_router(command_router)  # command 도메인 라우터(+agent 가드 필터)
        self._register_dead_letter_routes(app)
        app.include_router(projection_router)  # projection 도메인 라우터(대시보드)
        self._register_metrics_routes(app)
        self._register_error_handler(app)

    def _register_health_routes(self, app: FastAPI) -> None:
        @app.get(gateway_routes.HEALTHZ_PATH, response_model=HealthResponse)
        async def healthz() -> HealthResponse:
            return HealthResponse(status=Gateway.STATUS_OK, service=Settings.SERVICE_NAME)

        @app.get(
            gateway_routes.READYZ_PATH,
            response_model=HealthResponse,
            response_model_exclude_none=True,
        )
        async def readyz() -> HealthResponse:
            # 가벼운 연결 확인만(스키마 보장은 시작 시 lifespan 에서 1회). DDL 안 돌린다.
            self.db.check_ready()
            return HealthResponse(status=Gateway.STATUS_READY)

    def _register_ingest_routes(self, app: FastAPI) -> None:
        @app.post(gateway_routes.AGENT_CONNECT_PATH, response_model=AcceptedResponse)
        async def agent_connect(request: Request, payload: AgentConnectRequest) -> AcceptedResponse:
            require_agent(request)
            accepted = await self.events.accept(EventSubject.AGENT_CONNECTED, payload.model_dump())
            return AcceptedResponse(
                accepted=True,
                event_id=accepted.event.event_id,
                correlation_id=accepted.event.correlation_id,
            )

    def _register_dead_letter_routes(self, app: FastAPI) -> None:
        @app.get(gateway_routes.DEAD_LETTERS_PATH, response_model=DeadLettersResponse)
        async def dead_letters(
            request: Request, limit: int = Settings.DEFAULT_DEAD_LETTER_LIMIT
        ) -> DeadLettersResponse:
            # 전 테넌트 실패 이벤트 노출 → admin 만(일반 세션 금지).
            await require_admin_session(request)
            bounded_limit = max(1, min(limit, Settings.MAX_DEAD_LETTER_LIMIT))
            return DeadLettersResponse(dead_letters=self.db.list_dead_letters(bounded_limit))

        @app.post(
            gateway_routes.DEAD_LETTER_REPLAY_PATH,
            response_model=DeadLetterReplayResponse,
        )
        async def replay_dead_letter(
            request: Request, dead_letter_id: int
        ) -> DeadLetterReplayResponse:
            # 임의 이벤트 재발행 → admin 만.
            await require_admin_session(request)
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
            return DeadLetterReplayResponse(
                accepted=True,
                dead_letter_id=dead_letter_id,
                replay_event=accepted.event.to_dict(),
            )

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
            LOGGER.error(
                "gateway_unhandled_error",
                extra={CONTEXT_KEY: {"exception_type": type(exc).__name__}},
                exc_info=exc,
            )
            return JSONResponse(
                status_code=Settings.GATEWAY_ERROR_STATUS_CODE,
                content={Gateway.ERROR: Settings.GATEWAY_ERROR_MESSAGE},
            )


def create_app() -> FastAPI:
    return ApiGateway().app
