from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from eda_platform.auth import OAuthAuthService, RedisSessionStore
from eda_platform.core import Database, EventBus, publish_and_record, wait_for_database


class ManagementApiGateway:
    def __init__(self) -> None:
        self.db = Database()
        self.bus = EventBus()
        self.sessions = RedisSessionStore()
        self.auth = OAuthAuthService(self.db, self.sessions)
        self.app = FastAPI(title="EDA Management API Gateway", version="0.1.0")
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
            return {"status": "ok", "service": "management-api-gateway"}

        @app.get("/readyz")
        async def readyz() -> dict[str, str]:
            self.db.init()
            return {"status": "ready"}

        @app.get("/auth/session")
        async def session(request: Request) -> dict[str, Any]:
            current = await self.auth.require_session(request)
            return {"authenticated": True, "user_id": current.user_id, "roles": current.roles}

        @app.get("/auth/oauth/{provider}/start")
        async def oauth_start(provider: str, user_id: str = "local-user", scopes: str = "profile,email") -> dict[str, Any]:
            scope_list = [scope.strip() for scope in scopes.split(",") if scope.strip()]
            if provider == "github" and "repo" not in scope_list:
                scope_list.append("repo")
            response = await self.auth.start(provider, user_id, scope_list)
            await publish_and_record(
                self.bus,
                self.db,
                "oauth.start.requested",
                "management-api-gateway",
                {"provider": provider, "user_id": user_id, "scopes": scope_list, "state": response["state"]},
            )
            return response

        @app.post("/auth/oauth/{provider}/callback")
        async def oauth_callback(provider: str, request: Request) -> dict[str, Any]:
            payload = await request.json()
            result = await self.auth.callback(provider, payload)
            account = result["account"]
            evt = await publish_and_record(self.bus, self.db, "oauth.connected", "management-api-gateway", account)
            return {"accepted": True, "event_id": evt["event_id"], "token_ref": account["token_ref"], "session": result["session"]}

        @app.post("/github/webhook")
        async def github_webhook(request: Request) -> dict[str, Any]:
            payload = await request.json()
            evt = await publish_and_record(self.bus, self.db, "git.webhook.received", "management-api-gateway", payload)
            return {"accepted": True, "event": evt}

        @app.post("/agent/connect")
        async def agent_connect(request: Request) -> dict[str, Any]:
            payload = await request.json()
            evt = await publish_and_record(self.bus, self.db, "agent.connected", "management-api-gateway", payload)
            return {"accepted": True, "event_id": evt["event_id"]}

        @app.post("/agent/evidence")
        async def agent_evidence(request: Request) -> dict[str, Any]:
            payload = await request.json()
            evt = await publish_and_record(
                self.bus,
                self.db,
                "cluster.evidence.received",
                "management-api-gateway",
                payload,
                payload.get("correlation_id"),
            )
            return {"accepted": True, "event_id": evt["event_id"], "correlation_id": evt["correlation_id"]}

        @app.post("/commands")
        async def commands(request: Request) -> dict[str, Any]:
            current = await self.auth.require_session(request)
            payload = await request.json()
            payload["requested_by"] = current.user_id
            evt = await publish_and_record(self.bus, self.db, "command.requested", "management-api-gateway", payload)
            return {"accepted": True, "event_id": evt["event_id"], "correlation_id": evt["correlation_id"]}

        @app.get("/agent/commands/poll")
        async def poll_command(cluster_id: str = "target-cluster-01", timeout: int = 10) -> dict[str, Any]:
            deadline = time.time() + min(timeout, 30)
            while time.time() < deadline:
                with self.db.connect() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            select command_id, correlation_id, cluster_id, action, payload
                            from agent_commands
                            where cluster_id = %s and status = 'queued'
                            order by created_at
                            limit 1
                            """,
                            (cluster_id,),
                        )
                        row = cur.fetchone()
                        if row:
                            cur.execute("update agent_commands set status = 'leased', updated_at = now() where command_id = %s", (row["command_id"],))
                            return {"command": row}
                await asyncio.sleep(1)
            return {"command": None}

        @app.post("/agent/commands/{command_id}/result")
        async def command_result(command_id: str, request: Request) -> dict[str, Any]:
            payload = await request.json()
            with self.db.connect() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        update agent_commands
                        set status = %s, result = %s, updated_at = now()
                        where command_id = %s
                        returning correlation_id
                        """,
                        (payload.get("status", "completed"), json.dumps(payload), command_id),
                    )
                    row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="command not found")
            evt = await publish_and_record(
                self.bus,
                self.db,
                "command.completed",
                "management-api-gateway",
                {"command_id": command_id, "result": payload},
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
                        yield f"event: dashboard.updated\ndata: {encoded}\n\n"
                    await asyncio.sleep(2)

            return StreamingResponse(events(), media_type="text/event-stream")

        @app.exception_handler(Exception)
        async def unhandled(_request: Request, exc: Exception) -> JSONResponse:
            print(f"gateway error: {exc}", flush=True)
            return JSONResponse(status_code=500, content={"error": str(exc)})


def create_app() -> FastAPI:
    return ManagementApiGateway().app
