"""Safe Helm chart-source normalization and fail-closed provider selection."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from packages.contracts.helm.sources import (
    HelmChartSource,
    HelmChartVersionObservation,
    HelmChartVersionResolution,
)
from packages.security.outbound_url import UnsafeOutboundUrlError, validate_outbound_url_syntax

INVALID_HELM_CHART_SOURCE = "invalid Helm chart source"


def normalize_helm_chart_source_reference(provider: str, reference: str) -> str:
    """Return a secret-free canonical repository/OCI reference."""

    try:
        parsed = urlsplit(reference)
        if parsed.query or parsed.fragment:
            raise ValueError(INVALID_HELM_CHART_SOURCE)
        if provider == "repository":
            hostname = validate_outbound_url_syntax(reference)
            path = parsed.path.rstrip("/")
            return urlunsplit(("https", _normalized_netloc(parsed, hostname), path, "", ""))
        if provider == "oci":
            if parsed.scheme != "oci" or not parsed.netloc or not parsed.path.strip("/"):
                raise ValueError(INVALID_HELM_CHART_SOURCE)
            hostname = validate_outbound_url_syntax(
                urlunsplit(("https", parsed.netloc, parsed.path, "", ""))
            )
            path = f"/{parsed.path.strip('/')}"
            return urlunsplit(("oci", _normalized_netloc(parsed, hostname), path, "", ""))
    except (UnsafeOutboundUrlError, ValueError) as exc:
        raise ValueError(INVALID_HELM_CHART_SOURCE) from exc
    raise ValueError(INVALID_HELM_CHART_SOURCE)


def helm_chart_source_from_row(row: Mapping[str, Any]) -> HelmChartSource:
    """Project a persistence row without workspace or credential material."""

    return HelmChartSource(
        source_id=str(row["source_id"]),
        provider=str(row["provider"]),
        name=str(row["name"]),
        reference=str(row["canonical_ref"]),
        status=str(row["status"]),
        credentials_configured=bool(row.get("credential_ref")),
        observed_at=_iso_or_none(row.get("updated_at")),
    )


def resolve_helm_chart_versions(
    observations: Sequence[HelmChartVersionObservation],
) -> HelmChartVersionResolution:
    """Select exactly one provider result and never combine version catalogs."""

    if not observations:
        return HelmChartVersionResolution(
            availability="unavailable",
            reason_codes=("helm_chart_source_unavailable",),
        )
    identities = [
        (item.source.source_id, item.source.provider, item.source.reference)
        for item in observations
    ]
    if len(set(identities)) != len(identities):
        return HelmChartVersionResolution(
            availability="unavailable",
            reason_codes=("helm_chart_source_duplicate_observation",),
        )
    if len(observations) != 1:
        return HelmChartVersionResolution(
            availability="unavailable",
            reason_codes=("helm_chart_source_ambiguous",),
        )
    observation = observations[0]
    return HelmChartVersionResolution(
        availability=observation.availability,
        source=observation.source,
        versions=observation.versions,
        observed_at=observation.observed_at,
        truncated=observation.truncated,
        reason_codes=observation.reason_codes,
    )


def _normalized_netloc(parsed: Any, hostname: str) -> str:
    return f"{hostname}:{parsed.port}" if parsed.port not in {None, 443} else hostname


def _iso_or_none(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)
