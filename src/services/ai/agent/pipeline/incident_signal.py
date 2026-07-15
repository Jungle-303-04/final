"""Stable identities for polled Kubernetes container terminations."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from domains.rca.events import Evidence, IncidentRecord
from packages.contracts.event_bus.interfaces import JsonObject

SIGNAL_IDENTITY_VERSION = "k8s-container-termination-v1"


@dataclass(frozen=True)
class IncidentSignalIdentity:
    signal_key: str
    payload: JsonObject


def incident_termination_identity(
    evidence: Evidence,
    incident: IncidentRecord,
) -> IncidentSignalIdentity | None:
    """Return the newest concrete termination that belongs to the incident.

    A claim is deliberately produced only when the snapshot contains enough
    Kubernetes identity to distinguish one process termination from the next.
    Other incident sources remain fail-open and continue through the pipeline.
    """
    candidates: list[tuple[tuple[str, int, str, str], JsonObject]] = []
    pods = evidence.kubernetes.get("pods")
    if not isinstance(pods, list):
        return None

    for pod in pods:
        if not isinstance(pod, dict) or not pod_matches_incident(pod, incident):
            continue
        pod_uid = text(pod.get("uid"))
        if pod_uid is None:
            continue
        containers = pod.get("containers")
        if not isinstance(containers, list):
            continue
        for container in containers:
            if not isinstance(container, dict):
                continue
            container_name = text(container.get("name"))
            reason = text(container.get("last_state_reason"))
            if container_name is None or reason is None:
                continue
            last_state = text(container.get("last_state"))
            if last_state is not None and last_state.lower() != "terminated":
                continue
            restart_count = non_negative_int(container.get("restart_count"))
            finished_at = text(container.get("last_finished_at"))
            # At least one monotonic termination marker is required. Without it,
            # claiming could merge unrelated future failures of the same pod.
            if restart_count is None or (restart_count == 0 and finished_at is None):
                continue
            exit_code = optional_int(container.get("last_exit_code"))
            identity: JsonObject = {
                "version": SIGNAL_IDENTITY_VERSION,
                "workspace_id": evidence.workspace_id,
                "cluster_id": evidence.cluster_id,
                "namespace": text(pod.get("namespace")) or incident.namespace,
                "pod_uid": pod_uid,
                "pod_name": text(pod.get("name")),
                "container_name": container_name,
                "restart_count": restart_count,
                "last_finished_at": finished_at,
                "reason": reason,
                "exit_code": exit_code,
            }
            sort_key = (
                finished_at or "",
                restart_count,
                text(pod.get("name")) or "",
                container_name,
            )
            candidates.append((sort_key, identity))

    if not candidates:
        return None
    identity = max(candidates, key=lambda item: item[0])[1]
    encoded = json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
    digest = hashlib.sha256(encoded).hexdigest()
    return IncidentSignalIdentity(
        signal_key=f"{SIGNAL_IDENTITY_VERSION}:{digest}",
        payload=identity,
    )


def pod_matches_incident(pod: JsonObject, incident: IncidentRecord) -> bool:
    if text(pod.get("namespace")) != incident.namespace:
        return False
    resource_kind = incident.resource_kind.casefold()
    if resource_kind == "pod":
        return text(pod.get("name")) == incident.resource_name
    return (text(pod.get("owner_kind")) or "").casefold() == resource_kind and text(
        pod.get("owner_name")
    ) == incident.resource_name


def text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def non_negative_int(value: object) -> int | None:
    parsed = optional_int(value)
    return parsed if parsed is not None and parsed >= 0 else None


def optional_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
