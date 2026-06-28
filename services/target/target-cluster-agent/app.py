from __future__ import annotations

from agent import TargetClusterAgent
from settings import Settings

from packages.runtime.service import AsyncService


async def run() -> None:
    await TargetClusterAgent().run()


def main() -> None:
    AsyncService(Settings.TARGET_AGENT_SERVICE_NAME, run).run()


if __name__ == "__main__":
    main()
