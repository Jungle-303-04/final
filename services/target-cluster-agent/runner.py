from __future__ import annotations

from agent import TargetClusterAgent

from packages.runtime.service import AsyncService

SERVICE_NAME = "target-cluster-agent"


async def run() -> None:
    await TargetClusterAgent().run()


def main() -> None:
    AsyncService(SERVICE_NAME, run).run()


if __name__ == "__main__":
    main()
