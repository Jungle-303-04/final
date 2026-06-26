from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from auth import OAuthAuthService, RedisSessionStore
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from settings import (
    APP_TITLE,
    APP_VERSION,
    COMMAND_NOT_FOUND_MESSAGE,
    COMMAND_NOT_FOUND_STATUS_CODE,
    COMMAND_POLL_SLEEP_SECONDS,
    COMMAND_STATUS_LEASED,
    COMMAND_STATUS_QUEUED,
    CONFLICT_STATUS_CODE,
    DASHBOARD_STREAM_INTERVAL_SECONDS,
    DEAD_LETTER_NOT_FOUND_MESSAGE,
    DEAD_LETTER_REPLAYED_MESSAGE,
    DEFAULT_AGENT_COMMAND_POLL_SECONDS,
    DEFAULT_DEAD_LETTER_LIMIT,
    DEFAULT_SCOPES,
    EVENT_STREAM_MEDIA_TYPE,
    GATEWAY_ERROR_STATUS_CODE,
    MAX_COMMAND_POLL_SECONDS,
    MAX_DEAD_LETTER_LIMIT,
    SERVICE_NAME,
)

from packages.config.constants import (
    DEFAULT_TARGET_CLUSTER_ID,
    GITHUB_PROVIDER,
    LOCAL_USER_ID,
    REQUIRED_GITHUB_SCOPE,
)
from packages.contracts.event_bus.fields import CORRELATION_ID, EVENT_ID, PAYLOAD
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway import fields as gateway_fields
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    AgentConnectRequest,
    AgentEvidenceRequest,
    CommandRequest,
    CommandResultRequest,
    GitHubWebhookRequest,
    OAuthCallbackRequest,
)
from packages.events.bus import EventBus, publish_and_record
from packages.storage.database import Database, wait_for_database


