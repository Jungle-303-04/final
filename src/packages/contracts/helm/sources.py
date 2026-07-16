"""Workspace-scoped Helm chart source and version-provider contracts."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from packages.contracts.gateway.base import StrictModel

HELM_CHART_SOURCE_PAGE_MAX = 100
HELM_CHART_VERSION_PAGE_MAX = 200

HelmChartSourceProvider = Literal["repository", "oci"]
HelmChartSourceStatus = Literal["active", "disabled"]
HelmChartVersionAvailability = Literal["available", "partial", "unavailable"]


class HelmChartSource(StrictModel):
    """Public source projection; persisted credential references are intentionally absent."""

    source_id: str = Field(min_length=1)
    provider: HelmChartSourceProvider
    name: str = Field(min_length=1)
    reference: str = Field(min_length=1)
    status: HelmChartSourceStatus
    credentials_configured: bool
    observed_at: str | None = None


class HelmChartSourcePage(StrictModel):
    items: tuple[HelmChartSource, ...] = ()
    limit: int = Field(ge=1, le=HELM_CHART_SOURCE_PAGE_MAX)
    has_more: bool
    next_cursor: str | None = Field(default=None, max_length=4096)

    @model_validator(mode="after")
    def pagination_state_is_consistent(self) -> HelmChartSourcePage:
        if self.has_more != bool(self.next_cursor):
            raise ValueError("has_more and next_cursor must be consistent")
        return self


class HelmChartVersion(StrictModel):
    version: str = Field(min_length=1, max_length=256)
    app_version: str | None = Field(default=None, max_length=256)
    deprecated: bool = False


class HelmChartVersionObservation(StrictModel):
    """Bounded result from exactly one repository or OCI provider."""

    source: HelmChartSource
    chart_name: str = Field(min_length=1, max_length=512)
    availability: HelmChartVersionAvailability
    versions: tuple[HelmChartVersion, ...] = Field(
        default=(),
        max_length=HELM_CHART_VERSION_PAGE_MAX,
    )
    observed_at: str | None = None
    truncated: bool = False
    reason_codes: tuple[str, ...] = ()

    @model_validator(mode="after")
    def incomplete_observation_is_explicit(self) -> HelmChartVersionObservation:
        if self.availability != "available" and not self.reason_codes:
            raise ValueError("partial or unavailable Helm version observation requires a reason")
        if self.availability == "unavailable" and self.versions:
            raise ValueError("unavailable Helm version observation cannot contain versions")
        if self.truncated and "helm_chart_versions_truncated" not in self.reason_codes:
            raise ValueError("truncated Helm versions require the truncation reason")
        return self


class HelmChartVersionResolution(StrictModel):
    """Fail-closed source selection result; versions are never combined across sources."""

    availability: HelmChartVersionAvailability
    source: HelmChartSource | None = None
    versions: tuple[HelmChartVersion, ...] = Field(
        default=(),
        max_length=HELM_CHART_VERSION_PAGE_MAX,
    )
    observed_at: str | None = None
    truncated: bool = False
    reason_codes: tuple[str, ...] = ()

    @model_validator(mode="after")
    def resolution_is_consistent(self) -> HelmChartVersionResolution:
        if self.availability != "available" and not self.reason_codes:
            raise ValueError("partial or unavailable Helm version resolution requires a reason")
        if self.availability == "unavailable" and self.versions:
            raise ValueError("unavailable Helm version resolution cannot contain versions")
        if self.truncated and "helm_chart_versions_truncated" not in self.reason_codes:
            raise ValueError("truncated Helm versions require the truncation reason")
        return self
