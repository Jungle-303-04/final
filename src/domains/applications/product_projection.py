"""Provider-neutral allowlist projection for the Applications product surface."""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from typing import Any, Literal

from domains.inventory_filter.graph import build_resource_graph

JsonObject = dict[str, Any]
Completeness = Literal["exact", "partial", "unavailable"]
APPLICATION_TOPOLOGY_NODE_LIMIT = 200
APPLICATION_TOPOLOGY_EDGE_LIMIT = 1000

SENSITIVE_PATH_PARTS = frozenset(
    {"secret", "password", "passwd", "token", "credential", "private_key", "data"}
)
DRIFTING_CLASSIFICATIONS = frozenset(
    {"adoption_required", "conflict_or_manual_change", "drift", "intended_change"}
)


def application_card(
    application: Mapping[str, Any],
    *,
    bindings: Sequence[Mapping[str, Any]],
    runs: Sequence[Mapping[str, Any]],
    inventory_rows: Sequence[Mapping[str, Any]],
    inventory_context: Mapping[str, Any],
    incident_evidence: Mapping[str, Any],
) -> JsonObject:
    inventory = inventory_projection(inventory_rows, inventory_context=inventory_context)
    drift = drift_projection(runs)
    current = current_deployment_projection(runs, inventory=inventory)
    delivery = delivery_projection(runs)
    batch_runtime = batch_runtime_projection(inventory_rows, inventory=inventory)
    return {
        "id": str(application.get("application_id") or ""),
        "name": str(application.get("name") or ""),
        "environments": sorted(
            {
                str(binding.get("environment")).strip().casefold()
                for binding in bindings
                if str(binding.get("environment") or "").strip()
            }
        ),
        "lifecycle_status": str(application.get("status") or "unknown").casefold(),
        "repository_ref": _optional_text(application.get("repo_ref")),
        "default_branch": _optional_text(application.get("default_branch")),
        "manifest_path": _optional_text(application.get("manifest_path")),
        "health": inventory["health"],
        "runtime_readiness": inventory["runtime_readiness"],
        "current_deployment": current,
        "delivery": delivery,
        "batch_runtime": batch_runtime,
        "has_drift": (
            True
            if drift["status"] == "drifted"
            else False
            if drift["status"] == "in_sync"
            else None
        ),
        "drift_summary": drift["summary"],
        "resource_counts": inventory["resource_counts"],
        "resource_counts_completeness": inventory["resource_counts_completeness"],
        "open_incidents": (
            int(incident_evidence["open_count"])
            if incident_evidence.get("complete") is True
            and incident_evidence.get("open_count") is not None
            else None
        ),
    }


def application_detail(
    application: Mapping[str, Any],
    *,
    bindings: Sequence[Mapping[str, Any]],
    runs: Sequence[Mapping[str, Any]],
    inventory_rows: Sequence[Mapping[str, Any]],
    inventory_context: Mapping[str, Any],
    incident_evidence: Mapping[str, Any],
) -> JsonObject:
    card = application_card(
        application,
        bindings=bindings,
        runs=runs,
        inventory_rows=inventory_rows,
        inventory_context=inventory_context,
        incident_evidence=incident_evidence,
    )
    inventory = inventory_projection(inventory_rows, inventory_context=inventory_context)
    incidents = list(incident_evidence.get("items") or [])[:3]
    drift = drift_projection(runs)
    return {
        **card,
        "endpoints": inventory["endpoints"],
        "endpoints_completeness": inventory["resource_counts_completeness"],
        "recent_incidents": [
            {
                "id": str(item.get("id") or ""),
                "title": _bounded_optional_text(item.get("title")),
                "status": str(item.get("status") or "unknown"),
                "started_at": _optional_text(item.get("started_at")),
            }
            for item in incidents
        ],
        "recent_activity": recent_activity_projection(runs, incidents),
        "topology": topology_projection(
            inventory_rows,
            inventory_context=inventory_context,
            application_id=str(application.get("application_id") or ""),
        ),
        "history": history_projection(runs, incidents, incident_evidence=incident_evidence),
        "source": source_evidence_projection(application, drift=drift),
    }


