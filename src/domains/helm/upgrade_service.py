"""Authorized, bounded Helm chart-version observation orchestration."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping, Sequence
from typing import Any

from domains.helm.source_provider import (
    HelmChartVersionProvider,
    helm_chart_source_from_row,
    resolve_helm_release_versions,
)
from domains.helm.source_router import (
    HELM_CHART_CREDENTIAL_UNAVAILABLE,
    accessible_helm_chart_source_ids,
    load_helm_provider_credential,
)
from packages.contracts.helm.releases import HelmRelease
from packages.contracts.helm.sources import (
    HelmChartVersionObservation,
    HelmChartVersionResolution,
)
from packages.contracts.identity import Permission
from packages.security.credentials import CredentialEncryptionError

HELM_UPGRADE_MAX_SOURCES = 20
HELM_UPGRADE_PROVIDER_CONCURRENCY = 8


async def resolve_helm_release_catalogs(
    *,
    db: Any,
    current: Any,
    releases: Sequence[HelmRelease],
    provider: HelmChartVersionProvider,
) -> dict[str, HelmChartVersionResolution]:
    """Resolve each release from authorized sources without cross-source unions."""

    keyed = {helm_release_upgrade_key(release): release for release in releases}
    if not keyed:
        return {}
    workspace_id = str(getattr(current, "workspace_id", "") or "")
    source_ids = await accessible_helm_chart_source_ids(
        db,
        current,
        workspace_id,
        Permission.CATALOG_READ.value,
    )
    batch = await asyncio.to_thread(
        db.list_helm_chart_source_records,
        workspace_id=workspace_id,
        source_ids=source_ids,
        limit=HELM_UPGRADE_MAX_SOURCES,
    )
    if batch.truncated:
        return _unavailable_catalogs(keyed, "helm_chart_source_scope_truncated")
    records = tuple(batch.rows)
    if not records:
        return _unavailable_catalogs(keyed, "helm_chart_source_unavailable")

    chart_names = tuple(
        sorted({release.chart for release in keyed.values() if release.chart is not None})
    )
    observations = await _observe_chart_sources(
        db=db,
        workspace_id=workspace_id,
        records=records,
        chart_names=chart_names,
        provider=provider,
    )
    resolved: dict[str, HelmChartVersionResolution] = {}
    for key, release in keyed.items():
        if release.chart is None or release.chart_version is None:
            resolved[key] = HelmChartVersionResolution(
                availability="unavailable",
                reason_codes=release.chart_reason_codes or ("helm_chart_identity_unavailable",),
            )
            continue
        resolved[key] = resolve_helm_release_versions(
            release.chart_version,
            observations.get(release.chart, ()),
        )
    return resolved


def helm_release_upgrade_key(release: HelmRelease) -> str:
    return "/".join((release.scope.cluster_id, release.storage_namespace, release.name))


async def _observe_chart_sources(
    *,
    db: Any,
    workspace_id: str,
    records: Sequence[Mapping[str, Any]],
    chart_names: Sequence[str],
    provider: HelmChartVersionProvider,
) -> dict[str, tuple[HelmChartVersionObservation, ...]]:
    credentials: dict[str, object] = {}
    credential_failures: set[str] = set()
    for row in records:
        source_id = str(row.get("source_id") or "")
        try:
            credentials[source_id] = await asyncio.to_thread(
                load_helm_provider_credential,
                db,
                workspace_id,
                dict(row),
            )
        except CredentialEncryptionError:
            credential_failures.add(source_id)
    semaphore = asyncio.Semaphore(HELM_UPGRADE_PROVIDER_CONCURRENCY)

    async def observe(
        row: Mapping[str, Any],
        chart_name: str,
    ) -> HelmChartVersionObservation:
        source = helm_chart_source_from_row(row)
        if source.source_id in credential_failures:
            return HelmChartVersionObservation(
                source=source,
                chart_name=chart_name,
                availability="unavailable",
                reason_codes=(HELM_CHART_CREDENTIAL_UNAVAILABLE,),
            )
        async with semaphore:
            return await provider.fetch_versions(
                source,
                chart_name,
                credential=credentials.get(source.source_id),
            )

    tasks = {
        (chart_name, str(row.get("source_id") or "")): asyncio.create_task(observe(row, chart_name))
        for chart_name in chart_names
        for row in records
    }
    grouped: dict[str, list[HelmChartVersionObservation]] = {
        chart_name: [] for chart_name in chart_names
    }
    for (chart_name, _source_id), task in tasks.items():
        grouped[chart_name].append(await task)
    return {chart_name: tuple(items) for chart_name, items in grouped.items()}


def _unavailable_catalogs(
    releases: Mapping[str, HelmRelease],
    reason_code: str,
) -> dict[str, HelmChartVersionResolution]:
    return {
        key: HelmChartVersionResolution(
            availability="unavailable",
            reason_codes=(reason_code,),
        )
        for key in releases
    }
