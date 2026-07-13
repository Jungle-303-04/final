from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

from packages.events.bus import NatsEventBus
from packages.events.in_memory import InMemoryEventBus
from packages.runtime.controller import (
    AGENT_SERVICE_NAMES,
    ControllerProfile,
    build_composition_plan,
    event_bus_for_mode,
    load_worker_apps,
)
from packages.runtime.discovery import discover_services

ROOT = Path(__file__).resolve().parents[1]


def test_oss_profile_defaults_are_pr_only_and_nats_free(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "CONTROLLER_EVENT_BUS_MODE",
        "AGENT_ACCESS_MODE",
        "AGENT_DIRECT_COMMANDS_ENABLED",
        "REMEDIATION_DELIVERY_MODE",
        "PRODUCTION_AUTO_MERGE_ENABLED",
    ):
        monkeypatch.delenv(name, raising=False)

    profile = ControllerProfile.from_env()

    assert profile.event_bus_mode == "inprocess"
    assert profile.agent_access_mode == "read_only"
    assert profile.direct_commands_enabled is False
    assert profile.remediation_delivery_mode == "pull_request"
    assert profile.production_auto_merge_enabled is False
    assert isinstance(event_bus_for_mode(profile.event_bus_mode), InMemoryEventBus)


def test_nats_mode_is_explicit_and_rejects_unknown_mode() -> None:
    assert isinstance(event_bus_for_mode("nats"), NatsEventBus)
    with pytest.raises(ValueError, match="CONTROLLER_EVENT_BUS_MODE"):
        event_bus_for_mode("unknown")


def test_composition_plan_assigns_every_discovered_entrypoint_once() -> None:
    discovered = discover_services(ROOT)
    plan = build_composition_plan(ROOT)
    assigned = (*plan.controller_services, *plan.agent_services)

    assert len(discovered) == 40  # 39-entrypoint 지시 이후 change-correlation-worker 추가
    assert len(assigned) == len(discovered)
    assert {service.name for service in assigned} == {service.name for service in discovered}
    assert len({service.name for service in assigned}) == len(assigned)
    assert {service.name for service in plan.agent_services} == AGENT_SERVICE_NAMES
    assert all(service.name not in AGENT_SERVICE_NAMES for service in plan.controller_services)


def test_controller_loads_every_worker_app_into_one_composition_root() -> None:
    plan = build_composition_plan(ROOT)
    apps = load_worker_apps(ROOT, plan.controller_services)
    worker_services = {
        service.name for service in plan.controller_services if service.kind == "worker"
    }

    assert {app.name for app in apps} == worker_services
    assert all(app.subscriptions or app.raw_subscription for app in apps)


def test_nats_and_inprocess_modes_keep_identical_service_plan() -> None:
    inprocess = build_composition_plan(ROOT, event_bus_mode="inprocess")
    nats = build_composition_plan(ROOT, event_bus_mode="nats")

    assert inprocess.service_signature() == nats.service_signature()
    assert inprocess.event_bus_mode == "inprocess"
    assert nats.event_bus_mode == "nats"


def test_make_demo_dry_run_lists_the_complete_revert_story() -> None:
    result = subprocess.run(
        ["make", "demo"],
        cwd=ROOT,
        env={**os.environ, "DEMO_DRY_RUN": "1"},
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    for scene in (
        "kind-cluster-ready",
        "bad-rollout-observed",
        "mock-rollback-pr-created",
        "workload-normalized",
    ):
        assert scene in result.stdout
