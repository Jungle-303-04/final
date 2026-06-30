from __future__ import annotations

from agent import run_fake_telemetry
from settings import Settings

from packages.config.settings import required_env
from packages.runtime.service import AsyncService

TELEMETRY_KIND_ENV = "FAKE_TELEMETRY_KIND"
SERVICE_NAMES = {
    Settings.PROMETHEUS_TELEMETRY_KIND: Settings.FAKE_PROMETHEUS_SERVICE_NAME,
    Settings.LOKI_TELEMETRY_KIND: Settings.FAKE_LOKI_SERVICE_NAME,
    Settings.OTEL_TELEMETRY_KIND: Settings.FAKE_OTEL_SERVICE_NAME,
}


def telemetry_kind() -> str:
    kind = required_env(TELEMETRY_KIND_ENV)
    if kind not in SERVICE_NAMES:
        allowed = ", ".join(sorted(SERVICE_NAMES))
        raise RuntimeError(f"{TELEMETRY_KIND_ENV} must be one of: {allowed}")
    return kind


def main() -> None:
    kind = telemetry_kind()

    async def run() -> None:
        await run_fake_telemetry(kind)

    AsyncService(SERVICE_NAMES[kind], run).run()


if __name__ == "__main__":
    main()
