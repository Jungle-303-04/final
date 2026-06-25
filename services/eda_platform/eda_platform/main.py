from __future__ import annotations

import argparse
import asyncio
import os

from uvicorn import Config, Server

from eda_platform.core import env
from eda_platform.gateway import create_app
from eda_platform.target_agent import TargetClusterAgent, run_fake_telemetry, run_node_collector
from eda_platform.workflows import WORKERS, WorkerRuntime


async def run_gateway() -> None:
    await Server(
        Config(create_app(), host="0.0.0.0", port=int(env("PORT", "8000")), log_level="info")
    ).serve()


async def amain() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "role", help="gateway, worker role, target-agent, fake telemetry role, or node-collector"
    )
    role = parser.parse_args().role
    os.environ.setdefault("SERVICE_NAME", role)

    if role == "gateway":
        await run_gateway()
        return
    if role == "target-agent":
        await TargetClusterAgent().run()
        return
    if role == "node-collector":
        await run_node_collector()
        return
    if role in {"fake-prometheus", "fake-loki", "fake-otel"}:
        await run_fake_telemetry(role.replace("fake-", ""))
        return
    if role in WORKERS:
        subject, handler_factory = WORKERS[role]
        await WorkerRuntime(role, subject, handler_factory).run()
        return
    raise SystemExit(f"unknown role: {role}")


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
