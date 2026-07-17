from __future__ import annotations

from domains.gitops.overview_projection import project_gitops_overview


def test_registered_and_controller_rows_coexist_without_name_guessing() -> None:
    response = project_gitops_overview(
        workspace_id="workspace-a",
        registered_rows=[
            {
                "application_id": "app-a",
                "application_name": "storefront",
                "binding_id": "binding-a",
                "cluster_id": "cluster-a",
                "namespace": "argocd",
                "environment": "production",
                "status": "active",
            }
        ],
        inventory_rows=[
            {
                "version_id": 17,
                "cluster_id": "cluster-a",
                "api_version": "argoproj.io/v1alpha1",
                "kind": "Application",
                "namespace": "argocd",
                "name": "storefront",
                "uid": "application-uid",
                "resource_version": "17",
                "status": "Synced",
                "health": "Healthy",
                "summary": {"revision": "main@sha1:abc"},
                "labels": {"team": "platform"},
                "observed_at": "2026-07-17T01:02:03Z",
                "application_ids": [],
            },
            {
                "version_id": 18,
                "cluster_id": "cluster-a",
                "api_version": "argoproj.io/v1alpha1",
                "kind": "ApplicationSet",
                "namespace": "argocd",
                "name": "platform-apps",
                "uid": "applicationset-uid",
                "resource_version": "4",
                "status": "Ready",
                "health": "Healthy",
                "summary": {},
                "labels": {},
                "observed_at": "2026-07-17T01:02:03Z",
                "application_ids": [],
            },
        ],
        snapshot_contexts={
            "cluster-a": {
                "observed_at": "2026-07-17T01:02:03Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
        has_more=False,
    )

    assert [row.authority for row in response.items] == [
        "controller",
        "controller",
        "registered",
    ]
    assert response.coverage.registered_count == 1
    assert response.coverage.controller_count == 2
    assert {row.id for row in response.items} == {
        "controller:cluster-a:application-uid",
        "controller:cluster-a:applicationset-uid",
        "registered:binding-a",
    }
    assert response.items[0].application_ids == ()
    assert response.coverage.state == "complete"


def test_partial_and_empty_observations_are_honest() -> None:
    partial = project_gitops_overview(
        workspace_id="workspace-a",
        registered_rows=[],
        inventory_rows=[],
        snapshot_contexts={
            "cluster-a": {
                "observed_at": None,
                "resources_complete": False,
                "labels_complete": False,
                "partial_reason_codes": ["crd_discovery_forbidden"],
            }
        },
        has_more=False,
    )
    assert partial.items == ()
    assert partial.coverage.state == "partial"
    assert partial.coverage.reason_codes == ("crd_discovery_forbidden",)

    empty = project_gitops_overview(
        workspace_id="workspace-a",
        registered_rows=[],
        inventory_rows=[],
        snapshot_contexts={},
        has_more=False,
    )
    assert empty.items == ()
    assert empty.coverage.state == "complete"
    assert empty.coverage.reason_codes == ()
