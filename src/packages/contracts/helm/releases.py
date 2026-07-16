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


class HelmResourceHealthObservation(StrictModel):
    """Health rollup derived only from exactly correlated owned resources."""

    availability: Literal["available", "partial"]
    health: str = Field(min_length=1)
    resource_count: int = Field(ge=0)
    observed_at: str | None = None
    reason_codes: tuple[str, ...] = ()

    @model_validator(mode="after")
    def incomplete_health_has_a_reason(self) -> HelmResourceHealthObservation:
        if self.availability == "partial" and not self.reason_codes:
            raise ValueError("partial Helm resource health requires a reason")
        return self


class HelmFeatureAvailability(StrictModel):
    """Explicit absence of an external Helm/provider integration."""

    availability: Literal["unavailable"] = "unavailable"
    reason_code: str = Field(min_length=1)


class HelmOwnedResource(StrictModel):
    """One inventory resource with exact standard Helm ownership metadata."""

    resource: ResourceRef
    status: str = Field(min_length=1)
    health: str = Field(min_length=1)
    observed_at: str | None = None


class HelmOwnedResourceObservation(StrictModel):
    """Bounded owned-resource collection from one inventory observation cut."""

    availability: Literal["available", "partial"]
    items: tuple[HelmOwnedResource, ...] = ()
    observed_at: str | None = None
    truncated: bool = False
    reason_codes: tuple[str, ...] = ()

    @model_validator(mode="after")
    def incomplete_resources_have_a_reason(self) -> HelmOwnedResourceObservation:
        if self.availability == "partial" and not self.reason_codes:
            raise ValueError("partial Helm owned resources require a reason")
        if self.truncated and "helm_owned_resources_truncated" not in self.reason_codes:
            raise ValueError("truncated Helm owned resources require the truncation reason")
        return self


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
    resource_health: HelmResourceHealthObservation | HelmResourceHealthAvailability


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
    owned_resources: HelmOwnedResourceObservation | HelmFeatureAvailability
    commands: HelmFeatureAvailability


class HelmReleaseListResponse(StrictModel):
    releases: tuple[HelmRelease, ...] = ()
    coverage: HelmObservationCoverage
    refresh_after_seconds: int = Field(ge=1, le=3600)
    post_mutation_refresh_after_seconds: float = Field(gt=0, le=60)


class HelmReleaseDetailResponse(StrictModel):
    detail: HelmReleaseDetail
    refresh_after_seconds: int = Field(ge=1, le=3600)
    post_mutation_refresh_after_seconds: float = Field(gt=0, le=60)
