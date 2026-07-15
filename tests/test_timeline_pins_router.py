"""Persistent Timeline pins are owner-scoped, revisioned, and never browser fixtures."""

from __future__ import annotations

import importlib
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.timeline.repository import TimelinePinRevisionConflict
from packages.contracts.identity import Permission
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import (
    TimelineApplicationPinSnapshot,
    TimelinePin,
    TimelinePinMutation,
    TimelinePinnedApplicationSubject,
    TimelinePinnedResourceSubject,
    TimelinePinSet,
)
from packages.runtime.dependencies import get_db


class PinRouterDb:
    def __init__(self) -> None:
        self.current = SimpleNamespace(
            user_id="user-a", workspace_id="workspace-a", roles=("operator",)
        )
        self.cluster_ids = {"cluster-a"}
        self.application_ids = {"application-a"}
        self.deployment_ids = {"application-a"}
        self.pin_set = TimelinePinSet(revision=0)
        self.resource_calls: list[dict[str, str]] = []
        self.application_calls: list[dict[str, str]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        if resource_type == "cluster" and permission == Permission.INVENTORY_READ.value:
            return set(self.cluster_ids)
        if resource_type == "application" and permission == Permission.APPLICATION_READ.value:
            return set(self.application_ids)
        if resource_type == "application" and permission == Permission.DEPLOYMENT_READ.value:
            return set(self.deployment_ids)
        return set()

    def read_timeline_pin_set(self, workspace_id: str, user_id: str) -> TimelinePinSet:
        assert (workspace_id, user_id) == ("workspace-a", "user-a")
        return self.pin_set

    def resolve_timeline_pin_resource(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        uid: str,
    ) -> TimelinePinnedResourceSubject | None:
        self.resource_calls.append(
            {"workspace_id": workspace_id, "cluster_id": cluster_id, "uid": uid}
        )
        if (workspace_id, cluster_id, uid) != ("workspace-a", "cluster-a", "deployment-uid"):
            return None
        return _resource_subject()

    def resolve_timeline_pin_application(
        self,
        *,
        workspace_id: str,
        application_id: str,
    ) -> TimelinePinnedApplicationSubject | None:
        self.application_calls.append(
            {"workspace_id": workspace_id, "application_id": application_id}
        )
        if (workspace_id, application_id) != ("workspace-a", "application-a"):
            return None
        return _application_subject()

    def put_timeline_pin(
        self,
        *,
        workspace_id: str,
        user_id: str,
        expected_revision: int,
        subject: TimelinePinnedResourceSubject | TimelinePinnedApplicationSubject,
    ) -> TimelinePinMutation:
        assert (workspace_id, user_id) == ("workspace-a", "user-a")
        if expected_revision != self.pin_set.revision:
            raise TimelinePinRevisionConflict(self.pin_set.revision)
        if any(pin.subject == subject for pin in self.pin_set.pins):
            return TimelinePinMutation(action="unchanged", pin_set=self.pin_set)
        pin = TimelinePin(
            pin_id=f"pin-{len(self.pin_set.pins) + 1}", subject=subject, created_at=_NOW
        )
        self.pin_set = TimelinePinSet(
            revision=self.pin_set.revision + 1,
            pins=(*self.pin_set.pins, pin),
        )
        return TimelinePinMutation(action="added", pin_set=self.pin_set)

    def delete_timeline_pin(
        self,
        *,
        workspace_id: str,
        user_id: str,
        pin_id: str,
        expected_revision: int,
    ) -> TimelinePinMutation:
        assert (workspace_id, user_id) == ("workspace-a", "user-a")
        if expected_revision != self.pin_set.revision:
            raise TimelinePinRevisionConflict(self.pin_set.revision)
        retained = tuple(pin for pin in self.pin_set.pins if pin.pin_id != pin_id)
        if len(retained) == len(self.pin_set.pins):
            return TimelinePinMutation(action="absent", pin_set=self.pin_set)
        self.pin_set = TimelinePinSet(revision=self.pin_set.revision + 1, pins=retained)
        return TimelinePinMutation(action="deleted", pin_set=self.pin_set)


_NOW = datetime(2026, 7, 16, tzinfo=UTC)


def _resource_subject() -> TimelinePinnedResourceSubject:
    resource = ResourceRef(
        api_group="apps",
        version="v1",
        kind="Deployment",
        namespace="payments",
        name="checkout",
        uid="deployment-uid",
    )
    return TimelinePinnedResourceSubject(
        scope=ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),
        resource=resource,
    )


