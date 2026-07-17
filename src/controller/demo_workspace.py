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
from domains.inventory.events import InventorySnapshotRecordedBody  # noqa: E402
from domains.inventory.ingest import ingest_inventory_snapshot  # noqa: E402
from packages.contracts.demo_workspace import (  # noqa: E402
    DEMO_SEED_MARKER_KEY,
    DemoWorkspaceDescriptor,
)
from packages.contracts.gateway.requests import InventorySnapshotRequest  # noqa: E402
from packages.events.context import event_workspace  # noqa: E402
from packages.runtime.gateway import ApiEventGateway  # noqa: E402
from packages.storage.database import Database  # noqa: E402

DEFAULT_DESCRIPTOR = ROOT / "src" / "samples" / "demo-workspace" / "v1.json"
DEMO_EVENT_SOURCE = "demo-workspace-seed"


class OutboxRequiredPublisher:
    """Reject accidental broker publication when the durable DB outbox is unavailable."""

    async def emit(self, *_args: Any, **_kwargs: Any) -> Any:
        raise RuntimeError("demo inventory events require the database outbox")


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
        }

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

    result: Mapping[str, object] = snapshot if isinstance(snapshot, Mapping) else {}
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

    return {
        "action": "seeded",
        "descriptor_id": descriptor.descriptor_id,
        "digest": descriptor.digest(),
        "workspace_id": workspace_id,
        "cluster_id": cluster_id,
        "snapshot_id": str(result["snapshot_id"]),
        "registration_written": not registration_current,
        "inventory_written": not snapshot_current,
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
            output = asyncio.run(seed_demo_workspace(db, descriptor, events=events))
        else:
            output = reset_demo_workspace(db, descriptor)
        print(json.dumps(output, ensure_ascii=False, sort_keys=True))
    finally:
        db.engine.dispose()
        asyncio.run(db.async_engine.dispose())


if __name__ == "__main__":
    main()
