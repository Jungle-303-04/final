"""OSS controller composition plan and service entrypoint loader."""

from __future__ import annotations

import importlib.util
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType

from packages.events.bus import NatsEventBus
from packages.events.in_memory import InMemoryEventBus
from packages.runtime.app import App
from packages.runtime.discovery import DiscoveredService, discover_services

CONTROLLER_EVENT_BUS_MODE_ENV = "CONTROLLER_EVENT_BUS_MODE"
AGENT_ACCESS_MODE_ENV = "AGENT_ACCESS_MODE"
AGENT_DIRECT_COMMANDS_ENABLED_ENV = "AGENT_DIRECT_COMMANDS_ENABLED"
REMEDIATION_DELIVERY_MODE_ENV = "REMEDIATION_DELIVERY_MODE"
PRODUCTION_AUTO_MERGE_ENABLED_ENV = "PRODUCTION_AUTO_MERGE_ENABLED"

EVENT_BUS_MODES = frozenset({"inprocess", "nats"})
AGENT_ACCESS_MODES = frozenset({"read_only", "read_write"})
REMEDIATION_DELIVERY_MODES = frozenset({"pull_request", "direct"})
AGENT_SERVICE_NAMES = frozenset({"cluster-agent", "node-collector"})


def _bool_env(name: str, default: str) -> bool:
    value = os.getenv(name, default).strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean: {value!r}")


def _choice_env(name: str, default: str, allowed: frozenset[str]) -> str:
    value = os.getenv(name, default).strip().lower()
    if value not in allowed:
        raise ValueError(f"{name} must be one of {sorted(allowed)}: {value!r}")
    return value


@dataclass(frozen=True)
class ControllerProfile:
    event_bus_mode: str = "inprocess"
    agent_access_mode: str = "read_only"
    direct_commands_enabled: bool = False
    remediation_delivery_mode: str = "pull_request"
    production_auto_merge_enabled: bool = False

    @classmethod
    def from_env(cls) -> ControllerProfile:
        return cls(
            event_bus_mode=_choice_env(
                CONTROLLER_EVENT_BUS_MODE_ENV,
                "inprocess",
                EVENT_BUS_MODES,
            ),
            agent_access_mode=_choice_env(
                AGENT_ACCESS_MODE_ENV,
                "read_only",
                AGENT_ACCESS_MODES,
            ),
            direct_commands_enabled=_bool_env(AGENT_DIRECT_COMMANDS_ENABLED_ENV, "false"),
            remediation_delivery_mode=_choice_env(
                REMEDIATION_DELIVERY_MODE_ENV,
                "pull_request",
                REMEDIATION_DELIVERY_MODES,
            ),
            production_auto_merge_enabled=_bool_env(
                PRODUCTION_AUTO_MERGE_ENABLED_ENV,
                "false",
            ),
        )


@dataclass(frozen=True)
class CompositionPlan:
    event_bus_mode: str
    controller_services: tuple[DiscoveredService, ...]
    agent_services: tuple[DiscoveredService, ...]

    def service_signature(self) -> tuple[tuple[str, str, str], ...]:
        return tuple(
            sorted(
                (
                    service.name,
                    service.kind,
                    "agent" if service in self.agent_services else "controller",
                )
                for service in (*self.controller_services, *self.agent_services)
            )
        )


def event_bus_for_mode(mode: str) -> InMemoryEventBus | NatsEventBus:
    normalized = mode.strip().lower()
    if normalized == "inprocess":
        return InMemoryEventBus()
    if normalized == "nats":
        return NatsEventBus()
    raise ValueError(
        f"{CONTROLLER_EVENT_BUS_MODE_ENV} must be one of {sorted(EVENT_BUS_MODES)}: {mode!r}"
    )


def build_composition_plan(
    root: Path,
    *,
    event_bus_mode: str | None = None,
) -> CompositionPlan:
    mode = event_bus_mode or ControllerProfile.from_env().event_bus_mode
    event_bus_for_mode(mode)
    services = discover_services(root)
    agent = tuple(service for service in services if service.name in AGENT_SERVICE_NAMES)
    controller = tuple(service for service in services if service.name not in AGENT_SERVICE_NAMES)
    found_agent_names = {service.name for service in agent}
    if found_agent_names != AGENT_SERVICE_NAMES:
        raise ValueError(
            f"agent composition mismatch: expected={sorted(AGENT_SERVICE_NAMES)}, "
            f"actual={sorted(found_agent_names)}"
        )
    return CompositionPlan(mode, controller, agent)


def load_worker_apps(
    root: Path,
    services: tuple[DiscoveredService, ...],
) -> tuple[App, ...]:
    apps: list[App] = []
    for service in services:
        if service.kind != "worker":
            continue
        module = load_service_entrypoint(root, service)
        app = getattr(module, "app", None)
        if not isinstance(app, App):
            raise TypeError(f"{service.path}: worker entrypoint must expose App as 'app'")
        if app.name != service.name:
            raise ValueError(
                f"{service.path}: discovered name {service.name!r} != App {app.name!r}"
            )
        apps.append(app)
    return tuple(apps)


def load_service_entrypoint(root: Path, service: DiscoveredService) -> ModuleType:
    path = root / service.path
    module_name = f"oss_controller_{service.group}_{service.dirname.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load service entrypoint: {path}")
    local_names = _service_local_module_names(path.parent)
    previous = {name: sys.modules.pop(name, None) for name in local_names}
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(path.parent))
        for name in local_names:
            sys.modules.pop(name, None)
            if previous[name] is not None:
                sys.modules[name] = previous[name]


def _service_local_module_names(service_dir: Path) -> tuple[str, ...]:
    names = {
        child.stem if child.is_file() else child.name
        for child in service_dir.iterdir()
        if (child.is_file() and child.suffix == ".py")
        or (child.is_dir() and (child / "__init__.py").exists())
    }
    names.discard("app")
    return tuple(sorted(names))
