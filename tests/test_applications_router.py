from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from domains.applications.router import (
    connect_application,
    list_application_deployments,
    list_applications,
    upsert_application,
    upsert_application_deployment,
)
from domains.gitops.repository import derive_repository_id
from packages.contracts.gateway.requests import (
    ApplicationConnectRequest,
    ApplicationUpsertRequest,
    DeploymentBindingUpsertRequest,
)
from packages.contracts.gateway.responses import RepositoryManifestValidationResponse


class StubApplicationsDb:
    def __init__(
        self,
        *,
        connected_cluster_ids: set[str] | None = None,
        clusters: list[dict[str, object]] | None = None,
    ) -> None:
        self.registered_repositories: list[dict[str, object]] = []
        self.registered_watch_targets: list[dict[str, object]] = []
        self.registered_bindings: list[dict[str, object]] = []
        self.upserted_applications: list[dict[str, object]] = []
        self.credentials: list[dict[str, object]] = []
        self.registration_calls: list[str] = []
        self.access_checks: list[tuple[str, str, str, str, str]] = []
        self.connected_cluster_ids = (
            {"cluster-1"} if connected_cluster_ids is None else connected_cluster_ids
        )
        self.clusters = clusters or [
            {
                "workspace_id": "ws-1",
                "cluster_id": "cluster-1",
                "name": "cluster-1",
                "environment": "prod",
            }
        ]
        self.application = {
            "application_id": "app-1",
            "workspace_id": "ws-1",
            "repository_id": "repo-1",
            "name": "checkout-api",
            "manifest_path": "deploy.yaml",
            "default_branch": "release",
            "status": "active",
            "metadata": {"team": "payments"},
        }

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        _permission: str,
    ) -> set[str]:
        if resource_type == "cluster":
            return {"cluster-1"}
        if resource_type == "application":
            return {"app-1"}
        return set()

    def list_filtered_applications(self, **kwargs: object) -> dict[str, object]:
        assert kwargs["workspace_id"] == "ws-1"
        assert kwargs["allowed_cluster_ids"] == {"cluster-1"}
        assert kwargs["allowed_application_ids"] == {"app-1"}
        return {"items": [{"application_id": "app-1"}], "has_more": False}

    def list_applications(
        self,
        workspace_id: str,
        *,
        application_ids: set[str] | None,
        limit: int,
    ) -> list[dict[str, object]]:
        assert workspace_id == "ws-1"
        assert application_ids == {"app-1"}
        assert limit == 50
        return [self.application]

    def register_repository(self, payload: dict[str, object]) -> dict[str, object]:
        self.registration_calls.append("repository")
        self.registered_repositories.append(payload)
        return {**payload, "repository_id": "repo-1"}

    def get_repository_by_ref(self, _workspace_id: str, _repo_ref: str) -> dict[str, object] | None:
        return None

    def upsert_workspace_credential(self, payload: dict[str, object]) -> None:
        self.credentials.append(payload)

    def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
        self.upserted_applications.append(payload)
        return {**payload, "application_id": "app-1", "repository_id": "repo-1"}

    def get_application(
        self,
        workspace_id: str,
        application_id: str,
    ) -> dict[str, object] | None:
        if workspace_id == "ws-1" and application_id == "app-1":
            return self.application
        return None

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.access_checks.append((user_id, workspace_id, resource_type, resource_id, permission))
        return True

    def latest_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "ws-1"
        return {
            cluster_id: {
                "workspace_id": "ws-1",
                "cluster_id": cluster_id,
                "agent_id": f"agent-{cluster_id}",
                "status": "connected",
                "capabilities": ["inventory", "commands"],
                "details": {},
                "last_seen_at": datetime.now(UTC).isoformat(),
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
            for cluster_id in cluster_ids
            if cluster_id in self.connected_cluster_ids
        }

    def list_cluster_registrations(self, workspace_id: str) -> list[dict[str, object]]:
        assert workspace_id == "ws-1"
        return self.clusters

    def get_cluster_registration(
        self, workspace_id: str, cluster_id: str
    ) -> dict[str, object] | None:
        assert workspace_id == "ws-1"
        return next(
            (cluster for cluster in self.clusters if cluster["cluster_id"] == cluster_id),
            None,
        )

    def list_application_deployment_bindings(
        self,
        workspace_id: str,
        application_id: str,
        *,
        limit: int,
    ) -> list[dict[str, object]]:
        assert workspace_id == "ws-1"
        assert application_id == "app-1"
        assert limit == 500
        return [
            {
                "binding_id": "binding-1",
                "workspace_id": "ws-1",
                "repository_id": "repo-1",
                "watch_target_id": "watch-1",
                "cluster_id": "cluster-1",
                "namespace": "prod",
                "app_name": "checkout-api",
                "manifest_path": "deploy.yaml",
                "environment": "prod",
                "gitops_poll": {
                    "status": "failed",
                    "status_code": 403,
                    "error_kind": "access_denied",
                    "error": "GitHub token cannot read repository",
                    "last_seen_commit_sha": "sha-1",
                    "last_polled_at": "2026-07-10T10:00:00+00:00",
                },
            }
        ]

    def list_application_workflow_runs(
        self,
        workspace_id: str,
        application_id: str,
        *,
        limit: int,
    ) -> list[dict[str, object]]:
        assert workspace_id == "ws-1"
        assert application_id == "app-1"
        assert limit in {25, 100}
        return [
            {
                "workflow_run_id": "run-1",
                "cluster_id": "cluster-1",
                "environment": "prod",
                "commit_sha": "sha-1",
                "status": "succeeded",
                "summary": "deployed checkout",
                "metadata": {"version": "v1", "deployed_by": "user-1"},
                "updated_at": "2026-07-10T10:00:00+00:00",
                "steps": [
                    {
                        "name": "diff",
                        "updated_at": "2026-07-10T09:59:00+00:00",
                        "details": {"status": "no_change", "has_changes": False, "changes": []},
                    }
                ],
            }
        ]

    def filter_snapshot_context(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, object]:
        assert workspace_id == "ws-1"
        assert cluster_ids == {"cluster-1"}
        return {
            "snapshot_revision": 42,
            "resources_complete": True,
            "application_bindings_complete": True,
        }

    def get_application_inventory_evidence(self, **kwargs: object) -> list[dict[str, object]]:
        assert kwargs["workspace_id"] == "ws-1"
        assert kwargs["application_id"] == "app-1"
        return [
            {
                "id": "pod-1",
                "resource_type": "pod",
                "kind": "Pod",
                "name": "checkout-1",
                "status": "Running",
                "health": "healthy",
                "binding_complete": True,
                "summary": {
                    "restart_total": 1,
                    "conditions": [{"type": "Ready", "status": "True"}],
                    "image": "ghcr.io/example/checkout:v1@sha256:abc",
                },
            }
        ]

    def get_application_incident_evidence(self, **kwargs: object) -> dict[str, object]:
        assert kwargs["workspace_id"] == "ws-1"
        assert kwargs["application_id"] == "app-1"
        return {"complete": True, "open_count": 0, "items": []}

    def register_watch_target(self, payload: dict[str, object]) -> dict[str, object]:
        self.registration_calls.append("watch")
        self.registered_watch_targets.append(payload)
        return {**payload, "watch_target_id": "watch-1"}

    def register_deployment_binding(self, payload: dict[str, object]) -> dict[str, object]:
        self.registration_calls.append("binding")
        self.registered_bindings.append(payload)
        return {**payload, "binding_id": "binding-1"}


def current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id="ws-1")


