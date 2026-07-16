from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db


class TimelineCapabilitiesDb:
    def __init__(self, *, grants: bool = True) -> None:
        self.grants = grants
        self.authorization_calls: list[tuple[str, str]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        self.authorization_calls.append((resource_type, permission))
        if not self.grants:
            return set()
        if resource_type == "cluster" and permission == Permission.INVENTORY_READ.value:
            return {"cluster-a"}
        return set()

    def snapshot_timeline_events(self, *_args: object, **_kwargs: object) -> None:
        raise AssertionError("capabilities read must not read a timeline snapshot")

    def replay_timeline_events(self, *_args: object, **_kwargs: object) -> None:
        raise AssertionError("capabilities read must not start a timeline replay")

    def latest_cluster_agent_statuses(self, *_args: object, **_kwargs: object) -> None:
        raise AssertionError("capabilities read must not observe query freshness")


def _client(db: TimelineCapabilitiesDb) -> TestClient:
    module = importlib.import_module("domains.timeline.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("operator",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_timeline_capabilities_is_an_authenticated_read_only_server_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TIMELINE_MAX_WINDOW_SECONDS", "7200")
    db = TimelineCapabilitiesDb()

    response = _client(db).get("/timeline/capabilities")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    payload = response.json()
    controls = payload.pop("control_surface")
    query_bounds = payload.pop("query_bounds")
    assert payload == {
        "selected_source_mode": "retained",
        "available_source_modes": ["retained"],
        "max_retained_range_ms": 7_200_000,
        "namespace_filter_policy": "not_required",
    }
    assert query_bounds["max_window_ms"] == 7_200_000
    assert query_bounds["earliest_queryable_ms"] == (query_bounds["server_now_ms"] - 86_400_000)
    assert controls["pins"] == {
        "key": "pins",
        "label": "Pinned lanes",
        "availability": "available",
        "storage": "server",
        "revision": "pin_set",
        "subject_kinds": ["resource", "application"],
    }
    assert controls["default_time_range_id"] == "1h"
    assert db.authorization_calls == [
        ("cluster", Permission.INVENTORY_READ.value),
        ("application", Permission.APPLICATION_READ.value),
        ("cluster", Permission.RCA_READ.value),
        ("application", Permission.DEPLOYMENT_READ.value),
    ]


def test_timeline_capabilities_hide_the_contract_without_a_readable_source_grant() -> None:
    response = _client(TimelineCapabilitiesDb(grants=False)).get("/timeline/capabilities")

    assert response.status_code == 404


def test_timeline_capabilities_require_an_authenticated_session() -> None:
    class UnauthenticatedAuth:
        async def require_session(self, _request: object) -> None:
            raise HTTPException(status_code=401, detail="authentication required")

    module = importlib.import_module("domains.timeline.router")
    app = FastAPI()
    app.include_router(module.router)
    app.state.auth = UnauthenticatedAuth()
    app.dependency_overrides[get_db] = TimelineCapabilitiesDb

    response = TestClient(app).get("/timeline/capabilities")

    assert response.status_code == 401
