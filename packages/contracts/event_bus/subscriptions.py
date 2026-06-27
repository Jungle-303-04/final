from __future__ import annotations

from dataclasses import dataclass

ALL_EVENTS_SUBJECT = ">"


def durable_name(service_name: str, name: str | None = None) -> str:
    if name is None:
        return service_name
    return name


@dataclass(frozen=True)
class WorkerSubscription:
    service_name: str
    subject: str
    durable_name: str | None = None

    @property
    def durable(self) -> str:
        return durable_name(self.service_name, self.durable_name)
