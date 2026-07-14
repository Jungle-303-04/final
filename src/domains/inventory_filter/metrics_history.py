"""Build honest sparkline series from persisted inventory usage samples."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any, Literal

from packages.contracts.event_bus.interfaces import JsonObject

Completeness = Literal["exact", "partial", "unavailable"]


def build_resource_metric_history(
    resources: Sequence[Mapping[str, Any]],
    samples_by_cluster: Mapping[str, Sequence[Mapping[str, Any]]],
    *,
    projection_complete: bool,
) -> JsonObject:
    """Return CPU sparkline series without manufacturing missing samples as zero."""
    series: list[JsonObject] = []
    response_reasons: set[str] = set()
    for resource in resources:
        cluster_id = str(resource["cluster_id"])
        namespace = str(resource["namespace"])
        name = str(resource["name"])
        usage_key = f"{namespace}/{name}"
        points: list[JsonObject] = []
        for sample in samples_by_cluster.get(cluster_id, ()):
            observed_at = sample.get("sampled_at")
            if not observed_at:
                continue
            usage = sample.get("usage") if isinstance(sample.get("usage"), dict) else {}
            pods = usage.get("pods") if isinstance(usage.get("pods"), dict) else {}
            measured = pods.get(usage_key) if isinstance(pods.get(usage_key), dict) else {}
            points.append(
                {
                    "observed_at": str(observed_at),
                    "cpu_mcores": _non_negative_number(measured.get("cpu_mcores")),
                    "mem_mib": _non_negative_number(
                        measured.get("mem_mib", measured.get("memory_mib"))
                    ),
                }
            )
        points.sort(key=lambda point: point["observed_at"])
        cpu_count = sum(point["cpu_mcores"] is not None for point in points)
        completeness, reasons = _series_completeness(
            point_count=len(points),
            measured_count=cpu_count,
            projection_complete=projection_complete,
        )
        response_reasons.update(reasons)
        series.append(
            {
                "resource_id": str(resource["resource_id"]),
                "cluster_id": cluster_id,
                "resource_type": "pod",
                "namespace": namespace,
                "name": name,
                "points": points,
                "has_sparkline_points": cpu_count > 0,
                "completeness": completeness,
                "partial_reason_codes": reasons,
            }
        )
    response_completeness = _response_completeness(series, projection_complete)
    if not projection_complete:
        response_reasons.add("inventory_projection_partial")
    return {
        "series": series,
        "completeness": response_completeness,
        "partial_reason_codes": sorted(response_reasons),
    }


def _series_completeness(
    *,
    point_count: int,
    measured_count: int,
    projection_complete: bool,
) -> tuple[Completeness, list[str]]:
    if measured_count == 0:
        return "unavailable", ["metrics_history_unavailable"]
    if measured_count < point_count or not projection_complete:
        reasons = ["metrics_history_partial"] if measured_count < point_count else []
        if not projection_complete:
            reasons.append("inventory_projection_partial")
        return "partial", reasons
    return "exact", []


def _response_completeness(
    series: Sequence[Mapping[str, Any]], projection_complete: bool
) -> Completeness:
    values = {str(item.get("completeness")) for item in series}
    if not values or values == {"unavailable"}:
        return "unavailable"
    if projection_complete and values == {"exact"}:
        return "exact"
    return "partial"


def _non_negative_number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    number = float(value)
    return number if math.isfinite(number) and number >= 0 else None
