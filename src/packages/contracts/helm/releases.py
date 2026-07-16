"""Provider-neutral, read-only Helm release observation contracts.

Helm release storage is commonly represented by Secrets or ConfigMaps.  This
boundary intentionally exposes only inventory metadata: it does not decode
release payloads, values, rendered manifests, or credentials.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from packages.contracts.gateway.base import StrictModel
from packages.contracts.parity import ClusterScope, ResourceRef

HelmAvailability = Literal["available", "partial", "unavailable"]


class HelmObservationCoverage(StrictModel):
    """Completeness of the inventory cut used for Helm storage discovery."""

    availability: HelmAvailability
    observed_at: str | None = None
    reason_codes: tuple[str, ...] = ()

    @model_validator(mode="after")
    def unavailable_coverage_has_a_reason(self) -> HelmObservationCoverage:
        if self.availability != "available" and not self.reason_codes:
            raise ValueError("partial or unavailable Helm coverage requires a reason")
        return self


class HelmResourceHealthAvailability(StrictModel):
    """Health is unavailable until inventory ownership correlation is proven."""

    availability: Literal["unavailable"] = "unavailable"
    health: None = None
    reason_code: str = Field(min_length=1)


class HelmFeatureAvailability(StrictModel):
    """Explicit absence of an external Helm/provider integration."""

    availability: Literal["unavailable"] = "unavailable"
    reason_code: str = Field(min_length=1)


class HelmRelease(StrictModel):
    """One release inferred from an observed Helm storage metadata record."""

    scope: ClusterScope
    name: str = Field(min_length=1)
    storage_namespace: str = Field(min_length=1)
    storage: ResourceRef
    chart: None = None
    app_version: None = None
    status: str | None = None
    revision: int | None = Field(default=None, ge=1)
    observed_at: str | None = None
    resource_health: HelmResourceHealthAvailability


class HelmReleaseHistoryEntry(StrictModel):
    """One inventory-observed storage revision; never a decoded release body."""

    storage: ResourceRef
    revision: int | None = Field(default=None, ge=1)
    status: str | None = None
    observed_at: str | None = None


class HelmReleaseDetail(StrictModel):
    release: HelmRelease
    history: tuple[HelmReleaseHistoryEntry, ...] = ()
    manifest: HelmFeatureAvailability
    values: HelmFeatureAvailability
    owned_resources: HelmFeatureAvailability
    commands: HelmFeatureAvailability


class HelmReleaseListResponse(StrictModel):
    releases: tuple[HelmRelease, ...] = ()
    coverage: HelmObservationCoverage


class HelmReleaseDetailResponse(StrictModel):
    detail: HelmReleaseDetail
