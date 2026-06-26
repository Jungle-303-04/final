from __future__ import annotations

from dataclasses import dataclass

ALL_EVENTS_SUBJECT = ">"


@dataclass(frozen=True)
class WorkerSubscription:
    service_name: str
    subject: str
    durable_name: str | None = None

    @property
    def durable(self) -> str:
        return self.durable_name or self.service_name