class StubRepositoryDiscovery:
    async def validate_manifest(
        self,
        payload: object,
    ) -> RepositoryManifestValidationResponse:
        return RepositoryManifestValidationResponse(
            repo_ref=payload.repo_ref,
            branch=payload.branch,
            manifest_path=payload.manifest_path,
            valid=True,
            status="valid",
            validation_mode="static-parse",
            resource_count=2,
            resources=[],
            warnings=["server-side static validation"],
            errors=[],
        )


def test_list_applications_uses_accessible_application_ids() -> None:
    async def run():
        return await list_applications(
            clusters=None,
            namespaces=None,
            applications=None,
            labels=None,
            applications_environment=None,
            applications_status=None,
            applications_pending_promotion=None,
            applications_q=None,
            limit=50,
            current=current_session(),
            db=StubApplicationsDb(),
        )

    response = asyncio.run(run())

    assert response.applications[0].id == "app-1"
    assert response.applications[0].repository_ref is None
    assert response.applications[0].resource_counts[0].kind == "Pod"


def test_upsert_application_registers_repository_when_repo_ref_is_present() -> None:
    db = StubApplicationsDb()

    async def run():
        return await upsert_application(
            ApplicationUpsertRequest(
                name="checkout-api",
                repo_ref="org/checkout",
                metadata={"team": "payments"},
            ),
            current=SimpleNamespace(
                user_id="admin-1",
                roles=("service_admin",),
                workspace_id="ws-1",
            ),
            db=db,
        )

    response = asyncio.run(run())

    assert response.application["application_id"] == "app-1"
    assert db.registered_repositories[0]["repo_ref"] == "org/checkout"
    assert db.registered_repositories[0]["user_id"] == "admin-1"


