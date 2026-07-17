"""Seed or reset the descriptor-owned UI demo workspace through repository contracts."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from domains.demo_workspace.policy import require_demo_workspace_mutation_opt_in  # noqa: E402
from domains.gitops.repository_discovery import RepositoryDiscoveryService  # noqa: E402
from domains.inventory.events import InventorySnapshotRecordedBody  # noqa: E402
from domains.inventory.ingest import ingest_inventory_snapshot  # noqa: E402
from packages.contracts.demo_workspace import (  # noqa: E402
    DEMO_SEED_MARKER_KEY,
    DemoGitOpsSourceDescriptor,
    DemoWorkspaceDescriptor,
)
from packages.contracts.gateway.requests import (  # noqa: E402
    InventorySnapshotRequest,
    RepositoryManifestValidationRequest,
    RepositoryProbeRequest,
)
from packages.events.context import event_workspace  # noqa: E402
from packages.runtime.gateway import ApiEventGateway  # noqa: E402
from packages.storage.database import Database  # noqa: E402
from packages.storage.engine import unit_of_work_or_null  # noqa: E402

DEFAULT_DESCRIPTOR = ROOT / "src" / "samples" / "demo-workspace" / "v1.json"
DEMO_EVENT_SOURCE = "demo-workspace-seed"


class OutboxRequiredPublisher:
    """Reject accidental broker publication when the durable DB outbox is unavailable."""

    async def emit(self, *_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("demo inventory events require the database outbox")


async def validate_demo_gitops_sources(
    descriptor: DemoWorkspaceDescriptor,
    discovery: Any,
) -> list[dict[str, object]]:
    """Validate the public repository using the same discovery contract as connect."""

    gitops = descriptor.gitops
    if gitops is None:
        return []
    if discovery is None:
        raise RuntimeError("demo GitOps seed requires repository discovery")

    probe = await discovery.probe_repository(RepositoryProbeRequest(repo_ref=gitops.repo_ref))
    if not probe.valid or not probe.reachable:
        detail = probe.errors[0] if probe.errors else "repository is not reachable"
        raise RuntimeError(f"demo GitOps repository validation failed: {detail}")
    if probe.private is not False:
        raise RuntimeError("demo GitOps repository must be confirmed public")
    if probe.default_branch != gitops.default_branch:
        raise RuntimeError("demo GitOps repository default branch does not match descriptor")

    normalized_repo_ref = probe.normalized_repo_ref
    branches, candidates, revision = await asyncio.gather(
        discovery.list_branches(normalized_repo_ref),
        discovery.list_manifest_candidates(normalized_repo_ref, gitops.default_branch),
        discovery.resolve_branch_revision(normalized_repo_ref, gitops.default_branch),
    )
    branch_names = {branch.name for branch in branches.branches}
    if gitops.default_branch not in branch_names:
        raise RuntimeError("demo GitOps default branch is unavailable")
    if revision != gitops.revision:
        raise RuntimeError("demo GitOps repository revision does not match descriptor")
    candidate_identities = {
        (candidate.path, candidate.source_type) for candidate in candidates.candidates
    }
    missing = [
        f"{source.source_type}:{source.manifest_path}"
        for source in gitops.sources
        if (source.manifest_path, source.source_type) not in candidate_identities
    ]
    if missing:
        raise RuntimeError(f"demo GitOps candidates are unavailable: {', '.join(missing)}")

    validations = await asyncio.gather(
        *(
            discovery.validate_manifest(
                RepositoryManifestValidationRequest(
                    repo_ref=normalized_repo_ref,
                    branch=gitops.default_branch,
                    manifest_path=source.manifest_path,
                    source_type=source.source_type,
                    values_path=source.values_path,
                )
            )
            for source in gitops.sources
        )
    )
    evidence: list[dict[str, object]] = []
    for source, validation in zip(gitops.sources, validations, strict=True):
        if (
            not validation.valid
            or validation.repo_ref != normalized_repo_ref
            or validation.branch != gitops.default_branch
            or validation.manifest_path != source.manifest_path
        ):
            detail = validation.errors[0] if validation.errors else "manifest validation failed"
            raise RuntimeError(f"demo GitOps source validation failed ({source.name}): {detail}")
        evidence.append(
            {
                "source": source,
                "repo_ref": normalized_repo_ref,
                "validation_mode": validation.validation_mode,
                "resource_count": validation.resource_count,
                "warnings": list(validation.warnings),
            }
        )
    return evidence


def persist_demo_gitops_sources(
    db: Any,
    descriptor: DemoWorkspaceDescriptor,
    *,
    marker: Mapping[str, object],
    evidence: Sequence[Mapping[str, object]],
) -> int:
    """Persist validated sources through the canonical repository/application stores."""

    gitops = descriptor.gitops
    if gitops is None:
        return 0
    if len(evidence) != len(gitops.sources):
        raise RuntimeError("demo GitOps validation evidence is incomplete")
    normalized_repo_refs = {str(item.get("repo_ref") or "") for item in evidence}
    if len(normalized_repo_refs) != 1 or "" in normalized_repo_refs:
        raise RuntimeError("demo GitOps repository identity is incomplete")

    workspace_id = descriptor.workspace.workspace_id
    repository = db.register_repository(
        {
            "workspace_id": workspace_id,
            "user_id": descriptor.workspace.owner_user_id,
            "provider": "github",
            "repo_ref": normalized_repo_refs.pop(),
            "default_branch": gitops.default_branch,
            "credential_ref": None,
            "status": "active",
            "access_policy": {
                DEMO_SEED_MARKER_KEY: dict(marker),
                "visibility": "public",
                "mutation": "read-only-demo",
                "revision": gitops.revision,
                "catalog_scenario_count": gitops.catalog_scenario_count,
            },
        }
    )
    repository_id = str(repository["repository_id"])
    for item in evidence:
        source = item.get("source")
        if not isinstance(source, DemoGitOpsSourceDescriptor):
            raise RuntimeError("demo GitOps source validation evidence is invalid")
        validation_metadata = {
            "branch": gitops.default_branch,
            "source_type": source.source_type,
            "validation_mode": str(item.get("validation_mode") or ""),
            "validated_resource_count": int(item.get("resource_count") or 0),
            "validation_warnings": list(item.get("warnings") or []),
            "repository_revision": gitops.revision,
            "catalog_scenario_count": gitops.catalog_scenario_count,
            "values_path": source.values_path,
            DEMO_SEED_MARKER_KEY: dict(marker),
        }
        body = {
            "workspace_id": workspace_id,
            "user_id": descriptor.workspace.owner_user_id,
            "repository_id": repository_id,
            "repo_ref": str(repository["repo_ref"]),
            "name": source.name,
            "default_branch": gitops.default_branch,
            "branch": gitops.default_branch,
            "manifest_path": source.manifest_path,
            "metadata": validation_metadata,
            "cluster_id": descriptor.cluster.cluster_id,
            "namespace": source.namespace,
            "environment": source.environment,
            "resource_class": "application",
            "status": "active",
            "interval_seconds": source.interval_seconds,
            "settings": {
                "source_type": source.source_type,
                DEMO_SEED_MARKER_KEY: dict(marker),
            },
            "deploy_policy": {
                "manifest_source": source.source_type,
                "validation_mode": validation_metadata["validation_mode"],
                "values_path": source.values_path,
                "read_only": True,
            },
            "access_policy": {
                DEMO_SEED_MARKER_KEY: dict(marker),
                "mutation": "read-only-demo",
            },
        }
        application = db.upsert_application(body)
        binding_body = {
            **body,
            "application_id": str(application["application_id"]),
            "app_name": str(application.get("name") or source.name),
        }
        db.register_watch_target(binding_body)
        db.register_deployment_binding(binding_body)
    return len(evidence)


def load_descriptor(
    path: Path,
    *,
    owner_user_id: str | None = None,
) -> DemoWorkspaceDescriptor:
    with path.open(encoding="utf-8") as handle:
        descriptor = DemoWorkspaceDescriptor.model_validate(json.load(handle))
    if owner_user_id is None:
        return descriptor
    return descriptor.with_owner_user_id(owner_user_id)


def _persisted_registration_marker(registration: object) -> object:
    if not isinstance(registration, Mapping):
        return None
    settings = registration.get("settings")
    return settings.get(DEMO_SEED_MARKER_KEY) if isinstance(settings, Mapping) else None


def _persisted_snapshot_marker(snapshot: object) -> object:
    if not isinstance(snapshot, Mapping):
        return None
    envelope = snapshot.get("summary")
    if not isinstance(envelope, Mapping):
        return None
    summary = envelope.get("summary")
    return summary.get(DEMO_SEED_MARKER_KEY) if isinstance(summary, Mapping) else None


async def seed_demo_workspace(
    db: Any,
    descriptor: DemoWorkspaceDescriptor,
    *,
    events: Any,
    discovery: Any | None = None,
    observed_at: datetime | None = None,
) -> dict[str, object]:
    require_demo_workspace_mutation_opt_in()
    workspace_id = descriptor.workspace.workspace_id
    cluster_id = descriptor.cluster.cluster_id
    marker = descriptor.seed_marker()
    registration = db.get_cluster_registration(workspace_id, cluster_id)
    snapshot = db.latest_inventory_snapshot(workspace_id, cluster_id)
    registration_current = _persisted_registration_marker(registration) == marker
    snapshot_current = _persisted_snapshot_marker(snapshot) == marker

    if registration_current and snapshot_current:
        return {
            "action": "unchanged",
            "descriptor_id": descriptor.descriptor_id,
            "digest": descriptor.digest(),
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "snapshot_id": str(snapshot["snapshot_id"]),
            "gitops_source_count": len(descriptor.gitops.sources) if descriptor.gitops else 0,
        }

    gitops_evidence = await validate_demo_gitops_sources(descriptor, discovery)
    result: Mapping[str, object] = snapshot if isinstance(snapshot, Mapping) else {}
    with unit_of_work_or_null(db):
        if not registration_current:
            db.register_target_cluster(
                {
                    "workspace_id": workspace_id,
                    "organization_id": workspace_id,
                    "user_id": descriptor.workspace.owner_user_id,
                    "cluster_id": cluster_id,
                    "name": descriptor.cluster.name,
                    "environment": descriptor.cluster.environment,
                    "status": "registered",
                    "settings": {
                        **descriptor.cluster.settings,
                        DEMO_SEED_MARKER_KEY: marker,
                    },
                }
            )

        if not snapshot_current:
            collected_at = observed_at or datetime.now(UTC)
            inventory = InventorySnapshotRequest.model_validate(
                {
                    "cluster_id": cluster_id,
                    "agent_id": descriptor.cluster.agent_id,
                    "source": f"{DEMO_EVENT_SOURCE}:v{descriptor.schema_version}",
                    "collected_at": collected_at.isoformat(),
                    "replace": descriptor.inventory.replace,
                    "resources": [
                        item.model_dump(mode="json") for item in descriptor.inventory.resources
                    ],
                    "summary": {
                        **descriptor.inventory.summary,
                        DEMO_SEED_MARKER_KEY: marker,
                    },
                    "health": descriptor.inventory.health,
                    "usage": descriptor.inventory.usage,
                }
            )

            async def record_snapshot_event(saved: dict[str, Any]) -> None:
                if saved.get("accepted") is not True:
                    raise RuntimeError("demo inventory snapshot was not accepted")
                await events.accept_body(
                    InventorySnapshotRecordedBody(
                        workspace_id=workspace_id,
                        cluster_id=cluster_id,
                        snapshot_id=str(saved["snapshot_id"]),
                        agent_id=descriptor.cluster.agent_id,
                        resource_count=int(saved["resource_count"]),
                        resource_types=list(saved["resource_types"]),
                    )
                )

            with event_workspace(workspace_id):
                result = await ingest_inventory_snapshot(
                    db=db,
                    workspace_id=workspace_id,
                    cluster_id=cluster_id,
                    agent_id=descriptor.cluster.agent_id,
                    payload=inventory.model_dump(mode="json"),
                    after_persist=record_snapshot_event,
                )

        gitops_source_count = persist_demo_gitops_sources(
            db,
            descriptor,
            marker=marker,
            evidence=gitops_evidence,
        )

    return {
        "action": "seeded",
        "descriptor_id": descriptor.descriptor_id,
        "digest": descriptor.digest(),
        "workspace_id": workspace_id,
        "cluster_id": cluster_id,
        "snapshot_id": str(result["snapshot_id"]),
        "registration_written": not registration_current,
        "inventory_written": not snapshot_current,
        "gitops_source_count": gitops_source_count,
    }


def reset_demo_workspace(db: Any, descriptor: DemoWorkspaceDescriptor) -> dict[str, object]:
    require_demo_workspace_mutation_opt_in()
    counts = db.reset_demo_workspace(
        workspace_id=descriptor.workspace.workspace_id,
        cluster_id=descriptor.cluster.cluster_id,
        expected_marker=descriptor.seed_marker(),
        event_source=DEMO_EVENT_SOURCE,
    )
    return {
        "action": "reset",
        "descriptor_id": descriptor.descriptor_id,
        "digest": descriptor.digest(),
        "workspace_id": descriptor.workspace.workspace_id,
        "cluster_id": descriptor.cluster.cluster_id,
        "deleted": counts,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("seed", "reset"))
    parser.add_argument(
        "--descriptor",
        type=Path,
        default=DEFAULT_DESCRIPTOR,
        help="versioned demo workspace descriptor",
    )
    parser.add_argument(
        "--owner-user-id",
        help="validated runtime owner included in the effective descriptor digest",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    descriptor = load_descriptor(args.descriptor, owner_user_id=args.owner_user_id)
    require_demo_workspace_mutation_opt_in()
    db = Database()
    try:
        db.verify_schema()
        if args.action == "seed":
            events = ApiEventGateway(OutboxRequiredPublisher(), db, DEMO_EVENT_SOURCE)
            output = asyncio.run(
                seed_demo_workspace(
                    db,
                    descriptor,
                    events=events,
                    discovery=RepositoryDiscoveryService(),
                )
            )
        else:
            output = reset_demo_workspace(db, descriptor)
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
    finally:
        db.engine.dispose()
        asyncio.run(db.async_engine.dispose())


if __name__ == "__main__":
    main()
