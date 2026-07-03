from __future__ import annotations

from domains.rca.events import (
    ClusterEvidenceReceivedBody,
    Evidence,
    EvidenceBundle,
    EvidenceItem,
    IncidentRecord,
)
from services.ai.agent.causes.engine import required_evidence_sources

EvidenceSource = ClusterEvidenceReceivedBody | Evidence


def extract_resource(kubernetes: dict) -> tuple[str, str, str | None]:
    resource = kubernetes.get("resource", {})
    return (
        str(resource.get("kind", "Unknown")),
        str(resource.get("name", "unknown")),
        resource.get("namespace"),
    )


def extract_symptom(kubernetes: dict) -> str:
    return str(kubernetes.get("symptom", "unknown"))


def build_incident_evidence_bundle(
    evt: EvidenceSource,
    incident: IncidentRecord,
) -> EvidenceBundle:
    required_sources = required_evidence_sources(incident)
    items = collect_evidence_items(evt)
    present_sources = {item.source for item in items}
    missing_evidence = [source for source in required_sources if source not in present_sources]
    return EvidenceBundle(
        incident_id=incident.incident_id,
        items=items,
        missing_evidence=missing_evidence,
        complete=not missing_evidence,
    )


def collect_evidence_items(evt: EvidenceSource) -> list[EvidenceItem]:
    items: list[EvidenceItem] = []
    resource_kind, resource_name, namespace = extract_resource(evt.kubernetes)
    symptom = extract_symptom(evt.kubernetes)
    target_summary = (
        f"{namespace or 'unknown'} namespace의 {resource_kind} "
        f"{resource_name}에서 {symptom} 증상이 보고되었습니다."
    )

    if evt.kubernetes:
        items.append(
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value=evt.kubernetes,
                summary=f"{target_summary} Kubernetes 상태 근거입니다.",
            )
        )
    if evt.metrics:
        items.append(
            EvidenceItem(
                source="metrics",
                name="telemetry_metrics",
                value=evt.metrics,
                summary=f"{target_summary} Metric snapshot 근거입니다.",
            )
        )
    if evt.logs:
        items.append(
            EvidenceItem(
                source="logs",
                name="related_logs",
                value={"entries": evt.logs},
                summary=f"{target_summary} Log tail 근거입니다.",
            )
        )
    if evt.traces:
        items.append(
            EvidenceItem(
                source="traces",
                name="related_traces",
                value=evt.traces,
                summary=f"{target_summary} Trace 근거입니다.",
            )
        )
    return items
