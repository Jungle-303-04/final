from __future__ import annotations

import argparse
import asyncio
import os

from packages.shared.constants import SERVICE_NAME_ENV
from packages.shared.roles import ServiceRole
from services.registry import load_runner, service_roles


def parse_args() -> ServiceRole:
    parser = argparse.ArgumentParser(description="Run one service process.")
    parser.add_argument("role", choices=service_roles())
    return ServiceRole.from_raw(parser.parse_args().role)


async def amain() -> None:
    role = parse_args()
    os.environ.setdefault(SERVICE_NAME_ENV, role.value)
    await load_runner(role)()


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
