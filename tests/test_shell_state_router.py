from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from domains.shell_state.router import router
from packages.runtime.dependencies import get_db, get_events


class SessionAuth:
    async def require_session(self, _request: Request) -> Any:
        return SimpleNamespace(
            workspace_id="workspace-a",
            user_id="user-a",
            roles=("user",),
        )


class ShellStateDb:
    def __init__(self) -> None:
        self.namespace_scope: dict[str, Any] | None = None
        self.preferences: dict[str, Any] | None = None

    def can_access(self, *_args: Any) -> bool:
        return True

    def filter_snapshot_context(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, Any]:
        assert workspace_id == "workspace-a"
        assert cluster_ids == {"cluster-a"}
        return {
            "snapshot_revision": 42,
            "observed_at": "2026-07-16T09:00:00Z",
            "resources_complete": True,
            "partial_reason_codes": [],
        }

    def list_authorized_namespace_catalog(self, **kwargs: Any) -> dict[str, Any]:
        assert kwargs["snapshot_revision"] == 42
        return {
            "items": ["default", "shop"],
            "total": 2,
            "complete": True,
        }

    def resolve_authorized_namespaces(self, **kwargs: Any) -> set[str]:
        return set(kwargs["namespaces"]).intersection({"default", "shop"})

    def get_namespace_scope(self, **_kwargs: Any) -> dict[str, Any] | None:
        return self.namespace_scope

    def put_namespace_scope(self, **kwargs: Any) -> dict[str, Any] | None:
        current_revision = int((self.namespace_scope or {}).get("revision") or 0)
        if kwargs["expected_revision"] != current_revision:
            return None
        self.namespace_scope = {
            "workspace_id": kwargs["workspace_id"],
            "user_id": kwargs["user_id"],
            "cluster_id": kwargs["cluster_id"],
            "namespaces": tuple(kwargs["namespaces"]),
            "revision": current_revision + 1,
            "invalidation_generation": int(
                (self.namespace_scope or {}).get("invalidation_generation") or 0
            )
            + 1,
            "updated_at": "2026-07-16T09:01:00Z",
        }
        return self.namespace_scope

    def get_ui_preferences(self, **_kwargs: Any) -> dict[str, Any] | None:
        return self.preferences

    def put_ui_preferences(self, **kwargs: Any) -> dict[str, Any] | None:
        current_revision = int((self.preferences or {}).get("revision") or 0)
        if kwargs["expected_revision"] != current_revision:
            return None
        self.preferences = {
            "workspace_id": kwargs["workspace_id"],
            "user_id": kwargs["user_id"],
            "preferences": kwargs["preferences"],
            "revision": current_revision + 1,
            "updated_at": "2026-07-16T09:01:00Z",
        }
        return self.preferences


class ShellStateEvents:
    def __init__(self) -> None:
        self.subjects: list[str] = []

    async def accept_body(self, body: Any, **kwargs: Any) -> Any:
        self.subjects.append(str(body.__subject__))
        event = SimpleNamespace(event_id=f"evt-{len(self.subjects)}")
        kwargs["transactional_stage"](object(), event)
        return SimpleNamespace(event=event)


def test_namespace_scope_is_authoritative_and_mutation_is_audited() -> None:
    db = ShellStateDb()
    events = ShellStateEvents()
    client = _client(db, events)

    initial = client.get("/cluster/namespace-scope", params={"cluster_id": "cluster-a"})
    assert initial.status_code == 200
    assert initial.json()["accessible_namespaces"] == ["default", "shop"]
    assert initial.json()["mode"] == "all"

    updated = client.post(
        "/cluster/namespace",
        json={
            "cluster_id": "cluster-a",
            "namespaces": ["shop"],
            "expected_revision": 0,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["actives"] == ["shop"]
    assert updated.json()["invalidation_generation"] == 1
    assert updated.json()["audit_event_id"] == "evt-1"
    assert events.subjects == ["namespace.scope.updated"]


def test_namespace_scope_rejects_inaccessible_and_stale_mutations() -> None:
    db = ShellStateDb()
    events = ShellStateEvents()
    client = _client(db, events)

    forbidden = client.post(
        "/cluster/namespace",
        json={
            "cluster_id": "cluster-a",
            "namespaces": ["secret"],
            "expected_revision": 0,
        },
    )
    assert forbidden.status_code == 403

    first = client.post(
        "/cluster/namespace",
        json={
            "cluster_id": "cluster-a",
            "namespaces": ["default"],
            "expected_revision": 0,
        },
    )
    assert first.status_code == 200
    conflict = client.post(
        "/cluster/namespace",
        json={
            "cluster_id": "cluster-a",
            "namespaces": ["shop"],
            "expected_revision": 0,
        },
    )
    assert conflict.status_code == 409


def test_ui_preferences_round_trip_with_revision_and_audit_event() -> None:
    db = ShellStateDb()
    events = ShellStateEvents()
    client = _client(db, events)

    initial = client.get("/settings")
    assert initial.json()["preferences"] == {"theme": "system", "locale": "en"}
    assert initial.json()["revision"] == 0

    updated = client.put(
        "/settings",
        json={
            "preferences": {"theme": "dark", "locale": "ko"},
            "expected_revision": 0,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["preferences"] == {"theme": "dark", "locale": "ko"}
    assert updated.json()["revision"] == 1
    assert updated.json()["audit_event_id"] == "evt-1"
    assert events.subjects == ["ui.preferences.updated"]


def _client(db: ShellStateDb, events: ShellStateEvents) -> TestClient:
    app = FastAPI()
    app.state.auth = SessionAuth()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_events] = lambda: events
    app.include_router(router)
    return TestClient(app)