def inventory_projection(
    rows: Sequence[Mapping[str, Any]],
    *,
    inventory_context: Mapping[str, Any],
) -> JsonObject:
    revision = int(inventory_context.get("snapshot_revision") or 0)
    if revision <= 0:
        return {
            "health": {
                "status": "unknown",
                "ready_pods": None,
                "total_pods": None,
                "restarts": None,
            },
            "runtime_readiness": {
                "completeness": "unavailable",
                "status": "unknown",
                "ready_pods": None,
                "total_pods": None,
                "restarts": None,
            },
            "resource_counts": None,
            "resource_counts_completeness": "unavailable",
            "endpoints": None,
            "image": None,
            "image_digest": None,
        }
    complete = bool(inventory_context.get("resources_complete")) and bool(
        inventory_context.get("application_bindings_complete")
    )
    complete = complete and all(row.get("binding_complete") is True for row in rows)
    completeness: Completeness = "exact" if complete else "partial"
    counts = Counter(str(row.get("kind") or "Unknown") for row in rows)
    pods = [row for row in rows if str(row.get("resource_type") or "") == "pod"]
    degraded = any(str(row.get("health") or "").casefold() != "healthy" for row in rows)
    health_status = "degraded" if degraded else "healthy" if complete else "unknown"
    ready_values = [_pod_ready(row) for row in pods]
    ready_pods = (
        sum(1 for ready in ready_values if ready)
        if complete and all(ready is not None for ready in ready_values)
        else None
    )
    restart_values = [
        _nonnegative_int(_mapping(row.get("summary")).get("restart_total")) for row in pods
    ]
    restarts = (
        sum(value for value in restart_values if value is not None)
        if complete and all(value is not None for value in restart_values)
        else None
    )
    endpoints = _endpoints(rows)
    images = sorted(
        {
            image
            for row in pods
            if (image := _optional_text(_mapping(row.get("summary")).get("image"))) is not None
        }
    )
    image = images[0] if len(images) == 1 else None
    digest = image.rsplit("@", 1)[1] if image and "@sha256:" in image else None
    return {
        "health": {
            "status": health_status,
            "ready_pods": ready_pods,
            "total_pods": len(pods) if complete else None,
            "restarts": restarts,
        },
        "runtime_readiness": {
            "completeness": completeness,
            "status": health_status,
            "ready_pods": ready_pods,
            "total_pods": len(pods) if complete else None,
            "restarts": restarts,
        },
        "resource_counts": [
            {"kind": kind, "count": count} for kind, count in sorted(counts.items())
        ],
        "resource_counts_completeness": completeness,
        "endpoints": endpoints,
        "image": image,
        "image_digest": digest,
    }


def deployment_history_projection(runs: Sequence[Mapping[str, Any]]) -> list[JsonObject]:
    return [
        {
            "id": str(run.get("workflow_run_id") or ""),
            "environment": _optional_text(run.get("environment")),
            "cluster_id": str(run.get("cluster_id") or ""),
            "git_sha": str(run.get("commit_sha") or ""),
            "version": _run_version(run),
            "deployed_at": _optional_text(run.get("updated_at")),
            "deployed_by": _run_actor(run),
            "status": _deployment_status(run.get("status")),
            "gitops_change_id": _run_change_id(run),
        }
        for run in runs
    ]


def current_deployment_projection(
    runs: Sequence[Mapping[str, Any]],
    *,
    inventory: Mapping[str, Any],
) -> JsonObject | None:
    succeeded = next(
        (run for run in runs if str(run.get("status") or "").casefold() == "succeeded"),
        None,
    )
    if succeeded is None:
        return None
    return {
        "version": _run_version(succeeded),
        "image": _optional_text(inventory.get("image")),
        "image_digest": _optional_text(inventory.get("image_digest")),
        "git_sha": str(succeeded.get("commit_sha") or ""),
        "deployed_at": _optional_text(succeeded.get("updated_at")),
        "deployed_by": _run_actor(succeeded),
    }


def delivery_projection(runs: Sequence[Mapping[str, Any]]) -> JsonObject:
    """Project the latest observed delivery attempt, separate from last success."""

    latest = next(
        (run for run in runs if _optional_text(run.get("workflow_run_id")) is not None),
        None,
    )
    if latest is None:
        return {
            "availability": "unavailable",
            "status": None,
            "workflow_run_id": None,
            "observed_at": None,
        }
    return {
        "availability": "available",
        "status": _deployment_status(latest.get("status")),
        "workflow_run_id": _optional_text(latest.get("workflow_run_id")),
        "observed_at": _optional_text(latest.get("updated_at")),
    }


