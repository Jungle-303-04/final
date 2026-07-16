"""RCA test scenario catalog/API RED contract.

개발자가 raw Kubernetes manifest나 완성된 evidence payload를 직접 만들지 않고도
등록된 장애를 골라 실제 감지 -> RCA 흐름을 시작할 수 있어야 한다.
"""

from __future__ import annotations

import importlib
import threading
from collections.abc import Mapping
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

from domains.rca.router import router as rca_router

TEST_SCENARIOS_PATH = "/rca/test-scenarios"
TEST_RUNS_PATH = "/rca/test-runs"
TEST_TOKEN = "rca-test-token"

EXPECTED_ROOT_CAUSES = {
    "app_startup_failure",
    "application_5xx_spike",
    "backend_readiness_failure",
    "bad_image_rollout",
    "config_env_error",
    "database_connectivity_failure",
    "database_credential_or_config_error",
    "dependency_connection_failure",
    "deployment_progress_deadline_exceeded",
    "gitops_sync_failed",
    "insufficient_cpu",
    "insufficient_memory",
    "manifest_validation_failed",
    "missing_image_pull_secret",
    "missing_secret_reference",
    "network_path_timeout",
    "node_affinity_or_taint_mismatch",
    "oom_killed",
    "pvc_pending",
    "registry_unavailable",
    "replica_unavailable_after_rollout",
    "secret_key_missing",
    "service_dns_resolution_failure",
    "upstream_unavailable",
    "wrong_image_tag",
}

CATALOG_DIR = (
    Path(__file__).resolve().parents[1] / "src" / "domains" / "rca" / "test_scenario_catalog"
)


def _catalog_module() -> Any:
    return importlib.import_module("domains.rca.test_scenarios")


def _item_body(item: Any) -> dict[str, Any]:
    if isinstance(item, Mapping):
        return dict(item)
    if hasattr(item, "model_dump"):
        return item.model_dump()
    if hasattr(item, "to_body"):
        return item.to_body()
    raise TypeError(f"unsupported scenario catalog item: {type(item)!r}")


def _catalog_items() -> list[dict[str, Any]]:
    loaded = _catalog_module().load_test_scenario_catalog()
    return [_item_body(item) for item in loaded]


class _SessionAuth:
    def __init__(self, roles: tuple[str, ...] = ("release_operator",)) -> None:
        self.roles = roles

    async def require_session(self, _request: Any) -> SimpleNamespace:
        return SimpleNamespace(
            user_id="developer-1",
            roles=self.roles,
            workspace_id="workspace-1",
        )


