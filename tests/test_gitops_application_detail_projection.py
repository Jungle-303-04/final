from __future__ import annotations

import pytest
from pydantic import ValidationError

from domains.gitops.detail_projection import gitops_application_detail
from packages.contracts.gitops.detail import GitOpsDesiredLiveDiffAvailability


def _application() -> dict[str, object]:
    return {
        "application_id": "app-storefront",
        "workspace_id": "workspace-a",
        "name": "storefront",
        "repo_ref": "opsia/storefront",
        "default_branch": "main",
        "manifest_path": "deploy/production",
    }


def test_detail_binds_diff_availability_to_observed_source_without_inventing_live_state() -> None:
    detail = gitops_application_detail(
        _application(),
        bindings=[
            {
                "cluster_id": "cluster-a",
                "namespace": "storefront",
                "gitops_poll": {"last_seen_commit_sha": "from-poll"},
            }
        ],
        runs=[
            {
                "workflow_run_id": "run-1",
                "cluster_id": "cluster-a",
                "commit_sha": "from-workflow",
                "status": "applying",
                "updated_at": "2026-07-16T09:00:00Z",
            }
        ],
        can_refresh=True,
        can_sync=True,
    ).model_dump(mode="json")["application"]

    assert detail["resource"] == {
        "api_group": "opsia.io",
        "version": "v1",
        "kind": "GitOpsApplication",
        "namespace": "storefront",
        "name": "storefront",
        "uid": "app-storefront",
    }
    assert detail["scope"] == {
        "availability": "available",
        "scope": {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "namespaces": ["storefront"],
            "freshness": "partial",
        },
        "reason_code": None,
    }
    assert detail["desired_live_diff"] == {
        "availability": "unavailable",
        "source_revision": "from-workflow",
        "live_observation_revision": None,
        "reason_code": "live_observation_not_integrated",
    }
    assert "diff" not in detail["desired_live_diff"]
    assert detail["operation"] == {
        "availability": "partial",
        "in_progress": True,
        "workflow_run_id": "run-1",
        "status": "applying",
        "observed_at": "2026-07-16T09:00:00Z",
        "reason_code": "provider_operation_not_integrated",
    }
    assert detail["capabilities"] == [
        {
            "action": "refresh",
            "authorization": "allowed",
            "availability": "unavailable",
            "enabled": False,
            "operation_blocked": False,
            "reason_code": "provider_refresh_not_integrated",
        },
        {
            "action": "sync",
            "authorization": "allowed",
            "availability": "unavailable",
            "enabled": False,
            "operation_blocked": True,
            "reason_code": "operation_in_progress",
        },
    ]


def test_detail_uses_explicit_partial_scope_for_multiple_targets_and_denied_actions() -> None:
    detail = gitops_application_detail(
        _application(),
        bindings=[
            {"cluster_id": "cluster-a", "namespace": "storefront"},
            {"cluster_id": "cluster-b", "namespace": "storefront"},
        ],
        runs=[],
        can_refresh=False,
        can_sync=False,
    ).model_dump(mode="json")["application"]

    assert detail["scope"] == {
        "availability": "partial",
        "scope": None,
        "reason_code": "multiple_target_scopes",
    }
    assert detail["desired_live_diff"]["reason_code"] == "source_revision_unavailable"
    assert detail["operation"] == {
        "availability": "unavailable",
        "in_progress": None,
        "workflow_run_id": None,
        "status": None,
        "observed_at": None,
        "reason_code": "workflow_operation_unobserved",
    }
    assert [capability["reason_code"] for capability in detail["capabilities"]] == [
        "not_authorized",
        "not_authorized",
    ]


def test_available_diff_is_rejected_without_a_validated_comparison_artifact() -> None:
    with pytest.raises(ValidationError, match="comparison artifact"):
        GitOpsDesiredLiveDiffAvailability(availability="available")
