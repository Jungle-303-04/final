from __future__ import annotations

import argparse
import asyncio
import os
from collections.abc import Awaitable, Callable

from uvicorn import Config, Server

from service.gateway import create_app
from service.roles import ServiceRole
from service.shared.core import env
from service.target import TargetClusterAgent, run_fake_telemetry, run_node_collector
from service.workers import WORKERS, WorkerRuntime

RoleRunner = Callable[[], Awaitable[None]]


async def run_gateway() -> None:
    await Server(
        Config(create_app(), host="0.0.0.0", port=int(env("PORT", "8000")), log_level="info")
    ).serve()


async def run_target_agent() -> None:
    await TargetClusterAgent().run()


async def run_fake_prometheus() -> None:
    await run_fake_telemetry("prometheus")


async def run_fake_loki() -> None:
    await run_fake_telemetry("loki")


async def run_fake_otel() -> None:
    await run_fake_telemetry("otel")


def worker_runner(role: ServiceRole) -> RoleRunner:
    async def run_worker() -> None:
        subject, handler_factory = WORKERS[role.value]
        await WorkerRuntime(role.value, subject, handler_factory).run()

    return run_worker


def build_role_runners() -> dict[ServiceRole, RoleRunner]:
    return {
        ServiceRole.GATEWAY: run_gateway,
        ServiceRole.TARGET_AGENT: run_target_agent,
        ServiceRole.NODE_COLLECTOR: run_node_collector,
        ServiceRole.FAKE_PROMETHEUS: run_fake_prometheus,
        ServiceRole.FAKE_LOKI: run_fake_loki,
        ServiceRole.FAKE_OTEL: run_fake_otel,
        ServiceRole.GITOPS_SYNC_WORKER: worker_runner(ServiceRole.GITOPS_SYNC_WORKER),
        ServiceRole.COMMAND_WORKER: worker_runner(ServiceRole.COMMAND_WORKER),
        ServiceRole.RCA_WORKER: worker_runner(ServiceRole.RCA_WORKER),
        ServiceRole.DASHBOARD_PROJECTION_SERVICE: worker_runner(
            ServiceRole.DASHBOARD_PROJECTION_SERVICE
        ),
        ServiceRole.AUDIT_TIMELINE_SERVICE: worker_runner(ServiceRole.AUDIT_TIMELINE_SERVICE),
    }


def parse_args() -> ServiceRole:
    parser = argparse.ArgumentParser(description="Run one service role.")
    parser.add_argument("role", choices=ServiceRole.values())
    return ServiceRole.from_raw(parser.parse_args().role)


async def amain() -> None:
    role = parse_args()
    os.environ.setdefault("SERVICE_NAME", role.value)
    await build_role_runners()[role]()


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
