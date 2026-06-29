from __future__ import annotations

from agent import run_fake_telemetry
from settings import Settings

from packages.runtime.service import AsyncService


async def run() -> None:
    await run_fake_telemetry(Settings.OTEL_TELEMETRY_KIND)


def main() -> None:
    AsyncService(Settings.FAKE_OTEL_SERVICE_NAME, run).run()


if __name__ == "__main__":
    main()
