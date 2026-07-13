"""RCA test scenario SDK schema, adapter, and cross-catalog contracts."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from domains.rca.test_scenario_adapters import default_test_scenario_adapter_registry
from domains.rca.test_scenario_contract import (
    TestScenarioContractError,
    validate_scenario_adapter_contracts,
    validate_scenario_cross_contracts,
)
from domains.rca.test_scenarios import (
    CANONICAL_ROOT_CAUSES,
    TestScenarioCatalogError,
    load_test_scenario_catalog,
    validate_root_cause_coverage,
)
from packages.ai.rule_catalog import CatalogCandidateSpec, CatalogRuleSpec


def _ready_scenario():
    return next(
        scenario
        for scenario in load_test_scenario_catalog()
        if scenario.scenario_id == "image.wrong-tag"
    )


def test_root_cause_coverage_allows_multiple_scenarios_for_one_cause() -> None:
    catalog = load_test_scenario_catalog()
    extra = _ready_scenario().model_copy(update={"scenario_id": "image.wrong-tag-alternate"})

    validate_root_cause_coverage((*catalog, extra), CANONICAL_ROOT_CAUSES)


def test_root_cause_coverage_still_rejects_a_missing_canonical_cause() -> None:
    catalog = tuple(
        scenario
        for scenario in load_test_scenario_catalog()
        if scenario.expected.root_cause != "wrong_image_tag"
    )

    with pytest.raises(TestScenarioCatalogError, match="missing=.*wrong_image_tag"):
        validate_root_cause_coverage(catalog, CANONICAL_ROOT_CAUSES)


def test_catalog_loader_rejects_duplicate_scenario_ids_across_files(tmp_path: Path) -> None:
    body = _ready_scenario().model_dump(mode="json")
    for filename in ("first.yaml", "second.yaml"):
        (tmp_path / filename).write_text(
            yaml.safe_dump({"scenarios": [body]}, sort_keys=False),
            encoding="utf-8",
        )

    with pytest.raises(TestScenarioCatalogError, match="scenario_id duplicate"):
        load_test_scenario_catalog(tmp_path)


def test_only_live_completed_scenario_is_ready() -> None:
    ready_ids = {
        scenario.scenario_id
        for scenario in load_test_scenario_catalog()
        if scenario.availability == "ready"
    }

    assert ready_ids == {"image.wrong-tag"}


def test_executable_but_unverified_scenarios_are_verification_pending() -> None:
    scenarios = {scenario.scenario_id: scenario for scenario in load_test_scenario_catalog()}

    assert scenarios["image.registry-down"].availability == "verification_pending"
    assert scenarios["schedule.affinity"].availability == "verification_pending"
    assert scenarios["image.registry-down"].verification_work_needed
    assert scenarios["schedule.affinity"].verification_work_needed


def test_ready_scenarios_have_executable_trigger_fault_observe_and_cleanup() -> None:
    registry = default_test_scenario_adapter_registry()

    for scenario in load_test_scenario_catalog():
        if scenario.availability != "ready":
            continue
        adapter = registry.adapter_for(scenario)
        assert adapter.capabilities.trigger is True
        assert adapter.fixture_target_builder is not None
        assert adapter.trigger_builder is not None
        assert adapter.capabilities.observation is True
        assert adapter.observation_matcher is not None
        assert adapter.capabilities.cleanup is True
        assert adapter.cleanup_builder is not None
        assert scenario.trigger.params.fault_mode in adapter.capabilities.fault_modes
        assert set(scenario.observe.configured_predicates).issubset(
            adapter.capabilities.observation_predicates
        )


def test_ready_scenario_with_unsupported_observation_predicate_is_rejected() -> None:
    body = _ready_scenario().model_dump(mode="json")
    body["observe"] = {
        "timeout_seconds": 30,
        "poll_seconds": 1,
        "log_message_any": ["not collected by the Kubernetes snapshot adapter"],
    }
    scenario = type(_ready_scenario()).model_validate(body)

    with pytest.raises(TestScenarioContractError, match="log_message_any"):
        validate_scenario_adapter_contracts((scenario,))


def test_kubernetes_scenarios_name_the_actual_manifest_delete_cleanup() -> None:
    for scenario in load_test_scenario_catalog():
        if scenario.trigger.adapter == "kubernetes.deployment":
            assert scenario.cleanup.adapter == "kubernetes.manifest_delete"


def _cause_rule(
    *, candidate_id: str = "wrong_image_tag", evidence: tuple[str, ...] = ("kubernetes",)
):
    return CatalogRuleSpec(
        rule_id="image_pull",
        symptoms=("ImagePullBackOff",),
        required_sources=("kubernetes",),
        candidates=(
            CatalogCandidateSpec(
                candidate_id=candidate_id,
                title="candidate",
                description="candidate description",
                expected_evidence=evidence,
                checks=("check",),
                signals=(),
            ),
        ),
    )


def test_ready_scenario_cross_contract_accepts_matching_cause_evidence_and_recovery() -> None:
    validate_scenario_cross_contracts(
        (_ready_scenario(),),
        cause_rules=(_cause_rule(),),
        recovery_root_causes=frozenset({"wrong_image_tag"}),
    )


@pytest.mark.parametrize(
    ("cause_rules", "recovery_roots", "message"),
    [
        ((_cause_rule(candidate_id="registry_unavailable"),), {"wrong_image_tag"}, "candidate"),
        ((_cause_rule(evidence=("kubernetes", "logs")),), {"wrong_image_tag"}, "evidence"),
        ((_cause_rule(),), {"registry_unavailable"}, "recovery"),
    ],
)
def test_ready_scenario_cross_contract_rejects_catalog_mismatches(
    cause_rules: tuple[CatalogRuleSpec, ...],
    recovery_roots: set[str],
    message: str,
) -> None:
    with pytest.raises(TestScenarioContractError, match=message):
        validate_scenario_cross_contracts(
            (_ready_scenario(),),
            cause_rules=cause_rules,
            recovery_root_causes=frozenset(recovery_roots),
        )


def test_kubernetes_adapter_manifest_and_matcher_are_deterministic() -> None:
    registry = default_test_scenario_adapter_registry()
    scenario = _ready_scenario()
    adapter = registry.adapter_for(scenario)
    run_id = "72b5f320-46e9-4db8-90ad-423f7542e13e"
    expires_at = "2026-07-10T23:59:59+00:00"

    first = adapter.build_trigger(scenario, run_id, expires_at)
    second = adapter.build_trigger(scenario, run_id, expires_at)
    assert first == second

    snapshot = {
        "pods": [
            {
                "name": "rca-test-image-wrong-tag-pod",
                "labels": {"kubeheal.io/rca-test-run": run_id},
                "waiting_reasons": ["ImagePullBackOff"],
                "terminated_reasons": [],
            }
        ],
        "events": [
            {
                "involved_name": "rca-test-image-wrong-tag-pod",
                "reason": "Failed",
                "message": "manifest unknown: image not found",
            }
        ],
    }
    assert adapter.matches_observation(scenario, snapshot, run_id) is True
    assert adapter.matches_observation(scenario, snapshot, run_id) is True

    cleanup = adapter.build_cleanup("sandbox", "rca-test-image-wrong-tag")
    assert cleanup.adapter == "kubernetes.manifest_delete"
    assert [resource.kind for resource in cleanup.resources] == ["Service", "Deployment"]
