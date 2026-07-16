from __future__ import annotations

from domains.inventory.workload_revisions import workload_revision_history_response

from packages.contracts.gateway.requests import WorkloadRollbackRequest


def workload() -> dict[str, object]:
    return {
        "inventory_key": "workload-checkout",
        "snapshot_id": "snapshot-42",
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "resource_type": "workload",
        "api_version": "apps/v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout",
        "uid": "deployment-uid",
        "resource_version": "42",
        "raw": {
            "revision_history_complete": True,
            "revision_history_count": 3,
            "pod_template": {
                "metadata": {"labels": {"app": "checkout", "track": "stable"}},
                "spec": {"containers": [{"name": "api", "image": "checkout:v3"}]},
            },
        },
    }


def revision(
    number: int,
    image: str,
    *,
    uid: str | None = None,
    snapshot_id: str = "snapshot-42",
) -> dict[str, object]:
    name = f"checkout-r{number}"
    return {
        "inventory_key": f"revision-{number}",
        "snapshot_id": snapshot_id,
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "resource_type": "workload_revision",
        "api_version": "apps/v1",
        "kind": "ReplicaSet",
        "namespace": "shop",
        "name": name,
        "uid": uid or f"revision-uid-{number}",
        "resource_version": str(number),
        "raw": {
            "owner_kind": "Deployment",
            "owner_name": "checkout",
            "owner_uid": "deployment-uid",
            "revision": str(number),
            "created_at": f"2026-07-{number:02d}T00:00:00Z",
            "template": {
                "metadata": {"labels": {"app": "checkout", "track": "stable"}},
                "spec": {"containers": [{"name": "api", "image": image}]},
            },
        },
    }


class RevisionDb:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def list_inventory_resources(self, **kwargs: object) -> list[dict[str, object]]:
        assert kwargs == {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "resource_type": "workload_revision",
            "namespace": "shop",
            "include_deleted": False,
            "limit": 1000,
        }
        return self.rows


def test_revision_history_is_exact_bounded_and_excludes_the_current_template() -> None:
    response = workload_revision_history_response(
        RevisionDb(
            [
                revision(1, "checkout:v1"),
                revision(2, "checkout:v2"),
                revision(3, "checkout:v3"),
            ]
        ),
        workspace_id="workspace-a",
        resource=workload(),
        cursor=0,
        limit=1,
    )

    assert response.availability == "available"
    assert response.completeness == "exact"
    assert response.snapshot_id == "snapshot-42"
    assert response.current.resource_version == "42"
    assert [item.revision for item in response.revisions] == ["2"]
    assert response.revisions[0].resource.uid == "revision-uid-2"
    assert response.revisions[0].resource_version == "2"
    assert response.revisions[0].changes[0].path == "/spec/containers/0/image"
    assert response.revisions[0].changes[0].before == "checkout:v3"
    assert response.revisions[0].changes[0].after == "checkout:v2"
    assert response.next_cursor == 1


def test_revision_history_fails_closed_when_the_observed_set_is_incomplete() -> None:
    response = workload_revision_history_response(
        RevisionDb([revision(1, "checkout:v1"), revision(3, "checkout:v3")]),
        workspace_id="workspace-a",
        resource=workload(),
        cursor=0,
        limit=20,
    )

    assert response.availability == "unavailable"
    assert response.completeness == "partial"
    assert response.reason == "revision_history_incomplete"
    assert response.revisions == []


def test_revision_history_rejects_cross_snapshot_and_duplicate_revision_identity() -> None:
    response = workload_revision_history_response(
        RevisionDb(
            [
                revision(1, "checkout:v1", snapshot_id="snapshot-old"),
                revision(2, "checkout:v2", uid="same-uid"),
                revision(3, "checkout:v1", uid="same-uid"),
            ]
        ),
        workspace_id="workspace-a",
        resource=workload(),
        cursor=0,
        limit=20,
    )

    assert response.availability == "unavailable"
    assert response.completeness == "partial"
    assert response.revisions == []


def test_rollback_request_requires_exact_workload_and_revision_cas() -> None:
    preview = workload_revision_history_response(
        RevisionDb(
            [
                revision(1, "checkout:v1"),
                revision(2, "checkout:v2"),
                revision(3, "checkout:v3"),
            ]
        ),
        workspace_id="workspace-a",
        resource=workload(),
        cursor=0,
        limit=20,
    )
    selected = preview.revisions[0]

    request = WorkloadRollbackRequest(
        resource_id="workload-checkout",
        snapshot_id=preview.snapshot_id,
        capability_revision="a" * 64,
        workload=preview.current.resource,
        workload_resource_version=preview.current.resource_version,
        target_revision=selected.resource,
        target_resource_version=selected.resource_version,
        preview_revision=selected.preview_revision,
        confirmation=True,
        reason="restore the previous observed revision",
    )

    assert request.workload.uid == "deployment-uid"
    assert request.target_revision.uid == "revision-uid-2"
    assert request.preview_revision.startswith("sha256:")
