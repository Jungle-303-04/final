"""Truthful Checks read projection before an evaluation collector is integrated."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from domains.inventory_filter.snapshot_scope import project_snapshot_scope
from packages.contracts.checks.observations import (
    ChecksCatalog,
    ChecksDetail,
    ChecksDetailResponse,
    ChecksOverviewResponse,
    ChecksResultSet,
    ChecksScopeCoverage,
)

CHECKS_RESULT_UNAVAILABLE = "checks_result_projection_not_integrated"
CHECKS_CATALOG_UNAVAILABLE = "checks_catalog_not_integrated"


def checks_overview(
    *,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    namespace_refs: Iterable[tuple[str, str]],
    selected_cluster_ids: Iterable[str],
) -> ChecksOverviewResponse:
    """Return authorized scope and explicit collector absence, never synthetic findings."""

    coverage = _scope_coverage(
        workspace_id=workspace_id,
        contexts=contexts,
        namespace_refs=namespace_refs,
        selected_cluster_ids=selected_cluster_ids,
    )
    return ChecksOverviewResponse(
        scope_coverage=coverage,
        result_set=ChecksResultSet(reason_codes=(CHECKS_RESULT_UNAVAILABLE,)),
        catalog=ChecksCatalog(reason_codes=(CHECKS_CATALOG_UNAVAILABLE,)),
    )


def checks_detail(
    *,
    requested_check_id: str,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    namespace_refs: Iterable[tuple[str, str]],
    selected_cluster_ids: Iterable[str],
) -> ChecksDetailResponse:
    """Read a URL-requested check without treating it as a known catalog entry."""

    coverage = _scope_coverage(
        workspace_id=workspace_id,
        contexts=contexts,
        namespace_refs=namespace_refs,
        selected_cluster_ids=selected_cluster_ids,
    )
    return ChecksDetailResponse(
        scope_coverage=coverage,
        detail=ChecksDetail(
            requested_check_id=requested_check_id,
            reason_codes=(CHECKS_CATALOG_UNAVAILABLE, CHECKS_RESULT_UNAVAILABLE),
        ),
    )


def _scope_coverage(
    *,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    namespace_refs: Iterable[tuple[str, str]],
    selected_cluster_ids: Iterable[str],
) -> ChecksScopeCoverage:
    projection = project_snapshot_scope(
        workspace_id=workspace_id,
        contexts=contexts,
        namespace_refs=namespace_refs,
        selected_cluster_ids=selected_cluster_ids,
    )
    return ChecksScopeCoverage(
        availability=projection.availability,
        scopes=projection.scopes,
        observed_at=projection.observed_at,
        reason_codes=projection.reason_codes,
    )
