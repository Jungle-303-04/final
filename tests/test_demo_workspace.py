from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import (
    JSON,
    Column,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    create_engine,
    func,
    select,
)
from sqlalchemy import event as sqlalchemy_event

import domains.demo_workspace.repository as demo_repository_module
from controller.demo_workspace import (
    DEFAULT_DESCRIPTOR,
    DEMO_EVENT_SOURCE,
    OutboxRequiredPublisher,
    load_descriptor,
    reset_demo_workspace,
    seed_demo_workspace,
)
from domains.applications.router import router as applications_router
from domains.checks.observation_projection import checks_overview
from domains.cost.node_projection import cost_node_page
from domains.cost.observation_projection import cost_overview
from domains.cost.router import router as cost_router
from domains.dashboard.fleet_router import (
    current_warning_event_items,
    rollup_health,
)
from domains.dashboard.fleet_router import (
    router as fleet_router,
)
from domains.dashboard.home_bands import compose_home_topology_preview
from domains.dashboard.repository import (
    OPEN_INCIDENT_STATUSES,
    issue_severity_projection,
    open_incident_summary,
    timeline_update_from_event,
)
from domains.dashboard.router import router as dashboard_router
from domains.demo_workspace.policy import (
    DEMO_WORKSPACE_MUTATIONS_ENV,
    DEMO_WORKSPACE_MUTATIONS_OPT_IN,
)
from domains.demo_workspace.repository import DemoWorkspaceRepository
from domains.gitops.detail_router import router as gitops_detail_router
from domains.gitops.repository_discovery import (
    RepositoryDiscoveryError,
    RepositoryManifestValidationBatch,
)
from domains.helm.release_router import router as helm_release_router
from domains.helm.repository import HelmOwnedResourceObservationBatch
from domains.identity.dependencies import require_session
from domains.inventory.events import InventorySnapshotRecordedBody
from domains.inventory.kubernetes_events import KubernetesEventFactBatch
from domains.inventory.repository import (
    InventoryRepository,
    inventory_timeline_events,
    normalize_inventory_resource,
    snapshot_resources,
)
from domains.inventory_filter.cursor import FilterCursorCodec
from domains.inventory_filter.graph import build_resource_graph
from domains.registry import Database
from domains.traffic.router import router as traffic_router
from packages.contracts.demo_workspace import DEMO_SEED_MARKER_KEY, DemoWorkspaceDescriptor
from packages.contracts.gateway.responses import (
    RepositoryBranchItem,
    RepositoryBranchListResponse,
    RepositoryManifestCandidate,
    RepositoryManifestCandidateListResponse,
    RepositoryManifestResource,
    RepositoryManifestValidationResponse,
    RepositoryProbeResponse,
)
from packages.runtime.dependencies import get_db
from packages.runtime.gateway import ApiEventGateway


class FakeEvents:
    def __init__(self) -> None:
        self.bodies: list[object] = []

    async def accept_body(self, body: object) -> None:
        self.bodies.append(body)


