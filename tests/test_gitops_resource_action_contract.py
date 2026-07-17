from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.contracts.gitops.detail import GitOpsResourceActionRequest, GitOpsSyncOptions
from packages.contracts.parity import ResourceRef

RESOURCE = ResourceRef(
    api_group="argoproj.io",
    version="v1alpha1",
    kind="Application",
    namespace="argocd",
    name="storefront",
    uid="application-uid",
)


def test_argo_sync_contract_preserves_dry_run_force_prune_and_selective_resources() -> None:
    request = GitOpsResourceActionRequest(
        cluster_id="cluster-a",
        resource=RESOURCE,
        resource_version="42",
        capability_revision="capability-sha256",
        action="sync",
        confirmation=True,
        reason="apply the reviewed GitOps change",
        options=GitOpsSyncOptions(
            revision="main@sha1:abc",
            prune=False,
            dry_run=True,
            force=True,
            apply_only=False,
            sync_options=("CreateNamespace=true",),
            resources=(
                {
                    "api_group": "apps",
                    "kind": "Deployment",
                    "namespace": "storefront",
                    "name": "web",
                },
            ),
        ),
    )

    assert request.options is not None
    assert request.options.dry_run is True
    assert request.options.force is True
    assert request.options.resources[0].name == "web"


def test_non_sync_action_rejects_sync_options() -> None:
    with pytest.raises(ValidationError):
        GitOpsResourceActionRequest(
            cluster_id="cluster-a",
            resource=RESOURCE,
            resource_version="42",
            capability_revision="capability-sha256",
            action="refresh",
            confirmation=True,
            reason="refresh controller observation",
            options=GitOpsSyncOptions(dry_run=True),
        )