class _TestRunDb:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []
        self.commands: dict[str, dict[str, Any]] = {}
        self.active_test_targets: set[tuple[str, str, str, str, str]] = set()
        self.reservation_barrier: threading.Barrier | None = None
        self._reservation_lock = threading.Lock()

    def can_access(self, *_args: Any) -> bool:
        return True

    def user_has_resource_access(self, *_args: Any) -> bool:
        return True

    def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, Any]:
        return {
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "environment": "aws-test",
            "settings": {"cluster_role": "target"},
        }

    def create_rca_test_run(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_rca_test_run", args, kwargs))
        if args and isinstance(args[-1], dict):
            return dict(args[-1])
        return dict(kwargs)

    def queue_agent_command(self, *args: Any, **kwargs: Any) -> bool:
        self.calls.append(("queue_agent_command", args, kwargs))
        correlation_id, plan, status = args
        command_id = str(plan["command_id"])
        if command_id in self.commands:
            return False
        self.commands[command_id] = {
            "command_id": command_id,
            "cluster_id": str(plan["cluster_id"]),
            "correlation_id": str(correlation_id),
            "action": str(plan["action"]),
            "payload": dict(plan),
            "status": str(status),
            "result": {},
            "completed_at": None,
        }
        return True

    def queue_rca_test_command_if_available(
        self,
        correlation_id: str,
        plan: dict[str, Any],
        status: str,
        *,
        resource_kind: str,
        namespace: str,
        resource_name: str,
        max_concurrent_runs: int,
        ttl_seconds: int,
    ) -> bool:
        del ttl_seconds
        barrier = self.reservation_barrier
        if barrier is not None:
            barrier.wait(timeout=2)
        key = (
            str(plan["workspace_id"]),
            str(plan["cluster_id"]),
            resource_kind.casefold(),
            namespace,
            resource_name,
        )
        with self._reservation_lock:
            if sum(item == key for item in self.active_test_targets) >= max_concurrent_runs:
                return False
            self.active_test_targets.add(key)
            self.calls.append(("queue_rca_test_command_if_available", (), {"key": key}))
            self.queue_agent_command(correlation_id, plan, status)
            return True

    async def get_agent_command(self, command_id: str, _workspace_id: str) -> dict[str, Any] | None:
        return self.commands.get(command_id)

    def list_evidence_jobs_for_window(
        self, _evidence_key: str, _workspace_id: str
    ) -> list[dict[str, Any]]:
        return []

    def get_evidence_window(self, _evidence_key: str) -> None:
        return None

    def list_rca_report_records(self, *_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
        return []

    def get_recovery_plan_by_correlation(self, *_args: Any) -> None:
        return None

    def get_rca_test_analysis_outcome(self, *_args: Any) -> None:
        return None


class _TestRunEvents:
    def __init__(self) -> None:
        self.accepted: list[Any] = []

    async def accept_body(self, body: Any, *_args: Any, **_kwargs: Any) -> SimpleNamespace:
        self.accepted.append(body)
        return SimpleNamespace(
            event=SimpleNamespace(event_id="evt-test-run-1", correlation_id="corr-test-run-1")
        )


def _client(
    monkeypatch: pytest.MonkeyPatch,
    *,
    roles: tuple[str, ...] = ("release_operator",),
) -> tuple[TestClient, _TestRunDb, _TestRunEvents]:
    # 테스트 장애 주입 API는 명시적인 capability + 전용 토큰에서만 열린다.
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", "1")
    monkeypatch.setenv("RCA_TEST_RUNS_TOKEN", TEST_TOKEN)
    monkeypatch.setenv("RCA_TEST_TOKEN", TEST_TOKEN)

    db = _TestRunDb()
    events = _TestRunEvents()
    app = FastAPI()
    app.include_router(rca_router)
    app.state.auth = _SessionAuth(roles)
    app.state.db = db
    app.state.events = events
    return TestClient(app), db, events


def _test_headers() -> dict[str, str]:
    return {"x-rca-test-token": TEST_TOKEN}


def test_scenario_catalog_covers_every_registered_root_cause_with_safe_schema() -> None:
    assert CATALOG_DIR.is_dir()
    assert list(CATALOG_DIR.glob("*.yaml"))

    items = _catalog_items()
    scenario_ids = [str(item["scenario_id"]) for item in items]
    root_causes = {str(item["expected"]["root_cause"]) for item in items}

    assert root_causes == EXPECTED_ROOT_CAUSES
    assert len(scenario_ids) == len(set(scenario_ids))

    for item in items:
        assert item["scenario_id"]
        assert isinstance(item["version"], int) and item["version"] >= 1
        assert item["execution"] in {"real", "hybrid", "external"}
        assert item["availability"] in {
            "ready",
            "verification_pending",
            "fixture_required",
            "detector_gap",
        }
        assert item["expected"]["root_cause"]
        assert item["expected"]["symptom"]
        if item["availability"] == "ready":
            assert item["evidence_sources"]

        safety = item["safety"]
        assert safety["namespace"] == "sandbox"
        assert safety["cleanup_required"] is True
        assert 30 <= safety["ttl_seconds"] <= 900
        assert safety["management_cluster_allowed"] is False


def test_wrong_image_tag_is_a_ready_real_scenario() -> None:
    scenario = next(item for item in _catalog_items() if item["scenario_id"] == "image.wrong-tag")

    assert scenario["execution"] == "real"
    assert scenario["availability"] == "ready"
    assert scenario["evidence_sources"] == ["kubernetes"]
    assert scenario["expected"] == {
        "root_cause": "wrong_image_tag",
        "symptom": "ImagePullBackOff",
    }


def test_unverified_provider_ingestion_scenarios_are_not_ready() -> None:
    detector_gaps = {
        "crash.config-env",
        "crash.app-startup",
        "ingress.readiness",
        "schedule.cpu",
        "schedule.memory",
    }
    scenarios = {str(item["scenario_id"]): item for item in _catalog_items()}
    ready_ids = {
        scenario_id for scenario_id, item in scenarios.items() if item["availability"] == "ready"
    }

    assert detector_gaps.isdisjoint(ready_ids)
    for scenario_id in detector_gaps:
        item = scenarios[scenario_id]
        assert item["availability"] == "detector_gap"
        assert item["availability_reason"]
        assert item["detector_work_needed"]


@pytest.mark.parametrize(
    "scenario_id",
    ["crash.oom", "ingress.upstream-empty", "app.http-5xx"],
)
def test_scenarios_without_a_completable_agent_observation_are_detector_gaps(
    scenario_id: str,
) -> None:
    scenario = next(item for item in _catalog_items() if item["scenario_id"] == scenario_id)

    assert scenario["availability"] == "detector_gap"
    assert scenario["availability_reason"]
    assert scenario["detector_work_needed"]


def test_every_ready_scenario_has_a_target_agent_matchable_signal_group() -> None:
    runtime = importlib.import_module("domains.rca.test_runtime")
    run_id = "catalog-observation-audit"

    for scenario in _catalog_module().load_test_scenario_catalog():
        if scenario.availability != "ready":
            continue
        pod_name = f"{scenario.scenario_id}-pod"
        snapshot = {
            "pods": [
                {
                    "name": pod_name,
                    "labels": {"kubeheal.io/rca-test-run": run_id},
                    "waiting_reasons": list(scenario.observe.pod_waiting_reasons),
                    "terminated_reasons": list(scenario.observe.pod_terminated_reasons),
                }
            ],
            "events": [
                {
                    "involved_name": pod_name,
                    "reason": next(iter(scenario.observe.event_reasons), ""),
                    "message": " ".join(scenario.observe.event_message_any),
                }
            ],
        }

        assert runtime.rca_test_observation_matches(scenario, snapshot, run_id), (
            scenario.scenario_id
        )


def test_get_scenarios_exposes_the_catalog_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    client, _db, _events = _client(monkeypatch)

    response = client.get(TEST_SCENARIOS_PATH, headers=_test_headers())

    assert response.status_code == 200
    body = response.json()
    assert {item["expected"]["root_cause"] for item in body["items"]} == EXPECTED_ROOT_CAUSES
    assert all(
        {
            "scenario_id",
            "version",
            "execution",
            "availability",
            "expected",
            "safety",
        }
        <= set(item)
        for item in body["items"]
    )


def test_rca_test_api_is_hidden_when_capability_is_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _db, _events = _client(monkeypatch)
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", "0")

    response = client.get(TEST_SCENARIOS_PATH, headers=_test_headers())

    assert response.status_code == 404


def test_rca_test_api_does_not_use_app_environment_as_authorization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _db, _events = _client(monkeypatch)
    monkeypatch.setenv("APP_ENV", "production")

    response = client.get(TEST_SCENARIOS_PATH, headers=_test_headers())

    assert response.status_code == 200


def test_rca_test_api_rejects_an_invalid_dedicated_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _db, _events = _client(monkeypatch)

    response = client.get(TEST_SCENARIOS_PATH, headers={"x-rca-test-token": "wrong"})

    assert response.status_code == 401


def test_rca_test_api_exposes_dedicated_header_in_every_openapi_operation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _db, _events = _client(monkeypatch)

    schema = client.get("/openapi.json").json()
    operations = [
        schema["paths"][TEST_SCENARIOS_PATH]["get"],
        schema["paths"][TEST_RUNS_PATH]["post"],
        schema["paths"][f"{TEST_RUNS_PATH}/{{run_id}}"]["get"],
        schema["paths"][f"{TEST_RUNS_PATH}/{{run_id}}"]["delete"],
    ]

    for operation in operations:
        header = next(
            item
            for item in operation["parameters"]
            if item["in"] == "header" and item["name"] == "x-rca-test-token"
        )
        assert header["required"] is False
        assert header["schema"]["type"] == "string"


def test_scenario_list_openapi_uses_a_typed_item_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _db, _events = _client(monkeypatch)

    schema = client.get("/openapi.json").json()
    response_ref = schema["paths"][TEST_SCENARIOS_PATH]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]["$ref"]
    response_name = response_ref.rsplit("/", 1)[-1]
    item_schema = schema["components"]["schemas"][response_name]["properties"]["items"]["items"]

    assert item_schema["$ref"].endswith("/RcaTestScenarioItem")
    scenario_schema = schema["components"]["schemas"]["RcaTestScenarioItem"]
    assert scenario_schema["properties"]["expected"]["$ref"].endswith(
        "/RcaTestScenarioExpectedItem"
    )
    assert set(scenario_schema["properties"]["availability"]["enum"]) == {
        "ready",
        "verification_pending",
        "fixture_required",
        "detector_gap",
    }

    post_parameters = schema["paths"][TEST_RUNS_PATH]["post"]["parameters"]
    assert any(
        item["in"] == "header" and item["name"] == "x-rca-test-verification"
        for item in post_parameters
    )


def test_test_run_request_needs_only_cluster_and_scenario() -> None:
    requests = importlib.import_module("packages.contracts.gateway.requests")
    request_type = requests.RcaTestRunCreateRequest

    payload = request_type(cluster_id="cluster-1", scenario_id="image.wrong-tag")

    assert payload.model_dump() == {
        "cluster_id": "cluster-1",
        "scenario_id": "image.wrong-tag",
    }


@pytest.mark.parametrize(
    ("forbidden_field", "value"),
    [
        ("manifest", {"apiVersion": "apps/v1", "kind": "Deployment"}),
        ("raw_manifest", "apiVersion: apps/v1"),
        ("evidence", {"kubernetes": {"pods": []}}),
        ("namespace", "default"),
    ],
)
def test_test_run_request_rejects_client_owned_fault_payloads(
    monkeypatch: pytest.MonkeyPatch, forbidden_field: str, value: Any
) -> None:
    client, _db, _events = _client(monkeypatch)

    response = client.post(
        TEST_RUNS_PATH,
        headers=_test_headers(),
        json={
            "cluster_id": "cluster-1",
            "scenario_id": "image.wrong-tag",
            forbidden_field: value,
        },
    )

    assert response.status_code == 422


def test_post_test_run_accepts_minimal_ready_scenario(monkeypatch: pytest.MonkeyPatch) -> None:
    client, db, _events = _client(monkeypatch)

    response = client.post(
        TEST_RUNS_PATH,
        headers=_test_headers(),
        json={"cluster_id": "cluster-1", "scenario_id": "image.wrong-tag"},
    )

    assert response.status_code == 202
    body = response.json()
    assert body["accepted"] is True
    assert body["scenario_id"] == "image.wrong-tag"
    assert body["cluster_id"] == "cluster-1"
    assert body["run_id"]
    assert body["correlation_id"]
    assert body["status"] in {"queued", "injecting"}
    command = db.commands[body["command_id"]]
    nested = command["payload"]["payload"]
    assert nested["expected_root_cause"] == "wrong_image_tag"
    assert nested["expected_symptom"] == "ImagePullBackOff"
    assert nested["expires_at"] == command["payload"]["expires_at"] == body["cleanup_at"]
    assert nested["cleanup_adapter"] == "kubernetes.manifest_delete"
    assert nested["verification_mode"] is False
    assert body["verification_mode"] is False


def test_verification_pending_scenario_needs_admin_and_explicit_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, db, _events = _client(monkeypatch)
    payload = {"cluster_id": "cluster-1", "scenario_id": "image.registry-down"}

    without_header = client.post(TEST_RUNS_PATH, headers=_test_headers(), json=payload)
    non_admin = client.post(
        TEST_RUNS_PATH,
        headers={**_test_headers(), "x-rca-test-verification": "true"},
        json=payload,
    )

    assert without_header.status_code == 409
    assert non_admin.status_code == 403
    assert db.commands == {}


def test_admin_can_run_verification_pending_scenario_without_marking_it_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, db, _events = _client(monkeypatch, roles=("service_admin",))

    response = client.post(
        TEST_RUNS_PATH,
        headers={**_test_headers(), "x-rca-test-verification": "true"},
        json={"cluster_id": "cluster-1", "scenario_id": "image.registry-down"},
    )

    assert response.status_code == 202
    body = response.json()
    assert body["verification_mode"] is True
    command = db.commands[body["command_id"]]
    nested = command["payload"]["payload"]
    assert nested["verification_mode"] is True
    assert nested["cleanup_adapter"] == "kubernetes.manifest_delete"
    catalog = client.get(TEST_SCENARIOS_PATH, headers=_test_headers()).json()["items"]
    scenario = next(item for item in catalog if item["scenario_id"] == "image.registry-down")
    assert scenario["availability"] == "verification_pending"


def test_concurrent_test_run_requests_reserve_one_target_atomically(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, db, _events = _client(monkeypatch)
    # FastAPI/Pydantic dependency schema 생성은 전역 캐시를 갱신하므로 요청 스레드보다 먼저 끝낸다.
    client.app.openapi()
    db.reservation_barrier = threading.Barrier(2)
    payload = {"cluster_id": "cluster-1", "scenario_id": "image.wrong-tag"}

    def post_run(_index: int) -> Any:
        # TestClient 하나를 여러 스레드에서 공유하면 AnyIO portal 자체가 직렬화될 수 있다.
        # 앱과 DB stub만 공유하고 요청 transport는 스레드별로 분리한다.
        with TestClient(client.app) as worker_client:
            return worker_client.post(TEST_RUNS_PATH, headers=_test_headers(), json=payload)

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(post_run, range(2)))

    assert sorted(response.status_code for response in responses) == [202, 409]
    conflict = next(response for response in responses if response.status_code == 409)
    assert conflict.json()["detail"] == {
        "code": "rca_test_run_conflict",
        "message": "RCA test target already has an active run",
        "cluster_id": "cluster-1",
        "scenario_id": "image.wrong-tag",
        "resource_name": "rca-test-image-wrong-tag",
    }
    inject_commands = [
        command for command in db.commands.values() if command["action"] == "rca.test.inject"
    ]
    assert len(inject_commands) == 1


@pytest.mark.parametrize(
    ("registration", "expected_status"),
    [
        (None, 404),
        (
            {
                "workspace_id": "workspace-1",
                "cluster_id": "cluster-1",
                "environment": "production",
                "settings": {"cluster_role": "target"},
            },
            409,
        ),
    ],
)
def test_test_run_rejects_unregistered_or_non_test_targets(
    monkeypatch: pytest.MonkeyPatch,
    registration: dict[str, Any] | None,
    expected_status: int,
) -> None:
    client, db, _events = _client(monkeypatch)
    monkeypatch.setattr(db, "get_cluster_registration", lambda *_args: registration)

    response = client.post(
        TEST_RUNS_PATH,
        headers=_test_headers(),
        json={"cluster_id": "cluster-1", "scenario_id": "image.wrong-tag"},
    )

    assert response.status_code == expected_status
    assert db.commands == {}


def test_detector_gap_scenario_cannot_be_triggered(monkeypatch: pytest.MonkeyPatch) -> None:
    client, _db, events = _client(monkeypatch)
    catalog = client.get(TEST_SCENARIOS_PATH, headers=_test_headers()).json()["items"]
    detector_gap = next(item for item in catalog if item["availability"] == "detector_gap")

    response = client.post(
        TEST_RUNS_PATH,
        headers=_test_headers(),
        json={"cluster_id": "cluster-1", "scenario_id": detector_gap["scenario_id"]},
    )

    assert response.status_code == 409
    assert events.accepted == []

    verification_response = client.post(
        TEST_RUNS_PATH,
        headers={**_test_headers(), "x-rca-test-verification": "true"},
        json={"cluster_id": "cluster-1", "scenario_id": detector_gap["scenario_id"]},
    )
    assert verification_response.status_code == 409


def test_test_run_can_be_polled_and_cleanup_is_a_separate_safe_command(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, db, _events = _client(monkeypatch)
    created = client.post(
        TEST_RUNS_PATH,
        headers=_test_headers(),
        json={"cluster_id": "cluster-1", "scenario_id": "image.wrong-tag"},
    )
    assert created.status_code == 202
    run_id = created.json()["run_id"]

    status = client.get(f"{TEST_RUNS_PATH}/{run_id}", headers=_test_headers())
    assert status.status_code == 200
    assert status.json()["status"] == "injecting"
    assert [item["step"] for item in status.json()["steps"]] == [
        "fault_injection",
        "fault_observation",
        "evidence_collection",
        "root_cause_analysis",
        "recovery_plan",
        "action_selection",
        "cleanup",
    ]

    cleanup = client.delete(f"{TEST_RUNS_PATH}/{run_id}", headers=_test_headers())
    assert cleanup.status_code == 202
    assert cleanup.json()["status"] == "cleanup_queued"
    command = db.commands[f"cmd-rca-test-cleanup-{run_id}"]
    assert command["action"] == "rca.test.cleanup"
    assert command["payload"]["payload"] == {
        "run_id": run_id,
        "scenario_id": "image.wrong-tag",
        "scenario_version": 1,
        "resource_kind": "Deployment",
        "namespace": "sandbox",
        "resource_name": "rca-test-image-wrong-tag",
        "cleanup_adapter": "kubernetes.manifest_delete",
    }

    repeated = client.delete(f"{TEST_RUNS_PATH}/{run_id}", headers=_test_headers())
    assert repeated.status_code == 202
    assert repeated.json()["status"] == "cleanup_queued"
    cleanup_calls = [call for call in db.calls if call[0] == "queue_agent_command"]
    assert len(cleanup_calls) == 2


def test_repository_guard_uses_expiry_and_finished_cleanup_before_atomic_enqueue() -> None:
    from domains.command.repository import AgentCommandRepository, rca_test_guard_lock_key

    statements: list[Any] = []
    parameters: list[dict[str, Any] | None] = []

    class StubResult:
        def __init__(self, scalar: Any = None) -> None:
            self.scalar = scalar

        def scalar_one(self) -> Any:
            return self.scalar

        def scalar_one_or_none(self) -> Any:
            return self.scalar

    class StubConnection:
        def execute(
            self,
            statement: Any,
            params: dict[str, Any] | None = None,
        ) -> StubResult:
            statements.append(statement)
            parameters.append(params)
            values = [None, 0, "cmd-rca-test-inject-run-1", None, None]
            return StubResult(values[len(statements) - 1])

    @contextmanager
    def connection():
        yield StubConnection()

    repository = object.__new__(AgentCommandRepository)
    repository.connection = connection  # type: ignore[method-assign]
    plan = {
        "command_id": "cmd-rca-test-inject-run-1",
        "workspace_id": "workspace-1",
        "cluster_id": "cluster-1",
        "action": "rca.test.inject",
        "priority": 200,
        "expires_at": "2026-07-10T23:59:59+00:00",
        "payload": {
            "run_id": "run-1",
            "scenario_id": "image.wrong-tag",
            "resource_kind": "Deployment",
            "namespace": "sandbox",
            "resource_name": "rca-test-image-wrong-tag",
            "expires_at": "2026-07-10T23:59:59+00:00",
        },
    }

    reserved = repository.queue_rca_test_command_if_available(
        "corr-run-1",
        plan,
        "queued",
        resource_kind="Deployment",
        namespace="sandbox",
        resource_name="rca-test-image-wrong-tag",
        max_concurrent_runs=1,
        ttl_seconds=300,
    )

    assert reserved is True
    assert len(statements) == 5
    assert "pg_advisory_xact_lock" in str(statements[0])
    assert parameters[0] == {
        "lock_key": rca_test_guard_lock_key(
            "workspace-1",
            "cluster-1",
            "Deployment",
            "sandbox",
            "rca-test-image-wrong-tag",
        )
    }
    active_sql = statements[1].compile(dialect=postgresql.dialect())
    active_query = str(active_sql)
    assert "CAST" in active_query
    assert "TIMESTAMP WITH TIME ZONE" in active_query
    assert "finished_rca_test_cleanup" in active_query
    assert "EXISTS" in active_query
    assert "cleanup_completed" not in active_query
    assert "completed" in active_sql.params.values()
    expires_at_indexes = [value for value in active_sql.params.values() if value == "expires_at"]
    assert len(expires_at_indexes) == 1
    assert "payload" in active_sql.params.values()
    assert "INSERT INTO agent_commands" in str(statements[2].compile(dialect=postgresql.dialect()))
    attempt_sql = statements[3].compile(dialect=postgresql.dialect())
    assert "INSERT INTO agent_command_attempts" in str(attempt_sql)
    assert "workspace-1" in attempt_sql.params.values()
    assert "pg_notify" in str(statements[4])


def test_repository_rejects_active_reservation_before_command_insert() -> None:
    from domains.command.repository import AgentCommandRepository

    statements: list[Any] = []

    class StubResult:
        def __init__(self, scalar: Any = None) -> None:
            self.scalar = scalar

        def scalar_one(self) -> Any:
            return self.scalar

    class StubConnection:
        def execute(
            self,
            statement: Any,
            _params: dict[str, Any] | None = None,
        ) -> StubResult:
            statements.append(statement)
            return StubResult(1 if len(statements) == 2 else None)

    @contextmanager
    def connection():
        yield StubConnection()

    repository = object.__new__(AgentCommandRepository)
    repository.connection = connection  # type: ignore[method-assign]
    plan = {
        "command_id": "cmd-rca-test-inject-run-2",
        "workspace_id": "workspace-1",
        "cluster_id": "cluster-1",
        "action": "rca.test.inject",
        "expires_at": "2026-07-10T23:59:59+00:00",
        "payload": {
            "run_id": "run-2",
            "scenario_id": "image.wrong-tag",
            "resource_kind": "Deployment",
            "namespace": "sandbox",
            "resource_name": "rca-test-image-wrong-tag",
            "expires_at": "2026-07-10T23:59:59+00:00",
        },
    }

    reserved = repository.queue_rca_test_command_if_available(
        "corr-run-2",
        plan,
        "queued",
        resource_kind="Deployment",
        namespace="sandbox",
        resource_name="rca-test-image-wrong-tag",
        max_concurrent_runs=1,
        ttl_seconds=300,
    )

    assert reserved is False
    assert len(statements) == 2


def test_repository_guard_key_is_scoped_to_the_physical_fixture() -> None:
    from domains.command.repository import rca_test_guard_lock_key

    first = rca_test_guard_lock_key(
        "workspace-1",
        "cluster-1",
        "Deployment",
        "sandbox",
        "rca-test-shared",
    )
    same_fixture = rca_test_guard_lock_key(
        "workspace-1",
        "cluster-1",
        "deployment",
        "sandbox",
        "rca-test-shared",
    )
    other_namespace = rca_test_guard_lock_key(
        "workspace-1",
        "cluster-1",
        "Deployment",
        "other",
        "rca-test-shared",
    )

    assert first == same_fixture
    assert first != other_namespace
