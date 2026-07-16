from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.resource_access.router import router
from packages.runtime.dependencies import get_db


class AccessDb:
    def __init__(self, access: dict[str, object]) -> None:
        self.access = access

    def can_access(self, *_args: object) -> bool:
        return True

    def latest_inventory_snapshot(self, workspace_id: str, cluster_id: str) -> dict[str, object]:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        return {"summary": {"summary": {"resource_access": self.access}}}


def access_snapshot(*, completeness: str = "exact") -> dict[str, object]:
    return {
        "completeness": completeness,
        "observed_at": "2026-07-17T00:00:00Z",
        "reason_codes": [] if completeness == "exact" else ["role_bindings:rbac_denied"],
        "roles": [
            {
                "kind": "Role",
                "namespace": "shop",
                "name": "reader",
                "rules": [{"verbs": ["get"], "apiGroups": [""], "resources": ["pods"]}],
            }
        ],
        "cluster_roles": [],
        "role_bindings": [
            {
                "kind": "RoleBinding",
                "namespace": "shop",
                "name": "reader",
                "roleRef": {"kind": "Role", "name": "reader"},
                "subjects": [
                    {
                        "kind": "ServiceAccount",
                        "namespace": "shop",
                        "name": "checkout",
                    }
                ],
            }
        ],
        "cluster_role_bindings": [],
        "service_accounts": [{"namespace": "shop", "name": "checkout"}],
        "pod_subjects": [
            {
                "namespace": "shop",
                "name": "checkout-0",
                "service_account_name": "checkout",
            }
        ],
    }


def client(access: dict[str, object]) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        workspace_id="workspace-a",
        user_id="user-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: AccessDb(access)
    return TestClient(app)


def test_subject_role_and_namespace_routes_share_exact_snapshot() -> None:
    http = client(access_snapshot())

    subject = http.get(
        "/rbac/subject/ServiceAccount/shop/checkout",
        params={"cluster_id": "cluster-a"},
    )
    role = http.get(
        "/rbac/role/Role/shop/reader",
        params={"cluster_id": "cluster-a"},
    )
    namespace = http.get(
        "/rbac/namespace/shop",
        params={"cluster_id": "cluster-a"},
    )

    assert subject.status_code == role.status_code == namespace.status_code == 200
    assert subject.json()["direct"][0]["binding"]["name"] == "reader"
    assert role.json()["bindings"][0]["subjects"][0]["name"] == "checkout"
    assert namespace.json()["service_account_count"] == 1


def test_routes_fail_closed_for_partial_snapshot() -> None:
    response = client(access_snapshot(completeness="unavailable")).get(
        "/rbac/namespace/shop",
        params={"cluster_id": "cluster-a"},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "resource_access_incomplete"}


def test_routes_fail_closed_for_malformed_exact_snapshot() -> None:
    malformed = access_snapshot()
    malformed["roles"] = [
        {
            "kind": "Role",
            "namespace": "",
            "name": "reader",
            "rules": [],
        }
    ]

    response = client(malformed).get(
        "/rbac/namespace/shop",
        params={"cluster_id": "cluster-a"},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "resource_access_incomplete"}