class FakeDemoDatabase:
    def __init__(self) -> None:
        self.registration: dict[str, Any] | None = None
        self.snapshot: dict[str, Any] | None = None
        self.registration_writes: list[dict[str, Any]] = []
        self.inventory_writes: list[dict[str, Any]] = []
        self.reset_calls: list[dict[str, Any]] = []
        self.repository_writes: list[dict[str, Any]] = []
        self.application_writes: list[dict[str, Any]] = []
        self.applications_by_identity: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.watch_writes: list[dict[str, Any]] = []
        self.binding_writes: list[dict[str, Any]] = []
        self.workflow_writes: list[dict[str, Any]] = []
        self.workflow_step_writes: list[dict[str, Any]] = []
        self.manifest_artifact_writes: list[dict[str, Any]] = []
        self.evidence_writes: list[dict[str, Any]] = []
        self.rca_timeline_writes: list[dict[str, Any]] = []

    def get_cluster_registration(self, _workspace_id: str, _cluster_id: str) -> object:
        return self.registration

    def latest_inventory_snapshot(self, _workspace_id: str, _cluster_id: str) -> object:
        return self.snapshot

    def register_target_cluster(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.registration_writes.append(deepcopy(payload))
        self.registration = deepcopy(payload)
        return payload

    def save_inventory_snapshot(self, **kwargs: Any) -> dict[str, Any]:
        payload = deepcopy(kwargs["payload"])
        self.inventory_writes.append(payload)
        resources = snapshot_resources(payload)
        result = {
            "accepted": True,
            "snapshot_id": "snapshot-demo-v1",
            "cluster_id": kwargs["cluster_id"],
            "resource_count": len(resources),
            "marked_deleted": 0,
            "resource_types": sorted({str(item["resource_type"]) for item in resources}),
        }
        self.snapshot = {
            "snapshot_id": result["snapshot_id"],
            "summary": {
                "summary": payload["summary"],
                "health": payload["health"],
                "usage": payload["usage"],
            },
        }
        return result

    def reset_demo_workspace(self, **kwargs: Any) -> dict[str, int]:
        self.reset_calls.append(deepcopy(kwargs))
        return {"cluster_inventory_snapshots": 1, "workspaces": 1}

    def register_repository(self, payload: dict[str, Any]) -> dict[str, Any]:
        stored = {**deepcopy(payload), "repository_id": "repository-yaml-demo"}
        self.repository_writes.append(stored)
        return stored

    def upsert_application(self, payload: dict[str, Any]) -> dict[str, Any]:
        identity = (
            str(payload["workspace_id"]),
            str(payload["repository_id"]),
            str(payload["name"]),
        )
        existing = self.applications_by_identity.get(identity)
        stored = {
            **deepcopy(payload),
            "application_id": (
                str(existing["application_id"])
                if existing is not None
                else f"application-{payload['name']}"
            ),
        }
        self.application_writes.append(stored)
        self.applications_by_identity[identity] = stored
        return deepcopy(stored)

    def get_application_by_identity(
        self,
        workspace_id: str,
        repository_id: str,
        name: str,
    ) -> dict[str, Any] | None:
        application = self.applications_by_identity.get((workspace_id, repository_id, name))
        return deepcopy(application) if application is not None else None

    def register_watch_target(self, payload: dict[str, Any]) -> dict[str, Any]:
        stored = {
            **deepcopy(payload),
            "watch_target_id": f"watch-{payload['name']}",
        }
        self.watch_writes.append(stored)
        return stored

    def register_deployment_binding(self, payload: dict[str, Any]) -> dict[str, Any]:
        stored = {
            **deepcopy(payload),
            "watch_target_id": f"watch-{payload['name']}",
            "binding_id": f"binding-{payload['name']}",
        }
        self.binding_writes.append(stored)
        return stored

    def start_workflow_run(self, payload: dict[str, Any]) -> object:
        stored = {
            **deepcopy(payload),
            "created_at": "2026-07-18T01:02:03+00:00",
            "updated_at": "2026-07-18T01:02:03+00:00",
        }
        self.workflow_writes.append(stored)
        return object()

    def record_workflow_step(self, payload: dict[str, Any]) -> object:
        stored = {
            **deepcopy(payload),
            "updated_at": "2026-07-18T01:02:03+00:00",
        }
        self.workflow_step_writes.append(stored)
        return object()

    def record_manifest_artifact(self, payload: dict[str, Any]) -> dict[str, Any]:
        stored = deepcopy(payload)
        self.manifest_artifact_writes.append(stored)
        return stored

    def record_evidence_event_once(
        self,
        *,
        evidence_key: str,
        workspace_id: str,
        cluster_id: str,
        source_id: str,
        window_start: str,
        agent_id: str | None,
        event_envelope: Any,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        existing = next(
            (item for item in self.evidence_writes if item["evidence_key"] == evidence_key),
            None,
        )
        if existing is not None:
            return {
                "duplicate": True,
                "event_id": existing["event_envelope"].event_id,
                "correlation_id": existing["event_envelope"].correlation_id,
            }
        stored = {
            "evidence_key": evidence_key,
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "source_id": source_id,
            "window_start": window_start,
            "updated_at": window_start,
            "agent_id": agent_id,
            "event_envelope": deepcopy(event_envelope),
            "payload": deepcopy(payload),
        }
        self.evidence_writes.append(stored)
        return {
            "duplicate": False,
            "event_id": event_envelope.event_id,
            "correlation_id": event_envelope.correlation_id,
        }

    def upsert_rca_timeline(self, row: dict[str, Any]) -> None:
        existing = next(
            (
                item
                for item in self.rca_timeline_writes
                if item["workspace_id"] == row["workspace_id"]
                and item["correlation_id"] == row["correlation_id"]
            ),
            None,
        )
        if existing is None:
            self.rca_timeline_writes.append(
                {
                    "id": len(self.rca_timeline_writes) + 1,
                    "created_at": row["last_event_at"],
                    "updated_at": row["last_event_at"],
                    **deepcopy(row),
                }
            )
            return
        for key, value in row.items():
            if key.endswith("_complete") and existing.get(key) is True:
                continue
            if value is not None or key in {
                "current_subject",
                "status",
                "error_reason",
                "last_event_id",
                "last_event_at",
                "payload",
            }:
                existing[key] = deepcopy(value)
        existing["updated_at"] = row["last_event_at"]

    def list_rca_timeline(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str] | None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        return deepcopy(self._rca_rows(workspace_id, allowed_cluster_ids)[:limit])

    def list_rca_issues(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str] | None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        return [
            {**deepcopy(row), **issue_severity_projection(row)}
            for row in self._rca_rows(workspace_id, allowed_cluster_ids)[:limit]
        ]

    def get_rca_timeline_item(
        self,
        workspace_id: str,
        incident_id: str,
        allowed_cluster_ids: set[str] | None,
    ) -> dict[str, Any] | None:
        return next(
            (
                deepcopy(row)
                for row in self._rca_rows(workspace_id, allowed_cluster_ids)
                if row.get("incident_id") == incident_id
            ),
            None,
        )

    def count_open_rca_incidents(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str] | None = None,
    ) -> dict[str, int]:
        counts: dict[str, int] = {}
        for row in self._rca_rows(workspace_id, allowed_cluster_ids):
            if row.get("status") in OPEN_INCIDENT_STATUSES:
                cluster_id = str(row["cluster_id"])
                counts[cluster_id] = counts.get(cluster_id, 0) + 1
        return counts

    def list_open_rca_incidents(
        self,
        workspace_id: str,
        cluster_id: str,
        *,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        return [
            open_incident_summary(row)
            for row in self._rca_rows(workspace_id, {cluster_id})
            if row.get("status") in OPEN_INCIDENT_STATUSES
        ][:limit]

    def _rca_rows(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str] | None,
    ) -> list[dict[str, Any]]:
        return sorted(
            (
                row
                for row in self.rca_timeline_writes
                if row["workspace_id"] == workspace_id
                and (allowed_cluster_ids is None or row.get("cluster_id") in allowed_cluster_ids)
            ),
            key=lambda item: str(item.get("updated_at") or ""),
            reverse=True,
        )

    def helm_release_observation_contexts(
        self,
        *,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, Any]]:
        return self.filter_snapshot_contexts(workspace_id, cluster_ids)

    def list_helm_storage_observations(
        self,
        *,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
        namespaces: tuple[str, ...],
    ) -> list[dict[str, Any]]:
        return [
            row
            for row in self._inventory_observation_rows()
            if row["workspace_id"] == workspace_id
            and row["cluster_id"] in cluster_ids
            and (not namespaces or row["namespace"] in namespaces)
            and str(row["kind"]).casefold() in {"secret", "configmap"}
            and row["labels"].get("owner") == "helm"
        ]

    def list_helm_owned_resource_observations(
        self,
        *,
        workspace_id: str,
        release_scopes: tuple[tuple[str, str, str], ...],
        limit: int,
    ) -> HelmOwnedResourceObservationBatch:
        scopes = set(release_scopes)
        rows = []
        for row in self._inventory_observation_rows():
            annotations = row["annotations"]
            release_name = annotations.get("meta.helm.sh/release-name")
            release_namespace = annotations.get("meta.helm.sh/release-namespace")
            if (
                row["workspace_id"] == workspace_id
                and row["labels"].get("app.kubernetes.io/managed-by") == "Helm"
                and (row["cluster_id"], row["namespace"], release_name) in scopes
                and release_namespace == row["namespace"]
            ):
                rows.append(
                    {
                        **row,
                        "release_name": release_name,
                        "release_namespace": release_namespace,
                        "chart_label": row["labels"].get("helm.sh/chart"),
                    }
                )
        return HelmOwnedResourceObservationBatch(
            rows=tuple(rows[:limit]),
            truncated=len(rows) > limit,
        )

    def latest_cluster_agent_statuses(
        self,
        _workspace_id: str,
        _cluster_ids: set[str],
    ) -> dict[str, dict[str, Any]]:
        return {}

    def list_inventory_resources(self, **kwargs: Any) -> list[dict[str, Any]]:
        resource_type = kwargs.get("resource_type")
        return [
            row
            for row in self._inventory_observation_rows()
            if row["workspace_id"] == kwargs["workspace_id"]
            and row["cluster_id"] == kwargs["cluster_id"]
            and (resource_type is None or row.get("resource_type") == resource_type)
        ][: int(kwargs.get("limit") or 100)]

    def list_recent_warning_events(self, *_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
        return []

    def fleet_inventory_rollup(
        self,
        _workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, Any]]:
        return {cluster_id: {} for cluster_id in cluster_ids}

    def latest_cluster_usage_rollups(
        self,
        _workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, list[dict[str, Any]]]:
        return {cluster_id: [] for cluster_id in cluster_ids}

    def filter_snapshot_contexts(
        self,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, Any]]:
        if not self.inventory_writes or workspace_id != self.registration_writes[0]["workspace_id"]:
            return {}
        payload = self.inventory_writes[-1]
        summary = payload["summary"]
        return {
            cluster_id: {
                "snapshot_revision": 1,
                "observed_at": payload["collected_at"],
                "labels_complete": bool(summary.get("labels_complete")),
                "resources_complete": bool(summary.get("resources_complete")),
                "application_bindings_complete": False,
                "partial_reason_codes": [],
            }
            for cluster_id in cluster_ids
            if cluster_id == payload["cluster_id"]
        }

    def list_cost_evidence_windows(
        self,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
        **_kwargs: Any,
    ) -> list[dict[str, Any]]:
        return [
            deepcopy(row)
            for row in self.evidence_writes
            if row["workspace_id"] == workspace_id and row["cluster_id"] in cluster_ids
        ]

    def list_latest_traffic_evidence_windows(
        self,
        workspace_id: str,
        cluster_ids: set[str],
        **_kwargs: Any,
    ) -> list[dict[str, Any]]:
        return [
            deepcopy(row)
            for row in self.evidence_writes
            if row["workspace_id"] == workspace_id
            and row["cluster_id"] in cluster_ids
            and row["source_id"] == "cluster-snapshot"
        ]

    def resolve_filter_namespaces(
        self,
        workspace_id: str,
        cluster_ids: set[str],
        _snapshot_revision: int,
        requested: set[tuple[str, str]],
    ) -> set[tuple[str, str]]:
        if workspace_id != self.registration_writes[0]["workspace_id"]:
            return set()
        namespaces = set(self.inventory_writes[-1]["summary"].get("namespaces", ()))
        return {
            (cluster_id, namespace)
            for cluster_id, namespace in requested
            if cluster_id in cluster_ids and namespace in namespaces
        }

    def _inventory_observation_rows(self) -> list[dict[str, Any]]:
        if not self.inventory_writes:
            return []
        payload = self.inventory_writes[-1]
        workspace_id = self.registration_writes[0]["workspace_id"]
        return [
            {
                **deepcopy(resource),
                "workspace_id": workspace_id,
                "cluster_id": payload["cluster_id"],
                "inventory_key": (
                    f"{resource['kind'].casefold()}:{resource.get('namespace') or '_cluster'}:"
                    f"{resource['name']}"
                ),
                "observed_at": payload["collected_at"],
            }
            for resource in payload["resources"]
        ]

    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        _permission: str,
    ) -> set[str]:
        if workspace_id != self.registration_writes[0]["workspace_id"]:
            return set()
        if resource_type == "cluster":
            return {str(self.registration_writes[0]["cluster_id"])}
        if resource_type == "application":
            return {str(application["application_id"]) for application in self.application_writes}
        return set()

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        return resource_id in self.accessible_resource_ids(
            user_id,
            workspace_id,
            resource_type,
            permission,
        )

    def list_filtered_applications(self, **_kwargs: object) -> dict[str, object]:
        return {
            "items": [
                {"application_id": application["application_id"]}
                for application in self.application_writes
            ],
            "has_more": False,
        }

    def list_applications(
        self,
        workspace_id: str,
        *,
        application_ids: set[str] | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        items = [
            application
            for application in self.application_writes
            if application["workspace_id"] == workspace_id
            and (application_ids is None or str(application["application_id"]) in application_ids)
        ]
        return deepcopy(items[:limit])

    def get_application(self, workspace_id: str, application_id: str) -> dict[str, Any] | None:
        return next(
            (
                deepcopy(application)
                for application in self.application_writes
                if application["workspace_id"] == workspace_id
                and application["application_id"] == application_id
            ),
            None,
        )

    def list_application_deployment_bindings(
        self,
        workspace_id: str,
        application_id: str,
        *,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        application = self.get_application(workspace_id, application_id)
        if application is None:
            return []
        rows = []
        for binding in self.binding_writes:
            if (
                binding["workspace_id"] != workspace_id
                or binding["app_name"] != application["name"]
            ):
                continue
            watch = next(
                (
                    item
                    for item in self.watch_writes
                    if item["watch_target_id"] == binding["watch_target_id"]
                ),
                {},
            )
            rows.append(
                {
                    **deepcopy(binding),
                    "gitops_poll": {
                        "status": watch.get("settings", {}).get("poll_status", "unknown"),
                        "last_seen_commit_sha": watch.get("last_seen_commit_sha", ""),
                        "last_polled_at": (
                            watch.get("last_polled_at").isoformat()
                            if isinstance(watch.get("last_polled_at"), datetime)
                            else watch.get("last_polled_at")
                        ),
                    },
                }
            )
        return rows[:limit]

    def list_application_workflow_runs(
        self,
        workspace_id: str,
        application_id: str,
        *,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        rows = []
        for run in self.workflow_writes:
            if run["workspace_id"] != workspace_id or run["application_id"] != application_id:
                continue
            steps = [
                deepcopy(step)
                for step in self.workflow_step_writes
                if step["workflow_run_id"] == run["workflow_run_id"]
            ]
            rows.append({**deepcopy(run), "steps": steps})
        return rows[:limit]

    def get_application_catalog_states(
        self,
        *,
        workspace_id: str,
        application_ids: list[str],
        allowed_cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        return {
            application_id: {
                "bindings": self.list_application_deployment_bindings(
                    workspace_id,
                    application_id,
                    limit=500,
                ),
                "runs": [
                    run
                    for run in self.list_application_workflow_runs(
                        workspace_id,
                        application_id,
                        limit=100,
                    )
                    if run["cluster_id"] in allowed_cluster_ids
                ],
                "inventory_rows": [],
                "inventory_context": {
                    "snapshot_revision": 0,
                    "observed_at": None,
                    "labels_complete": True,
                    "resources_complete": True,
                    "application_bindings_complete": False,
                    "partial_reason_codes": ["application_runtime_membership_unavailable"],
                },
                "incident_evidence": {
                    "complete": False,
                    "open_count": None,
                    "items": [],
                },
            }
            for application_id in application_ids
        }


class TransactionalFakeDemoDatabase(FakeDemoDatabase):
    """Fail on nested units and restore all writes when the outer seed fails."""

    def __init__(self) -> None:
        super().__init__()
        self.unit_of_work_depth = 0

    @contextmanager
    def unit_of_work(self):
        if self.unit_of_work_depth:
            raise AssertionError("demo seed opened a nested unit of work")
        state = deepcopy(
            {key: value for key, value in vars(self).items() if key != "unit_of_work_depth"}
        )
        self.unit_of_work_depth = 1
        try:
            yield self
        except Exception:
            for key, value in state.items():
                setattr(self, key, value)
            raise
        finally:
            self.unit_of_work_depth = 0


class FailingTransactionalDemoDatabase(TransactionalFakeDemoDatabase):
    def register_deployment_binding(self, payload: dict[str, Any]) -> dict[str, Any]:
        if len(self.binding_writes) == 2:
            raise RuntimeError("demo binding write failed")
        return super().register_deployment_binding(payload)


class FakeRepositoryDiscovery:
    def __init__(
        self,
        *,
        reachable: bool = True,
        revision: str = "3bc4084ee8a0bff5bbee54cd6a826b1ecd10dbef",
        confirmed_revision: str | None = None,
    ) -> None:
        self.reachable = reachable
        self.revision = revision
        self.confirmed_revision = confirmed_revision or revision
        self.revision_calls = 0
        self.validation_requests: list[Any] = []

    async def probe_repository(self, _payload: Any) -> RepositoryProbeResponse:
        return RepositoryProbeResponse(
            repo_ref="jungle-303-04/yaml-demo",
            normalized_repo_ref="jungle-303-04/yaml-demo",
            valid=True,
            reachable=self.reachable,
            default_branch="main",
            private=False,
            errors=[] if self.reachable else ["unreachable"],
        )

    async def list_branches(self, repo_ref: str) -> RepositoryBranchListResponse:
        return RepositoryBranchListResponse(
            repo_ref=repo_ref,
            default_branch="main",
            branches=[RepositoryBranchItem(name="main", default=True)],
        )

    async def resolve_branch_revision(self, _repo_ref: str, _branch: str) -> str:
        self.revision_calls += 1
        return self.revision if self.revision_calls == 1 else self.confirmed_revision

    async def list_manifest_candidates(
        self, repo_ref: str, branch: str
    ) -> RepositoryManifestCandidateListResponse:
        return RepositoryManifestCandidateListResponse(
            repo_ref=repo_ref,
            branch=branch,
            candidates=[
                RepositoryManifestCandidate(
                    path="manifests/base/workloads.yaml",
                    source_type="raw-yaml",
                    display_name="workloads",
                ),
                RepositoryManifestCandidate(
                    path="manifests/overlays/dev",
                    source_type="kustomize",
                    display_name="dev",
                ),
                RepositoryManifestCandidate(
                    path="manifests/overlays/diagnostics",
                    source_type="kustomize",
                    display_name="diagnostics",
                ),
                RepositoryManifestCandidate(
                    path="charts/demo-app",
                    source_type="helm",
                    display_name="chart",
                ),
            ],
        )

    async def validate_manifest(self, payload: Any) -> RepositoryManifestValidationResponse:
        self.validation_requests.append(payload)
        resource_count = {
            "manifests/base/workloads.yaml": 3,
            "manifests/overlays/dev": 14,
            "manifests/overlays/diagnostics": 15,
            "charts/demo-app": 2,
        }[payload.manifest_path]
        return RepositoryManifestValidationResponse(
            repo_ref="jungle-303-04/yaml-demo",
            branch=payload.branch,
            manifest_path=payload.manifest_path,
            valid=True,
            status="valid",
            validation_mode=payload.source_type,
            resource_count=resource_count,
            resources=[
                RepositoryManifestResource(
                    api_version="apps/v1",
                    kind="Deployment",
                    namespace="demo-shop",
                    name=f"{payload.source_type}-{index}",
                )
                for index in range(resource_count)
            ],
        )

    async def validate_manifests_at_revision(
        self,
        payloads: list[Any],
        *,
        expected_revision: str,
    ) -> RepositoryManifestValidationBatch:
        observed_revision = await self.resolve_branch_revision("", "")
        if observed_revision != expected_revision:
            raise RuntimeError("repository revision does not match expected revision")
        candidates = await self.list_manifest_candidates(
            "jungle-303-04/yaml-demo",
            "main",
        )
        candidate_identities = {
            (candidate.path, candidate.source_type) for candidate in candidates.candidates
        }
        for payload in payloads:
            if (payload.manifest_path, payload.source_type) not in candidate_identities:
                raise RuntimeError("repository manifest candidate is unavailable")
        validations = tuple(
            await asyncio.gather(*(self.validate_manifest(payload) for payload in payloads))
        )
        confirmed_revision = await self.resolve_branch_revision("", "")
        if confirmed_revision != observed_revision:
            raise RepositoryDiscoveryError(
                409,
                "repository changed during manifest batch validation",
            )
        return RepositoryManifestValidationBatch(
            repo_ref="jungle-303-04/yaml-demo",
            branch="main",
            revision=observed_revision,
            validations=validations,
        )


class IncompleteRepositoryDiscovery(FakeRepositoryDiscovery):
    async def validate_manifest(self, payload: Any) -> RepositoryManifestValidationResponse:
        validation = await super().validate_manifest(payload)
        if payload.manifest_path != "manifests/base/workloads.yaml":
            return validation
        return validation.model_copy(update={"resource_count": validation.resource_count + 1})


class FakeOutboxDemoDatabase(FakeDemoDatabase):
    def __init__(self) -> None:
        super().__init__()
        self.recorded_events: list[Any] = []
        self.staged_events: list[Any] = []

    @contextmanager
    def unit_of_work(self):
        yield self

    def record_event(self, event: Any) -> None:
        self.recorded_events.append(event)

    def stage_events(self, connection: object, events: list[Any]) -> None:
        assert connection is self
        self.staged_events.extend(events)


@pytest.fixture(autouse=True)
def allow_demo_mutations(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(DEMO_WORKSPACE_MUTATIONS_ENV, DEMO_WORKSPACE_MUTATIONS_OPT_IN)


def test_v1_descriptor_is_dedicated_complete_and_digest_stable() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    restored = DemoWorkspaceDescriptor.model_validate_json(descriptor.model_dump_json())

    assert descriptor.schema_version == 1
    assert descriptor.workspace.workspace_id != "default"
    assert descriptor.inventory.summary["resources_complete"] is True
    assert descriptor.inventory.summary["labels_complete"] is True
    assert descriptor.inventory.summary["namespaces"] == ["demo-payments", "demo-shop"]
    assert len(descriptor.inventory.resources) == 13
    assert {resource.health for resource in descriptor.inventory.resources} >= {
        "healthy",
        "warning",
        "critical",
        "unknown",
    }
    assert descriptor.gitops is not None
    assert descriptor.gitops.runtime_evidence_version == 1
    assert descriptor.gitops.repo_ref == "jungle-303-04/yaml-demo"
    assert descriptor.gitops.revision == "3bc4084ee8a0bff5bbee54cd6a826b1ecd10dbef"
    assert descriptor.gitops.catalog_scenario_count == 17
    assert len(descriptor.gitops.sources) == 5
    assert {source.source_type for source in descriptor.gitops.sources} == {
        "raw-yaml",
        "kustomize",
        "helm",
    }
    assert descriptor.observations is not None
    assert descriptor.observations.runtime_evidence_version == 1
    assert descriptor.observations.origin == "descriptor-owned-synthetic"
    assert [item.namespace for item in descriptor.observations.cost_namespace_rates] == [
        "demo-shop",
        "demo-payments",
    ]
    assert descriptor.observations.traffic_source == "caretta"
    assert len(descriptor.observations.traffic_flows) == 2
    assert descriptor.rca is not None
    assert descriptor.rca.runtime_evidence_version == 1
    assert descriptor.rca.origin == "descriptor-owned-synthetic"
    assert descriptor.rca.analysis_mode == "none"
    assert descriptor.rca.resource_name == "payments-api"
    assert [step.stage for step in descriptor.rca.timeline] == [
        "incident_detected",
        "rca_completed",
    ]
    assert descriptor.digest() == restored.digest()
    assert descriptor.seed_marker() == restored.seed_marker()


def test_runtime_owner_override_is_revalidated_and_bound_to_seed_marker() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    owner_user_id = "user-8c543a9f-bc2f-594e-928b-55f2246f43fe"

    overridden = load_descriptor(DEFAULT_DESCRIPTOR, owner_user_id=owner_user_id)
    restored = DemoWorkspaceDescriptor.model_validate_json(overridden.model_dump_json())
    db = FakeDemoDatabase()

    asyncio.run(
        seed_demo_workspace(
            db,
            overridden,
            events=FakeEvents(),
            discovery=FakeRepositoryDiscovery(),
        )
    )

    assert overridden.workspace.workspace_id == descriptor.workspace.workspace_id
    assert overridden.workspace.owner_user_id == owner_user_id
    assert overridden.digest() != descriptor.digest()
    assert overridden.seed_marker() == restored.seed_marker()
    assert db.registration_writes[0]["user_id"] == owner_user_id
    assert db.registration_writes[0]["settings"][DEMO_SEED_MARKER_KEY] == overridden.seed_marker()

    with pytest.raises(ValidationError, match="owner_user_id"):
        load_descriptor(DEFAULT_DESCRIPTOR, owner_user_id=" invalid owner ")


def test_descriptor_rejects_default_workspace_and_incomplete_inventory(tmp_path: Path) -> None:
    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    raw["workspace"]["workspace_id"] = "default"
    default_path = tmp_path / "default.json"
    default_path.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(default_path)

    assert "dedicated non-default workspace" in str(error.value)

    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    raw["inventory"]["summary"]["resources_complete"] = False
    incomplete_path = tmp_path / "incomplete.json"
    incomplete_path.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(incomplete_path)

    assert "resources_complete" in str(error.value)

    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    raw["gitops"]["sources"][0]["manifest_path"] = "../secret.yaml"
    unsafe_path = tmp_path / "unsafe-gitops-path.json"
    unsafe_path.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(unsafe_path)

    assert "repository-relative" in str(error.value)

    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    raw["gitops"]["sources"][0]["values_path"] = "values.yaml"
    invalid_values = tmp_path / "invalid-values-source.json"
    invalid_values.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(invalid_values)

    assert "only for Helm" in str(error.value)

    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    del raw["gitops"]["runtime_evidence_version"]
    legacy_runtime = tmp_path / "legacy-runtime-evidence.json"
    legacy_runtime.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(legacy_runtime)

    assert "runtime_evidence_version" in str(error.value)

    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    raw["observations"]["cost_namespace_rates"][0]["namespace"] = "not-in-inventory"
    invalid_observation_scope = tmp_path / "invalid-observation-scope.json"
    invalid_observation_scope.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(invalid_observation_scope)

    assert "inventoried namespaces" in str(error.value)

    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    del raw["observations"]["runtime_evidence_version"]
    legacy_observations = tmp_path / "legacy-observation-evidence.json"
    legacy_observations.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(legacy_observations)

    assert "runtime_evidence_version" in str(error.value)

    raw = json.loads(DEFAULT_DESCRIPTOR.read_text(encoding="utf-8"))
    raw["rca"]["resource_name"] = "not-in-inventory"
    invalid_rca_resource = tmp_path / "invalid-rca-resource.json"
    invalid_rca_resource.write_text(json.dumps(raw), encoding="utf-8")

    with pytest.raises(ValidationError) as error:
        load_descriptor(invalid_rca_resource)

    assert "inventoried resource" in str(error.value)


def test_seed_uses_registration_inventory_event_contract_and_is_idempotent() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = TransactionalFakeDemoDatabase()
    events = FakeEvents()
    discovery = FakeRepositoryDiscovery()
    observed_at = datetime(2026, 7, 18, 1, 2, 3, tzinfo=UTC)

    first = asyncio.run(
        seed_demo_workspace(
            db,
            descriptor,
            events=events,
            discovery=discovery,
            observed_at=observed_at,
        )
    )
    second = asyncio.run(
        seed_demo_workspace(
            db,
            descriptor,
            events=events,
            discovery=discovery,
            observed_at=observed_at,
        )
    )

    assert first["action"] == "seeded"
    assert first["registration_written"] is True
    assert first["inventory_written"] is True
    assert second["action"] == "unchanged"
    assert len(db.registration_writes) == 1
    assert len(db.inventory_writes) == 1
    assert len(db.repository_writes) == 1
    assert len(db.application_writes) == 5
    assert len(db.watch_writes) == 5
    assert len(db.binding_writes) == 5
    assert len(db.workflow_writes) == 5
    assert len(db.workflow_step_writes) == 35
    assert len(db.manifest_artifact_writes) == 36
    assert len(db.evidence_writes) == 1
    assert len(db.rca_timeline_writes) == 1
    assert len(discovery.validation_requests) == 5
    assert first["gitops_source_count"] == 5
    assert second["gitops_source_count"] == 5
    assert first["observation_window_count"] == 1
    assert second["observation_window_count"] == 1
    assert first["rca_scenario_count"] == 1
    assert second["rca_scenario_count"] == 1
    assert [
        request.values_path
        for request in discovery.validation_requests
        if request.values_path is not None
    ] == ["charts/demo-app/values-staging.yaml"]
    assert db.registration_writes[0]["settings"][DEMO_SEED_MARKER_KEY] == (descriptor.seed_marker())
    assert db.inventory_writes[0]["summary"][DEMO_SEED_MARKER_KEY] == (descriptor.seed_marker())
    assert db.inventory_writes[0]["collected_at"] == observed_at.isoformat()
    assert len(events.bodies) == 1
    body = events.bodies[0]
    assert isinstance(body, InventorySnapshotRecordedBody)
    assert body.workspace_id == descriptor.workspace.workspace_id
    assert body.cluster_id == descriptor.cluster.cluster_id
    assert body.snapshot_id == "snapshot-demo-v1"
    assert body.resource_count == 15

    observation = db.evidence_writes[0]
    assert observation["source_id"] == "cluster-snapshot"
    assert observation["payload"]["metadata"] == {
        "runtime_evidence_version": 1,
        "synthetic": True,
        DEMO_SEED_MARKER_KEY: descriptor.seed_marker(),
    }
    assert observation["payload"]["collection_status"] == {
        "availability": "observed",
        "mode": "descriptor-owned-synthetic",
        "cost_namespace_count": 2,
        "traffic_source": "caretta",
        "traffic_flow_count": 2,
    }
    metric_results = observation["payload"]["metrics"]["results"]
    assert set(metric_results) == {
        "opencost_namespace_hourly_rate",
        "opencost_namespace_storage_rate",
        "traffic_caretta_flows",
    }
    assert observation["event_envelope"].workspace_id == descriptor.workspace.workspace_id
    assert observation["event_envelope"].payload["metrics"] == {}

    repository = db.repository_writes[0]
    assert repository["repo_ref"] == "jungle-303-04/yaml-demo"
    assert repository["default_branch"] == "main"
    assert repository["credential_ref"] is None
    assert repository["access_policy"][DEMO_SEED_MARKER_KEY] == descriptor.seed_marker()
    assert repository["access_policy"]["revision"] == descriptor.gitops.revision
    assert repository["access_policy"]["catalog_scenario_count"] == 17
    assert {application["metadata"]["source_type"] for application in db.application_writes} == {
        "raw-yaml",
        "kustomize",
        "helm",
    }
    helm_override = next(
        application
        for application in db.application_writes
        if application["name"] == "yaml-demo-helm-staging"
    )
    assert helm_override["metadata"]["values_path"] == ("charts/demo-app/values-staging.yaml")
    assert helm_override["deploy_policy"]["values_path"] == ("charts/demo-app/values-staging.yaml")
    assert all(binding["deploy_policy"]["read_only"] for binding in db.binding_writes)
    assert {run["status"] for run in db.workflow_writes} == {"succeeded"}
    assert {run["current_step"] for run in db.workflow_writes} == {"render"}
    assert all(run["metadata"]["runtime_mode"] == "read-only-demo" for run in db.workflow_writes)
    assert {step["name"]: step["status"] for step in db.workflow_step_writes[:7]} == {
        "git": "succeeded",
        "render": "succeeded",
        "diff": "skipped",
        "policy": "succeeded",
        "approval": "skipped",
        "apply": "skipped",
        "health": "skipped",
    }
    assert all(
        artifact["source_summary"][DEMO_SEED_MARKER_KEY] == descriptor.seed_marker()
        for artifact in db.manifest_artifact_writes
    )
    assert all(
        str(artifact["rendered_manifest"]["artifact_digest"]).startswith("sha256:")
        for artifact in db.manifest_artifact_writes
    )
    assert descriptor.rca is not None
    rca = db.rca_timeline_writes[0]
    assert rca["current_subject"] == "rca.completed"
    assert rca["status"] == "rca_completed"
    assert rca["evidence_ref"].startswith("synthetic://demo-workspace/")
    assert rca["severity"] == "high"
    assert rca["severity_complete"] is True
    assert rca["category"] == "availability"
    assert rca["category_complete"] is True
    assert rca["payload"]["rca_detail"]["selected_candidate_id"] == descriptor.rca.cause_id


def test_seeded_runtime_is_visible_through_applications_and_gitops_reads() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()
    asyncio.run(
        seed_demo_workspace(
            db,
            descriptor,
            events=FakeEvents(),
            discovery=FakeRepositoryDiscovery(),
            observed_at=datetime(2026, 7, 18, 1, 2, 3, tzinfo=UTC),
        )
    )
    app = FastAPI()
    app.include_router(applications_router)
    app.include_router(gitops_detail_router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id=descriptor.workspace.owner_user_id,
        workspace_id=descriptor.workspace.workspace_id,
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)

    applications_response = client.get("/applications")
    assert applications_response.status_code == 200
    applications = applications_response.json()["applications"]
    assert len(applications) == 5
    assert {item["delivery"]["status"] for item in applications} == {"succeeded"}
    assert all(
        item["current_deployment"]["git_sha"] == descriptor.gitops.revision for item in applications
    )
    assert all(item["runtime_readiness"]["completeness"] == "unavailable" for item in applications)
    assert all(item["has_drift"] is None for item in applications)

    application = db.application_writes[0]
    gitops_response = client.get(f"/gitops/applications/{application['application_id']}")
    assert gitops_response.status_code == 200
    gitops = gitops_response.json()["application"]
    assert gitops["source"]["repository_ref"] == descriptor.gitops.repo_ref
    assert gitops["desired_live_diff"]["source_revision"] == descriptor.gitops.revision
    assert gitops["operation"]["status"] == "succeeded"
    assert gitops["operation"]["in_progress"] is False
    assert gitops["operation"]["reason_code"] == "provider_operation_not_integrated"


def test_seeded_helm_cost_and_traffic_are_visible_through_existing_read_contracts() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()
    asyncio.run(
        seed_demo_workspace(
            db,
            descriptor,
            events=FakeEvents(),
            discovery=FakeRepositoryDiscovery(),
            observed_at=datetime.now(UTC),
        )
    )
    app = FastAPI()
    app.include_router(helm_release_router)
    app.include_router(cost_router)
    app.include_router(traffic_router)
    app.state.inventory_filter_cursor_codec = FilterCursorCodec("d" * 32)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id=descriptor.workspace.owner_user_id,
        workspace_id=descriptor.workspace.workspace_id,
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)
    cluster_id = descriptor.cluster.cluster_id

    helm_response = client.get(f"/helm/releases?clusters={cluster_id}")
    assert helm_response.status_code == 200
    helm = helm_response.json()
    assert helm["coverage"] == {
        "availability": "available",
        "observed_at": db.inventory_writes[0]["collected_at"],
        "reason_codes": [],
    }
    assert len(helm["releases"]) == 1
    release = helm["releases"][0]
    assert release["name"] == "yaml-demo-helm-staging"
    assert release["storage_namespace"] == "demo-shop"
    assert release["chart"] == "demo-app"
    assert release["chart_version"] == "0.1.0"
    assert release["status"] == "deployed"
    assert release["revision"] == 1
    assert release["scope"]["freshness"] == "disconnected"
    assert release["resource_health"] == {
        "availability": "available",
        "health": "healthy",
        "resource_count": 2,
        "observed_at": db.inventory_writes[0]["collected_at"],
        "reason_codes": [],
    }

    cost_response = client.get(f"/cost/overview?clusters={cluster_id}")
    assert cost_response.status_code == 200
    cost = cost_response.json()
    assert cost["observation"]["availability"] == "available"
    assert cost["summary"] == {
        "availability": "available",
        "hourly_cost": 840_000,
        "monthly_projection": 613_200_000,
        "storage_cost": 90_000,
        "idle_cost": None,
        "efficiency": None,
        "savings_recommendations": None,
        "reason_codes": [],
    }
    assert cost["trend"]["availability"] == "unavailable"
    assert cost["trend"]["reason_codes"] == ["cost_trend_history_insufficient"]

    traffic_response = client.get(f"/traffic/flows?clusters={cluster_id}")
    assert traffic_response.status_code == 200
    traffic = traffic_response.json()
    assert traffic["observation"]["availability"] == "partial"
    assert traffic["observation"]["source_keys"] == ["caretta"]
    assert traffic["observation"]["reason_codes"] == [
        f"traffic_source_selection_unobserved:{cluster_id}"
    ]
    assert traffic["summary"]["total_flow_count"] == 2
    assert traffic["summary"]["external_flow_count"] == 1
    assert {edge["connections"] for edge in traffic["relationships"]["edges"]} == {6, 28}


def test_seeded_synthetic_incident_is_visible_through_rca_issues_and_home_contracts() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()
    asyncio.run(
        seed_demo_workspace(
            db,
            descriptor,
            events=FakeEvents(),
            discovery=FakeRepositoryDiscovery(),
            observed_at=datetime(2026, 7, 18, 1, 2, 3, tzinfo=UTC),
        )
    )
    app = FastAPI()
    app.include_router(dashboard_router)
    app.include_router(fleet_router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id=descriptor.workspace.owner_user_id,
        workspace_id=descriptor.workspace.workspace_id,
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    client = TestClient(app)
    cluster_id = descriptor.cluster.cluster_id

    timeline_response = client.get(f"/dashboard/rca/timeline?cluster_id={cluster_id}")
    assert timeline_response.status_code == 200
    timeline = timeline_response.json()["items"]
    assert len(timeline) == 1
    assert timeline[0]["incident_id"] == "demo-payments-restart-loop"
    assert timeline[0]["status"] == "rca_completed"
    assert timeline[0]["evidence_ref"].startswith("synthetic://demo-workspace/")
    assert timeline[0]["root_cause"].startswith("데모 서술자가 가정한")
    assert any(
        evidence.startswith("descriptor-impact:") for evidence in timeline[0]["supporting_evidence"]
    )
    assert "AI or rule-engine analysis" in timeline[0]["missing_evidence"]

    issues_response = client.get(f"/dashboard/rca/issues?cluster_id={cluster_id}")
    assert issues_response.status_code == 200
    issues = issues_response.json()["items"]
    assert len(issues) == 1
    assert issues[0]["issue_severity"] == "critical"
    assert issues[0]["severity_availability"] == "available"

    incident_response = client.get(
        f"/dashboard/rca/incidents/demo-payments-restart-loop?cluster_id={cluster_id}"
    )
    assert incident_response.status_code == 200
    assert incident_response.json()["item"] == timeline[0]

    home_response = client.get(f"/clusters/{cluster_id}/summary")
    assert home_response.status_code == 200
    open_incidents = home_response.json()["open_incidents"]
    assert len(open_incidents) == 1
    assert open_incidents[0]["incident_id"] == "demo-payments-restart-loop"
    assert open_incidents[0]["root_cause"].startswith("데모 서술자가 가정한")


def test_seed_rolls_back_inventory_and_gitops_when_one_binding_fails() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FailingTransactionalDemoDatabase()
    events = FakeEvents()

    with pytest.raises(RuntimeError, match="binding write failed"):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=events,
                discovery=FakeRepositoryDiscovery(),
            )
        )

    assert db.registration is None
    assert db.snapshot is None
    assert db.registration_writes == []
    assert db.inventory_writes == []
    assert db.repository_writes == []
    assert db.application_writes == []
    assert db.watch_writes == []
    assert db.binding_writes == []
    assert db.evidence_writes == []
    assert db.rca_timeline_writes == []
    assert events.bodies == []


def test_seed_rejects_unreachable_demo_repository_before_any_write() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    with pytest.raises(RuntimeError, match="repository validation failed"):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=FakeEvents(),
                discovery=FakeRepositoryDiscovery(reachable=False),
            )
        )

    assert db.registration_writes == []
    assert db.inventory_writes == []
    assert db.repository_writes == []


def test_seed_rejects_unpinned_demo_repository_revision_before_any_write() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    with pytest.raises(RuntimeError, match="revision does not match"):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=FakeEvents(),
                discovery=FakeRepositoryDiscovery(revision="a" * 40),
            )
        )

    assert db.registration_writes == []
    assert db.inventory_writes == []
    assert db.repository_writes == []


