from __future__ import annotations

from dataclasses import dataclass, field

from domains.rca.events import (
    Evidence,
    EvidenceBundleBuiltBody,
    IncidentDetectedBody,
    IncidentRecord,
    RcaActionRequiredBody,
)
from packages.contracts.event_bus.bodies import EventBody, JsonObject
from services.ai.agent.defaults import IncidentMessages, RcaMessages
from services.ai.agent.pipeline.evidence_bundle import build_incident_evidence_bundle
from services.ai.agent.pipeline.symptom import UNKNOWN_SYMPTOM, derive_symptom, resolve_resource


@dataclass(frozen=True)
class IncidentDetector:
    messages: IncidentMessages = field(default_factory=IncidentMessages)

    def detect_body(self, evidence: Evidence, correlation_id: str) -> IncidentDetectedBody:
        incident = self.classify(evidence, correlation_id)
        detected = self.has_signal(evidence)
        return IncidentDetectedBody(
            cluster_id=evidence.cluster_id,
            detected=detected,
            reason=self.messages.detected_reason if detected else self.messages.not_detected_reason,
            workspace_id=evidence.workspace_id,
            severity=incident.severity,
            affected=self.affected_resources(incident),
            evidence=evidence,
            incident=incident,
        )

    def has_signal(self, evidence: Evidence) -> bool:
        derived = derive_symptom(evidence.kubernetes)
        if derived.signal is not None or derived.symptom != UNKNOWN_SYMPTOM:
            return True

        # Alertmanager webhook evidence arrives through metrics, not the Kubernetes
        # snapshot. Keep firing alert groups incident-worthy without treating every
        # normal metrics sample as an incident.
        alertmanager = evidence.metrics.get("alertmanager") if isinstance(evidence.metrics, dict) else None
        if isinstance(alertmanager, dict):
            alerts = alertmanager.get("alerts")
            return isinstance(alerts, list) and any(
                isinstance(alert, dict) and alert.get("status") == "firing" for alert in alerts
            )
        return False

    def classify(self, evidence: Evidence, incident_id: str) -> IncidentRecord:
        # 명시 symptom(webhook/fixture)이 있으면 그대로, 없으면 snapshot 신호에서 유도.
        # 우선순위·판정 기준은 pipeline/symptom.py 상수 표 참조(명시 > 유도 > unknown).
        derived = derive_symptom(evidence.kubernetes)
        resource_kind, resource_name, namespace = resolve_resource(
            evidence.kubernetes, derived.signal
        )
        symptom = derived.symptom
        severity = str(evidence.kubernetes.get("severity", "medium"))
        return IncidentRecord(
            incident_id=incident_id,
            cluster_id=evidence.cluster_id,
            resource_kind=resource_kind,
            resource_name=resource_name,
            namespace=namespace,
            symptom=symptom,
            severity=severity,
            first_seen_at=evidence.kubernetes.get("first_seen_at"),
            summary=f"{resource_kind} {resource_name} has {symptom}",
            workspace_id=evidence.workspace_id,
            secondary_symptoms=derived.secondary_symptoms,
        )

    def affected_resources(self, incident: IncidentRecord) -> list[JsonObject]:
        return [
            {
                "cluster_id": incident.cluster_id,
                "workspace_id": incident.workspace_id,
                "namespace": incident.namespace,
                "resource_kind": incident.resource_kind,
                "resource_name": incident.resource_name,
                "symptom": incident.symptom,
                "severity": incident.severity,
            }
        ]


@dataclass(frozen=True)
class EvidenceBundler:
    messages: RcaMessages = field(default_factory=RcaMessages)

    def build_body(self, evt: IncidentDetectedBody) -> EventBody:
        evidence = evt.evidence
        incident = evt.incident
        if evidence is None or incident is None:
            return RcaActionRequiredBody(
                reason=self.messages.missing_incident_context,
                evidence_ref=evidence.object_ref if evidence else "unknown",
                workspace_id=evt.workspace_id,
            )
        if not evt.detected:
            return RcaActionRequiredBody(
                reason=self.messages.no_incident_action_required,
                evidence_ref=evidence.object_ref,
                workspace_id=evidence.workspace_id,
            )
        return EvidenceBundleBuiltBody(
            evidence=evidence,
            incident=incident,
            evidence_bundle=build_incident_evidence_bundle(evidence, incident),
        )
