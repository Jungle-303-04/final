from __future__ import annotations

import asyncio
import json
import os
import subprocess
from pathlib import Path

import pytest
import yaml

from packages.events.bus import NatsEventBus
from packages.events.in_memory import InMemoryEventBus
from packages.runtime.controller import (
    AGENT_SERVICE_NAMES,
    API_GATEWAY_SERVICE_NAME,
    BorrowedEventBus,
    ControllerProfile,
    ControllerRuntime,
    build_composition_plan,
    event_bus_for_mode,
    load_worker_apps,
)
from packages.runtime.discovery import discover_services
from packages.storage.sessions import RedisSessionStore

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


def test_oss_profile_rejects_production_auto_merge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PRODUCTION_AUTO_MERGE_ENABLED", "true")
    with pytest.raises(ValueError, match="production auto-merge is forbidden"):
        ControllerProfile.from_env()


def test_composition_plan_assigns_every_discovered_entrypoint_once() -> None:
    discovered = discover_services(ROOT)
    plan = build_composition_plan(ROOT)
    assigned = (*plan.controller_services, *plan.agent_services)

    # BQ-007 auto-revert-worker까지 H3 lane에서 합류한 현재 조립 정본.
    assert len(discovered) == 41
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
    assert {spec.service_name for spec in (app.handler_spec() for app in apps)} == worker_services


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
        "opsia-installed",
        "bad-rollout-observed",
        "safe-pr-requested",
        "safe-pr-created",
        "review-merged",
        "gitops-sync-applied",
        "workload-normalized",
    ):
        assert scene in result.stdout


def test_controller_check_loads_every_management_entrypoint() -> None:
    result = subprocess.run(
        ["uv", "run", "python", "src/entrypoints/app.py", "--check"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert '"discovered_services": 41' in result.stdout
    assert '"controller_services": 39' in result.stdout
    assert '"agent_services": 2' in result.stdout
    assert '"worker_services": 33' in result.stdout
    assert '"async_services": 4' in result.stdout
    assert '"http_services": 2' in result.stdout


def test_oss_install_profile_is_three_components_and_has_no_nats_or_redis() -> None:
    documents = list(
        yaml.safe_load_all((ROOT / "deploy" / "oss" / "kubeheal-oss.yaml").read_text())
    )
    workloads = {
        (document["kind"], document["metadata"]["name"]): document
        for document in documents
        if document and document.get("kind") in {"Deployment", "StatefulSet", "DaemonSet"}
    }

    assert set(workloads) == {
        ("Deployment", "kubeheal-controller"),
        ("StatefulSet", "kubeheal-postgres"),
        ("DaemonSet", "kubeheal-agent"),
    }
    manifest = (ROOT / "deploy" / "oss" / "kubeheal-oss.yaml").read_text()
    assert "NATS_URL" not in manifest
    assert "REDIS_URL" not in manifest
    controller_env = {
        item["name"]: item.get("value")
        for item in workloads[("Deployment", "kubeheal-controller")]["spec"]["template"]["spec"][
            "containers"
        ][0]["env"]
    }
    agent_env = {
        item["name"]: item.get("value")
        for item in workloads[("DaemonSet", "kubeheal-agent")]["spec"]["template"]["spec"][
            "containers"
        ][0]["env"]
    }
    assert controller_env["CONTROLLER_EVENT_BUS_MODE"] == "inprocess"
    assert controller_env["AGENT_ACCESS_MODE"] == "read_only"
    assert controller_env["REMEDIATION_DELIVERY_MODE"] == "pull_request"
    assert controller_env["PRODUCTION_AUTO_MERGE_ENABLED"] == "false"
    assert agent_env["AGENT_ACCESS_MODE"] == "read_only"
    assert agent_env["AGENT_DIRECT_COMMANDS_ENABLED"] == "false"


def test_controller_injects_borrowed_bus_without_memory_sessions_into_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg://kubeheal:kubeheal@127.0.0.1:55432/kubeheal",
    )
    runtime = ControllerRuntime(ROOT)
    loaded = next(item for item in runtime.loaded if item.service.name == API_GATEWAY_SERVICE_NAME)
    owner = InMemoryEventBus()
    borrowed = BorrowedEventBus(owner)
    sessions = runtime._memory_sessions()

    server = runtime._http_server(loaded, borrowed, sessions)
    app = server.config.app

    assert app.state.events.events.publisher is borrowed
    assert isinstance(app.state.auth.sessions, RedisSessionStore)
    assert app.state.auth.sessions is not sessions
    assert server.config.access_log is False


def test_controller_shutdown_lets_http_servers_finish_gracefully() -> None:
    class FakeServer:
        should_exit = False

    async def scenario() -> tuple[bool, bool, bool]:
        server = FakeServer()
        graceful = asyncio.Event()

        async def serve_until_stopped() -> None:
            while not server.should_exit:
                await asyncio.sleep(0)
            graceful.set()

        server_task = asyncio.create_task(serve_until_stopped())
        service_task = asyncio.create_task(asyncio.Event().wait())
        waiter = asyncio.create_task(asyncio.Event().wait())
        await ControllerRuntime._shutdown(
            [server],
            [service_task],
            [server_task],
            waiter,
        )
        return graceful.is_set(), server_task.cancelled(), service_task.cancelled()

    graceful, server_cancelled, service_cancelled = asyncio.run(scenario())

    assert graceful is True
    assert server_cancelled is False
    assert service_cancelled is True


def test_bundle_verify_command_validates_and_hashes_canonical_json(tmp_path: Path) -> None:
    bundle = tmp_path / "bundle.json"
    bundle.write_text(
        json.dumps(
            {
                "meta": {
                    "correlation_id": "corr-1",
                    "incident_id": None,
                    "cluster_id": "cluster-1",
                    "workspace_id": "ws-1",
                    "created_at": None,
                },
                "diagnosis": {
                    "root_cause": "insufficient_evidence",
                    "confidence": None,
                    "supporting_evidence": [],
                    "missing_evidence": ["signal"],
                    "supporting_evidence_refs": [],
                    "missing_evidence_checks": [{"check_id": "signal"}],
                    "selected_candidate_id": None,
                },
                "remediation": None,
            }
        ),
        encoding="utf-8",
    )

    result = subprocess.run(
        ["uv", "run", "python", "scripts/verify-remediation-bundle.py", str(bundle)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert len(result.stdout.strip()) == 64
