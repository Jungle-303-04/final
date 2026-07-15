"""Read-only, evidence-first traffic observation contracts.

The contract deliberately distinguishes an observed empty flow set from an
unavailable collector.  A consumer must never render an empty graph or zero
traffic count when the product has not collected traffic evidence.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from packages.contracts.gateway.base import StrictModel
from packages.contracts.parity import ClusterScope, ResourceRef

TrafficAvailability = Literal["available", "partial", "unavailable"]


class TrafficScopeCoverage(StrictModel):
    """Authorized inventory scope used to evaluate traffic availability."""

    availability: TrafficAvailability
    scopes: tuple[ClusterScope, ...] = ()
    observed_at: str | None = None
    reason_codes: tuple[str, ...] = ()

    @model_validator(mode="after")
    def incomplete_scope_has_a_reason(self) -> TrafficScopeCoverage:
        if self.availability != "available" and not self.reason_codes:
            raise ValueError("incomplete traffic scope coverage requires a reason")
        return self


class TrafficObservationStatus(StrictModel):
    """State of the traffic evidence collector for the selected scope."""

    availability: Literal["unavailable"] = "unavailable"
    observed_at: None = None
    reason_codes: tuple[str, ...] = Field(min_length=1)


class TrafficObservationSummary(StrictModel):
    """Counts are null until a collector materializes a traffic observation."""

    availability: Literal["unavailable"] = "unavailable"
    total_flow_count: None = None
    denied_flow_count: None = None
    external_flow_count: None = None
    reason_codes: tuple[str, ...] = Field(min_length=1)


class TrafficRelationship(StrictModel):
    """Reserved for future collector-backed, evidence-addressable flow edges."""

    source: ResourceRef
    target: ResourceRef
    observed_at: str = Field(min_length=1)


class TrafficRelationships(StrictModel):
    """Never use an empty edge list to represent a missing collector."""

    availability: Literal["unavailable"] = "unavailable"
    edges: None = None
    reason_codes: tuple[str, ...] = Field(min_length=1)


class TrafficOverviewResponse(StrictModel):
    scope_coverage: TrafficScopeCoverage
    observation: TrafficObservationStatus
    summary: TrafficObservationSummary
    relationships: TrafficRelationships