def batch_runtime_projection(
    rows: Sequence[Mapping[str, Any]],
    *,
    inventory: Mapping[str, Any],
) -> JsonObject:
    """Expose Job/CronJob counters only when they are actually observed.

    The current collector can omit batch workloads.  An absent batch row is therefore
    an unavailable signal, never a synthetic idle or zero state.
    """

    batch_rows = [
        row for row in rows if str(row.get("kind") or "").casefold() in {"job", "cronjob"}
    ]
    if not batch_rows:
        return {
            "availability": "unavailable",
            "completeness": "unavailable",
            "status": None,
            "active_runs": None,
            "failed_runs": None,
            "succeeded_runs": None,
        }

    active_values = [_batch_counter(row, "active", "active_runs") for row in batch_rows]
    failed_values = [_batch_counter(row, "failed", "failed_runs") for row in batch_rows]
    succeeded_values = [_batch_counter(row, "succeeded", "succeeded_runs") for row in batch_rows]
    suspended_values = [_batch_suspended(row) for row in batch_rows]
    counters_complete = all(
        value is not None
        for values in (active_values, failed_values, succeeded_values)
        for value in values
    )
    inventory_complete = inventory.get("resource_counts_completeness") == "exact"
    completeness: Completeness = "exact" if inventory_complete and counters_complete else "partial"
    active_runs = _sum_known_counters(active_values, complete=counters_complete)
    failed_runs = _sum_known_counters(failed_values, complete=counters_complete)
    succeeded_runs = _sum_known_counters(succeeded_values, complete=counters_complete)
    status = (
        "running"
        if active_runs is not None and active_runs > 0
        else "failed"
        if failed_runs is not None and failed_runs > 0
        else "succeeded"
        if succeeded_runs is not None and succeeded_runs > 0
        else "suspended"
        if any(suspended_values)
        else "unknown"
    )
    return {
        "availability": "available",
        "completeness": completeness,
        "status": status,
        "active_runs": active_runs,
        "failed_runs": failed_runs,
        "succeeded_runs": succeeded_runs,
    }


def topology_projection(
    rows: Sequence[Mapping[str, Any]],
    *,
    inventory_context: Mapping[str, Any],
    application_id: str,
) -> JsonObject:
    """Return only server-built, authorized application relationship evidence."""

    revision = _nonnegative_int(inventory_context.get("snapshot_revision")) or 0
    if revision <= 0:
        return {
            "availability": "unavailable",
            "completeness": "unavailable",
            "observed_at": None,
            "nodes": None,
            "edges": None,
            "partial_reason_codes": [],
        }

    resources_complete = inventory_context.get("resources_complete") is True
    bindings_complete = inventory_context.get("application_bindings_complete") is True
    labels_complete = inventory_context.get("labels_complete") is True
    reasons = {
        str(reason)
        for reason in inventory_context.get("partial_reason_codes") or []
        if _optional_text(reason) is not None
    }
    if not resources_complete:
        reasons.add("source_resources_incomplete")
    if not bindings_complete:
        reasons.add("application_bindings_incomplete")
    if not labels_complete:
        reasons.add("source_labels_incomplete")

    graphs = []
    for cluster_id in sorted(
        {str(row.get("cluster_id") or "") for row in rows if row.get("cluster_id")}
    ):
        cluster_rows = [row for row in rows if str(row.get("cluster_id") or "") == cluster_id]
        graph = build_resource_graph(
            [_topology_graph_item(row, application_id=application_id) for row in cluster_rows],
            snapshot_revision=revision,
            filter_fingerprint=f"application:{application_id}:{cluster_id}",
            source_complete=resources_complete and bindings_complete,
            labels_complete=labels_complete,
            truncated=False,
            partial_reason_codes=sorted(reasons),
            cluster={"cluster_id": cluster_id},
        )
        graphs.append(graph)
        reasons.update(str(reason) for reason in graph["partial_reason_codes"])

    all_nodes = [_topology_node(node) for graph in graphs for node in graph["nodes"]]
    all_edges = [_topology_edge(edge) for graph in graphs for edge in graph["edges"]]
    nodes = all_nodes[:APPLICATION_TOPOLOGY_NODE_LIMIT]
    node_ids = {str(node["id"]) for node in nodes}
    edges = [
        edge
        for edge in all_edges
        if str(edge["from_id"]) in node_ids and str(edge["to_id"]) in node_ids
    ][:APPLICATION_TOPOLOGY_EDGE_LIMIT]
    if len(all_nodes) > len(nodes):
        reasons.add("application_topology_node_budget_exceeded")
    if len(all_edges) > len(edges):
        reasons.add("application_topology_edge_budget_exceeded")
    topology_complete = (
        bool(graphs)
        and all(graph["relation_completeness"] == "exact" for graph in graphs)
        and len(all_nodes) == len(nodes)
        and len(all_edges) == len(edges)
    )
    if not graphs and resources_complete and bindings_complete and labels_complete:
        topology_complete = True
    return {
        "availability": "available",
        "completeness": "exact" if topology_complete else "partial",
        "observed_at": _optional_text(inventory_context.get("observed_at")),
        "nodes": nodes,
        "edges": edges,
        "partial_reason_codes": [] if topology_complete else sorted(reasons),
    }


