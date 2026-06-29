from __future__ import annotations

from poller import GitHubPoller
from settings import Settings

from packages.runtime.service import AsyncService


async def run() -> None:
    await GitHubPoller().run()


def main() -> None:
    AsyncService(Settings.SERVICE_NAME, run).run()


if __name__ == "__main__":
    main()
