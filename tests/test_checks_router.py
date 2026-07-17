from __future__ import annotations

import importlib
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db, get_events


class ChecksDb:
    def __init__(self, *, owner: bool = True) -> None:
        self.owner = owner
        self.settings: dict[str, object] | None = None
        self.settings_context_revision = 11

    def is_service_admin(self, user_id: str) -> bool:
        assert user_id == "user-a"
        return self.owner

    def get_organization_member(self, workspace_id: str, user_id: str) -> None:
        assert (workspace_id, user_id) == ("workspace-a", "user-a")
        return None

    def get_checks_settings(self, **kwargs: object) -> dict[str, object] | None:
        assert kwargs == {"workspace_id": "workspace-a", "user_id": "user-a"}
        return self.settings

    def put_checks_settings(self, **kwargs: object) -> dict[str, object] | None:
        current_revision = int((self.settings or {}).get("revision") or 0)
        if kwargs["expected_revision"] != current_revision:
            return None
        self.settings = {
            "workspace_id": kwargs["workspace_id"],
            "user_id": kwargs["user_id"],
            "policy": kwargs["policy"],
            "revision": current_revision + 1,
            "invalidation_generation": int(
                (self.settings or {}).get("invalidation_generation") or 0
            )
            + 1,
            "updated_at": "2026-07-17T10:00:00Z",
        }
        return self.settings

    def resolve_authorized_namespaces(self, **kwargs: object) -> set[str]:
        assert kwargs["workspace_id"] == "workspace-a"
        assert kwargs["snapshot_revision"] == 11
        return set(kwargs["namespaces"]).intersection({"storefront", "platform"})

    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        assert workspace_id == "workspace-a"
        if resource_type == "cluster" and permission == Permission.INVENTORY_READ.value:
            return {"cluster-a", "cluster-b"}
        return set()

    def filter_snapshot_contexts(
        self,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        return {
            cluster_id: {
                "snapshot_revision": self.settings_context_revision,
                "observed_at": "2026-07-16T09:00:00+00:00",
                "labels_complete": True,
                "resources_complete": cluster_id == "cluster-a",
                "application_bindings_complete": True,
                "partial_reason_codes": []
                if cluster_id == "cluster-a"
                else ["agent_snapshot_truncated"],
            }
            for cluster_id in cluster_ids
        }

    def latest_inventory_snapshots(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        observed_at = datetime.now(UTC).isoformat()
        return {
            cluster_id: {
                "summary": {
                    "summary": {
                        "checks_observation": {
                            "availability": "available",
                            "observed_at": observed_at,
                            "namespaces": [],
                            "reason_codes": [],
                            "findings": [
                                {
                                    "finding_id": f"finding-{cluster_id}",
                                    "check_id": "workload-limits",
                                    "category": "resources",
                                    "severity": "warning",
                                    "message": "Container limits are not observed.",
                                    "resource": {
                                        "api_group": "apps",
                                        "version": "v1",
                                        "kind": "Deployment",
                                        "namespace": "storefront",
                                        "name": "checkout",
                                        "uid": f"uid-{cluster_id}",
                                    },
                                }
                            ],
                            "catalog": [
                                {
                                    "check_id": "workload-limits",
                                    "title": "Workload limits",
                                    "category": "resources",
                                    "severity": "warning",
                                    "description": "Checks resource limits.",
                                    "remediation": "Set resource limits.",
                                }
                            ],
                            "visibility": {
                                "state": "ok",
                                "namespace_scope": [],
                                "core": {"deployments": "allowed"},
                                "missing_optional_kinds": [],
                            },
                        }
                    }
                }
            }
            for cluster_id in cluster_ids
        }


class ChecksEvents:
    def __init__(self) -> None:
        self.subjects: list[str] = []

    async def accept_body(self, body: object, **kwargs: object) -> object:
        self.subjects.append(str(body.__subject__))  # type: ignore[attr-defined]
        kwargs["transactional_stage"](object(), object())
        return SimpleNamespace(event=SimpleNamespace(event_id=f"evt-{len(self.subjects)}"))


def _client(
    db: ChecksDb | None = None,
    events: ChecksEvents | None = None,
) -> TestClient:
    module = importlib.import_module("domains.checks.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db or ChecksDb()
    app.dependency_overrides[get_events] = lambda: events or ChecksEvents()
    return TestClient(app)


def test_checks_overview_is_scope_and_permission_bound_to_agent_observations() -> None:
    response = _client().get(
        "/checks/overview?clusters=cluster-a,cluster-b&namespaces=cluster-a/storefront"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["scope_coverage"]["availability"] == "partial"
    assert body["scope_coverage"]["scopes"] == [
        {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "namespaces": ["storefront"],
            "freshness": "live",
        },
        {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-b",
            "namespaces": [],
            "freshness": "partial",
        },
    ]
    assert body["result_set"]["availability"] == "partial"
    assert body["result_set"]["total_check_count"] == 1
    assert body["result_set"]["total_finding_count"] == 2
    assert {finding["cluster_id"] for finding in body["result_set"]["checks"]} == {
        "cluster-a",
        "cluster-b",
    }
    assert body["catalog"]["entries"][0]["check_id"] == "workload-limits"
    assert body["visibility"]["clusters"][0]["state"] == "ok"


def test_checks_overview_filters_exact_resource_identity_and_rejects_ambiguous_scope() -> None:
    client = _client()
    query = (
        "clusters=cluster-a&namespaces=cluster-a/storefront"
        "&resource_group=apps&resource_version=v1&resource_kind=Deployment"
        "&resource_namespace=storefront&resource_name=checkout&resource_uid=uid-cluster-a"
    )

    response = client.get(f"/checks/overview?{query}")
    wrong_uid = client.get(f"/checks/overview?{query.replace('uid-cluster-a', 'replacement-uid')}")
    incomplete = client.get("/checks/overview?clusters=cluster-a&resource_kind=Deployment")
    ambiguous = client.get(
        "/checks/overview?clusters=cluster-a,cluster-b"
        "&resource_version=v1&resource_kind=Node&resource_name=node-a&resource_uid=uid-node-a"
    )
    unbounded_namespace = client.get(
        "/checks/overview?clusters=cluster-a"
        "&resource_group=apps&resource_version=v1&resource_kind=Deployment"
        "&resource_namespace=storefront&resource_name=checkout&resource_uid=uid-cluster-a"
    )

    assert response.status_code == 200
    assert response.json()["result_set"]["total_finding_count"] == 1
    assert wrong_uid.status_code == 200
    assert wrong_uid.json()["result_set"]["total_finding_count"] == 0
    assert incomplete.status_code == 422
    assert ambiguous.status_code == 422
    assert unbounded_namespace.status_code == 422


def test_checks_detail_resolves_an_agent_reported_catalog_entry() -> None:
    response = _client().get("/checks/workload-limits?clusters=cluster-a")

    assert response.status_code == 200
    body = response.json()
    assert body["detail"]["requested_check_id"] == "workload-limits"
    assert body["detail"]["title"] == "Workload limits"
    assert body["detail"]["affected_resource_count"] == 1
    assert body["detail"]["findings"][0]["cluster_id"] == "cluster-a"


def test_checks_hides_unauthorized_scope_and_rejects_invalid_scope_or_identity() -> None:
    client = _client()

    denied = client.get("/checks/overview?clusters=cluster-private")
    invalid_scope = client.get("/checks/overview?namespaces=not-a-reference")
    invalid_check_id = client.get("/checks/%20workload-limits?clusters=cluster-a")

    assert denied.status_code == 404
    assert invalid_scope.status_code == 422
    assert invalid_check_id.status_code == 422


def test_checks_settings_are_revisioned_audited_and_applied_to_agent_results() -> None:
    db = ChecksDb()
    events = ChecksEvents()
    client = _client(db, events)

    initial = client.get("/settings/audit")
    assert initial.status_code == 200
    assert initial.json() == {
        "workspace_id": "workspace-a",
        "user_id": "user-a",
        "policy": {
            "hidden_check_ids": [],
            "hidden_categories": [],
            "hidden_namespaces": [],
        },
        "revision": 0,
        "invalidation_generation": 0,
        "can_edit": True,
        "updated_at": None,
    }

    updated = client.put(
        "/settings/audit",
        json={
            "expected_revision": 0,
            "policy": {
                "hidden_check_ids": [],
                "hidden_categories": [],
                "hidden_namespaces": ["cluster-a/storefront"],
            },
        },
    )
    assert updated.status_code == 200
    assert updated.json()["revision"] == 1
    assert updated.json()["invalidation_generation"] == 1
    assert updated.json()["audit_event_id"] == "evt-1"
    assert events.subjects == ["checks.settings.updated"]

    overview = client.get("/checks/overview?clusters=cluster-a")
    assert overview.status_code == 200
    assert overview.json()["result_set"]["checks"] == []
    assert overview.json()["result_set"]["total_finding_count"] == 0


def test_checks_settings_reject_stale_unauthorized_partial_and_secret_input() -> None:
    db = ChecksDb()
    events = ChecksEvents()
    client = _client(db, events)

    forbidden = client.put(
        "/settings/audit",
        json={
            "expected_revision": 0,
            "policy": {
                "hidden_check_ids": [],
                "hidden_categories": [],
                "hidden_namespaces": ["cluster-private/secret"],
            },
        },
    )
    invalid = client.put(
        "/settings/audit",
        json={
            "expected_revision": 0,
            "policy": {
                "hidden_check_ids": ["workload-limits"],
                "hidden_categories": [],
                "hidden_namespaces": [],
                "credential": "must-not-cross-the-contract",
            },
        },
    )
    accepted = client.put(
        "/settings/audit",
        json={
            "expected_revision": 0,
            "policy": {
                "hidden_check_ids": ["workload-limits"],
                "hidden_categories": [],
                "hidden_namespaces": [],
            },
        },
    )
    conflict = client.put(
        "/settings/audit",
        json={
            "expected_revision": 0,
            "policy": {
                "hidden_check_ids": [],
                "hidden_categories": ["resources"],
                "hidden_namespaces": [],
            },
        },
    )

    assert forbidden.status_code == 403
    assert invalid.status_code == 422
    assert accepted.status_code == 200
    assert conflict.status_code == 409
    assert db.settings is not None and db.settings["revision"] == 1

    partial_db = ChecksDb()
    partial_db.settings_context_revision = 0
    partial = _client(partial_db).put(
        "/settings/audit",
        json={
            "expected_revision": 0,
            "policy": {
                "hidden_check_ids": [],
                "hidden_categories": [],
                "hidden_namespaces": ["cluster-a/storefront"],
            },
        },
    )
    assert partial.status_code == 409
    assert partial_db.settings is None


def test_checks_settings_write_requires_server_owned_owner_authority() -> None:
    client = _client(ChecksDb(owner=False))

    readable = client.get("/settings/audit")
    denied = client.put(
        "/settings/audit",
        json={
            "expected_revision": 0,
            "policy": {
                "hidden_check_ids": [],
                "hidden_categories": [],
                "hidden_namespaces": [],
            },
        },
    )

    assert readable.status_code == 200
    assert readable.json()["can_edit"] is False
    assert denied.status_code == 403
