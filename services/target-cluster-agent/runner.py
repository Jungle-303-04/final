from __future__ import annotations

from agent import TargetClusterAgent
from settings import TARGET_AGENT_SERVICE_NAME

from packages.runtime.service import AsyncService


async def run() -> None:
    await TargetClusterAgent().run()


def main() -> None:
    AsyncService(TARGET_AGENT_SERVICE_NAME, run).run()


if __name__ == "__main__":
    main()
