from __future__ import annotations

import importlib.util
import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from packages.shared.roles import ServiceRole

Runner = Callable[[], Awaitable[None]]
DEFAULT_RUNNER_NAME = "run"
LOADED_MODULE_PREFIX = "services.loaded"
GATEWAY_DIR = "management-api-gateway"
GITOPS_SYNC_DIR = "gitops-sync-worker"
COMMAND_WORKER_DIR = "command-worker"
RCA_WORKER_DIR = "rca-worker"
DASHBOARD_PROJECTION_DIR = "dashboard-projection-service"
AUDIT_TIMELINE_DIR = "audit-timeline-service"
TARGET_AGENT_DIR = "target-cluster-agent"
NODE_COLLECTOR_RUNNER = "run_node_collector"
FAKE_PROMETHEUS_RUNNER = "run_fake_prometheus"
FAKE_LOKI_RUNNER = "run_fake_loki"
FAKE_OTEL_RUNNER = "run_fake_otel"


@dataclass(frozen=True)
class ServiceEntry:
    role: ServiceRole
    directory: str
    runner_name: str = DEFAULT_RUNNER_NAME

    @property
    def path(self) -> Path:
        return Path(__file__).resolve().parent / self.directory / "runner.py"


SERVICE_REGISTRY: dict[ServiceRole, ServiceEntry] = {
    ServiceRole.GATEWAY: ServiceEntry(ServiceRole.GATEWAY, GATEWAY_DIR),
    ServiceRole.GITOPS_SYNC_WORKER: ServiceEntry(ServiceRole.GITOPS_SYNC_WORKER, GITOPS_SYNC_DIR),
    ServiceRole.COMMAND_WORKER: ServiceEntry(ServiceRole.COMMAND_WORKER, COMMAND_WORKER_DIR),
    ServiceRole.RCA_WORKER: ServiceEntry(ServiceRole.RCA_WORKER, RCA_WORKER_DIR),
    ServiceRole.DASHBOARD_PROJECTION_SERVICE: ServiceEntry(
        ServiceRole.DASHBOARD_PROJECTION_SERVICE, DASHBOARD_PROJECTION_DIR
    ),
    ServiceRole.AUDIT_TIMELINE_SERVICE: ServiceEntry(
        ServiceRole.AUDIT_TIMELINE_SERVICE, AUDIT_TIMELINE_DIR
    ),
    ServiceRole.TARGET_AGENT: ServiceEntry(ServiceRole.TARGET_AGENT, TARGET_AGENT_DIR),
    ServiceRole.NODE_COLLECTOR: ServiceEntry(
        ServiceRole.NODE_COLLECTOR, TARGET_AGENT_DIR, NODE_COLLECTOR_RUNNER
    ),
    ServiceRole.FAKE_PROMETHEUS: ServiceEntry(
        ServiceRole.FAKE_PROMETHEUS, TARGET_AGENT_DIR, FAKE_PROMETHEUS_RUNNER
    ),
    ServiceRole.FAKE_LOKI: ServiceEntry(ServiceRole.FAKE_LOKI, TARGET_AGENT_DIR, FAKE_LOKI_RUNNER),
    ServiceRole.FAKE_OTEL: ServiceEntry(ServiceRole.FAKE_OTEL, TARGET_AGENT_DIR, FAKE_OTEL_RUNNER),
}


def service_roles() -> list[str]:
    return [role.value for role in SERVICE_REGISTRY]


def load_runner(role: ServiceRole) -> Runner:
    entry = SERVICE_REGISTRY[role]
    module_path = entry.path
    service_dir = str(module_path.parent)
    if service_dir not in sys.path:
        sys.path.insert(0, service_dir)

    module_name = f"{LOADED_MODULE_PREFIX}_{role.value.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load service runner: {module_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    runner = getattr(module, entry.runner_name)
    return runner
