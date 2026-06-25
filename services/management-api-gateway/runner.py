from __future__ import annotations

from gateway import create_app
from uvicorn import Config, Server

from packages.shared.constants import DEFAULT_HTTP_PORT
from packages.shared.core import env

HOST = "0.0.0.0"
LOG_LEVEL = "info"
PORT_ENV = "PORT"


async def run() -> None:
    await Server(
        Config(
            create_app(), host=HOST, port=int(env(PORT_ENV, DEFAULT_HTTP_PORT)), log_level=LOG_LEVEL
        )
    ).serve()
