from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace

from domains.gitops import detail_router
from packages.contracts.gitops.detail import GitOpsResourceActionRequest
from packages.contracts.parity import CommandReceipt, ResourceRef


def _root() -> dict[str, object]:
    return {
        "inventory_key": "gitops-root",
        "snapshot_id": "snapshot-1",
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "resource_type": "custom_resource",
        "api_version": "argoproj.io/v1alpha1",
        "kind": "Application",
        "namespace": "argocd",
        "name": "storefront",
        "uid": "app-uid",
        "resource_version": "17",
        "status": "Synced",
        "health": "Healthy",
        "raw": {"status": {"sync": {"revision": "main@sha1:abc"}}},
    }


class GitOpsResourceDb:
    def __init__(self) -> None:
        self.root = _root()
        self.list_calls = 0

    def user_has_resource_access(self, *_args: object) -> bool:
        return True

    def get_inventory_resource_by_api_version(self, **kwargs: object) -> dict[str, object] | None:
        if (
            kwargs.get("workspace_id") == "workspace-a"
            and kwargs.get("cluster_id") == "cluster-a"
            and kwargs.get("resource_type") == "custom_resource"
            and kwargs.get("api_version") == "argoproj.io/v1alpha1"
            and str(kwargs.get("kind")).casefold() == "application"
            and kwargs.get("namespace") == "argocd"
            and kwargs.get("name") == "storefront"
        ):
            return self.root
        return None

    def list_inventory_resources(self, **kwargs: object) -> list[dict[str, object]]:
        assert kwargs == {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "include_deleted": False,
            "limit": 1000,
        }
        self.list_calls += 1
        return [self.root]

    def latest_inventory_snapshot(self, workspace_id: str, cluster_id: str) -> dict[str, object]:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        return {
            "snapshot_id": "snapshot-1",
            "summary": {"summary": {"resources_complete": True}},
        }

    def list_cluster_agent_statuses(
        self, workspace_id: str, cluster_id: str
    ) -> list[dict[str, object]]:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        return [
            {
                "status": "connected",
                "last_seen_at": datetime.now(UTC).isoformat(),
                "capabilities": ["command_receiver", "gitops_control.v1"],
            }
        ]


def _current() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-a", roles=("operator",), workspace_id="workspace-a")


def test_tree_and_insights_share_one_exact_inventory_batch_per_request() -> None:
    db = GitOpsResourceDb()

    tree = asyncio.run(
        detail_router.get_gitops_resource_tree(
            kind="Application",
            namespace="argocd",
            name="storefront",
            cluster_id="cluster-a",
            api_version="argoproj.io/v1alpha1",
            current=_current(),
            db=db,
        )
    )
    insights = asyncio.run(
        detail_router.get_gitops_resource_insights(
            kind="Application",
            namespace="argocd",
            name="storefront",
            cluster_id="cluster-a",
            api_version="argoproj.io/v1alpha1",
            current=_current(),
            db=db,
        )
    )

    assert tree.coverage.state == "complete"
    assert insights.insights.resource.uid == "app-uid"
    assert insights.insights.capabilities.actions == ("refresh", "sync")
    assert db.list_calls == 2


def test_action_revalidates_capability_revision_and_dispatches_existing_receipt_flow(
    monkeypatch,
) -> None:
    db = GitOpsResourceDb()
    insights = asyncio.run(
        detail_router.get_gitops_resource_insights(
            kind="Application",
            namespace="argocd",
            name="storefront",
            cluster_id="cluster-a",
            api_version="argoproj.io/v1alpha1",
            current=_current(),
            db=db,
        )
    ).insights
    captured: dict[str, object] = {}

    async def accept(_events, command, **_kwargs):
        captured["command"] = command
        return SimpleNamespace(
            event=SimpleNamespace(event_id="event-1", correlation_id="corr-1")
        ), None

    monkeypatch.setattr(detail_router, "accept_command_with_receipt_stage", accept)
    monkeypatch.setattr(
        detail_router,
        "command_accepted_response",
        lambda command, _accepted: CommandReceipt(
            command_id=command.command_id,
            event_id="event-1",
            audit_event_id="event-1",
            correlation_id="corr-1",
            status="queued",
        ),
    )

    async def announce(*_args, **_kwargs):
        return True

    monkeypatch.setattr(detail_router, "announce_staged_operation_event", announce)
    request = GitOpsResourceActionRequest(
        cluster_id="cluster-a",
        resource=ResourceRef(
            api_group="argoproj.io",
            version="v1alpha1",
            kind="Application",
            namespace="argocd",
            name="storefront",
            uid="app-uid",
        ),
        resource_version="17",
        capability_revision=insights.capabilities.revision,
        action="refresh",
        refresh_mode="hard",
        confirmation=True,
        reason="refresh reviewed controller state",
    )

    receipt = asyncio.run(
        detail_router.create_gitops_resource_action(
            kind="Application",
            namespace="argocd",
            name="storefront",
            payload=request,
            idempotency_key="refresh-storefront-17",
            current=_current(),
            db=db,
            events=object(),
            operation_events=object(),
        )
    )

    assert receipt.status == "queued"
    command = captured["command"]
    assert command.action == "gitops.resource.control"
    assert command.payload["resource_version"] == "17"
    assert command.payload["refresh_mode"] == "hard"
    assert command.direct_execution is True
