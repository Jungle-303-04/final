from __future__ import annotations

# ruff: noqa: E402
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from gateway import create_app
from uvicorn import Config, Server

from packages.shared.constants import DEFAULT_HTTP_PORT
from packages.shared.core import env
from packages.shared.service_bootstrap import run_service

SERVICE_NAME = "management-api-gateway"
HOST = "0.0.0.0"
LOG_LEVEL = "info"
PORT_ENV = "PORT"


async def run() -> None:
    await Server(
        Config(
            create_app(), host=HOST, port=int(env(PORT_ENV, DEFAULT_HTTP_PORT)), log_level=LOG_LEVEL
        )
    ).serve()


def main() -> None:
    run_service(SERVICE_NAME, run)


if __name__ == "__main__":
    main()
