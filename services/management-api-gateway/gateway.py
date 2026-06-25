from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from auth import OAuthAuthService, RedisSessionStore
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from packages.shared.constants import (
    DEFAULT_TARGET_CLUSTER_ID,
    GITHUB_PROVIDER,
    LOCAL_USER_ID,
    REQUIRED_GITHUB_SCOPE,
    EventSubject,
)
from packages.shared.core import Database, EventBus, publish_and_record, wait_for_database
from packages.shared.schemas import (
    AgentConnectRequest,
    AgentEvidenceRequest,
    CommandRequest,
    CommandResultRequest,
    GitHubWebhookRequest,
    OAuthCallbackRequest,
)

SERVICE_NAME = "management-api-gateway"
APP_TITLE = "Management API Gateway"
APP_VERSION = "0.1.0"
DEFAULT_SCOPES = "profile,email"
DEFAULT_AGENT_COMMAND_POLL_SECONDS = 10
MAX_COMMAND_POLL_SECONDS = 30
COMMAND_POLL_SLEEP_SECONDS = 1
DASHBOARD_STREAM_INTERVAL_SECONDS = 2
COMMAND_NOT_FOUND_STATUS_CODE = 404
GATEWAY_ERROR_STATUS_CODE = 500
COMMAND_NOT_FOUND_MESSAGE = "command not found"
COMMAND_STATUS_QUEUED = "queued"
COMMAND_STATUS_LEASED = "leased"
EVENT_STREAM_MEDIA_TYPE = "text/event-stream"


class ManagementApiGateway:
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

        @app.get("/healthz")
        async def healthz() -> dict[str, str]:
            return {"status": "ok", "service": SERVICE_NAME}

        @app.get("/readyz")
        async def readyz() -> dict[str, str]:
            self.db.init()
            return {"status": "ready"}

        @app.get("/auth/session")
        async def session(request: Request) -> dict[str, Any]:
            current = await self.auth.require_session(request)
            return {"authenticated": True, "user_id": current.user_id, "roles": current.roles}

        @app.get("/auth/oauth/{provider}/start")
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
                    "provider": provider,
                    "user_id": user_id,
                    "scopes": scope_list,
                    "state": response["state"],
                },
            )
            return response

        @app.post("/auth/oauth/{provider}/callback")
        async def oauth_callback(provider: str, payload: OAuthCallbackRequest) -> dict[str, Any]:
            result = await self.auth.callback(provider, payload.model_dump())
            account = result["account"]
            evt = await publish_and_record(
                self.bus, self.db, EventSubject.OAUTH_CONNECTED, SERVICE_NAME, account
            )
            return {
                "accepted": True,
                "event_id": evt["event_id"],
                "token_ref": account["token_ref"],
                "session": result["session"],
            }

        @app.post("/github/webhook")
        async def github_webhook(payload: GitHubWebhookRequest) -> dict[str, Any]:
            evt = await publish_and_record(
                self.bus,
                self.db,
                EventSubject.GIT_WEBHOOK_RECEIVED,
                SERVICE_NAME,
                payload.model_dump(),
            )
            return {"accepted": True, "event": evt}

        @app.post("/agent/connect")
        async def agent_connect(payload: AgentConnectRequest) -> dict[str, Any]:
            evt = await publish_and_record(
                self.bus,
                self.db,
                EventSubject.AGENT_CONNECTED,
                SERVICE_NAME,
                payload.model_dump(),
            )
            return {"accepted": True, "event_id": evt["event_id"]}

        @app.post("/agent/evidence")
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
                "accepted": True,
                "event_id": evt["event_id"],
                "correlation_id": evt["correlation_id"],
            }

        @app.post("/commands")
        async def commands(request: Request, payload: CommandRequest) -> dict[str, Any]:
            current = await self.auth.require_session(request)
            command = payload.model_dump()
            command["requested_by"] = current.user_id
            evt = await publish_and_record(
                self.bus, self.db, EventSubject.COMMAND_REQUESTED, SERVICE_NAME, command
            )
            return {
                "accepted": True,
                "event_id": evt["event_id"],
                "correlation_id": evt["correlation_id"],
            }

        @app.get("/agent/commands/poll")
        async def poll_command(
            cluster_id: str = DEFAULT_TARGET_CLUSTER_ID,
            timeout: int = DEFAULT_AGENT_COMMAND_POLL_SECONDS,
        ) -> dict[str, Any]:
            deadline = time.time() + min(timeout, MAX_COMMAND_POLL_SECONDS)
            while time.time() < deadline:
                with self.db.connect() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            select command_id, correlation_id, cluster_id, action, payload
                            from agent_commands
                            where cluster_id = %s and status = %s
                            order by created_at
                            limit 1
                            """,
                            (cluster_id, COMMAND_STATUS_QUEUED),
                        )
                        row = cur.fetchone()
                        if row:
                            cur.execute(
                                """
                                update agent_commands
                                set status = %s, updated_at = now()
                                where command_id = %s
                                """,
                                (COMMAND_STATUS_LEASED, row["command_id"]),
                            )
                            return {"command": row}
                await asyncio.sleep(COMMAND_POLL_SLEEP_SECONDS)
            return {"command": None}

        @app.post("/agent/commands/{command_id}/result")
        async def command_result(command_id: str, payload: CommandResultRequest) -> dict[str, Any]:
            result = payload.model_dump()
            with self.db.connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        update agent_commands
                        set status = %s, result = %s, updated_at = now()
                        where command_id = %s
                        returning correlation_id
                        """,
                        (result["status"], json.dumps(result), command_id),
                    )
                    row = cur.fetchone()
            if not row:
                raise HTTPException(
                    status_code=COMMAND_NOT_FOUND_STATUS_CODE,
                    detail=COMMAND_NOT_FOUND_MESSAGE,
                )
            evt = await publish_and_record(
                self.bus,
                self.db,
                EventSubject.COMMAND_COMPLETED,
                SERVICE_NAME,
                {"command_id": command_id, "result": result},
                row["correlation_id"],
            )
            return {"accepted": True, "event_id": evt["event_id"]}

        @app.get("/dashboard/query")
        async def dashboard_query(request: Request) -> dict[str, Any]:
            await self.auth.require_session(request)
            return {"cards": self.db.list_dashboard()}

        @app.get("/dashboard/stream")
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
            return JSONResponse(status_code=GATEWAY_ERROR_STATUS_CODE, content={"error": str(exc)})


def create_app() -> FastAPI:
    return ManagementApiGateway().app
