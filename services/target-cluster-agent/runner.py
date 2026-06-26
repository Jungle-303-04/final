from __future__ import annotations

from agent import TargetClusterAgent, run_fake_telemetry

PROMETHEUS_KIND = "prometheus"
LOKI_KIND = "loki"
OTEL_KIND = "otel"


async def run() -> None:
    await TargetClusterAgent().run()


async def run_fake_prometheus() -> None:
    await run_fake_telemetry(PROMETHEUS_KIND)


async def run_fake_loki() -> None:
    await run_fake_telemetry(LOKI_KIND)


async def run_fake_otel() -> None:
    await run_fake_telemetry(OTEL_KIND)
