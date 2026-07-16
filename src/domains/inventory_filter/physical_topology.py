"""Allowlisted physical topology projection for the Resources surface."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal

JsonObject = dict[str, Any]
Completeness = Literal["exact", "partial", "unavailable"]


def build_physical_topology(
    result: Mapping[str, Any],
    *,
    latest_usage_sample: Mapping[str, Any] | None,
    matched_count_completeness: Completeness,
    total_count_completeness: Completeness,
) -> JsonObject:
    """Map inventory and measured usage without exposing raw Kubernetes payloads."""
    usage_sample = dict(latest_usage_sample or {})
    usage = _mapping(usage_sample.get("usage"))
    node_usage = _mapping(usage.get("nodes"))
    pod_usage = _mapping(usage.get("pods"))
    pod_counts = _mapping(result.get("pod_counts_by_node_name"))

    servers: list[JsonObject] = []
    server_id_by_name: dict[str, str] = {}
    metric_values: list[float | None] = []
    measured_values: list[float | None] = []
    for row in _rows(result.get("servers")):
        server_id = _text(row.get("inventory_key"))
        name = _text(row.get("name"))
        if not server_id or not name:
            continue
        summary = _mapping(row.get("summary"))
        measured = _mapping(node_usage.get(name))
        cpu_pct = _usage_pct(measured, ("cpu_pct", "cpu_percent"), ("cpu_ratio",))
        if cpu_pct is None:
            cpu_pct = _usage_pct(summary, ("cpu_pct", "cpu_percent"), ("cpu_ratio",))
        mem_pct = _usage_pct(
            measured,
            ("mem_pct", "memory_pct"),
            ("mem_ratio", "memory_ratio"),
        )
        if mem_pct is None:
            mem_pct = _usage_pct(
                summary,
                ("mem_pct", "memory_pct"),
                ("mem_ratio", "memory_ratio"),
            )
        cpu_mcores = _number(measured.get("cpu_mcores"))
        if cpu_mcores is None:
            cpu_mcores = _number(summary.get("cpu_mcores"))
        mem_mib = _number(_first(measured, "mem_mib", "memory_mib"))
        if mem_mib is None:
            mem_mib = _number(_first(summary, "mem_mib", "memory_mib"))
        allocatable_cpu = _number(summary.get("allocatable_cpu_mcores"))
        allocatable_mem = _number(_first(summary, "allocatable_mem_mib", "allocatable_memory_mib"))
        pod_capacity = _optional_non_negative_int(summary.get("pod_capacity"))
        metric_values.extend((cpu_pct, mem_pct, cpu_mcores, mem_mib))
        measured_values.extend((cpu_pct, mem_pct, cpu_mcores, mem_mib))
        counts = _mapping(pod_counts.get(name))
        server_id_by_name[name] = server_id
        servers.append(
            {
                "id": server_id,
                "name": name,
                "cpu_pct": cpu_pct,
                "mem_pct": mem_pct,
                "cpu_mcores": cpu_mcores,
                "mem_mib": mem_mib,
                "allocatable_cpu_mcores": allocatable_cpu,
                "allocatable_mem_mib": allocatable_mem,
                "pod_capacity": pod_capacity,
                "status": _text(row.get("status")),
                "matched_pod_count": (
                    None
                    if matched_count_completeness == "unavailable"
                    else _non_negative_int(counts.get("matched"))
                ),
                "total_pod_count": (
                    None
                    if total_count_completeness == "unavailable"
                    else _non_negative_int(counts.get("total"))
                ),
                "matched_pod_count_completeness": matched_count_completeness,
                "total_pod_count_completeness": total_count_completeness,
            }
        )

    pods: list[JsonObject] = []
    placement_incomplete = False
    for row in _rows(result.get("pods")):
        pod_id = _text(row.get("inventory_key"))
        name = _text(row.get("name"))
        namespace = _text(row.get("namespace"), "default")
        if not pod_id or not name:
            continue
        summary = _mapping(row.get("summary"))
        observed_node_name = _text(summary.get("node_name"))
        placement_node_name = _text(row.get("placement_node_name"))
        server_id = server_id_by_name.get(placement_node_name) if placement_node_name else None
        if observed_node_name and server_id is None:
            placement_incomplete = True
        measured = _mapping(pod_usage.get(f"{namespace}/{name}"))
        cpu_mcores = _number(measured.get("cpu_mcores"))
        mem_mib = _number(_first(measured, "mem_mib", "memory_mib"))
        cpu_request_mcores, mem_request_mib = _request_denominators(summary)
        ownership = _pod_ownership(row, summary, namespace=namespace)
        usage_pct = _requests_usage_pct(
            cpu_mcores=cpu_mcores,
            cpu_request_mcores=cpu_request_mcores,
            mem_mib=mem_mib,
            mem_request_mib=mem_request_mib,
        )
        metric_values.extend((cpu_mcores, cpu_request_mcores, mem_mib, mem_request_mib, usage_pct))
        measured_values.extend((cpu_mcores, mem_mib, usage_pct))
        pods.append(
            {
                "id": pod_id,
                "name": name,
                "namespace": namespace,
                "server_id": server_id,
                **ownership,
                "usage_pct": usage_pct,
                "cpu_mcores": cpu_mcores,
                "cpu_request_mcores": cpu_request_mcores,
                "mem_mib": mem_mib,
                "mem_request_mib": mem_request_mib,
                "phase": _text(row.get("status") or summary.get("phase"), "Unknown"),
                "health": _text(row.get("health"), "unknown"),
                "restarts": _non_negative_int(summary.get("restart_total")),
                "matches_filter": bool(row.get("matches_filter")),
            }
        )

    truncated = {
        server_id_by_name[node_name]: int(count)
        for node_name, count in _mapping(result.get("truncated_by_node_name")).items()
        if node_name in server_id_by_name and _non_negative_int(count) > 0
    }
    unassigned_truncated_count = _non_negative_int(result.get("unassigned_truncated_count"))
    reasons: set[str] = set()
    if placement_incomplete:
        reasons.add("pod_node_projection_missing")
    if truncated or unassigned_truncated_count:
        reasons.add("topology_pod_budget_exceeded")

    entities_exist = bool(servers or pods)
    metrics_completeness: Completeness
    if not entities_exist:
        metrics_completeness = "exact"
    elif not any(value is not None for value in measured_values):
        metrics_completeness = "unavailable"
    elif any(value is None for value in metric_values):
        metrics_completeness = "partial"
    else:
        metrics_completeness = "exact"

    return {
        "servers": servers,
        "pods": pods,
        "truncated": truncated,
        "unassigned_truncated_count": unassigned_truncated_count,
        "metrics_completeness": metrics_completeness,
        "metrics_observed_at": _optional_text(usage_sample.get("sampled_at")),
        "partial_reason_codes": sorted(reasons),
    }


def _pod_ownership(
    row: Mapping[str, Any],
    summary: Mapping[str, Any],
    *,
    namespace: str,
) -> JsonObject:
    owner_kind = _optional_text(summary.get("owner_kind"))
    owner_name = _optional_text(summary.get("owner_name"))
    owner_uid = _optional_text(summary.get("owner_uid"))
    owner_references_complete = _optional_bool(summary.get("owner_references_complete"))
    if owner_references_complete is False:
        return {
            "owner_kind": owner_kind,
            "owner_name": owner_name,
            "owner_uid": owner_uid,
            "owner_references_complete": owner_references_complete,
            "workload_key": None,
            "replica_group_key": None,
            "replica_group_kind": None,
            "replica_group_name": None,
            "replica_group_uid": None,
        }
    workload_key = _optional_text(summary.get("workload_key")) or _workload_key(
        namespace,
        owner_kind,
        owner_name,
    )
    replica_group_kind = _optional_text(row.get("controller_resource_kind"))
    replica_group_name = _optional_text(row.get("controller_resource_name"))
    replica_group_uid = _optional_text(row.get("controller_resource_uid"))
    if not replica_group_kind or not replica_group_name:
        replica_group_kind = _optional_text(row.get("owner_resource_kind")) or owner_kind
        replica_group_name = _optional_text(row.get("owner_resource_name")) or owner_name
        replica_group_uid = _optional_text(row.get("owner_resource_uid")) or owner_uid
    return {
        "owner_kind": owner_kind,
        "owner_name": owner_name,
        "owner_uid": owner_uid,
        "owner_references_complete": owner_references_complete,
        "workload_key": workload_key,
        "replica_group_key": _workload_key(namespace, replica_group_kind, replica_group_name),
        "replica_group_kind": replica_group_kind,
        "replica_group_name": replica_group_name,
        "replica_group_uid": replica_group_uid,
    }


def _workload_key(namespace: str, kind: str | None, name: str | None) -> str | None:
    if not namespace or not kind or not name:
        return None
    return f"{namespace}/{kind}/{name}"


def _requests_usage_pct(
    *,
    cpu_mcores: float | None,
    cpu_request_mcores: float | None,
    mem_mib: float | None,
    mem_request_mib: float | None,
) -> float | None:
    """Return usage only when both request denominators and a measurement exist."""
    if (
        cpu_request_mcores is None
        or mem_request_mib is None
        or cpu_request_mcores <= 0
        or mem_request_mib <= 0
    ):
        return None
    ratios = []
    if cpu_mcores is not None:
        ratios.append(cpu_mcores / cpu_request_mcores * 100.0)
    if mem_mib is not None:
        ratios.append(mem_mib / mem_request_mib * 100.0)
    return round(max(ratios), 1) if ratios else None


def _request_denominators(summary: Mapping[str, Any]) -> tuple[float | None, float | None]:
    return (
        _positive_number(
            _first(
                summary,
                "cpu_request_mcores",
                "request_cpu_mcores",
                "requests_cpu_mcores",
            )
        ),
        _positive_number(_first(summary, "mem_request_mib", "request_mem_mib", "requests_mem_mib")),
    )


def _usage_pct(
    usage: Mapping[str, Any],
    pct_keys: tuple[str, ...],
    ratio_keys: tuple[str, ...],
) -> float | None:
    for key in pct_keys:
        value = _number(usage.get(key))
        if value is not None:
            return round(value, 1)
    for key in ratio_keys:
        value = _number(usage.get(key))
        if value is not None:
            return round(value * 100.0, 1)
    return None


def _rows(value: object) -> list[Mapping[str, Any]]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [row for row in value if isinstance(row, Mapping)]


def _mapping(value: object) -> JsonObject:
    return dict(value) if isinstance(value, Mapping) else {}


def _first(values: Mapping[str, Any], *keys: str) -> object:
    return next((values[key] for key in keys if values.get(key) is not None), None)


def _number(value: object) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _positive_number(value: object) -> float | None:
    parsed = _number(value)
    return parsed if parsed is not None and parsed > 0 else None


def _non_negative_int(value: object) -> int:
    if isinstance(value, bool):
        return 0
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _optional_non_negative_int(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None


def _text(value: object, default: str = "") -> str:
    return str(value) if value not in (None, "") else default


def _optional_text(value: object) -> str | None:
    return str(value) if value not in (None, "") else None


def _optional_bool(value: object) -> bool | None:
    return value if isinstance(value, bool) else None
