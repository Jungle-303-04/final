from __future__ import annotations

from enum import StrEnum


class ServiceRole(StrEnum):
    GATEWAY = "gateway"
    TARGET_AGENT = "target-agent"
    NODE_COLLECTOR = "node-collector"
    FAKE_PROMETHEUS = "fake-prometheus"
    FAKE_LOKI = "fake-loki"
    FAKE_OTEL = "fake-otel"
    GITOPS_SYNC_WORKER = "gitops-sync-worker"
    COMMAND_WORKER = "command-worker"
    RCA_WORKER = "rca-worker"
    DASHBOARD_PROJECTION_SERVICE = "dashboard-projection-service"
    AUDIT_TIMELINE_SERVICE = "audit-timeline-service"

    @classmethod
    def values(cls) -> list[str]:
        return [role.value for role in cls]

    @classmethod
    def from_raw(cls, raw: str) -> ServiceRole:
        try:
            return cls(raw)
        except ValueError as exc:
            available = ", ".join(cls.values())
            raise ValueError(f"unknown role: {raw}. available roles: {available}") from exc
