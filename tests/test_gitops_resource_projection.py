from __future__ import annotations

from domains.gitops.resource_projection import (
    GITOPS_TREE_NODE_LIMIT,
    gitops_resource_insights,
    gitops_resource_tree,
)


def _row(
    *,
    api_version: str,
    kind: str,
    namespace: str,
    name: str,
    uid: str,
    raw: dict[str, object] | None = None,
    snapshot_id: str = "snapshot-1",
) -> dict[str, object]:
    return {
        "inventory_key": f"{api_version}:{kind}:{namespace}:{name}",
        "snapshot_id": snapshot_id,
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "resource_type": "custom_resource",
        "api_version": api_version,
        "kind": kind,
        "namespace": namespace,
        "name": name,
        "uid": uid,
        "resource_version": "17",
        "status": "Healthy",
        "health": "healthy",
        "labels": {},
        "annotations": {},
        "summary": {},
        "raw": raw or {},
        "observed_at": "2026-07-17T04:00:00+00:00",
    }


def test_argo_tree_resolves_declared_resources_from_one_bounded_inventory_batch() -> None:
    root = _row(
        api_version="argoproj.io/v1alpha1",
        kind="Application",
        namespace="argocd",
        name="storefront",
        uid="app-uid",
        raw={
            "status": {
                "resources": [
                    {
                        "group": "apps",
                        "version": "v1",
                        "kind": "Deployment",
                        "namespace": "storefront",
                        "name": "web",
                        "status": "Synced",
                        "health": {"status": "Healthy"},
                    }
                ]
            }
        },
    )
    deployment = _row(
        api_version="apps/v1",
        kind="Deployment",
        namespace="storefront",
        name="web",
        uid="deployment-uid",
    )

    tree = gitops_resource_tree(
        root,
        [root, deployment],
        snapshot={
            "snapshot_id": "snapshot-1",
            "summary": {"summary": {"resources_complete": True}},
        },
    )

    assert tree.root.uid == "app-uid"
    assert [node.role for node in tree.nodes] == ["root", "declared"]
    assert tree.edges[0].relationship == "owns"
    assert tree.coverage.state == "complete"
    assert tree.coverage.reason_codes == ()


def test_tree_reports_truncation_instead_of_silently_claiming_completeness() -> None:
    declared = [
        {
            "group": "apps",
            "version": "v1",
            "kind": "Deployment",
            "namespace": "storefront",
            "name": f"web-{index}",
        }
        for index in range(GITOPS_TREE_NODE_LIMIT + 10)
    ]
    root = _row(
        api_version="argoproj.io/v1alpha1",
        kind="Application",
        namespace="argocd",
        name="storefront",
        uid="app-uid",
        raw={"status": {"resources": declared}},
    )
    rows = [root] + [
        _row(
            api_version="apps/v1",
            kind="Deployment",
            namespace="storefront",
            name=f"web-{index}",
            uid=f"deployment-{index}",
        )
        for index in range(GITOPS_TREE_NODE_LIMIT + 10)
    ]

    tree = gitops_resource_tree(
        root,
        rows,
        snapshot={
            "snapshot_id": "snapshot-1",
            "summary": {"summary": {"resources_complete": True}},
        },
    )

    assert len(tree.nodes) == GITOPS_TREE_NODE_LIMIT
    assert tree.coverage.state == "partial"
    assert "node_limit_reached" in tree.coverage.reason_codes
    assert tree.coverage.observed_count > tree.coverage.returned_count


def test_flux_insights_expose_only_actions_supported_by_exact_observed_state() -> None:
    root = _row(
        api_version="kustomize.toolkit.fluxcd.io/v1",
        kind="Kustomization",
        namespace="flux-system",
        name="storefront",
        uid="kustomization-uid",
        raw={
            "metadata": {"generation": 8},
            "spec": {
                "suspend": False,
                "sourceRef": {"kind": "GitRepository", "name": "storefront-source"},
            },
            "status": {
                "observedGeneration": 8,
                "lastAppliedRevision": "main@sha1:abc",
                "conditions": [
                    {"type": "Ready", "status": "True", "reason": "ReconciliationSucceeded"}
                ],
            },
        },
    )
    source = _row(
        api_version="source.toolkit.fluxcd.io/v1",
        kind="GitRepository",
        namespace="flux-system",
        name="storefront-source",
        uid="source-uid",
    )

    insights = gitops_resource_insights(
        root,
        [root, source],
        writable=True,
        agent_available=True,
    )

    assert insights.provider == "flux"
    assert insights.source is not None
    assert insights.source.uid == "source-uid"
    assert insights.revision == "main@sha1:abc"
    assert insights.capabilities.actions == ("reconcile", "suspend", "sync_with_source")
    assert insights.conditions[0].reason == "ReconciliationSucceeded"