def _application_subject() -> TimelinePinnedApplicationSubject:
    return TimelinePinnedApplicationSubject(
        application_id="application-a",
        snapshot=TimelineApplicationPinSnapshot(
            name="checkout",
            repository_id="repo-a",
            manifest_path="deploy/checkout.yaml",
        ),
    )


def _client(db: PinRouterDb) -> TestClient:
    module = importlib.import_module("domains.timeline.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: db.current
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_pin_routes_are_server_owned_revisioned_and_idempotent() -> None:
    db = PinRouterDb()
    client = _client(db)
    initial = client.get("/timeline/pins")

    assert initial.status_code == 200
    assert initial.headers["cache-control"] == "no-store"
    assert initial.json() == {"revision": 0, "pins": []}

    resource = _resource_subject()
    added = client.put(
        "/timeline/pins",
        json={
            "expected_revision": 0,
            "target": {
                "kind": "resource",
                "scope": resource.scope.model_dump(mode="json"),
                "resource": resource.resource.model_dump(mode="json"),
            },
        },
    )
    assert added.status_code == 200
    assert added.json()["action"] == "added"
    assert added.json()["pin_set"]["revision"] == 1
    assert added.json()["pin_set"]["pins"][0]["subject"] == resource.model_dump(mode="json")

    unchanged = client.put(
        "/timeline/pins",
        json={
            "expected_revision": 1,
            "target": {
                "kind": "resource",
                "scope": resource.scope.model_dump(mode="json"),
                "resource": resource.resource.model_dump(mode="json"),
            },
        },
    )
    assert unchanged.json()["action"] == "unchanged"
    assert unchanged.json()["pin_set"]["revision"] == 1

    stale = client.put(
        "/timeline/pins",
        json={
            "expected_revision": 0,
            "target": {
                "kind": "resource",
                "scope": resource.scope.model_dump(mode="json"),
                "resource": resource.resource.model_dump(mode="json"),
            },
        },
    )
    assert stale.status_code == 409

    pin_id = added.json()["pin_set"]["pins"][0]["pin_id"]
    db.cluster_ids.clear()  # revoked visibility does not delete the owner row
    assert client.get("/timeline/pins").json() == {"revision": 1, "pins": []}
    assert (
        db.pin_set.pins[0].subject.resource.name == "checkout"
    )  # rename/delete never rewrites snapshot

    deleted = client.delete(f"/timeline/pins/{pin_id}?expected_revision=1")
    assert deleted.json() == {"action": "deleted", "pin_set": {"revision": 2, "pins": []}}
    absent = client.delete("/timeline/pins/not-an-owner-pin?expected_revision=2")
    assert absent.json() == {"action": "absent", "pin_set": {"revision": 2, "pins": []}}


def test_pin_routes_materialize_application_snapshots_and_do_not_leak_unreadable_targets() -> None:
    db = PinRouterDb()
    client = _client(db)

    application = client.put(
        "/timeline/pins",
        json={
            "expected_revision": 0,
            "target": {"kind": "application", "application_id": "application-a"},
        },
    )
    assert application.status_code == 200
    subject = application.json()["pin_set"]["pins"][0]["subject"]
    assert subject == _application_subject().model_dump(mode="json")

    forbidden = client.put(
        "/timeline/pins",
        json={
            "expected_revision": 1,
            "target": {"kind": "application", "application_id": "application-hidden"},
        },
    )
    assert forbidden.status_code == 404
    assert db.application_calls == [
        {"workspace_id": "workspace-a", "application_id": "application-a"}
    ]

    stale_resource = _resource_subject().model_copy(
        update={"resource": _resource_subject().resource.model_copy(update={"name": "old-name"})}
    )
    mismatched = client.put(
        "/timeline/pins",
        json={
            "expected_revision": 1,
            "target": {
                "kind": "resource",
                "scope": stale_resource.scope.model_dump(mode="json"),
                "resource": stale_resource.resource.model_dump(mode="json"),
            },
        },
    )
    assert mismatched.status_code == 404
