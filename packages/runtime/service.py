from __future__ import annotations

import asyncio
import os
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from fastapi import FastAPI
from uvicorn import Config, Server

from packages.config.constants import Runtime
from packages.config.logs import configure_logging
from packages.config.settings import env
from packages.contracts.event_bus.interfaces import EventClient, EventHandler
from packages.contracts.event_bus.subscriptions import WorkerSubscription
from packages.runtime.worker import EventHandlerSpec, WorkerRuntime
from packages.storage.database import Database

AsyncRunner = Callable[[], Awaitable[None]]
FastApiFactory = Callable[[], FastAPI]
WorkerHandlerFactory = Callable[[EventClient, Database], EventHandler]

DEFAULT_HTTP_HOST = "0.0.0.0"
DEFAULT_LOG_LEVEL = "info"
PORT_ENV = "PORT"


@dataclass(frozen=True)
class AsyncService:
    service_name: str
    runner: AsyncRunner

    def run(self) -> None:
        os.environ.setdefault(Runtime.SERVICE_NAME_ENV, self.service_name)
        configure_logging(self.service_name)
        asyncio.run(self.runner())


@dataclass(frozen=True)
class FastApiService:
    service_name: str
    app_factory: FastApiFactory
    host: str = DEFAULT_HTTP_HOST
    port_env: str = PORT_ENV
    default_port: str = Runtime.DEFAULT_HTTP_PORT
    log_level: str = DEFAULT_LOG_LEVEL

    def run(self) -> None:
        AsyncService(self.service_name, self.serve).run()

    async def serve(self) -> None:
        await Server(
            Config(
                self.app_factory(),
                host=self.host,
                port=int(env(self.port_env, self.default_port)),
                log_level=self.log_level,
            )
        ).serve()


@dataclass(frozen=True)
class WorkerService:
    service_name: str
    subject: str
    handler_factory: WorkerHandlerFactory
    durable_name: str | None = None

    @classmethod
    def from_subscription(
        cls,
        subscription: WorkerSubscription,
        handler_factory: WorkerHandlerFactory,
    ) -> WorkerService:
        return cls(
            subscription.service_name,
            subscription.subject,
            handler_factory,
            subscription.durable_name,
        )

    def run(self) -> None:
        AsyncService(self.service_name, self.serve).run()

    async def serve(self) -> None:
        spec = EventHandlerSpec(
            service_name=self.service_name,
            subject=self.subject,
            handler_factory=self.handler_factory,
            durable_name=self.durable_name,
        )
        await WorkerRuntime(spec).run()