def history_projection(
    runs: Sequence[Mapping[str, Any]],
    incidents: Sequence[Mapping[str, Any]],
    *,
    incident_evidence: Mapping[str, Any],
) -> JsonObject:
    """Keep bounded delivery and incident evidence separate from browser ordering."""

    entries = [
        {
            "id": f"delivery:{run_id}",
            "type": "delivery",
            "status": _deployment_status(run.get("status")),
            "summary": _bounded_optional_text(run.get("summary")),
            "occurred_at": _optional_text(run.get("updated_at")),
            "workflow_run_id": run_id,
            "gitops_change_id": _run_change_id(run),
        }
        for run in runs
        if (run_id := _optional_text(run.get("workflow_run_id"))) is not None
    ]
    entries.extend(
        {
            "id": f"incident:{incident_id}",
            "type": "incident",
            "status": str(incident.get("status") or "unknown"),
            "summary": _bounded_optional_text(incident.get("title")),
            "occurred_at": _optional_text(incident.get("updated_at") or incident.get("started_at")),
            "workflow_run_id": None,
            "gitops_change_id": None,
        }
        for incident in incidents
        if (incident_id := _optional_text(incident.get("id"))) is not None
    )
    entries.sort(
        key=lambda item: (
            str(item.get("occurred_at") or ""),
            str(item["type"]),
            str(item["id"]),
        ),
        reverse=True,
    )
    reasons = {"bounded_workflow_history"}
    if incident_evidence.get("complete") is not True:
        reasons.add("incident_source_incomplete")
    return {
        "availability": "available",
        "completeness": "partial",
        "entries": entries[:6],
        "partial_reason_codes": sorted(reasons),
    }


def source_evidence_projection(
    application: Mapping[str, Any],
    *,
    drift: Mapping[str, Any],
) -> JsonObject:
    """Expose registered source provenance and observed source-to-runtime conflict."""

    repository_ref = _optional_text(application.get("repo_ref"))
    default_branch = _optional_text(application.get("default_branch"))
    manifest_path = _optional_text(application.get("manifest_path"))
    if repository_ref is None:
        return {
            "availability": "unavailable",
            "completeness": "unavailable",
            "conflict": None,
            "repository_ref": None,
            "default_branch": None,
            "manifest_path": None,
            "partial_reason_codes": [],
        }
    reasons = []
    if default_branch is None:
        reasons.append("default_branch_unavailable")
    if manifest_path is None:
        reasons.append("manifest_path_unavailable")
    drift_status = str(drift.get("status") or "unknown")
    conflict = (
        "conflict"
        if drift_status == "drifted"
        else "aligned"
        if drift_status == "in_sync"
        else "unknown"
    )
    return {
        "availability": "available",
        "completeness": "exact" if not reasons else "partial",
        "conflict": conflict,
        "repository_ref": repository_ref,
        "default_branch": default_branch,
        "manifest_path": manifest_path,
        "partial_reason_codes": reasons,
    }


def _topology_graph_item(row: Mapping[str, Any], *, application_id: str) -> JsonObject:
    return {
        "resource": {
            "inventory_key": str(row.get("id") or ""),
            "cluster_id": str(row.get("cluster_id") or ""),
            "resource_type": str(row.get("resource_type") or ""),
            "api_version": str(row.get("api_version") or ""),
            "kind": str(row.get("kind") or ""),
            "namespace": _optional_text(row.get("namespace")),
            "name": str(row.get("name") or ""),
            "uid": _optional_text(row.get("uid")),
            "status": str(row.get("status") or ""),
            "health": str(row.get("health") or ""),
            "labels": _mapping(row.get("labels")),
            "summary": _mapping(row.get("summary")),
            "observed_at": _optional_text(row.get("observed_at")),
        },
        "application_ids": [application_id] if application_id else [],
        "application_binding_completeness": (
            "exact" if row.get("binding_complete") is True else "partial"
        ),
    }


