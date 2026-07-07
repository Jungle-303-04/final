"""RCA 룰 카탈로그(YAML) 테스트 — 하드코딩 룰 세트와의 동작 동등성 + 로더 계약."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest

from domains.rca.events import CAUSE_CANDIDATE_SOURCE_RULE, EvidenceBundle, IncidentRecord
from services.ai.agent.causes.engine import plan_causes, required_evidence_sources
from services.ai.agent.causes.loader import (
    CauseCatalogError,
    load_catalog_profiles,
    register_catalog_profiles,
)
from services.ai.agent.playbooks.cause import (
    CAUSE_PROFILES,
    cause_rules,
    evidence_rules,
    registered_cause_profiles,
)


def incident_for(symptom: str) -> IncidentRecord:
    return IncidentRecord(
        incident_id="inc-catalog",
        cluster_id="target-cluster-01",
        resource_kind="deployment",
        resource_name="checkout-api",
        namespace="sandbox",
        symptom=symptom,
        severity="high",
        first_seen_at=None,
        summary=f"deployment checkout-api has {symptom}",
        workspace_id="workspace-1",
    )


def empty_bundle() -> EvidenceBundle:
    return EvidenceBundle(
        incident_id="inc-catalog",
        items=[],
        missing_evidence=[],
        complete=True,
    )


def plan_for(symptom: str):
    return plan_causes(incident_for(symptom), empty_bundle(), "object://evidence/catalog.json")


# 카탈로그 전환 이전(하드코딩 python 모듈) 룰 세트의 plan_causes 스냅샷 —
# 증상 → (후보 id 순서, required_evidence_sources). 카탈로그가 이 표와 다르면 회귀다.
EXPECTED_RULE_SNAPSHOT: dict[str, tuple[list[str], list[str]]] = {
    "CrashLoopBackOff": (
        [
            "oom_killed",
            "bad_image_rollout",
            "config_env_error",
            "app_startup_failure",
            "dependency_connection_failure",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "pod_restart_loop": (
        [
            "oom_killed",
            "bad_image_rollout",
            "config_env_error",
            "app_startup_failure",
            "dependency_connection_failure",
        ],
        ["kubernetes", "metrics", "logs"],
    ),
    "DB connection failed": (
        ["database_connectivity_failure", "database_credential_or_config_error"],
        ["kubernetes", "metrics", "logs", "traces", "metadata"],
    ),
    "ProgressDeadlineExceeded": (
        ["deployment_progress_deadline_exceeded", "replica_unavailable_after_rollout"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "Rollout failed": (
        ["deployment_progress_deadline_exceeded", "replica_unavailable_after_rollout"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "ArgoCD Sync Failed": (
        ["gitops_sync_failed", "manifest_validation_failed"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "Sync Failed": (
        ["gitops_sync_failed", "manifest_validation_failed"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "ImagePullBackOff": (
        ["wrong_image_tag", "missing_image_pull_secret", "registry_unavailable"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "ErrImagePull": (
        ["wrong_image_tag", "missing_image_pull_secret", "registry_unavailable"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "DNS lookup failed": (
        ["service_dns_resolution_failure"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "Connection timeout": (
        ["network_path_timeout"],
        ["kubernetes", "metrics", "logs", "traces", "metadata"],
    ),
    "Ingress 502/503": (
        ["upstream_unavailable", "backend_readiness_failure"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "FailedScheduling": (
        [
            "insufficient_cpu",
            "insufficient_memory",
            "node_affinity_or_taint_mismatch",
            "pvc_pending",
        ],
        ["kubernetes", "metrics", "metadata"],
    ),
    "Pending": (
        [
            "insufficient_cpu",
            "insufficient_memory",
            "node_affinity_or_taint_mismatch",
            "pvc_pending",
        ],
        ["kubernetes", "metrics", "metadata"],
    ),
    "Secret not found": (
        ["missing_secret_reference", "secret_key_missing"],
        ["kubernetes", "logs", "metadata"],
    ),
}


def test_catalog_rules_match_previous_hardcoded_plan_snapshot() -> None:
    """(a) 동등성 스냅샷 — YAML 카탈로그가 하드코딩 룰 세트와 동일한 계획을 내야 한다."""
    for symptom, (expected_candidates, expected_sources) in EXPECTED_RULE_SNAPSHOT.items():
        plan = plan_for(symptom)

        assert plan.rule_missing is None, symptom
        assert [c.candidate_id for c in plan.candidates] == expected_candidates, symptom
        assert required_evidence_sources(incident_for(symptom)) == expected_sources, symptom
        assert all(c.source == CAUSE_CANDIDATE_SOURCE_RULE for c in plan.candidates), symptom


def test_catalog_oom_killed_candidate_keeps_full_field_parity() -> None:
    """대표 후보(oom_killed)의 전체 필드가 하드코딩 시절 원문과 동일해야 한다."""
    plan = plan_for("CrashLoopBackOff")
    oom = plan.candidates[0]

    assert oom.candidate_id == "oom_killed"
    assert oom.title == "컨테이너 OOMKilled"
    assert oom.description == "컨테이너가 메모리 제한을 초과해 재시작됐을 가능성이 있습니다."
    assert oom.expected_evidence == ["kubernetes", "metrics", "logs"]
    assert oom.checks == [
        "containerStatuses.lastState.terminated.reason == OOMKilled 확인",
        "restartCount 증가와 memory usage가 limit 근처인지 확인",
        "로그에 out of memory, heap, allocation failure 흔적 확인",
    ]


def test_unmatched_symptom_still_reports_rule_missing() -> None:
    plan = plan_for("UnmappedSymptom")

    assert plan.candidates == []
    assert plan.rule_missing is not None
    assert plan.rule_missing.message == "정의된 RCA rule 없음"


NEW_RULE_YAML = dedent(
    """\
    rules:
      - id: "node_not_ready"
        symptoms: ["NodeNotReady"]
        required_sources: ["kubernetes", "metrics"]
        candidates:
          - candidate_id: "kubelet_down"
            title: "kubelet 중단"
            description: "노드 kubelet 프로세스가 중단되어 NodeNotReady 가 됐을 가능성이 있습니다."
            expected_evidence: ["kubernetes", "metrics"]
            checks:
              - "Node.status.conditions Ready=False reason 확인"
              - "kubelet process/heartbeat metric 확인"
    """
)


def test_new_yaml_only_rule_becomes_active(tmp_path: Path) -> None:
    """(b) YAML 파일만 추가하면(코드 수정 없이) 새 룰이 활성화되어야 한다."""
    (tmp_path / "node.yaml").write_text(NEW_RULE_YAML, encoding="utf-8")

    profiles = load_catalog_profiles(tmp_path)
    plan = plan_causes(
        incident_for("NodeNotReady"),
        empty_bundle(),
        "object://evidence/catalog.json",
        rules=cause_rules(profiles=profiles),
    )

    assert plan.rule_missing is None
    assert [c.candidate_id for c in plan.candidates] == ["kubelet_down"]
    assert required_evidence_sources(
        incident_for("NodeNotReady"), rules=evidence_rules(profiles=profiles)
    ) == ["kubernetes", "metrics"]


def test_malformed_yaml_raises_clear_startup_error(tmp_path: Path) -> None:
    """(c) 깨진 YAML 은 기동 시점에 한국어 오류로 즉시 실패해야 한다."""
    (tmp_path / "broken.yaml").write_text("rules: [", encoding="utf-8")

    with pytest.raises(CauseCatalogError, match="RCA 룰 카탈로그 YAML 파싱 실패: broken.yaml"):
        load_catalog_profiles(tmp_path)


def test_schema_violation_raises_clear_startup_error(tmp_path: Path) -> None:
    """(c) 스키마 위반(필수 필드 누락)도 한국어 오류로 즉시 실패해야 한다."""
    (tmp_path / "invalid.yaml").write_text(
        dedent(
            """\
            rules:
              - id: "no_symptoms"
                required_sources: ["kubernetes"]
                candidates: []
            """
        ),
        encoding="utf-8",
    )

    with pytest.raises(CauseCatalogError, match="RCA 룰 카탈로그 스키마 위반: invalid.yaml"):
        load_catalog_profiles(tmp_path)


def test_duplicate_rule_id_within_catalog_raises(tmp_path: Path) -> None:
    """(d) 카탈로그 안에서 rule id 가 중복되면 실패해야 한다."""
    (tmp_path / "a.yaml").write_text(NEW_RULE_YAML, encoding="utf-8")
    (tmp_path / "b.yaml").write_text(NEW_RULE_YAML, encoding="utf-8")

    with pytest.raises(CauseCatalogError, match="RCA 룰 id 중복: 'node_not_ready'"):
        load_catalog_profiles(tmp_path)


def test_duplicate_rule_id_against_registered_rules_raises(tmp_path: Path) -> None:
    """(d) 이미 등록된 룰과 같은 id 의 YAML 룰은 병합 시점에 실패해야 한다."""
    registered_cause_profiles()  # 내장 카탈로그 등록 보장
    (tmp_path / "dup.yaml").write_text(
        NEW_RULE_YAML.replace("node_not_ready", "crashloop_backoff"), encoding="utf-8"
    )
    before = len(CAUSE_PROFILES)

    with pytest.raises(CauseCatalogError, match="RCA 룰 id 중복: 'crashloop_backoff'"):
        register_catalog_profiles(tmp_path)

    assert len(CAUSE_PROFILES) == before  # 실패 시 레지스트리가 오염되지 않아야 한다
