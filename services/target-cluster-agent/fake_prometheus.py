from __future__ import annotations

from agent import run_fake_telemetry

from packages.runtime.service import AsyncService

SERVICE_NAME = "fake-prometheus"
TELEMETRY_KIND = "prometheus"


async def run() -> None:
    await run_fake_telemetry(TELEMETRY_KIND)


def main() -> None:
    AsyncService(SERVICE_NAME, run).run()


if __name__ == "__main__":
    main()
