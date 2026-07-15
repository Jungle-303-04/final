"""Pure projection from inventory metadata to Helm release contracts."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from packages.contracts.helm.releases import (
    HelmFeatureAvailability,
    HelmObservationCoverage,
    HelmRelease,
    HelmReleaseDetail,
    HelmReleaseDetailResponse,
    HelmReleaseHistoryEntry,
    HelmReleaseListResponse,
    HelmResourceHealthAvailability,
)
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.storage.engine import iso_or_none

HELM_STORAGE_OWNER_LABEL = "owner"
HELM_STORAGE_OWNER_VALUE = "helm"
HELM_RELEASE_NAME_LABEL = "name"
HELM_RELEASE_REVISION_LABEL = "version"
HELM_RELEASE_STATUS_LABEL = "status"
HELM_STORAGE_KINDS = frozenset({"secret", "configmap"})

_RESOURCE_HEALTH_UNAVAILABLE = "owned_resources_not_correlated"
_MANIFEST_UNAVAILABLE = "helm_manifest_provider_not_integrated"
_VALUES_UNAVAILABLE = "helm_values_provider_not_integrated"
_COMMANDS_UNAVAILABLE = "agent_helm_executor_not_integrated"


@dataclass(frozen=True)
class ObservedHelmStorage:
    scope: ClusterScope
    release_name: str
    storage_namespace: str
    storage: ResourceRef
    revision: int | None
    status: str | None
    observed_at: str | None


def helm_release_list(
    storage_rows: Sequence[Mapping[str, Any]],
    *,
    contexts: Mapping[str, Mapping[str, Any]],
    selected_cluster_ids: Iterable[str],
) -> HelmReleaseListResponse:
    """Build a list without treating a storage payload as a Helm API response."""

    selected = tuple(sorted({_text(value) for value in selected_cluster_ids if _text(value)}))
    coverage = helm_observation_coverage(contexts, selected_cluster_ids=selected)
    observed = _observed_rows(storage_rows, contexts)
    latest_by_release: dict[tuple[str, str, str], ObservedHelmStorage] = {}
    for item in observed:
        key = (item.scope.cluster_id, item.storage_namespace, item.release_name)
        current = latest_by_release.get(key)
        if current is None or _observation_order(item) > _observation_order(current):
            latest_by_release[key] = item
    releases = tuple(
        _release(item)
        for _key, item in sorted(
            latest_by_release.items(),
            key=lambda pair: (pair[0][0], pair[0][1], pair[0][2]),
        )
    )
    return HelmReleaseListResponse(releases=releases, coverage=coverage)


def helm_release_detail(
    storage_rows: Sequence[Mapping[str, Any]],
    *,
    contexts: Mapping[str, Mapping[str, Any]],
    selected_cluster_id: str,
    namespace: str,
    release_name: str,
) -> HelmReleaseDetailResponse | None:
    """Return safe detail metadata for one exact scope, or no release at all."""

    cluster = _text(selected_cluster_id)
    selected_namespace = _text(namespace)
    selected_name = _text(release_name)
    observed = [
        item
        for item in _observed_rows(storage_rows, contexts)
        if item.scope.cluster_id == cluster
        and item.storage_namespace == selected_namespace
        and item.release_name == selected_name
    ]
    if not observed:
        return None
    latest = max(observed, key=_observation_order)
    history = tuple(
        HelmReleaseHistoryEntry(
            storage=item.storage,
            revision=item.revision,
            status=item.status,
            observed_at=item.observed_at,
        )
        for item in sorted(observed, key=_observation_order, reverse=True)
    )
    return HelmReleaseDetailResponse(
        detail=HelmReleaseDetail(
            release=_release(latest),
            history=history,
            manifest=HelmFeatureAvailability(reason_code=_MANIFEST_UNAVAILABLE),
            values=HelmFeatureAvailability(reason_code=_VALUES_UNAVAILABLE),
            owned_resources=HelmFeatureAvailability(reason_code=_RESOURCE_HEALTH_UNAVAILABLE),
            commands=HelmFeatureAvailability(reason_code=_COMMANDS_UNAVAILABLE),
        )
    )


def helm_observation_coverage(
    contexts: Mapping[str, Mapping[str, Any]],
    *,
    selected_cluster_ids: Iterable[str],
) -> HelmObservationCoverage:
    """State whether an empty list can truthfully mean no Helm releases."""

    selected = tuple(sorted({_text(value) for value in selected_cluster_ids if _text(value)}))
    if not selected:
        return HelmObservationCoverage(
            availability="unavailable",
            reason_codes=("authorization_scope_empty",),
        )
    normalized = {cluster_id: contexts.get(cluster_id) for cluster_id in selected}
    missing = [cluster_id for cluster_id, context in normalized.items() if not context]
    reasons: set[str] = set()
    observed_at: list[str] = []
    for cluster_id, context in normalized.items():
        if not context:
            reasons.add(f"inventory_snapshot_unavailable:{cluster_id}")
            continue
        if int(context.get("snapshot_revision") or 0) <= 0:
            reasons.add(f"inventory_snapshot_unavailable:{cluster_id}")
        if not bool(context.get("resources_complete")):
            reasons.add("source_resources_incomplete")
        if not bool(context.get("labels_complete")):
            reasons.add("helm_storage_labels_incomplete")
        reasons.update(
            _text(value) for value in context.get("partial_reason_codes", ()) if _text(value)
        )
        if stamp := _optional_text(context.get("observed_at")):
            observed_at.append(stamp)
    if missing or any(reason.startswith("inventory_snapshot_unavailable:") for reason in reasons):
        availability = "unavailable"
    elif reasons:
        availability = "partial"
    else:
        availability = "available"
    return HelmObservationCoverage(
        availability=availability,
        observed_at=max(observed_at) if observed_at else None,
        reason_codes=tuple(sorted(reasons)),
    )


def _observed_rows(
    storage_rows: Sequence[Mapping[str, Any]],
    contexts: Mapping[str, Mapping[str, Any]],
) -> tuple[ObservedHelmStorage, ...]:
    return tuple(
        observed
        for row in storage_rows
        if (observed := _observed_storage(row, contexts)) is not None
    )


def _observed_storage(
    row: Mapping[str, Any], contexts: Mapping[str, Mapping[str, Any]]
) -> ObservedHelmStorage | None:
    labels = _string_mapping(row.get("labels"))
    if labels.get(HELM_STORAGE_OWNER_LABEL, "").casefold() != HELM_STORAGE_OWNER_VALUE:
        return None
    kind = _text(row.get("kind"))
    if kind.casefold() not in HELM_STORAGE_KINDS:
        return None
    workspace_id = _text(row.get("workspace_id"))
    cluster_id = _text(row.get("cluster_id"))
    namespace = _text(row.get("namespace"))
    release_name = _optional_text(labels.get(HELM_RELEASE_NAME_LABEL))
    inventory_key = _text(row.get("inventory_key"))
    if not all((workspace_id, cluster_id, namespace, release_name, inventory_key)):
        return None
    api_group, version = _api_group_and_version(_text(row.get("api_version")))
    context = contexts.get(cluster_id, {})
    return ObservedHelmStorage(
        scope=ClusterScope(
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            namespaces=(namespace,),
            freshness=_freshness(context),
        ),
        release_name=release_name,
        storage_namespace=namespace,
        storage=ResourceRef(
            api_group=api_group,
            version=version,
            kind=kind,
            namespace=namespace,
            name=_text(row.get("name")) or inventory_key,
            uid=_optional_text(row.get("uid")) or inventory_key,
        ),
        revision=_revision(labels.get(HELM_RELEASE_REVISION_LABEL)),
        status=_optional_text(labels.get(HELM_RELEASE_STATUS_LABEL)),
        observed_at=_iso(row.get("observed_at")),
    )


def _release(item: ObservedHelmStorage) -> HelmRelease:
    return HelmRelease(
        scope=item.scope,
        name=item.release_name,
        storage_namespace=item.storage_namespace,
        storage=item.storage,
        status=item.status,
        revision=item.revision,
        observed_at=item.observed_at,
        resource_health=HelmResourceHealthAvailability(
            reason_code=_RESOURCE_HEALTH_UNAVAILABLE,
        ),
    )


def _freshness(context: Mapping[str, Any]) -> str:
    if int(context.get("snapshot_revision") or 0) <= 0:
        return "disconnected"
    if not bool(context.get("resources_complete")) or not bool(context.get("labels_complete")):
        return "partial"
    return "live"


def _observation_order(item: ObservedHelmStorage) -> tuple[int, str, str]:
    return (item.revision or 0, item.observed_at or "", item.storage.uid)


def _revision(value: object) -> int | None:
    try:
        parsed = int(_text(value))
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def _api_group_and_version(api_version: str) -> tuple[str, str]:
    group, separator, version = api_version.partition("/")
    return (group, version) if separator else ("", group)


def _string_mapping(value: object) -> dict[str, str]:
    if not isinstance(value, Mapping):
        return {}
    return {_text(key): _text(item) for key, item in value.items() if _text(key)}


def _iso(value: object) -> str | None:
    return iso_or_none(value) or _optional_text(value)


def _text(value: object) -> str:
    return str(value or "").strip()


def _optional_text(value: object) -> str | None:
    return _text(value) or None
