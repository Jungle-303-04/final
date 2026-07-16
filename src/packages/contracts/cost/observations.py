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
CostTimeRange = Literal["6h", "24h", "7d"]

MAX_COST_TREND_SERIES = 8
MAX_COST_TREND_POINTS = 480
MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991


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


class CostTrendPoint(StrictModel):
    timestamp: int = Field(ge=0)
    rate_micros: int = Field(ge=0, le=MAX_SAFE_JSON_INTEGER)


class CostTrendSeries(StrictModel):
    key: str = Field(min_length=1, max_length=160)
    label: str = Field(min_length=1, max_length=240)
    points: tuple[CostTrendPoint, ...] = Field(
        min_length=2,
        max_length=MAX_COST_TREND_POINTS,
    )

    @model_validator(mode="after")
    def points_are_strictly_ordered(self) -> CostTrendSeries:
        timestamps = tuple(point.timestamp for point in self.points)
        if timestamps != tuple(sorted(set(timestamps))):
            raise ValueError("cost trend points must have unique ascending timestamps")
        return self


class CostObservedTrend(StrictModel):
    availability: Literal["available", "partial"]
    range: CostTimeRange
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    series: tuple[CostTrendSeries, ...] = Field(
        min_length=1,
        max_length=MAX_COST_TREND_SERIES,
    )
    reason_codes: tuple[str, ...] = ()

    @model_validator(mode="after")
    def partial_trend_has_a_reason(self) -> CostObservedTrend:
        if self.availability == "partial" and not self.reason_codes:
            raise ValueError("partial cost trend requires a reason")
        keys = tuple(series.key for series in self.series)
        if len(keys) != len(set(keys)):
            raise ValueError("cost trend series keys must be unique")
        return self


class CostUnavailableTrend(StrictModel):
    availability: Literal["unavailable"] = "unavailable"
    range: CostTimeRange
    currency: None = None
    series: tuple[()] = ()
    reason_codes: tuple[str, ...] = Field(min_length=1)


class CostOverviewResponse(StrictModel):
    scope_coverage: CostScopeCoverage
    observation: CostObservationStatus
    summary: CostObservationSummary
    trend: CostObservedTrend | CostUnavailableTrend
    refresh_after_seconds: int = Field(ge=1, le=3600)
