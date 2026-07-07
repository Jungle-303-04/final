from __future__ import annotations

from domains.rca.events import (
    ClusterEvidenceReceivedBody,
    Evidence,
    EvidenceBundle,
    EvidenceItem,
    IncidentRecord,
    MissingEvidenceCheck,
)
from services.ai.agent.causes.engine import required_evidence_sources
from services.ai.agent.pipeline.symptom import derive_symptom, resolve_resource

EvidenceSource = ClusterEvidenceReceivedBody | Evidence


def extract_resource(kubernetes: dict) -> tuple[str, str, str | None]:
    # incident 분류(pipeline/incident.py)와 같은 규칙 — 명시 resource > 유도 신호의 리소스.
    return resolve_resource(kubernetes, derive_symptom(kubernetes).signal)


def extract_symptom(kubernetes: dict) -> str:
    # incident 분류와 같은 규칙 — 명시 symptom > snapshot 신호 유도 > "unknown".
    return derive_symptom(kubernetes).symptom


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
        missing_evidence_checks=missing_source_checks(missing_evidence),
    )


def evidence_ref_for(evt: EvidenceSource, source: str, name: str) -> str:
    if isinstance(evt, Evidence):
        base_ref = evt.object_ref
    else:
        base_ref = evt.evidence_key or f"cluster:{evt.workspace_id}:{evt.cluster_id}"
    return f"{base_ref}#{source}:{name}"


def source_check_id(source: str, name: str) -> str:
    return f"evidence:{source}:{name}"


def source_query(source: str, name: str) -> str:
    return f"{source}.{name}"


def evidence_item(
    evt: EvidenceSource,
    *,
    source: str,
    name: str,
    value: dict,
    summary: str,
) -> EvidenceItem:
    return EvidenceItem(
        source=source,
        name=name,
        value=value,
        summary=summary,
        evidence_ref=evidence_ref_for(evt, source, name),
        check_id=source_check_id(source, name),
        query=source_query(source, name),
    )


def missing_source_checks(missing_evidence: list[str]) -> list[MissingEvidenceCheck]:
    return [
        MissingEvidenceCheck(
            check_id=f"evidence:{source}:required",
            source=source,
            status="missing",
            reason=f"{source} evidence query/check must complete before RCA can be finalized.",
        )
        for source in missing_evidence
    ]


# Loki 정규화 payload 의 stream 라벨 중 네임스페이스로 인정하는 키.
LOG_STREAM_NAMESPACE_LABELS = ("k8s_namespace_name", "namespace")


def select_incident_log_entries(
    logs: list[dict],
    namespace: str | None,
) -> list[dict]:
    """incident 네임스페이스의 로그만 근거로 채택한다(다른 네임스페이스 노이즈 제외).

    에이전트 정책의 로그 쿼리는 네임스페이스별로 여러 개(target/sandbox) 실행되는데,
    RCA 근거·판별 신호에는 incident 리소스가 속한 네임스페이스의 로그만 의미가 있다.
    (예: sandbox 워크로드 장애 리포트에 target 네임스페이스 loki 자체 ERROR 로그가
    섞여 들어가던 문제.) 판정 규칙:
    - Loki 정규화 entry(streams 보유): 네임스페이스 라벨이 incident 와 일치하는 stream 만
      남기고, 남는 stream 이 없으면 entry 자체를 제외한다. 라벨이 없는 stream 은
      귀속 불가라 보수적으로 유지한다.
    - streams 가 없는 entry(단순 {"line": ...} fixture/webhook 형태): 귀속 불가 → 유지.
    - incident 네임스페이스를 모르면 필터하지 않는다.

    참고: 여기서 걸러도 원본 `Evidence.logs`(수집 원문)에는 전체 네임스페이스 로그가
    남는다. 리포트가 소비하는 근거 번들(evidence_bundle)만 정제하는 최소 수정이며,
    수집 시점 분리(incident 별 로그 쿼리 실행)는 evidence 수집 파이프라인 후속 과제다.
    """
    if not namespace:
        return list(logs)
    selected: list[dict] = []
    for entry in logs:
        if not isinstance(entry, dict):
            continue
        streams = entry.get("streams")
        if not isinstance(streams, list):
            selected.append(entry)
            continue
        kept = [
            stream
            for stream in streams
            if isinstance(stream, dict) and stream_matches_namespace(stream, namespace)
        ]
        if not kept:
            continue
        selected.append(
            {
                **entry,
                "streams": kept,
                "line_count": sum(len(stream.get("values") or []) for stream in kept),
            }
        )
    return selected


def stream_matches_namespace(stream: dict, namespace: str) -> bool:
    labels = stream.get("stream")
    if not isinstance(labels, dict):
        return True  # 라벨 없음 → 귀속 불가, 보수적으로 유지
    for key in LOG_STREAM_NAMESPACE_LABELS:
        value = labels.get(key)
        if value is not None:
            return str(value) == namespace
    return True


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
            evidence_item(
                evt,
                source="kubernetes",
                name="cluster_resource_state",
                value=evt.kubernetes,
                summary=f"{target_summary} Kubernetes 상태 근거입니다.",
            )
        )
    if evt.metrics:
        items.append(
            evidence_item(
                evt,
                source="metrics",
                name="telemetry_metrics",
                value=evt.metrics,
                summary=f"{target_summary} Metric snapshot 근거입니다.",
            )
        )
    log_entries = select_incident_log_entries(evt.logs, namespace)
    if log_entries:
        items.append(
            evidence_item(
                evt,
                source="logs",
                name="related_logs",
                value={"entries": log_entries},
                summary=f"{target_summary} Log tail 근거입니다.",
            )
        )
    if evt.traces:
        items.append(
            evidence_item(
                evt,
                source="traces",
                name="related_traces",
                value=evt.traces,
                summary=f"{target_summary} Trace 근거입니다.",
            )
        )
    return items
