from __future__ import annotations

from enum import StrEnum


class DashboardStatus(StrEnum):
    RUNNING = "running"
    DONE = "done"
    ATTENTION = "attention"
