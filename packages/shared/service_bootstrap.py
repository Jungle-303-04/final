from __future__ import annotations

import asyncio
import os
from collections.abc import Awaitable, Callable

from packages.shared.constants import SERVICE_NAME_ENV

AsyncRunner = Callable[[], Awaitable[None]]


def run_service(service_name: str, runner: AsyncRunner) -> None:
    os.environ.setdefault(SERVICE_NAME_ENV, service_name)
    asyncio.run(runner())
