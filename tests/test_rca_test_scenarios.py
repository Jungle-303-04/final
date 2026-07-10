"""RCA test scenario catalog/API RED contract.

개발자가 raw Kubernetes manifest나 완성된 evidence payload를 직접 만들지 않고도
등록된 장애를 골라 실제 감지 -> RCA 흐름을 시작할 수 있어야 한다.
"""

from __future__ import annotations

import importlib
from collections.abc import Mapping
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

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
    async def require_session(self, _request: Any) -> SimpleNamespace:
        return SimpleNamespace(
            user_id="developer-1",
            roles=("release_operator",),
            workspace_id="workspace-1",
        )


class _TestRunDb:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []

    def can_access(self, *_args: Any) -> bool:
        return True

    def user_has_resource_access(self, *_args: Any) -> bool:
        return True

    def get_cluster_registration(self, workspace_id: str, cluster_id: str) -> dict[str, Any]:
        return {
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "settings": {"cluster_role": "target"},
        }

    def create_rca_test_run(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("create_rca_test_run", args, kwargs))
        if args and isinstance(args[-1], dict):
            return dict(args[-1])
        return dict(kwargs)

    def queue_agent_command(self, *args: Any, **kwargs: Any) -> None:
        self.calls.append(("queue_agent_command", args, kwargs))


class _TestRunEvents:
    def __init__(self) -> None:
        self.accepted: list[Any] = []

    async def accept_body(self, body: Any, *_args: Any, **_kwargs: Any) -> SimpleNamespace:
        self.accepted.append(body)
        return SimpleNamespace(
            event=SimpleNamespace(event_id="evt-test-run-1", correlation_id="corr-test-run-1")
        )


def _client(monkeypatch: pytest.MonkeyPatch) -> tuple[TestClient, _TestRunDb, _TestRunEvents]:
    # 테스트 장애 주입 API는 명시적인 test 환경 + enable flag + 전용 토큰에서만 열린다.
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("RCA_TEST_RUNS_ENABLED", "1")
    monkeypatch.setenv("RCA_TEST_RUNS_TOKEN", TEST_TOKEN)
    monkeypatch.setenv("RCA_TEST_TOKEN", TEST_TOKEN)

    db = _TestRunDb()
    events = _TestRunEvents()
    app = FastAPI()
    app.include_router(rca_router)
    app.state.auth = _SessionAuth()
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
        assert item["availability"] in {"ready", "fixture_required", "detector_gap"}
        assert item["expected"]["root_cause"]
        assert item["expected"]["symptom"]

        safety = item["safety"]
        assert safety["namespace"] == "sandbox"
        assert safety["cleanup_required"] is True
        assert 30 <= safety["ttl_seconds"] <= 900
        assert safety["management_cluster_allowed"] is False


def test_wrong_image_tag_is_a_ready_real_scenario() -> None:
    scenario = next(item for item in _catalog_items() if item["scenario_id"] == "image.wrong-tag")

    assert scenario["execution"] == "real"
    assert scenario["availability"] == "ready"
    assert scenario["expected"] == {
        "root_cause": "wrong_image_tag",
        "symptom": "ImagePullBackOff",
    }


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
    client, _db, _events = _client(monkeypatch)

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