def _topology_node(node: Mapping[str, Any]) -> JsonObject:
    identity = _mapping(node.get("identity"))
    return {
        "id": str(node.get("node_id") or ""),
        "cluster_id": str(identity.get("cluster_id") or ""),
        "resource_type": str(identity.get("resource_type") or ""),
        "kind": str(identity.get("kind") or ""),
        "namespace": _optional_text(identity.get("namespace")),
        "name": str(identity.get("name") or ""),
        "status": str(node.get("status") or "unknown"),
        "health": str(node.get("health") or "unknown"),
        "observed_at": _optional_text(node.get("observed_at")),
    }


def _topology_edge(edge: Mapping[str, Any]) -> JsonObject:
    evidence = _mapping(edge.get("evidence"))
    return {
        "id": str(edge.get("edge_id") or ""),
        "from_id": str(edge.get("from_node_id") or ""),
        "to_id": str(edge.get("to_node_id") or ""),
        "type": str(edge.get("kind") or ""),
        "evidence_type": str(evidence.get("type") or ""),
        "authority": str(evidence.get("authority") or ""),
        "observed_at": _optional_text(evidence.get("observed_at")),
    }


def drift_projection(runs: Sequence[Mapping[str, Any]]) -> JsonObject:
    evidence = _latest_diff_evidence(runs)
    if evidence is None:
        return {"status": "unknown", "summary": None, "differences": [], "observed_at": None}
    diff, observed_at = evidence
    raw_changes = diff.get("changes")
    if not isinstance(raw_changes, list):
        return {"status": "unknown", "summary": None, "differences": [], "observed_at": observed_at}
    changes = [dict(change) for change in raw_changes if isinstance(change, Mapping)]
    drifting = [
        change
        for change in changes
        if str(change.get("classification") or "") in DRIFTING_CLASSIFICATIONS
    ]
    has_changes = diff.get("has_changes")
    if drifting:
        status = "drifted"
        summary = f"{len(drifting)} field{'s' if len(drifting) != 1 else ''} differ"
    elif has_changes is False or (
        not changes and str(diff.get("status") or "") in {"no_change", "already_converged"}
    ):
        status = "in_sync"
        summary = None
    elif changes and all(
        str(change.get("classification") or "") == "already_converged" for change in changes
    ):
        status = "in_sync"
        summary = None
    else:
        status = "unknown"
        summary = None
    return {
        "status": status,
        "summary": summary,
        "differences": [_drift_difference(diff, change) for change in drifting],
        "observed_at": observed_at,
    }


def recent_activity_projection(
    runs: Sequence[Mapping[str, Any]],
    incidents: Sequence[Mapping[str, Any]],
) -> list[JsonObject]:
    activity = [
        {
            "id": str(run.get("workflow_run_id") or ""),
            "type": "deployment",
            "summary": _bounded_optional_text(run.get("summary")),
            "occurred_at": _optional_text(run.get("updated_at")),
        }
        for run in runs[:3]
    ]
    activity.extend(
        {
            "id": str(incident.get("id") or ""),
            "type": "incident",
            "summary": _bounded_optional_text(incident.get("title")),
            "occurred_at": _optional_text(incident.get("updated_at") or incident.get("started_at")),
        }
        for incident in incidents[:3]
    )
    return sorted(
        activity,
        key=lambda item: (str(item.get("occurred_at") or ""), str(item["id"])),
        reverse=True,
    )[:3]


def _latest_diff_evidence(
    runs: Sequence[Mapping[str, Any]],
) -> tuple[Mapping[str, Any], str | None] | None:
    for run in runs:
        for raw_step in run.get("steps") or []:
            step = _mapping(raw_step)
            if str(step.get("name") or "") != "diff":
                continue
            details = _mapping(step.get("details"))
            diff = _mapping(details.get("diff")) if "diff" in details else details
            if diff:
                return diff, _optional_text(step.get("updated_at") or run.get("updated_at"))
    return None