def test_seed_rejects_repository_change_during_validation_before_any_write() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    with pytest.raises(RuntimeError, match="changed during source validation"):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=FakeEvents(),
                discovery=FakeRepositoryDiscovery(confirmed_revision="b" * 40),
            )
        )

    assert db.registration_writes == []
    assert db.inventory_writes == []
    assert db.repository_writes == []


def test_seed_rejects_incomplete_render_evidence_before_any_write() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    with pytest.raises(RuntimeError, match="validation evidence is incomplete"):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=FakeEvents(),
                discovery=IncompleteRepositoryDiscovery(),
            )
        )

    assert db.registration_writes == []
    assert db.inventory_writes == []
    assert db.repository_writes == []
    assert db.workflow_writes == []


def test_seed_rejects_missing_opt_in_before_any_write(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(DEMO_WORKSPACE_MUTATIONS_ENV)
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    with pytest.raises(RuntimeError, match=DEMO_WORKSPACE_MUTATIONS_ENV):
        asyncio.run(
            seed_demo_workspace(
                db,
                descriptor,
                events=FakeEvents(),
                discovery=FakeRepositoryDiscovery(),
            )
        )

    assert db.registration_writes == []
    assert db.inventory_writes == []


def test_seed_stages_inventory_event_through_gateway_outbox_contract() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeOutboxDemoDatabase()
    gateway = ApiEventGateway(OutboxRequiredPublisher(), db, DEMO_EVENT_SOURCE)

    asyncio.run(
        seed_demo_workspace(
            db,
            descriptor,
            events=gateway,
            discovery=FakeRepositoryDiscovery(),
        )
    )

    assert len(db.recorded_events) == 1
    assert db.staged_events == db.recorded_events
    event = db.staged_events[0]
    assert event.source == DEMO_EVENT_SOURCE
    assert event.workspace_id == descriptor.workspace.workspace_id
    assert (
        event.payload
        == InventorySnapshotRecordedBody(
            workspace_id=descriptor.workspace.workspace_id,
            cluster_id=descriptor.cluster.cluster_id,
            snapshot_id="snapshot-demo-v1",
            agent_id=descriptor.cluster.agent_id,
            resource_count=15,
            resource_types=[
                "endpoint",
                "event",
                "health",
                "node",
                "pod",
                "secret",
                "service",
                "usage",
                "workload",
            ],
        ).to_body()
    )
    assert timeline_update_from_event(event) is None


def test_seed_payload_drives_canonical_resources_home_and_timeline_projections() -> None:
    descriptor, payload, observed_at = _seeded_inventory_payload()
    normalized = _normalized_seed_resources(descriptor, payload, observed_at)
    serialized = _serialized_resources(normalized)
    graph = build_resource_graph(
        [_graph_item(descriptor, resource) for resource in serialized],
        snapshot_revision=1,
        filter_fingerprint="demo-descriptor-v1",
        source_complete=payload["summary"]["resources_complete"],
        labels_complete=payload["summary"]["labels_complete"],
        truncated=payload["summary"]["collection_limits"]["truncated"],
    )

    assert graph["relation_completeness"] == "exact"
    assert graph["node_count"] == 15
    assert graph["edge_count"] == 10
    assert _edge_kind_counts(graph) == {
        "owns": 2,
        "routes_to": 2,
        "runs_on": 2,
        "selects": 4,
    }
    home = compose_home_topology_preview(
        graph,
        observed_at=observed_at.isoformat(),
    )
    assert home.coverage.availability == "available"
    assert home.node_count == 15
    assert home.edge_count == 10
    assert (
        rollup_health(
            workloads_degraded=sum(
                resource["resource_type"] == "workload" and resource["health"] == "degraded"
                for resource in serialized
            ),
            nodes_ready=sum(
                resource["resource_type"] == "node" and resource["status"] == "Ready"
                for resource in serialized
            ),
            nodes_total=sum(resource["resource_type"] == "node" for resource in serialized),
            restarts_recent=0,
            open_incidents=0,
        )
        == "critical"
    )

    event_batch = KubernetesEventFactBatch.from_snapshot_summary(payload["summary"])
    timeline = inventory_timeline_events(
        workspace_id=descriptor.workspace.workspace_id,
        cluster_id=descriptor.cluster.cluster_id,
        observed_at=observed_at,
        previous_rows=(),
        current_rows=normalized,
        resources_complete=True,
        current_event_batch=event_batch,
    )
    assert len(timeline) == 13
    assert {event.source for event in timeline} == {"inventory", "kubernetes_event"}
    assert sum(event.source == "kubernetes_event" for event in timeline) == 1
    assert next(event for event in timeline if event.source == "kubernetes_event").severity == (
        "warning"
    )

    warning_items = current_warning_event_items(
        [resource for resource in serialized if resource["resource_type"] == "event"],
        pods=[resource for resource in serialized if resource["resource_type"] == "pod"],
        workloads=[resource for resource in serialized if resource["resource_type"] == "workload"],
        current_snapshot_id="snapshot-demo-v1",
        limit=10,
    )
    assert len(warning_items) == 1
    assert warning_items[0].involved_kind == "Deployment"
    assert warning_items[0].involved_name == "payments-api"


def test_seed_payload_drives_canonical_checks_and_cost_node_projections() -> None:
    descriptor, payload, observed_at = _seeded_inventory_payload()
    normalized = _normalized_seed_resources(descriptor, payload, observed_at)
    serialized = _serialized_resources(normalized)
    context = {
        "snapshot_revision": 1,
        "observed_at": observed_at.isoformat(),
        "resources_complete": True,
        "labels_complete": True,
        "partial_reason_codes": [],
    }
    snapshot = {
        "summary": {
            "summary": payload["summary"],
            "health": payload["health"],
            "usage": payload["usage"],
        }
    }

    checks = checks_overview(
        workspace_id=descriptor.workspace.workspace_id,
        contexts={descriptor.cluster.cluster_id: context},
        snapshots={descriptor.cluster.cluster_id: snapshot},
        namespace_refs=(),
        selected_cluster_ids=(descriptor.cluster.cluster_id,),
        now=observed_at,
    )
    assert checks.result_set.availability == "available"
    assert checks.result_set.total_check_count == 3
    assert checks.result_set.total_finding_count == 3
    assert checks.result_set.checks is not None
    assert {finding.severity for finding in checks.result_set.checks} == {
        "danger",
        "warning",
    }

    node_resources = [
        _graph_item(descriptor, resource)
        for resource in serialized
        if resource["resource_type"] == "node"
    ]
    nodes = cost_node_page(
        workspace_id=descriptor.workspace.workspace_id,
        selected_cluster_ids=(descriptor.cluster.cluster_id,),
        namespace_refs=(),
        contexts={descriptor.cluster.cluster_id: context},
        resource_page={"items": node_resources, "filtered_count": 2, "has_more": False},
        metric_page={
            "resources": [],
            "samples_by_cluster": {
                descriptor.cluster.cluster_id: [
                    {"sampled_at": observed_at.isoformat(), "usage": payload["usage"]}
                ]
            },
        },
        snapshot_revision=1,
        next_cursor=None,
    )
    assert nodes.count_completeness == "exact"
    assert nodes.total == 2
    assert {item.status for item in nodes.items} == {"NotReady", "Ready"}
    assert all(item.usage.availability == "available" for item in nodes.items)
    assert all(item.capacity.cpu_mcores == 3800.0 for item in nodes.items)
    assert nodes.pricing_coverage.availability == "unavailable"

    overview = cost_overview(
        workspace_id=descriptor.workspace.workspace_id,
        contexts={descriptor.cluster.cluster_id: context},
        selected_cluster_ids=(descriptor.cluster.cluster_id,),
    )
    assert overview.observation.availability == "unavailable"
    assert overview.observation.reason_codes == ("cost_observation_unavailable",)


def test_reset_passes_exact_descriptor_marker_to_repository_boundary() -> None:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()

    result = reset_demo_workspace(db, descriptor)

    assert result["action"] == "reset"
    assert result["deleted"] == {"cluster_inventory_snapshots": 1, "workspaces": 1}
    assert db.reset_calls == [
        {
            "workspace_id": descriptor.workspace.workspace_id,
            "cluster_id": descriptor.cluster.cluster_id,
            "expected_marker": descriptor.seed_marker(),
            "event_source": DEMO_EVENT_SOURCE,
        }
    ]


def test_direct_broker_fallback_is_fail_closed() -> None:
    with pytest.raises(RuntimeError, match="database outbox"):
        asyncio.run(OutboxRequiredPublisher().emit("subject", "source", {}))


def test_database_composition_exposes_demo_reset_repository() -> None:
    assert DemoWorkspaceRepository in Database.__mro__
    assert Database.reset_demo_workspace is DemoWorkspaceRepository.reset_demo_workspace


def test_sqlite_reset_deletes_children_before_parents_and_preserves_other_scopes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    schema = _demo_reset_test_schema()
    engine = create_engine("sqlite+pysqlite:///:memory:")

    @sqlalchemy_event.listens_for(engine, "connect")
    def enable_foreign_keys(connection: Any, _record: object) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    schema.create_all(engine)
    marker = {"descriptor_id": "opsia-ui-demo.v1", "schema_version": 1, "digest": "a" * 64}
    _insert_reset_test_rows(schema, engine, marker)
    repository = object.__new__(DemoWorkspaceRepository)

    @contextmanager
    def unit_of_work():
        with engine.begin() as connection:
            yield connection

    repository.unit_of_work = unit_of_work  # type: ignore[method-assign]
    monkeypatch.setattr(demo_repository_module, "metadata", schema)

    counts = repository.reset_demo_workspace(
        workspace_id="demo-workspace",
        cluster_id="demo-cluster",
        expected_marker=marker,
        event_source=DEMO_EVENT_SOURCE,
    )

    assert counts["event_processing"] == 1
    assert counts["events"] == 1
    assert counts["cluster_registrations"] == 1
    assert counts["cluster_inventory_snapshots"] == 1
    assert counts["outbox"] == 2
    assert counts["workspaces"] == 1
    assert counts["member_resource_roles"] == 1
    assert counts["resource_assignments"] == 1
    assert counts["group_members"] == 1
    assert counts["groups"] == 1
    assert counts["organization_members"] == 1
    assert counts["organizations"] == 1

    with engine.connect() as connection:
        for table_name in (
            "event_processing",
            "cluster_registrations",
            "cluster_inventory_snapshots",
            "outbox",
            "member_resource_roles",
            "resource_assignments",
            "group_members",
            "groups",
            "organization_members",
            "organizations",
        ):
            assert (
                connection.execute(
                    select(func.count()).select_from(schema.tables[table_name])
                ).scalar_one()
                == 0
            )
        assert (
            connection.execute(
                select(func.count()).select_from(schema.tables["workspaces"])
            ).scalar_one()
            == 1
        )
        remaining_events = connection.execute(
            select(schema.tables["events"].c.event_id).order_by(schema.tables["events"].c.event_id)
        ).scalars()
        assert list(remaining_events) == ["event-other-source"]


def test_sqlite_reset_marker_mismatch_rolls_back_without_deleting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    schema = _demo_reset_test_schema()
    engine = create_engine("sqlite+pysqlite:///:memory:")
    schema.create_all(engine)
    marker = {"descriptor_id": "opsia-ui-demo.v1", "schema_version": 1, "digest": "a" * 64}
    _insert_reset_test_rows(schema, engine, marker)
    repository = object.__new__(DemoWorkspaceRepository)

    @contextmanager
    def unit_of_work():
        with engine.begin() as connection:
            yield connection

    repository.unit_of_work = unit_of_work  # type: ignore[method-assign]
    monkeypatch.setattr(demo_repository_module, "metadata", schema)

    with pytest.raises(RuntimeError, match="persisted descriptor marker"):
        repository.reset_demo_workspace(
            workspace_id="demo-workspace",
            cluster_id="demo-cluster",
            expected_marker={**marker, "digest": "b" * 64},
            event_source=DEMO_EVENT_SOURCE,
        )

    with engine.connect() as connection:
        assert (
            connection.execute(
                select(func.count()).select_from(schema.tables["cluster_inventory_snapshots"])
            ).scalar_one()
            == 1
        )
        assert (
            connection.execute(
                select(func.count()).select_from(schema.tables["workspaces"])
            ).scalar_one()
            == 2
        )


def _seeded_inventory_payload() -> tuple[DemoWorkspaceDescriptor, dict[str, Any], datetime]:
    descriptor = load_descriptor(DEFAULT_DESCRIPTOR)
    db = FakeDemoDatabase()
    observed_at = datetime(2026, 7, 17, 0, 0, tzinfo=UTC)
    asyncio.run(
        seed_demo_workspace(
            db,
            descriptor,
            events=FakeEvents(),
            discovery=FakeRepositoryDiscovery(),
            observed_at=observed_at,
        )
    )
    return descriptor, db.inventory_writes[0], observed_at


def _normalized_seed_resources(
    descriptor: DemoWorkspaceDescriptor,
    payload: dict[str, Any],
    observed_at: datetime,
) -> list[dict[str, Any]]:
    return [
        normalize_inventory_resource(
            resource,
            workspace_id=descriptor.workspace.workspace_id,
            cluster_id=descriptor.cluster.cluster_id,
            snapshot_id="snapshot-demo-v1",
            observed_at=observed_at,
        )
        for resource in snapshot_resources(payload)
    ]


def _serialized_resources(resources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    repository = object.__new__(InventoryRepository)
    return [repository.serialize_inventory_resource(resource) for resource in resources]


def _graph_item(
    descriptor: DemoWorkspaceDescriptor,
    resource: dict[str, Any],
) -> dict[str, Any]:
    return {
        "resource": resource,
        "cluster": {
            "cluster_id": descriptor.cluster.cluster_id,
            "name": descriptor.cluster.name,
            "provider": descriptor.cluster.settings["provider"],
        },
        "application_ids": [],
        "application_binding_completeness": "exact",
    }


def _edge_kind_counts(graph: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for edge in graph["edges"]:
        kind = str(edge["kind"])
        counts[kind] = counts.get(kind, 0) + 1
    return counts


def _demo_reset_test_schema() -> MetaData:
    schema = MetaData()
    Table("workspaces", schema, Column("workspace_id", String, primary_key=True))
    Table("organizations", schema, Column("organization_id", String, primary_key=True))
    Table(
        "organization_members",
        schema,
        Column("id", Integer, primary_key=True),
        Column("organization_id", ForeignKey("organizations.organization_id")),
        Column("user_id", String),
    )
    Table(
        "groups",
        schema,
        Column("group_id", String, primary_key=True),
        Column("organization_id", ForeignKey("organizations.organization_id")),
    )
    Table(
        "group_members",
        schema,
        Column("id", Integer, primary_key=True),
        Column("group_id", ForeignKey("groups.group_id")),
        Column("user_id", String),
    )
    Table(
        "resource_assignments",
        schema,
        Column("resource_assignment_id", String, primary_key=True),
        Column("organization_id", ForeignKey("organizations.organization_id")),
        Column("group_id", ForeignKey("groups.group_id")),
    )
    Table(
        "member_resource_roles",
        schema,
        Column("id", Integer, primary_key=True),
        Column(
            "resource_assignment_id",
            ForeignKey("resource_assignments.resource_assignment_id"),
        ),
    )
    Table(
        "cluster_registrations",
        schema,
        Column("id", Integer, primary_key=True),
        Column("workspace_id", ForeignKey("workspaces.workspace_id")),
        Column("cluster_id", String),
        Column("settings", JSON),
    )
    Table(
        "cluster_inventory_snapshots",
        schema,
        Column("snapshot_id", String, primary_key=True),
        Column("workspace_id", ForeignKey("workspaces.workspace_id")),
    )
    Table(
        "outbox",
        schema,
        Column("id", Integer, primary_key=True),
        Column("workspace_id", ForeignKey("workspaces.workspace_id")),
    )
    Table(
        "events",
        schema,
        Column("event_id", String, primary_key=True),
        Column("source", String),
        Column("payload", JSON),
    )
    Table(
        "event_processing",
        schema,
        Column("event_id", ForeignKey("events.event_id"), primary_key=True),
    )
    return schema


def _insert_reset_test_rows(
    schema: MetaData,
    engine: Any,
    marker: dict[str, object],
) -> None:
    tables = schema.tables
    with engine.begin() as connection:
        connection.execute(
            tables["workspaces"].insert(),
            [{"workspace_id": "demo-workspace"}, {"workspace_id": "live-workspace"}],
        )
        connection.execute(
            tables["organizations"].insert().values(organization_id="demo-workspace")
        )
        connection.execute(
            tables["organization_members"]
            .insert()
            .values(id=1, organization_id="demo-workspace", user_id="demo-user")
        )
        connection.execute(
            tables["groups"]
            .insert()
            .values(group_id="demo-group", organization_id="demo-workspace")
        )
        connection.execute(
            tables["group_members"]
            .insert()
            .values(id=1, group_id="demo-group", user_id="demo-user")
        )
        connection.execute(
            tables["resource_assignments"]
            .insert()
            .values(
                resource_assignment_id="demo-assignment",
                organization_id="demo-workspace",
                group_id="demo-group",
            )
        )
        connection.execute(
            tables["member_resource_roles"]
            .insert()
            .values(id=1, resource_assignment_id="demo-assignment")
        )
        connection.execute(
            tables["cluster_registrations"]
            .insert()
            .values(
                id=1,
                workspace_id="demo-workspace",
                cluster_id="demo-cluster",
                settings={DEMO_SEED_MARKER_KEY: marker},
            )
        )
        connection.execute(
            tables["cluster_inventory_snapshots"]
            .insert()
            .values(snapshot_id="demo-snapshot", workspace_id="demo-workspace")
        )
        connection.execute(
            tables["outbox"].insert(),
            [
                {"id": 1, "workspace_id": "demo-workspace"},
                {"id": 2, "workspace_id": "demo-workspace"},
            ],
        )
        connection.execute(
            tables["events"].insert(),
            [
                {
                    "event_id": "event-demo-seed",
                    "source": DEMO_EVENT_SOURCE,
                    "payload": {"workspace_id": "demo-workspace"},
                },
                {
                    "event_id": "event-other-source",
                    "source": "another-service",
                    "payload": {"workspace_id": "demo-workspace"},
                },
            ],
        )
        connection.execute(tables["event_processing"].insert().values(event_id="event-demo-seed"))
