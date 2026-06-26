from __future__ import annotations

from agent import run_fake_telemetry
from settings import FAKE_OTEL_SERVICE_NAME, OTEL_TELEMETRY_KIND

from packages.runtime.service import AsyncService


async def run() -> None:
    await run_fake_telemetry(OTEL_TELEMETRY_KIND)


def main() -> None:
    AsyncService(FAKE_OTEL_SERVICE_NAME, run).run()


if __name__ == "__main__":
    main()
