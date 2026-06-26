from __future__ import annotations

# ruff: noqa: E402
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from node_collector import SERVICE_NAME, run

from packages.shared.service_bootstrap import run_service

__all__ = ["run"]


def main() -> None:
    run_service(SERVICE_NAME, run)


if __name__ == "__main__":
    main()
