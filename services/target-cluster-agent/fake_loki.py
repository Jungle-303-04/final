from __future__ import annotations

# ruff: noqa: E402
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from agent import run_fake_telemetry

from packages.shared.service_bootstrap import run_service

SERVICE_NAME = "fake-loki"
TELEMETRY_KIND = "loki"


async def run() -> None:
    await run_fake_telemetry(TELEMETRY_KIND)


def main() -> None:
    run_service(SERVICE_NAME, run)


if __name__ == "__main__":
    main()
