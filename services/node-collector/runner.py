from __future__ import annotations

from node_collector import run
from settings import SERVICE_NAME

from packages.runtime.service import AsyncService

__all__ = ["run"]


def main() -> None:
    AsyncService(SERVICE_NAME, run).run()


if __name__ == "__main__":
    main()
