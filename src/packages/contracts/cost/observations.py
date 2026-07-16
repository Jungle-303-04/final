"""Evidence-first Cost contracts.

Amounts, currencies, and recommendations remain null until an authorized
collector persists provider billing or allocation observations.  Consumers
must distinguish that condition from an observed zero cost.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from packages.contracts.gateway.base import StrictModel
from packages.contracts.parity import ClusterScope

CostAvailability = Literal["available", "partial", "unavailable"]


class CostScopeCoverage(StrictModel):
    availability: CostAvailability
    scopes: tuple[ClusterScope, ...] = ()
    observed_at: str | None = None
    reason_codes: tuple[str, ...] = ()

    @model_validator(mode="after")
    def incomplete_scope_has_a_reason(self) -> CostScopeCoverage:
        if self.availability != "available" and not self.reason_codes:
            raise ValueError("incomplete cost scope coverage requires a reason")
        return self


class CostObservationStatus(StrictModel):
    availability: Literal["unavailable"] = "unavailable"
    observed_at: None = None
    currency: None = None
    data_window: None = None
    reason_codes: tuple[str, ...] = Field(min_length=1)


class CostObservationSummary(StrictModel):
    availability: Literal["unavailable"] = "unavailable"
    hourly_cost: None = None
    monthly_projection: None = None
    storage_cost: None = None
    idle_cost: None = None
    efficiency: None = None
    savings_recommendations: None = None
    reason_codes: tuple[str, ...] = Field(min_length=1)


class CostOverviewResponse(StrictModel):
    scope_coverage: CostScopeCoverage
    observation: CostObservationStatus
    summary: CostObservationSummary
    refresh_after_seconds: int = Field(ge=1, le=3600)
