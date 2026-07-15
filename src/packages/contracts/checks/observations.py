"""Evidence-first contracts for the Checks read surface.

Checks findings, catalog definitions, severities, and counts are deliberately
nullable until a collector materializes them.  An empty list would mean a
completed evaluation with zero findings, which this product cannot claim yet.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from packages.contracts.gateway.base import StrictModel
from packages.contracts.parity import ClusterScope

ChecksAvailability = Literal["available", "partial", "unavailable"]


class ChecksScopeCoverage(StrictModel):
    availability: ChecksAvailability
    scopes: tuple[ClusterScope, ...] = ()
    observed_at: str | None = None
    reason_codes: tuple[str, ...] = ()

    @model_validator(mode="after")
    def incomplete_scope_has_a_reason(self) -> ChecksScopeCoverage:
        if self.availability != "available" and not self.reason_codes:
            raise ValueError("incomplete checks scope coverage requires a reason")
        return self


class ChecksResultSet(StrictModel):
    """No findings are emitted until an agent-backed evaluation exists."""

    availability: Literal["unavailable"] = "unavailable"
    evaluated_at: None = None
    checks: None = None
    total_check_count: None = None
    total_finding_count: None = None
    reason_codes: tuple[str, ...] = Field(min_length=1)


class ChecksCatalog(StrictModel):
    """The static check catalog is unavailable with the result collector."""

    availability: Literal["unavailable"] = "unavailable"
    entries: None = None
    reason_codes: tuple[str, ...] = Field(min_length=1)


class ChecksOverviewResponse(StrictModel):
    scope_coverage: ChecksScopeCoverage
    result_set: ChecksResultSet
    catalog: ChecksCatalog


class ChecksDetail(StrictModel):
    """A requested check identity, not an asserted catalog match."""

    requested_check_id: str = Field(min_length=1, max_length=253)
    availability: Literal["unavailable"] = "unavailable"
    title: None = None
    category: None = None
    effective_severity: None = None
    message: None = None
    remediation: None = None
    affected_resource_count: None = None
    findings: None = None
    reason_codes: tuple[str, ...] = Field(min_length=1)


class ChecksDetailResponse(StrictModel):
    scope_coverage: ChecksScopeCoverage
    detail: ChecksDetail
