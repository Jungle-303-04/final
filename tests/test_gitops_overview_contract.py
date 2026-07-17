from __future__ import annotations

import pytest
from packages.contracts.gitops.overview import (
    GitOpsOverviewCoverage,
    GitOpsOverviewResponse,
    GitOpsOverviewRow,
)
from pydantic import ValidationError

from packages.contracts.parity import CapabilitySet, ClusterScope, ResourceRef


def _scope() -> ClusterScope:
    return ClusterScope(
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        namespaces=("argocd",),
        freshness="live",
    )


def _resource() -> ResourceRef:
    return ResourceRef(
        api_group="argoproj.io",
        version="v1alpha1",
        kind="Application",
        namespace="argocd",
        name="storefront",
        uid="application-uid",
    )


def test_controller_row_is_strict_safe_and_revision_bound() -> None:
    row = GitOpsOverviewRow(
        id="controller:cluster-a:application-uid",
        authority="controller",
        provider="argo",
        role="controller",
        display_name="storefront",
        scope=_scope(),
        resource=_resource(),
        status="Synced",
        health="Healthy",
        revision="main@sha1:abc",
        observed_at="2026-07-17T01:02:03Z",
        labels={"team": "platform"},
        capabilities=CapabilitySet(
            scope=_scope(),
            resource=_resource(),
            revision="17",
            actions=(),
        ),
    )

    payload = row.model_dump(mode="json")

    assert payload["resource"]["uid"] == "application-uid"
    assert payload["capabilities"]["actions"] == []
    assert "raw" not in payload
    assert "credential" not in str(payload).casefold()


def test_controller_and_registered_evidence_require_exact_identities() -> None:
    with pytest.raises(ValidationError):
        GitOpsOverviewRow(
            id="controller:missing-resource",
            authority="controller",
            provider="argo",
            role="controller",
            display_name="storefront",
            scope=_scope(),
        )
    with pytest.raises(ValidationError):
        GitOpsOverviewRow(
            id="registered:missing-binding",
            authority="registered",
            provider="internal",
            role="controller",
            display_name="storefront",
            scope=_scope(),
            application_ids=("app-a",),
        )


def test_complete_coverage_rejects_partial_reasons_and_duplicate_rows() -> None:
    row = GitOpsOverviewRow(
        id="registered:binding-a",
        authority="registered",
        provider="internal",
        role="controller",
        display_name="storefront",
        scope=_scope(),
        application_ids=("app-a",),
        binding_id="binding-a",
    )
    with pytest.raises(ValidationError):
        GitOpsOverviewCoverage(
            state="complete",
            registered_count=1,
            controller_count=0,
            returned_count=1,
            reason_codes=("snapshot_incomplete",),
        )
    with pytest.raises(ValidationError):
        GitOpsOverviewResponse(
            workspace_id="workspace-a",
            scopes=(_scope(),),
            items=(row, row),
            kind_counts=(),
            coverage=GitOpsOverviewCoverage(
                state="complete",
                registered_count=1,
                controller_count=0,
                returned_count=2,
            ),
            observed_at="2026-07-17T01:02:03Z",
        )
