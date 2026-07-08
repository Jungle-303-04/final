from __future__ import annotations

import json
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
from services.ai.agent.pipeline.evidence_bundle import (
    build_incident_evidence_bundle,
    compact_evidence_reference,
)
from services.ai.agent.pipeline.symptom import (
    SYMPTOM_INGRESS_5XX,
    UNKNOWN_SYMPTOM,
    derive_symptom,
    resolve_resource,
)

SANDBOX_NAMESPACE = "sandbox"
APPLICATION_5XX_SIGNAL = "Application5xx"
APPLICATION_TIMEOUT_SIGNAL = "ApplicationTimeout"
APP_5XX_FIELDS = ("status", "status_code", "upstream_status")
APP_5XX_TEXT_PATTERNS = (
    'upstream_status":500',
    'upstream_status": 500',
    'upstream_status":502',
    'upstream_status": 502',
    'upstream_status":503',
    'upstream_status": 503',
    'upstream_status":504',
    'upstream_status": 504',
    'status":500',
    'status": 500',
    'status":502',
    'status": 502',
    'status":503',
    'status": 503',
    'status":504',
    'status": 504',
    "/api/orders/error",
)
APP_TIMEOUT_TEXT_PATTERNS = (
    "dependency_timeout",
    "dependency call timed out",
    "timeout",
)


@dataclass(frozen=True)
class LogIncidentSignal:
    signal: str
    symptom: str
    resource_kind: str
    resource_name: str
    namespace: str | None


@dataclass(frozen=True)
class IncidentDetector:
    messages: IncidentMessages = field(default_factory=IncidentMessages)

    def detect_body(self, evidence: Evidence, correlation_id: str) -> IncidentDetectedBody:
        incident = self.classify(evidence, correlation_id)
        detected = self.has_signal(evidence)
        if not detected:
            return IncidentDetectedBody(
                cluster_id=evidence.cluster_id,
                detected=False,
                reason=self.messages.not_detected_reason,
                workspace_id=evidence.workspace_id,
                severity=None,
                affected=[],
                evidence=compact_evidence_reference(evidence),
                incident=None,
            )
        return IncidentDetectedBody(
            cluster_id=evidence.cluster_id,
            detected=True,
            reason=self.messages.detected_reason,
            workspace_id=evidence.workspace_id,
            severity=incident.severity,
            affected=self.affected_resources(incident),
            evidence=compact_evidence_reference(evidence),
            incident=incident,
        )

    def has_signal(self, evidence: Evidence) -> bool:
        derived = derive_symptom(evidence.kubernetes)
        if derived.signal is not None or derived.symptom != UNKNOWN_SYMPTOM:
            return True
        if derive_log_incident_signal(evidence.logs) is not None:
            return True

        # Alertmanager webhook evidence arrives through metrics, not the Kubernetes
        # snapshot. Keep firing alert groups incident-worthy without treating every
        # normal metrics sample as an incident.
        alertmanager = (
            evidence.metrics.get("alertmanager") if isinstance(evidence.metrics, dict) else None
        )
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
        log_signal = None
        if derived.signal is None and derived.symptom == UNKNOWN_SYMPTOM:
            log_signal = derive_log_incident_signal(evidence.logs)
        if log_signal is not None:
            resource_kind = log_signal.resource_kind
            resource_name = log_signal.resource_name
            namespace = log_signal.namespace
            symptom = log_signal.symptom
            secondary_symptoms = [log_signal.signal]
        else:
            resource_kind, resource_name, namespace = resolve_resource(
                evidence.kubernetes, derived.signal
            )
            symptom = derived.symptom
            secondary_symptoms = derived.secondary_symptoms
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
            secondary_symptoms=secondary_symptoms,
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


def derive_log_incident_signal(logs: list[JsonObject]) -> LogIncidentSignal | None:
    for sample in iter_log_samples(logs):
        parsed = parse_json_line(sample["line"])
        if has_5xx_status(parsed, sample["line"]):
            return LogIncidentSignal(
                signal=APPLICATION_5XX_SIGNAL,
                symptom=SYMPTOM_INGRESS_5XX,
                resource_kind="Deployment",
                resource_name=resource_name_for_log_sample(sample, parsed),
                namespace=sample.get("namespace") or SANDBOX_NAMESPACE,
            )
        if has_timeout_signal(parsed, sample["line"]):
            return LogIncidentSignal(
                signal=APPLICATION_TIMEOUT_SIGNAL,
                symptom=SYMPTOM_INGRESS_5XX,
                resource_kind="Deployment",
                resource_name=resource_name_for_log_sample(sample, parsed),
                namespace=sample.get("namespace") or SANDBOX_NAMESPACE,
            )
    return None


def iter_log_samples(logs: list[JsonObject]) -> list[JsonObject]:
    samples: list[JsonObject] = []
    for entry in logs:
        if not isinstance(entry, dict):
            continue
        entry_namespace = namespace_from_query(entry.get("query"))
        line = entry.get("line")
        if isinstance(line, str) and should_consider_log_namespace(entry_namespace):
            samples.append(
                {"namespace": entry_namespace, "container": entry.get("container"), "line": line}
            )
        for stream in dict_items(entry.get("streams")):
            stream_labels = stream.get("stream")
            labels = stream_labels if isinstance(stream_labels, dict) else {}
            namespace = str(labels.get("k8s_namespace_name") or entry_namespace or "")
            if not should_consider_log_namespace(namespace):
                continue
            container = str(
                labels.get("k8s_container_name")
                or labels.get("container")
                or labels.get("app")
                or ""
            )
            for value in dict_items(stream.get("values")):
                stream_line = value.get("line")
                if isinstance(stream_line, str) and stream_line:
                    samples.append(
                        {"namespace": namespace, "container": container, "line": stream_line}
                    )
    return samples


def should_consider_log_namespace(namespace: object) -> bool:
    return namespace in (None, "", SANDBOX_NAMESPACE)


def namespace_from_query(query: object) -> str | None:
    if not isinstance(query, str):
        return None
    marker = 'k8s_namespace_name="'
    if marker not in query:
        return None
    return query.split(marker, 1)[1].split('"', 1)[0]


def parse_json_line(line: str) -> JsonObject:
    try:
        value = json.loads(line)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def has_5xx_status(parsed: JsonObject, line: str) -> bool:
    for status_field in APP_5XX_FIELDS:
        if is_5xx(parsed.get(status_field)):
            return True
    normalized = line.casefold()
    return any(pattern in normalized for pattern in APP_5XX_TEXT_PATTERNS)


def has_timeout_signal(parsed: JsonObject, line: str) -> bool:
    event = str(parsed.get("event") or "").casefold()
    message = str(parsed.get("message") or "").casefold()
    combined = f"{event} {message} {line.casefold()}"
    return any(pattern in combined for pattern in APP_TIMEOUT_TEXT_PATTERNS)


def is_5xx(value: object) -> bool:
    if isinstance(value, bool) or value is None:
        return False
    try:
        status = int(value)
    except (TypeError, ValueError):
        return False
    return 500 <= status <= 599


def resource_name_for_log_sample(sample: JsonObject, parsed: JsonObject) -> str:
    service = str(parsed.get("service") or "").strip()
    if service:
        return service
    container = str(sample.get("container") or "").strip()
    return container or "sandbox-workload"


def dict_items(value: object) -> list[JsonObject]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


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
            evidence=compact_evidence_reference(evidence),
            incident=incident,
            evidence_bundle=build_incident_evidence_bundle(evidence, incident),
        )