def test_create_application_rejects_explicit_repository_id_before_writes() -> None:
    db = StubApplicationsDb()

    async def run():
        return await upsert_application(
            ApplicationUpsertRequest(
                name="checkout-api",
                repo_ref="org/checkout",
                repository_id="client-controlled-repository",
            ),
            current=current_session(),
            db=db,
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 422
    assert db.registered_repositories == []
    assert db.upserted_applications == []


def test_connect_application_registers_repo_watch_binding_atomically() -> None:
    db = StubApplicationsDb()

    async def run():
        return await connect_application(
            ApplicationConnectRequest(
                name="checkout-api",
                repo_ref="org/checkout",
                branch="release",
                manifest_path="deploy/kustomization.yaml",
                source_type="kustomize",
                cluster_id="cluster-1",
                namespace="prod",
                metadata={"team": "payments"},
            ),
            current=current_session(),
            db=db,
            discovery=StubRepositoryDiscovery(),
        )

    response = asyncio.run(run())

    assert response.application["application_id"] == "app-1"
    assert db.registration_calls == ["repository", "watch", "binding"]
    assert db.registered_repositories[0]["repo_ref"] == "org/checkout"
    assert db.registered_repositories[0]["default_branch"] == "release"
    assert db.registered_repositories[0]["metadata"]["source_type"] == "kustomize"
    assert db.registered_repositories[0]["metadata"]["validated_resource_count"] == 2
    assert db.registered_watch_targets[0]["cluster_id"] == "cluster-1"
    assert db.registered_watch_targets[0]["namespace"] == "prod"
    assert db.registered_watch_targets[0]["manifest_path"] == "deploy/kustomization.yaml"
    assert db.registered_watch_targets[0]["settings"]["source_type"] == "kustomize"
    assert db.registered_watch_targets[0]["deploy_policy"]["manifest_source"] == "kustomize"
    assert db.registered_bindings[0]["repository_id"] == "repo-1"
    assert db.access_checks == [
        ("user-1", "ws-1", "cluster", "cluster-1", "deploy.run"),
    ]


def test_connect_application_stores_github_token_as_credential_ref(monkeypatch) -> None:
    monkeypatch.setenv("CREDENTIAL_ENCRYPTION_KEY", "local-test-key")
    db = StubApplicationsDb()

    async def run():
        return await connect_application(
            ApplicationConnectRequest(
                name="checkout-api",
                repo_ref="org/checkout",
                token="ghp_secret-token",
                branch="release",
                manifest_path="deploy/kustomization.yaml",
                source_type="kustomize",
                cluster_id="cluster-1",
            ),
            current=current_session(),
            db=db,
            discovery=StubRepositoryDiscovery(),
        )

    asyncio.run(run())

    repository_id = derive_repository_id({"workspace_id": "ws-1", "repo_ref": "org/checkout"})
    expected_scope = f"repository:{repository_id}"
    assert db.credentials
    assert db.credentials[0]["provider"] == "github"
    assert db.credentials[0]["scope"] == expected_scope
    assert db.credentials[0]["encrypted_value"] != "ghp_secret-token"
    assert db.registered_repositories[0]["credential_ref"] == f"db:github:{expected_scope}"


def test_connect_application_rejects_disconnected_cluster_before_write() -> None:
    db = StubApplicationsDb(connected_cluster_ids=set())

    async def run():
        return await connect_application(
            ApplicationConnectRequest(
                name="checkout-api",
                repo_ref="org/checkout",
                branch="release",
                manifest_path="deploy/kustomization.yaml",
                source_type="kustomize",
                cluster_id="cluster-1",
                namespace="prod",
            ),
            current=current_session(),
            db=db,
            discovery=StubRepositoryDiscovery(),
        )

    with pytest.raises(Exception) as exc:
        asyncio.run(run())

    assert getattr(exc.value, "status_code", None) == 400
    assert exc.value.detail == {
        "code": "cluster_not_connected",
        "detail": "에이전트가 연결되지 않은 클러스터입니다",
        "clusters": ["cluster-1"],
    }
    assert db.registration_calls == []


def test_connect_application_returns_422_for_invalid_source_type() -> None:
    db = StubApplicationsDb()

    async def run():
        return await connect_application(
            ApplicationConnectRequest(
                name="checkout-api",
                repo_ref="org/checkout",
                branch="release",
                manifest_path="deploy/kustomization.yaml",
                source_type="zip",
                cluster_id="cluster-1",
            ),
            current=current_session(),
            db=db,
            discovery=StubRepositoryDiscovery(),
        )

    with pytest.raises(Exception) as exc:
        asyncio.run(run())

    assert getattr(exc.value, "status_code", None) == 422
    assert "source_type must be" in str(getattr(exc.value, "detail", ""))
    assert db.registration_calls == []


def test_upsert_application_deployment_requires_app_and_cluster_access() -> None:
    db = StubApplicationsDb()

    async def run():
        return await upsert_application_deployment(
            "app-1",
            DeploymentBindingUpsertRequest(cluster_id="cluster-1", namespace="sandbox"),
            current=current_session(),
            db=db,
        )

    response = asyncio.run(run())

    assert response.deployment["binding_id"] == "binding-1"
    assert response.deployment["app_name"] == "checkout-api"
    assert response.deployment["repository_id"] == "repo-1"
    assert db.registration_calls == ["watch", "binding"]
    assert db.registered_watch_targets[0]["branch"] == "release"
    assert db.registered_watch_targets[0]["manifest_path"] == "deploy.yaml"
    assert db.registered_bindings[0]["branch"] == "release"
    assert db.access_checks == [
        ("user-1", "ws-1", "application", "app-1", "application.manage"),
        ("user-1", "ws-1", "cluster", "cluster-1", "deploy.run"),
    ]


def test_list_application_deployments_returns_strict_workflow_history() -> None:
    db = StubApplicationsDb()

    async def run():
        return await list_application_deployments(
            "app-1",
            limit=25,
            current=current_session(),
            db=db,
        )

    response = asyncio.run(run())

    assert response.deployments[0].id == "run-1"
    assert response.deployments[0].git_sha == "sha-1"
    assert response.deployments[0].version == "v1"
    assert response.deployments[0].status == "succeeded"
    assert db.access_checks == [
        ("user-1", "ws-1", "application", "app-1", "deployment.read"),
    ]


def test_upsert_application_deployment_rejects_disconnected_cluster() -> None:
    db = StubApplicationsDb(connected_cluster_ids=set())

    async def run():
        return await upsert_application_deployment(
            "app-1",
            DeploymentBindingUpsertRequest(cluster_id="cluster-1", namespace="sandbox"),
            current=current_session(),
            db=db,
        )

    with pytest.raises(Exception) as exc:
        asyncio.run(run())

    assert getattr(exc.value, "status_code", None) == 400
    assert exc.value.detail["code"] == "cluster_not_connected"
    assert exc.value.detail["clusters"] == ["cluster-1"]
    assert db.registration_calls == []


def test_global_application_deployment_reports_mixed_disconnected_targets() -> None:
    db = StubApplicationsDb(
        connected_cluster_ids={"cluster-1"},
        clusters=[
            {"workspace_id": "ws-1", "cluster_id": "cluster-1", "name": "cluster-1"},
            {"workspace_id": "ws-1", "cluster_id": "cluster-2", "name": "cluster-2"},
        ],
    )

    async def run():
        return await upsert_application_deployment(
            "app-1",
            DeploymentBindingUpsertRequest(cluster_id="*", namespace="sandbox"),
            current=current_session(),
            db=db,
        )

    with pytest.raises(Exception) as exc:
        asyncio.run(run())

    assert getattr(exc.value, "status_code", None) == 400
    assert exc.value.detail == {
        "code": "cluster_not_connected",
        "detail": "에이전트가 연결되지 않은 클러스터입니다",
        "clusters": ["cluster-2"],
    }
    assert db.registration_calls == []


def test_global_application_deployment_excludes_management_cluster() -> None:
    db = StubApplicationsDb(
        connected_cluster_ids={"cluster-1"},
        clusters=[
            {
                "workspace_id": "ws-1",
                "cluster_id": "cluster-1",
                "name": "cluster-1",
                "settings": {"cluster_role": "target"},
            },
            {
                "workspace_id": "ws-1",
                "cluster_id": "kubernetes-ops",
                "name": "kubernetes-ops",
                "settings": {"cluster_role": "management"},
            },
        ],
    )

    async def run():
        return await upsert_application_deployment(
            "app-1",
            DeploymentBindingUpsertRequest(cluster_id="*", namespace="sandbox"),
            current=current_session(),
            db=db,
        )

    response = asyncio.run(run())

    assert response.deployment["cluster_id"] == "cluster-1"
    assert [binding["cluster_id"] for binding in db.registered_bindings] == ["cluster-1"]
    assert all(check[3] != "kubernetes-ops" for check in db.access_checks)


@pytest.mark.parametrize("connect_route", [False, True])
def test_explicit_management_binding_is_rejected(connect_route: bool) -> None:
    db = StubApplicationsDb(
        connected_cluster_ids={"kubernetes-ops"},
        clusters=[
            {
                "workspace_id": "ws-1",
                "cluster_id": "kubernetes-ops",
                "name": "kubernetes-ops",
                "settings": {"cluster_role": "management"},
            }
        ],
    )

    async def run():
        if connect_route:
            return await connect_application(
                ApplicationConnectRequest(
                    name="checkout-api",
                    repo_ref="org/checkout",
                    branch="release",
                    manifest_path="deploy/kustomization.yaml",
                    source_type="kustomize",
                    cluster_id="kubernetes-ops",
                ),
                current=current_session(),
                db=db,
                discovery=StubRepositoryDiscovery(),
            )
        return await upsert_application_deployment(
            "app-1",
            DeploymentBindingUpsertRequest(cluster_id="kubernetes-ops", namespace="management"),
            current=current_session(),
            db=db,
        )

    with pytest.raises(Exception) as exc:
        asyncio.run(run())

    assert getattr(exc.value, "status_code", None) == 400
    assert exc.value.detail == {
        "code": "management_readonly",
        "detail": "management 클러스터는 읽기 전용입니다",
    }
    assert db.registration_calls == []