def _drift_difference(diff: Mapping[str, Any], change: Mapping[str, Any]) -> JsonObject:
    path = str(change.get("field_path") or "")
    old_value, old_redacted = _safe_diff_value(path, change.get("new_desired"))
    new_value, new_redacted = _safe_diff_value(path, change.get("live"))
    value_redacted = old_redacted or new_redacted
    if value_redacted:
        old_value = None
        new_value = None
    return {
        "resource": str(diff.get("resource") or ""),
        "field_path": path,
        "old_value": old_value,
        "new_value": new_value,
        "value_redacted": value_redacted,
        "changed_by": _bounded_optional_text(change.get("changed_by") or change.get("actor")),
        "changed_at": _optional_text(change.get("changed_at")),
    }


def _safe_diff_value(path: str, value: Any) -> tuple[str | int | float | bool | None, bool]:
    normalized = path.casefold().replace("-", "_")
    if any(part in normalized for part in SENSITIVE_PATH_PARTS):
        return None, True
    if value is None or isinstance(value, (bool, int, float)):
        return value, False
    if isinstance(value, str) and len(value) <= 512:
        return value, False
    return None, True


def _endpoints(rows: Sequence[Mapping[str, Any]]) -> list[JsonObject]:
    endpoints: dict[tuple[str, str], JsonObject] = {}
    for row in rows:
        if str(row.get("resource_type") or "") != "service":
            continue
        summary = _mapping(row.get("summary"))
        urls = []
        external_url = _optional_text(summary.get("external_url"))
        if external_url:
            urls.append(external_url)
        hosts = summary.get("external_hosts")
        if isinstance(hosts, list):
            urls.extend(
                f"http://{host}" for value in hosts if (host := _optional_text(value)) is not None
            )
        for url in sorted(set(urls)):
            key = (str(row.get("id") or ""), url)
            endpoints[key] = {
                "id": key[0],
                "kind": str(row.get("kind") or "Service"),
                "name": str(row.get("name") or ""),
                "url": url,
            }
    return [endpoints[key] for key in sorted(endpoints)]


def _pod_ready(row: Mapping[str, Any]) -> bool | None:
    conditions = _mapping(row.get("summary")).get("conditions")
    if not isinstance(conditions, list):
        return None
    for raw_condition in conditions:
        condition = _mapping(raw_condition)
        if str(condition.get("type") or "") == "Ready":
            value = str(condition.get("status") or "").casefold()
            return True if value == "true" else False if value == "false" else None
    return None


def _batch_counter(row: Mapping[str, Any], *keys: str) -> int | None:
    summary = _mapping(row.get("summary"))
    for key in keys:
        if key in summary:
            return _nonnegative_int(summary.get(key))
    return None


def _batch_suspended(row: Mapping[str, Any]) -> bool:
    summary = _mapping(row.get("summary"))
    return any(summary.get(key) is True for key in ("suspended", "suspend"))


def _sum_known_counters(values: Sequence[int | None], *, complete: bool) -> int | None:
    return sum(value for value in values if value is not None) if complete else None


def _run_version(run: Mapping[str, Any]) -> str | None:
    metadata = _mapping(run.get("metadata"))
    for key in ("version", "release", "image_tag"):
        value = _bounded_optional_text(metadata.get(key))
        if value is not None:
            return value
    return None


def _run_actor(run: Mapping[str, Any]) -> str | None:
    metadata = _mapping(run.get("metadata"))
    for key in ("deployed_by", "actor", "requested_by"):
        value = _bounded_optional_text(metadata.get(key))
        if value is not None:
            return value
    return None


def _run_change_id(run: Mapping[str, Any]) -> str | None:
    metadata = _mapping(run.get("metadata"))
    for key in ("gitops_change_id", "change_id"):
        value = _bounded_optional_text(metadata.get(key))
        if value is not None:
            return value
    return None


def _deployment_status(value: Any) -> str:
    status = str(value or "").casefold()
    if status == "succeeded":
        return "succeeded"
    if status == "failed":
        return "failed"
    if status in {"applying", "rollout_waiting"}:
        return "running"
    if status in {"started", "rendering", "diffing", "policy_checking", "waiting_for_approval"}:
        return "pending"
    return "unknown"


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _optional_text(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _bounded_optional_text(value: Any) -> str | None:
    text = _optional_text(value)
    return text[:500] if text is not None else None


def _nonnegative_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        result = int(value)
    except (TypeError, ValueError):
        return None
    return result if result >= 0 else None
