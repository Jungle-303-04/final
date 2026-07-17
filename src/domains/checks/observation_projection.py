"""Projection of persisted outbound cluster-agent Checks observations."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import ValidationError

from domains.inventory_filter.snapshot_scope import project_snapshot_scope
from packages.config.refresh_policies import integral_refresh_after_seconds
from packages.contracts.checks.observations import (
    AgentChecksObservation,
    ChecksCatalogEntry,
    ChecksDetailResponse,
    ChecksFinding,
    ChecksObservedCatalog,
    ChecksObservedDetail,
    ChecksObservedResultSet,
    ChecksOverviewResponse,
    ChecksScopeCoverage,
    ChecksUnavailableCatalog,
    ChecksUnavailableDetail,
    ChecksUnavailableResultSet,
    ChecksVisibility,
    ChecksVisibilitySummary,
)
from packages.contracts.parity import ClusterScope

CHECKS_OBSERVATION_UNAVAILABLE = "checks_observation_unavailable"
CHECKS_DEFINITION_UNAVAILABLE = "checks_definition_unavailable"
ObservedAvailability = Literal["available", "partial"]


@dataclass(frozen=True)
class _ProjectedChecks:
    coverage: ChecksScopeCoverage
    findings: tuple[ChecksFinding, ...]
    catalog: tuple[ChecksCatalogEntry, ...]
    visibility: tuple[ChecksVisibility, ...]
    evaluated_at: str | None
    availability: Literal["available", "partial", "unavailable"]
    reason_codes: tuple[str, ...]


def checks_overview(
    *,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    snapshots: Mapping[str, Mapping[str, Any]] | None = None,
    namespace_refs: Iterable[tuple[str, str]],
    selected_cluster_ids: Iterable[str],
    now: datetime | None = None,
) -> ChecksOverviewResponse:
    """Project only observations persisted from an outbound agent session."""

    projected = _project(
        workspace_id=workspace_id,
        contexts=contexts,
        snapshots=snapshots or {},
        namespace_refs=namespace_refs,
        selected_cluster_ids=selected_cluster_ids,
        now=now or datetime.now(UTC),
    )
    if projected.evaluated_at is None:
        reasons = projected.reason_codes or (CHECKS_OBSERVATION_UNAVAILABLE,)
        return ChecksOverviewResponse(
            scope_coverage=projected.coverage,
            result_set=ChecksUnavailableResultSet(reason_codes=reasons),
            catalog=ChecksUnavailableCatalog(reason_codes=reasons),
            visibility=ChecksVisibilitySummary(
                availability="unavailable",
                reason_codes=reasons,
            ),
        )

    availability: ObservedAvailability = (
        "available" if projected.availability == "available" else "partial"
    )
    return ChecksOverviewResponse(
        scope_coverage=projected.coverage,
        result_set=ChecksObservedResultSet(
            availability=availability,
            evaluated_at=projected.evaluated_at,
            checks=projected.findings,
            total_check_count=len(projected.catalog),
            total_finding_count=len(projected.findings),
            reason_codes=projected.reason_codes,
        ),
        catalog=ChecksObservedCatalog(
            availability=availability,
            entries=projected.catalog,
            reason_codes=projected.reason_codes,
        ),
        visibility=ChecksVisibilitySummary(
            availability=availability,
            clusters=projected.visibility,
            reason_codes=projected.reason_codes,
        ),
    )


def checks_detail(
    *,
    requested_check_id: str,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    snapshots: Mapping[str, Mapping[str, Any]] | None = None,
    namespace_refs: Iterable[tuple[str, str]],
    selected_cluster_ids: Iterable[str],
    now: datetime | None = None,
) -> ChecksDetailResponse:
    """Resolve a check only when an authorized agent observation declares it."""

    projected = _project(
        workspace_id=workspace_id,
        contexts=contexts,
        snapshots=snapshots or {},
        namespace_refs=namespace_refs,
        selected_cluster_ids=selected_cluster_ids,
        now=now or datetime.now(UTC),
    )
    entry = next(
        (item for item in projected.catalog if item.check_id == requested_check_id),
        None,
    )
    if entry is None or projected.evaluated_at is None:
        reasons = tuple(
            sorted(
                {
                    *projected.reason_codes,
                    f"{CHECKS_DEFINITION_UNAVAILABLE}:{requested_check_id}",
                }
            )
        )
        return ChecksDetailResponse(
            scope_coverage=projected.coverage,
            detail=ChecksUnavailableDetail(
                requested_check_id=requested_check_id,
                reason_codes=reasons,
            ),
        )

    findings = tuple(
        finding for finding in projected.findings if finding.check_id == requested_check_id
    )
    availability: ObservedAvailability = (
        "available" if projected.availability == "available" else "partial"
    )
    return ChecksDetailResponse(
        scope_coverage=projected.coverage,
        detail=ChecksObservedDetail(
            requested_check_id=requested_check_id,
            availability=availability,
            title=entry.title,
            category=entry.category,
            effective_severity=entry.severity,
            message=entry.description,
            remediation=entry.remediation,
            affected_resource_count=len(findings),
            findings=findings,
            reason_codes=projected.reason_codes,
        ),
    )


def _project(
    *,
    workspace_id: str,
    contexts: Mapping[str, Mapping[str, Any]],
    snapshots: Mapping[str, Mapping[str, Any]],
    namespace_refs: Iterable[tuple[str, str]],
    selected_cluster_ids: Iterable[str],
    now: datetime,
) -> _ProjectedChecks:
    selected = tuple(sorted({value.strip() for value in selected_cluster_ids if value.strip()}))
    requested_namespaces = _namespaces_by_cluster(namespace_refs)
    base = project_snapshot_scope(
        workspace_id=workspace_id,
        contexts=contexts,
        namespace_refs=(
            (cluster_id, namespace)
            for cluster_id, namespaces in requested_namespaces.items()
            for namespace in namespaces
        ),
        selected_cluster_ids=selected,
    )
    base_scope = {scope.cluster_id: scope for scope in base.scopes}
    reasons = set(base.reason_codes)
    findings: list[ChecksFinding] = []
    catalogs: dict[str, ChecksCatalogEntry] = {}
    visibility: list[ChecksVisibility] = []
    observed_at: list[datetime] = []
    usable_clusters = 0
    scopes: list[ClusterScope] = []
    max_age_seconds = integral_refresh_after_seconds("issues_audit")

    current_time = _as_utc(now)
    assert current_time is not None
    for cluster_id in selected:
        observation = _observation(snapshots.get(cluster_id))
        freshness = base_scope[cluster_id].freshness
        if observation is None or observation.availability == "unavailable":
            reasons.add(f"{CHECKS_OBSERVATION_UNAVAILABLE}:{cluster_id}")
            freshness = "disconnected"
        else:
            usable_clusters += 1
            stamp = _as_utc(observation.observed_at)
            assert stamp is not None
            observed_at.append(stamp)
            age_seconds = (current_time - stamp).total_seconds()
            if age_seconds < -max_age_seconds:
                reasons.add(f"checks_observation_clock_skew:{cluster_id}")
                freshness = "partial"
            elif age_seconds > max_age_seconds:
                reasons.add(f"checks_observation_stale:{cluster_id}")
                freshness = "stale"
            elif observation.availability == "partial":
                reasons.add(f"checks_observation_partial:{cluster_id}")
                freshness = "partial"
            elif freshness != "live":
                freshness = "partial"

            requested = set(requested_namespaces.get(cluster_id, ()))
            observed_namespaces = set(observation.namespaces)
            if observed_namespaces and (
                not requested or not requested.issubset(observed_namespaces)
            ):
                reasons.add(f"checks_namespace_scope_partial:{cluster_id}")
                freshness = "partial" if freshness == "live" else freshness

            for finding in observation.findings or ():
                namespace = finding.resource.namespace or ""
                if requested and namespace not in requested:
                    continue
                if observed_namespaces and namespace not in observed_namespaces:
                    continue
                findings.append(
                    ChecksFinding(
                        **finding.model_dump(),
                        cluster_id=cluster_id,
                    )
                )
            for entry in observation.catalog or ():
                current = catalogs.get(entry.check_id)
                if current is None:
                    catalogs[entry.check_id] = entry
                elif current != entry:
                    reasons.add(f"checks_catalog_conflict:{entry.check_id}")
            if observation.visibility is not None:
                visibility.append(
                    ChecksVisibility(
                        **observation.visibility.model_dump(),
                        cluster_id=cluster_id,
                    )
                )

        scopes.append(
            ClusterScope(
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                namespaces=requested_namespaces.get(cluster_id, ()),
                freshness=freshness,
            )
        )

    if not selected:
        availability: Literal["available", "partial", "unavailable"] = "unavailable"
    elif usable_clusters == 0:
        availability = "unavailable"
    elif usable_clusters != len(selected) or reasons:
        availability = "partial"
    else:
        availability = "available"
    reason_codes = tuple(sorted(reasons))
    coverage = ChecksScopeCoverage(
        availability=availability,
        scopes=tuple(scopes),
        observed_at=max(observed_at).isoformat() if observed_at else base.observed_at,
        reason_codes=reason_codes,
    )
    return _ProjectedChecks(
        coverage=coverage,
        findings=tuple(sorted(findings, key=_finding_key)),
        catalog=tuple(catalogs[key] for key in sorted(catalogs)),
        visibility=tuple(sorted(visibility, key=lambda item: item.cluster_id)),
        evaluated_at=max(observed_at).isoformat() if observed_at else None,
        availability=availability,
        reason_codes=reason_codes,
    )


def _observation(snapshot: Mapping[str, Any] | None) -> AgentChecksObservation | None:
    if not isinstance(snapshot, Mapping):
        return None
    summary = snapshot.get("summary")
    if not isinstance(summary, Mapping):
        return None
    source = summary.get("summary")
    if not isinstance(source, Mapping):
        return None
    raw = source.get("checks_observation")
    if not isinstance(raw, Mapping):
        return None
    try:
        return AgentChecksObservation.model_validate(raw)
    except ValidationError:
        return None


def _namespaces_by_cluster(
    refs: Iterable[tuple[str, str]],
) -> dict[str, tuple[str, ...]]:
    grouped: dict[str, set[str]] = {}
    for raw_cluster, raw_namespace in refs:
        cluster_id = raw_cluster.strip()
        namespace = raw_namespace.strip()
        if cluster_id and namespace:
            grouped.setdefault(cluster_id, set()).add(namespace)
    return {cluster_id: tuple(sorted(values)) for cluster_id, values in grouped.items()}


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _finding_key(finding: ChecksFinding) -> tuple[str, str, str, str, str]:
    resource = finding.resource
    return (
        finding.cluster_id,
        resource.namespace or "",
        resource.kind,
        resource.name,
        finding.finding_id,
    )
