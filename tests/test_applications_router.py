from __future__ import annotations

import asyncio
from types import SimpleNamespace

from domains.applications.router import (
    connect_application,
    list_applications,
    upsert_application,
    upsert_application_deployment,
)
from packages.contracts.gateway.requests import (
    ApplicationConnectRequest,
    ApplicationUpsertRequest,
    DeploymentBindingUpsertRequest,
)
from packages.contracts.gateway.responses import RepositoryManifestValidationResponse


class FakeApplicationsDb:
    def __init__(self) -> None:
        self.registered_repositories: list[dict[str, object]] = []
        self.registered_watch_targets: list[dict[str, object]] = []
        self.registered_bindings: list[dict[str, object]] = []
        self.registration_calls: list[str] = []
        self.access_checks: list[tuple[str, str, str, str, str]] = []
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
        _resource_type: str,
        _permission: str,
    ) -> set[str]:
        return {"app-1"}

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

    def upsert_application(self, payload: dict[str, object]) -> dict[str, object]:
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


class FakeRepositoryDiscovery:
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
        return await list_applications(limit=50, current=current_session(), db=FakeApplicationsDb())

    response = asyncio.run(run())

    assert response.applications[0]["application_id"] == "app-1"


def test_upsert_application_registers_repository_when_repo_ref_is_present() -> None:
    db = FakeApplicationsDb()

    async def run():
        return await upsert_application(
            ApplicationUpsertRequest(
                name="checkout-api",
                repo_ref="org/checkout",
                metadata={"team": "payments"},
            ),
            current=current_session(),
            db=db,
        )

    response = asyncio.run(run())

    assert response.application["application_id"] == "app-1"
    assert db.registered_repositories[0]["repo_ref"] == "org/checkout"
    assert db.registered_repositories[0]["user_id"] == "user-1"


def test_connect_application_registers_repo_watch_binding_atomically() -> None:
    db = FakeApplicationsDb()

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
            discovery=FakeRepositoryDiscovery(),
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


def test_upsert_application_deployment_requires_app_and_cluster_access() -> None:
    db = FakeApplicationsDb()

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