class ApiGateway:
    def __init__(self) -> None:
        self.db = Database()
        self.bus = EventBus()
        self.sessions = RedisSessionStore()
        self.auth = OAuthAuthService(self.db, self.sessions)
        self.app = FastAPI(title=APP_TITLE, version=APP_VERSION)
        self.configure_routes()

    def configure_routes(self) -> None:
        app = self.app

        @app.on_event("startup")
        async def startup() -> None:
            await wait_for_database(self.db)
            await self.sessions.connect()
            await self.bus.connect()

        @app.on_event("shutdown")
        async def shutdown() -> None:
            await self.bus.close()
            await self.sessions.close()

        @app.get(gateway_routes.HEALTHZ_PATH)
        async def healthz() -> dict[str, str]:
            return {
                gateway_fields.STATUS: gateway_fields.STATUS_OK,
                gateway_fields.SERVICE: SERVICE_NAME,
            }

        @app.get(gateway_routes.READYZ_PATH)
        async def readyz() -> dict[str, str]:
            self.db.init()
            return {gateway_fields.STATUS: gateway_fields.STATUS_READY}

        @app.get(gateway_routes.AUTH_SESSION_PATH)
        async def session(request: Request) -> dict[str, Any]:
            current = await self.auth.require_session(request)
            return {
                gateway_fields.AUTHENTICATED: True,
                gateway_fields.USER_ID: current.user_id,
                gateway_fields.ROLES: current.roles,
            }

        @app.get(gateway_routes.OAUTH_START_PATH)
        async def oauth_start(
            provider: str, user_id: str = LOCAL_USER_ID, scopes: str = DEFAULT_SCOPES
        ) -> dict[str, Any]:
            scope_list = [scope.strip() for scope in scopes.split(",") if scope.strip()]
            if provider == GITHUB_PROVIDER and REQUIRED_GITHUB_SCOPE not in scope_list:
                scope_list.append(REQUIRED_GITHUB_SCOPE)
            response = await self.auth.start(provider, user_id, scope_list)
            await publish_and_record(
                self.bus,
                self.db,
                EventSubject.OAUTH_START_REQUESTED,
                SERVICE_NAME,
                {
                    gateway_fields.PROVIDER: provider,
                    gateway_fields.USER_ID: user_id,
                    gateway_fields.SCOPES: scope_list,
                    gateway_fields.STATE: response[gateway_fields.STATE],
                },
            )
            return response

        @app.post(gateway_routes.OAUTH_CALLBACK_PATH)
        async def oauth_callback(provider: str, payload: OAuthCallbackRequest) -> dict[str, Any]:
            result = await self.auth.callback(provider, payload.model_dump())
            account = result[gateway_fields.ACCOUNT]
            evt = await publish_and_record(
                self.bus, self.db, EventSubject.OAUTH_CONNECTED, SERVICE_NAME, account
            )
            return {
                gateway_fields.ACCEPTED: True,
                EVENT_ID: evt[EVENT_ID],
                gateway_fields.TOKEN_REF: account[gateway_fields.TOKEN_REF],
                gateway_fields.SESSION: result[gateway_fields.SESSION],
            }

        @app.post(gateway_routes.GITHUB_WEBHOOK_PATH)
        async def github_webhook(payload: GitHubWebhookRequest) -> dict[str, Any]:
            evt = await publish_and_record(
                self.bus,
                self.db,
                EventSubject.GIT_WEBHOOK_RECEIVED,
                SERVICE_NAME,
                payload.model_dump(),
            )
            return {gateway_fields.ACCEPTED: True, gateway_fields.EVENT: evt}

        @app.post(gateway_routes.AGENT_CONNECT_PATH)
        async def agent_connect(payload: AgentConnectRequest) -> dict[str, Any]:
            evt = await publish_and_record(
                self.bus,
                self.db,
                EventSubject.AGENT_CONNECTED,
                SERVICE_NAME,
                payload.model_dump(),
            )
            return {gateway_fields.ACCEPTED: True, EVENT_ID: evt[EVENT_ID]}

        @app.post(gateway_routes.AGENT_EVIDENCE_PATH)
        async def agent_evidence(payload: AgentEvidenceRequest) -> dict[str, Any]:
            evidence = payload.model_dump()
            evt = await publish_and_record(
                self.bus,
                self.db,
                EventSubject.CLUSTER_EVIDENCE_RECEIVED,
                SERVICE_NAME,
                evidence,
                payload.correlation_id,
            )
            return {
                gateway_fields.ACCEPTED: True,
                EVENT_ID: evt[EVENT_ID],
                CORRELATION_ID: evt[CORRELATION_ID],
            }

        @app.post(gateway_routes.COMMANDS_PATH)
        async def commands(request: Request, payload: CommandRequest) -> dict[str, Any]:
            current = await self.auth.require_session(request)
            command = payload.model_dump()
            command[gateway_fields.REQUESTED_BY] = current.user_id
            evt = await publish_and_record(
                self.bus, self.db, EventSubject.COMMAND_REQUESTED, SERVICE_NAME, command
            )
            return {
                gateway_fields.ACCEPTED: True,
                EVENT_ID: evt[EVENT_ID],
                CORRELATION_ID: evt[CORRELATION_ID],
            }

        @app.get(gateway_routes.DEAD_LETTERS_PATH)
        async def dead_letters(
            request: Request,
            limit: int = DEFAULT_DEAD_LETTER_LIMIT,
        ) -> dict[str, Any]:
            await self.auth.require_session(request)
            bounded_limit = max(1, min(limit, MAX_DEAD_LETTER_LIMIT))
            return {gateway_fields.DEAD_LETTERS: self.db.list_dead_letters(bounded_limit)}

        @app.post(gateway_routes.DEAD_LETTER_REPLAY_PATH)
        async def replay_dead_letter(request: Request, dead_letter_id: int) -> dict[str, Any]:
            await self.auth.require_session(request)
            dead_letter = self.db.get_dead_letter(dead_letter_id)
            if dead_letter is None:
                raise HTTPException(
                    status_code=COMMAND_NOT_FOUND_STATUS_CODE,
                    detail=DEAD_LETTER_NOT_FOUND_MESSAGE,
                )
            if dead_letter[gateway_fields.STATUS] == gateway_fields.STATUS_REPLAYED:
                raise HTTPException(
                    status_code=CONFLICT_STATUS_CODE,
                    detail=DEAD_LETTER_REPLAYED_MESSAGE,
                )

            evt = await publish_and_record(
                self.bus,
                self.db,
                dead_letter["original_subject"],
                SERVICE_NAME,
                dead_letter[PAYLOAD],
                dead_letter[CORRELATION_ID],
                dead_letter["original_event_id"],
            )
            self.db.mark_dead_letter_replayed(dead_letter_id, evt[EVENT_ID])
            return {
                gateway_fields.ACCEPTED: True,
                gateway_fields.DEAD_LETTER_ID: dead_letter_id,
                gateway_fields.REPLAY_EVENT: evt,
            }

        @app.get(gateway_routes.AGENT_COMMAND_POLL_PATH)
        async def poll_command(
            cluster_id: str = DEFAULT_TARGET_CLUSTER_ID,
            timeout: int = DEFAULT_AGENT_COMMAND_POLL_SECONDS,
        ) -> dict[str, Any]:
            deadline = time.time() + min(timeout, MAX_COMMAND_POLL_SECONDS)
            while time.time() < deadline:
                row = self.db.lease_agent_command(
                    cluster_id, COMMAND_STATUS_QUEUED, COMMAND_STATUS_LEASED
                )
                if row:
                    return {gateway_fields.COMMAND: row}
                await asyncio.sleep(COMMAND_POLL_SLEEP_SECONDS)
            return {gateway_fields.COMMAND: None}

        @app.post(gateway_routes.AGENT_COMMAND_RESULT_PATH)
        async def command_result(command_id: str, payload: CommandResultRequest) -> dict[str, Any]:
            result = payload.model_dump()
            correlation_id = self.db.complete_agent_command(command_id, result)
            if not correlation_id:
                raise HTTPException(
                    status_code=COMMAND_NOT_FOUND_STATUS_CODE,
                    detail=COMMAND_NOT_FOUND_MESSAGE,
                )
            evt = await publish_and_record(
                self.bus,
                self.db,
                EventSubject.COMMAND_COMPLETED,
                SERVICE_NAME,
                {gateway_fields.COMMAND_ID: command_id, gateway_fields.RESULT: result},
                correlation_id,
            )
            return {gateway_fields.ACCEPTED: True, EVENT_ID: evt[EVENT_ID]}

        @app.get(gateway_routes.DASHBOARD_QUERY_PATH)
        async def dashboard_query(request: Request) -> dict[str, Any]:
            await self.auth.require_session(request)
            return {gateway_fields.CARDS: self.db.list_dashboard()}

        @app.get(gateway_routes.DASHBOARD_STREAM_PATH)
        async def dashboard_stream(request: Request) -> StreamingResponse:
            await self.auth.require_session(request)

            async def events():
                last = ""
                while True:
                    encoded = json.dumps(self.db.list_dashboard(), default=str)
                    if encoded != last:
                        last = encoded
                        yield f"event: {EventSubject.DASHBOARD_UPDATED}\ndata: {encoded}\n\n"
                    await asyncio.sleep(DASHBOARD_STREAM_INTERVAL_SECONDS)

            return StreamingResponse(events(), media_type=EVENT_STREAM_MEDIA_TYPE)

        @app.exception_handler(Exception)
        async def unhandled(_request: Request, exc: Exception) -> JSONResponse:
            print(f"gateway error: {exc}", flush=True)
            return JSONResponse(
                status_code=GATEWAY_ERROR_STATUS_CODE,
                content={gateway_fields.ERROR: str(exc)},
            )


def create_app() -> FastAPI:
    return ApiGateway().app
