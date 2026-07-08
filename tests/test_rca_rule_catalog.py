"""RCA 룰 카탈로그(YAML) 테스트 — 하드코딩 룰 세트와의 동작 동등성 + 로더 계약."""

from __future__ import annotations

import asyncio
from pathlib import Path
from textwrap import dedent
from types import SimpleNamespace

import pytest

from domains.rca.events import (
    CAUSE_CANDIDATE_SOURCE_RULE,
    EvidenceBundle,
    EvidenceItem,
    IncidentRecord,
)
from domains.rca.router import validate_rca_rule_catalog
from packages.contracts.gateway.requests import RcaRuleValidateRequest
from services.ai.agent.causes.engine import evaluate_causes, plan_causes, required_evidence_sources
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


# 현재 RCA 룰 카탈로그의 plan_causes 계약 스냅샷 —
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
    "GitOps Sync Failed": (
        ["gitops_sync_failed", "manifest_validation_failed"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "Sync Failed": (
        ["gitops_sync_failed", "manifest_validation_failed"],
        ["kubernetes", "metrics", "logs", "metadata"],
    ),
    "ImagePullBackOff": (
        ["wrong_image_tag", "missing_image_pull_secret", "registry_unavailable"],
        ["kubernetes"],
    ),
    "ErrImagePull": (
        ["wrong_image_tag", "missing_image_pull_secret", "registry_unavailable"],
        ["kubernetes"],
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
        ["upstream_unavailable", "backend_readiness_failure", "application_5xx_spike"],
        ["kubernetes", "metrics", "logs"],
    ),
    "FailedScheduling": (
        [
            "insufficient_cpu",
            "insufficient_memory",
            "node_affinity_or_taint_mismatch",
            "pvc_pending",
        ],
        ["kubernetes"],
    ),
    "Pending": (
        [
            "insufficient_cpu",
            "insufficient_memory",
            "node_affinity_or_taint_mismatch",
            "pvc_pending",
        ],
        ["kubernetes"],
    ),
    "Secret not found": (
        ["missing_secret_reference", "secret_key_missing"],
        ["kubernetes", "logs", "metadata"],
    ),
}


def test_catalog_rules_match_previous_hardcoded_plan_snapshot() -> None:
    """(a) 계약 스냅샷 — YAML 카탈로그가 현재 룰 계획을 유지해야 한다."""
    for symptom, (expected_candidates, expected_sources) in EXPECTED_RULE_SNAPSHOT.items():
        plan = plan_for(symptom)

        assert plan.rule_missing is None, symptom
        assert [c.candidate_id for c in plan.candidates] == expected_candidates, symptom
        assert required_evidence_sources(incident_for(symptom)) == expected_sources, symptom
        assert all(c.source == CAUSE_CANDIDATE_SOURCE_RULE for c in plan.candidates), symptom


def test_rca_rule_validate_route_returns_candidate_summary() -> None:
    yaml_text = dedent(
        """
        rules:
          - id: "custom_dns"
            symptoms: ["DNS lookup failed"]
            required_sources: ["kubernetes", "logs"]
            candidates:
              - candidate_id: "service_dns_resolution_failure"
                title: "서비스 DNS 실패"
                description: "서비스 이름 해석이 실패했습니다."
                expected_evidence: ["kubernetes", "logs"]
                checks:
                  - "CoreDNS 이벤트 확인"
        """
    )

    response = asyncio.run(
        validate_rca_rule_catalog(
            RcaRuleValidateRequest(yaml_text=yaml_text),
            SimpleNamespace(user_id="user-1", workspace_id="workspace-1"),
        )
    )

    assert response.valid is True
    assert response.matched_symptom == "DNS lookup failed"
    assert response.candidates_count == 1


def test_rca_rule_validate_route_reports_schema_errors() -> None:
    response = asyncio.run(
        validate_rca_rule_catalog(
            RcaRuleValidateRequest(yaml_text="rules:\n  - id: broken\n"),
            SimpleNamespace(user_id="user-1", workspace_id="workspace-1"),
        )
    )

    assert response.valid is False
    assert response.errors[0].code == "schema_error"


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


def evidence_item(source: str, value: dict) -> EvidenceItem:
    return EvidenceItem(source=source, name=f"{source}_item", value=value, summary=f"{source} 근거")


def crashloop_bundle(*, log_lines: list[str], pods: list[dict]) -> EvidenceBundle:
    return EvidenceBundle(
        incident_id="inc-catalog",
        items=[
            evidence_item("kubernetes", {"pods": pods, "events": []}),
            evidence_item("metrics", {"memory": "near-limit"}),
            evidence_item("logs", {"entries": [{"line": line} for line in log_lines]}),
        ],
        missing_evidence=[],
        complete=True,
    )


def crashloop_pod(**overrides: object) -> dict:
    base: dict = {
        "name": "checkout-api-1",
        "namespace": "sandbox",
        "waiting_reasons": ["CrashLoopBackOff"],
        "terminated_reasons": [],
        "containers": [],
    }
    base.update(overrides)
    return base


def evaluations_by_id(bundle: EvidenceBundle) -> dict:
    plan = plan_for("CrashLoopBackOff")
    return {e.candidate_id: e for e in evaluate_causes(plan.candidates, bundle)}


def test_oom_killed_requires_positive_oom_evidence_for_full_score() -> None:
    """exit 1 크래시(OOM 신호 없음) — oom_killed 는 1.0 불가 + signal 누락 토큰을 남긴다."""
    bundle = crashloop_bundle(
        log_lines=["FATAL: required environment variable DATABASE_URL is not set"],
        pods=[crashloop_pod()],
    )

    by_id = evaluations_by_id(bundle)

    assert by_id["oom_killed"].score < 1.0
    assert "signal:oom_evidence" in by_id["oom_killed"].missing_evidence
    assert by_id["config_env_error"].score == 1.0
    assert by_id["config_env_error"].missing_evidence == []


def test_oom_killed_reaches_full_score_with_terminated_reason() -> None:
    """terminated_reasons=OOMKilled 관측 시 oom_killed 가 1.0 으로 완결 가능하다."""
    bundle = crashloop_bundle(
        log_lines=["container restarted"],
        pods=[crashloop_pod(terminated_reasons=["OOMKilled"])],
    )

    by_id = evaluations_by_id(bundle)

    assert by_id["oom_killed"].score == 1.0
    assert by_id["oom_killed"].missing_evidence == []


def test_oom_killed_reaches_full_score_with_exit_code_137() -> None:
    """직전 컨테이너 종료 코드 137(lastState)도 양성 OOM 근거로 인정된다."""
    bundle = crashloop_bundle(
        log_lines=["container restarted"],
        pods=[
            crashloop_pod(
                containers=[{"name": "app", "last_state": "terminated", "last_exit_code": 137}]
            )
        ],
    )

    by_id = evaluations_by_id(bundle)

    assert by_id["oom_killed"].score == 1.0


def test_non_oom_exit_code_supports_app_startup_failure() -> None:
    """exit 1(non_oom fact) + FATAL 로그는 app_startup_failure 를 1.0 으로 만든다."""
    bundle = crashloop_bundle(
        log_lines=["FATAL: boom during boot"],
        pods=[
            crashloop_pod(
                containers=[{"name": "app", "last_state": "terminated", "last_exit_code": 1}]
            )
        ],
    )

    by_id = evaluations_by_id(bundle)

    assert by_id["app_startup_failure"].score == 1.0
    assert by_id["oom_killed"].score < 1.0


def test_no_candidate_gets_full_score_without_distinguishing_evidence() -> None:
    """판별 신호가 전혀 없는 근거(소스만 존재)로는 어떤 crashloop 후보도 1.0 이 될 수 없다."""
    bundle = crashloop_bundle(log_lines=["container restarted"], pods=[crashloop_pod()])

    by_id = evaluations_by_id(bundle)

    assert all(evaluation.score < 1.0 for evaluation in by_id.values())
    assert all(evaluation.missing_evidence for evaluation in by_id.values())


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


SIGNAL_RULE_YAML = dedent(
    """\
    rules:
      - id: "node_disk_pressure"
        symptoms: ["NodeDiskPressure"]
        required_sources: ["kubernetes"]
        candidates:
          - candidate_id: "disk_full"
            title: "노드 디스크 포화"
            description: "노드 디스크가 가득 차 파드가 축출됐을 가능성이 있습니다."
            expected_evidence: ["kubernetes"]
            checks:
              - "Node.status.conditions DiskPressure 확인"
            signals:
              - id: "disk_pressure_event"
                any_of:
                  - fact: "event_reason=Evicted"
                  - event_pattern: "disk pressure"
    """
)


def test_yaml_signals_load_into_candidate(tmp_path: Path) -> None:
    """signals 블록이 스키마 검증을 거쳐 후보의 판별 신호로 로딩된다."""
    (tmp_path / "node_disk.yaml").write_text(SIGNAL_RULE_YAML, encoding="utf-8")

    profiles = load_catalog_profiles(tmp_path)
    plan = plan_causes(
        incident_for("NodeDiskPressure"),
        empty_bundle(),
        "object://evidence/catalog.json",
        rules=cause_rules(profiles=profiles),
    )

    assert plan.candidates[0].signals == [
        {
            "id": "disk_pressure_event",
            "any_of": [{"fact": "event_reason=Evicted"}, {"event_pattern": "disk pressure"}],
        }
    ]


def test_signal_matcher_with_multiple_keys_fails_at_startup(tmp_path: Path) -> None:
    """matcher 는 fact/log_pattern/event_pattern 중 정확히 하나 — 위반 시 기동 실패."""
    broken = SIGNAL_RULE_YAML.replace(
        '- fact: "event_reason=Evicted"',
        '- {fact: "event_reason=Evicted", log_pattern: "disk"}',
    )
    (tmp_path / "broken_signal.yaml").write_text(broken, encoding="utf-8")

    with pytest.raises(CauseCatalogError, match="RCA 룰 카탈로그 스키마 위반: broken_signal.yaml"):
        load_catalog_profiles(tmp_path)


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
