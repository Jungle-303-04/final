from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from auth import OAuthAuthService, RedisSessionStore
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from settings import Settings

from packages.config.constants import Auth, CommandStatus, GitHub, Sandbox, Target
from packages.config.settings import env
from packages.contracts.auth import Actor
from packages.contracts.event_bus.bodies import (
    ClusterEvidenceReceivedBody,
    CommandCompletedBody,
    CommandRequestedBody,
    Diff,
    GitWebhookReceivedBody,
)
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway
from packages.contracts.gateway.requests import (
    AgentConnectRequest,
    AgentEvidenceRequest,
    CommandRequest,
    CommandResultRequest,
    CommandStartRequest,
    GitHubWebhookRequest,
    OAuthCallbackRequest,
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
        self._register_auth_routes(app)
        self._register_ingest_routes(app)
        self._register_command_routes(app)
        self._register_dead_letter_routes(app)
        self._register_dashboard_routes(app)
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
        expected = env(Settings.AGENT_TOKEN_ENV, Settings.DEFAULT_AGENT_TOKEN)
        supplied = request.headers.get(Settings.AGENT_TOKEN_HEADER)
        if supplied != expected:
            raise HTTPException(status_code=401, detail=Settings.AGENT_AUTH_REQUIRED_MESSAGE)

    @staticmethod
    def _command_diff(payload: CommandRequest) -> Diff:
        raw = payload.diff or {
            "resource": "manual/command",
            "namespace": payload.namespace,
            "desired_image": payload.action,
            "actual_image": "unknown",
            "risk": Sandbox.RISK_TAG,
        }
        return Diff.from_body(raw)

    async def _lease_next_command(
        self, cluster_id: str, agent_id: str, timeout: int
    ) -> dict[str, Any] | None:
        """롱폴 — 이 클러스터(cluster_id)의 다음 명령을 timeout 까지 대기하며 리스.

        agent 가 아웃바운드로 거는 단일 채널. 명령이 생기면 즉시 응답, 없으면 None.
        """
        deadline = time.time() + min(timeout, Settings.MAX_COMMAND_POLL_SECONDS)
        while time.time() < deadline:
            row = await self.db.lease_agent_command(
                cluster_id,
                Settings.COMMAND_STATUS_QUEUED,
                Settings.COMMAND_STATUS_LEASED,
                agent_id,
                Settings.COMMAND_LEASE_SECONDS,
            )
            if row:
                return row
            await asyncio.sleep(Settings.COMMAND_POLL_SLEEP_SECONDS)
        return None

    def _register_auth_routes(self, app: FastAPI) -> None:
        @app.get(gateway_routes.AUTH_SESSION_PATH)
        async def session(request: Request) -> dict[str, Any]:
            current = await self.auth.require_session(request)
            return {
                Gateway.AUTHENTICATED: True,
                Gateway.USER_ID: current.user_id,
                Gateway.ROLES: current.roles,
            }

        @app.get(gateway_routes.OAUTH_START_PATH)
        async def oauth_start(
            provider: str, user_id: str = Auth.LOCAL_USER_ID, scopes: str = Settings.DEFAULT_SCOPES
        ) -> dict[str, Any]:
            scope_list = [scope.strip() for scope in scopes.split(",") if scope.strip()]
            if provider == GitHub.PROVIDER and GitHub.REQUIRED_SCOPE not in scope_list:
                scope_list.append(GitHub.REQUIRED_SCOPE)
            response = await self.auth.start(provider, user_id, scope_list)
            await self.events.accept(
                EventSubject.OAUTH_START_REQUESTED,
                {
                    Gateway.PROVIDER: provider,
                    Gateway.USER_ID: user_id,
                    Gateway.SCOPES: scope_list,
                    Gateway.STATE: response[Gateway.STATE],
                },
            )
            return response

        @app.post(gateway_routes.OAUTH_CALLBACK_PATH)
        async def oauth_callback(provider: str, payload: OAuthCallbackRequest) -> dict[str, Any]:
            result = await self.auth.callback(provider, payload.model_dump())
            account = result[Gateway.ACCOUNT]
            accepted = await self.events.accept(EventSubject.OAUTH_CONNECTED, account)
            return {
                Gateway.ACCEPTED: True,
                Gateway.EVENT_ID: accepted.event.event_id,
                Gateway.TOKEN_REF: account[Gateway.TOKEN_REF],
                Gateway.SESSION: result[Gateway.SESSION],
            }

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

        @app.post(gateway_routes.AGENT_EVIDENCE_PATH)
        async def agent_evidence(request: Request, payload: AgentEvidenceRequest) -> dict[str, Any]:
            self._require_agent(request)
            accepted = await self.events.accept_body(
                ClusterEvidenceReceivedBody(**payload.model_dump(exclude={"correlation_id"})),
                payload.correlation_id,
            )
            return accepted.response()

    def _register_command_routes(self, app: FastAPI) -> None:
        @app.post(gateway_routes.COMMANDS_PATH)
        async def commands(request: Request, payload: CommandRequest) -> dict[str, Any]:
            current = await self.auth.require_session(request)
            accepted = await self.events.accept_body(
                CommandRequestedBody(
                    cluster_id=payload.cluster_id,
                    action=payload.action,
                    namespace=payload.namespace,
                    reason=payload.reason or "manual command request",
                    diff=self._command_diff(payload),
                    requested_by=current.user_id,
                ),
                actor=Actor(current.user_id, tuple(current.roles)),
            )
            return accepted.response()

        @app.get(gateway_routes.AGENT_COMMAND_POLL_PATH)
        async def poll_command(
            request: Request,
            cluster_id: str = Target.DEFAULT_CLUSTER_ID,
            agent_id: str = "target-agent",
            timeout: int = Settings.DEFAULT_AGENT_COMMAND_POLL_SECONDS,
        ) -> dict[str, Any]:
            # 멀티클러스터: 각 클러스터 agent 가 자기 cluster_id 로 아웃바운드 롱폴(인바운드 0).
            self._require_agent(request)
            row = await self._lease_next_command(cluster_id, agent_id, timeout)
            return {Gateway.COMMAND: row}

        @app.post(gateway_routes.AGENT_COMMAND_START_PATH)
        async def command_start(
            request: Request, command_id: str, payload: CommandStartRequest
        ) -> dict[str, Any]:
            self._require_agent(request)
            correlation_id = await self.db.start_agent_command(
                command_id,
                payload.lease_id,
                payload.agent_id,
                Settings.COMMAND_STATUS_RUNNING,
            )
            if not correlation_id:
                raise HTTPException(
                    status_code=Settings.COMMAND_NOT_FOUND_STATUS_CODE,
                    detail=Settings.COMMAND_NOT_FOUND_MESSAGE,
                )
            return {Gateway.ACCEPTED: True, Gateway.CORRELATION_ID: correlation_id}

        @app.post(gateway_routes.AGENT_COMMAND_RESULT_PATH)
        async def command_result(
            request: Request, command_id: str, payload: CommandResultRequest
        ) -> dict[str, Any]:
            self._require_agent(request)
            result = payload.model_dump()
            correlation_id = await self.db.complete_agent_command(
                command_id, result, payload.lease_id, payload.agent_id
            )
            if not correlation_id:
                raise HTTPException(
                    status_code=Settings.COMMAND_NOT_FOUND_STATUS_CODE,
                    detail=Settings.COMMAND_NOT_FOUND_MESSAGE,
                )
            accepted = await self.events.accept_body(
                CommandCompletedBody(command_id=command_id, result=result), correlation_id
            )
            return {Gateway.ACCEPTED: True, Gateway.EVENT_ID: accepted.event.event_id}

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

    def _register_dashboard_routes(self, app: FastAPI) -> None:
        @app.get(gateway_routes.DASHBOARD_QUERY_PATH)
        async def dashboard_query(request: Request) -> dict[str, Any]:
            await self.auth.require_session(request)
            return {Gateway.CARDS: self.db.list_dashboard()}

        @app.get(gateway_routes.DASHBOARD_STREAM_PATH)
        async def dashboard_stream(request: Request) -> StreamingResponse:
            await self.auth.require_session(request)

            async def events():
                last = ""
                while True:
                    encoded = json.dumps(self.db.list_dashboard(), default=str)
                    if encoded != last:
                        last = encoded
                        yield (f"event: {EventSubject.DASHBOARD_UPDATED}\ndata: {encoded}\n\n")
                    await asyncio.sleep(Settings.DASHBOARD_STREAM_INTERVAL_SECONDS)

            return StreamingResponse(events(), media_type=Settings.EVENT_STREAM_MEDIA_TYPE)

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
