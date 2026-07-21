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
from packages.contracts.demo_seed import DEMO_SEED_MARKER_KEY
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
        self.workflow_runs: list[dict[str, object]] = []
        self.workflow_steps: list[dict[str, object]] = []
        self.manifest_artifacts: list[dict[str, object]] = []
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

    def get_application_catalog_states(
        self,
        *,
        workspace_id: str,
        application_ids: list[str],
        allowed_cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "ws-1"
        assert application_ids == ["app-1"]
        assert allowed_cluster_ids == {"cluster-1"}
        return {
            "app-1": {
                "bindings": self.list_application_deployment_bindings(
                    workspace_id,
                    "app-1",
                    limit=500,
                ),
                "runs": self.list_application_workflow_runs(
                    workspace_id,
                    "app-1",
                    limit=100,
                ),
                "inventory_rows": self.get_application_inventory_evidence(
                    workspace_id=workspace_id,
                    application_id="app-1",
                    allowed_cluster_ids=allowed_cluster_ids,
                ),
                "inventory_context": self.filter_snapshot_context(
                    workspace_id,
                    allowed_cluster_ids,
                ),
                "incident_evidence": self.get_application_incident_evidence(
                    workspace_id=workspace_id,
                    application_id="app-1",
                    allowed_cluster_ids=allowed_cluster_ids,
                    limit=3,
                ),
            }
        }

    def register_watch_target(self, payload: dict[str, object]) -> dict[str, object]:
        self.registration_calls.append("watch")
        self.registered_watch_targets.append(payload)
        return {**payload, "watch_target_id": "watch-1"}

    def register_deployment_binding(self, payload: dict[str, object]) -> dict[str, object]:
        self.registration_calls.append("binding")
        self.registered_bindings.append(payload)
        return {**payload, "binding_id": "binding-1"}

    def start_workflow_run(self, payload: dict[str, object]) -> None:
        self.workflow_runs.append(payload)

    def record_workflow_step(self, payload: dict[str, object]) -> None:
        self.workflow_steps.append(payload)

    def record_manifest_artifact(self, payload: dict[str, object]) -> None:
        self.manifest_artifacts.append(payload)


class BulkCatalogApplicationsDb(StubApplicationsDb):
    def __init__(self) -> None:
        super().__init__()
        self.application_ids = [f"app-{index:03d}" for index in range(200)]
        self.catalog_calls: list[dict[str, object]] = []

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
            return set(self.application_ids)
        return set()

    def list_filtered_applications(self, **kwargs: object) -> dict[str, object]:
        assert kwargs["allowed_application_ids"] == set(self.application_ids)
        return {
            "items": [
                {"application_id": application_id} for application_id in self.application_ids
            ],
            "has_more": False,
        }

    def list_applications(
        self,
        workspace_id: str,
        *,
        application_ids: set[str] | None,
        limit: int,
    ) -> list[dict[str, object]]:
        assert workspace_id == "ws-1"
        assert application_ids == set(self.application_ids)
        assert limit == 200
        return [
            {
                **self.application,
                "application_id": application_id,
                "name": f"application-{index:03d}",
            }
            for index, application_id in enumerate(self.application_ids)
        ]

    def get_application_catalog_states(
        self,
        *,
        workspace_id: str,
        application_ids: list[str],
        allowed_cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        self.catalog_calls.append(
            {
                "workspace_id": workspace_id,
                "application_ids": list(application_ids),
                "allowed_cluster_ids": set(allowed_cluster_ids),
            }
        )
        state = {
            "bindings": [],
            "runs": [],
            "inventory_rows": [],
            "inventory_context": {
                "snapshot_revision": 0,
                "observed_at": None,
                "labels_complete": True,
                "resources_complete": True,
                "application_bindings_complete": True,
                "partial_reason_codes": [],
            },
            "incident_evidence": {"complete": True, "open_count": 0, "items": []},
        }
        return {application_id: dict(state) for application_id in application_ids}


def current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id="ws-1")


class StubRepositoryDiscovery:
    revision = "a" * 40

    async def resolve_branch_revision(self, repo_ref: str, branch: str) -> str:
        assert repo_ref == "org/checkout"
        assert branch == "release"
        return self.revision

    async def validate_manifests_at_revision(
        self,
        payloads: tuple[object, ...],
        *,
        expected_revision: str,
    ) -> SimpleNamespace:
        assert expected_revision == self.revision
        assert len(payloads) == 1
        payload = payloads[0]
        return SimpleNamespace(
            repo_ref=payload.repo_ref,
            branch=payload.branch,
            revision=self.revision,
            validations=(
                RepositoryManifestValidationResponse(
                    repo_ref=payload.repo_ref,
                    branch=payload.branch,
                    manifest_path=payload.manifest_path,
                    valid=True,
                    status="valid",
                    validation_mode="kustomize-render",
                    resource_count=2,
                    resources=[
                        {
                            "api_version": "apps/v1",
                            "kind": "Deployment",
                            "namespace": "prod",
                            "name": "checkout-api",
                        },
                        {
                            "api_version": "v1",
                            "kind": "Service",
                            "namespace": "prod",
                            "name": "checkout-api",
                        },
                    ],
                    warnings=["server-side static validation"],
                    errors=[],
                ),
            ),
        )


class IncompleteRepositoryDiscovery(StubRepositoryDiscovery):
    async def validate_manifests_at_revision(
        self,
        payloads: tuple[object, ...],
        *,
        expected_revision: str,
    ) -> SimpleNamespace:
        result = await super().validate_manifests_at_revision(
            payloads,
            expected_revision=expected_revision,
        )
        validation = result.validations[0].model_copy(update={"resource_count": 3})
        return SimpleNamespace(
            repo_ref=result.repo_ref,
            branch=result.branch,
            revision=result.revision,
            validations=(validation,),
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


def test_list_applications_projects_200_cards_with_one_catalog_batch() -> None:
    db = BulkCatalogApplicationsDb()

    response = asyncio.run(
        list_applications(
            clusters=None,
            namespaces=None,
            applications=None,
            labels=None,
            applications_environment=None,
            applications_status=None,
            applications_pending_promotion=None,
            applications_q=None,
            limit=200,
            current=current_session(),
            db=db,
        )
    )

    assert len(response.applications) == 200
    assert len(db.catalog_calls) == 1
    assert db.catalog_calls[0] == {
        "workspace_id": "ws-1",
        "application_ids": db.application_ids,
        "allowed_cluster_ids": {"cluster-1"},
    }


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


@pytest.mark.parametrize(
    "operation",
    ["upsert", "connect-metadata", "connect-deploy", "connect-access"],
)
def test_application_public_requests_reject_internal_seed_provenance(operation: str) -> None:
    marker = {
        "descriptor_id": "opsia-ui-demo.v1",
        "schema_version": 1,
        "digest": "a" * 64,
    }

    with pytest.raises(ValueError, match="reserved for internal seed writes"):
        if operation == "upsert":
            ApplicationUpsertRequest(
                name="checkout-api",
                metadata={DEMO_SEED_MARKER_KEY: marker},
            )
        elif operation == "connect-metadata":
            ApplicationConnectRequest(
                name="checkout-api",
                repo_ref="org/checkout",
                cluster_id="cluster-1",
                metadata={DEMO_SEED_MARKER_KEY: marker},
            )
        elif operation == "connect-deploy":
            ApplicationConnectRequest(
                name="checkout-api",
                repo_ref="org/checkout",
                cluster_id="cluster-1",
                deploy_policy={DEMO_SEED_MARKER_KEY: marker},
            )
        else:
            ApplicationConnectRequest(
                name="checkout-api",
                repo_ref="org/checkout",
                cluster_id="cluster-1",
                access_policy={DEMO_SEED_MARKER_KEY: marker},
            )


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
    assert db.registered_repositories[0]["metadata"]["repository_revision"] == "a" * 40
    assert db.registered_watch_targets[0]["cluster_id"] == "cluster-1"
    assert db.registered_watch_targets[0]["namespace"] == "prod"
    assert db.registered_watch_targets[0]["manifest_path"] == "deploy/kustomization.yaml"
    assert db.registered_watch_targets[0]["settings"]["source_type"] == "kustomize"
    assert db.registered_watch_targets[0]["deploy_policy"]["manifest_source"] == "kustomize"
    assert db.registered_bindings[0]["repository_id"] == "repo-1"
    assert len(db.workflow_runs) == 1
    assert db.workflow_runs[0]["workflow_run_id"].startswith("workflow-connect-validation-")
    assert db.workflow_runs[0]["commit_sha"] == "a" * 40
    assert db.workflow_runs[0]["status"] == "succeeded"
    assert db.workflow_runs[0]["current_step"] == "render"
    assert db.workflow_runs[0]["metadata"] == {
        "runtime_mode": "repository-connect-validation",
        "evidence_kind": "revision_pinned_manifest_validation",
        "source_type": "kustomize",
        "validation_mode": "kustomize-render",
        "validated_resource_count": 2,
        "repository_revision": "a" * 40,
        "cluster_mutation": False,
    }
    assert len(db.workflow_steps) == 1
    assert db.workflow_steps[0]["workflow_run_id"] == db.workflow_runs[0]["workflow_run_id"]
    assert db.workflow_steps[0]["details"]["cluster_mutation"] is False
    assert len(db.manifest_artifacts) == 2
    assert {
        (
            artifact["rendered_manifest"]["kind"],
            artifact["rendered_manifest"]["metadata"]["namespace"],
            artifact["rendered_manifest"]["metadata"]["name"],
        )
        for artifact in db.manifest_artifacts
    } == {
        ("Deployment", "prod", "checkout-api"),
        ("Service", "prod", "checkout-api"),
    }
    assert all(
        artifact["source_summary"]["repository_revision"] == "a" * 40
        and artifact["source_summary"]["cluster_mutation"] is False
        for artifact in db.manifest_artifacts
    )
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


def test_connect_application_rejects_incomplete_pinned_resource_evidence_before_write() -> None:
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
            ),
            current=current_session(),
            db=db,
            discovery=IncompleteRepositoryDiscovery(),
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 422
    assert exc.value.detail == "repository manifest validation resource count is incomplete"
    assert db.registered_repositories == []
    assert db.registered_watch_targets == []
    assert db.registered_bindings == []
    assert db.workflow_runs == []
    assert db.manifest_artifacts == []


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
