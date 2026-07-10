"""Validation contracts composed around the RCA test scenario schema."""

from __future__ import annotations

from pathlib import Path

from domains.rca.test_scenario_adapters import (
    TestScenarioAdapterError,
    TestScenarioAdapterRegistry,
    default_test_scenario_adapter_registry,
)
from domains.rca.test_scenarios import RcaTestScenario, load_test_scenario_catalog
from packages.ai.rule_catalog import CatalogRuleSpec


class TestScenarioContractError(RuntimeError):
    """One or more scenario execution or cross-catalog contracts are invalid."""

    __test__ = False


def validate_scenario_adapter_contracts(
    scenarios: tuple[RcaTestScenario, ...],
    registry: TestScenarioAdapterRegistry | None = None,
) -> None:
    adapters = registry or default_test_scenario_adapter_registry()
    errors: list[str] = []
    for scenario in scenarios:
        try:
            adapter = adapters.adapter_for(scenario)
        except TestScenarioAdapterError as exc:
            errors.append(f"{scenario.scenario_id}: {exc}")
            continue
        if scenario.availability != "ready":
            continue
        capabilities = adapter.capabilities
        fault_mode = str(getattr(scenario.trigger.params, "fault_mode", ""))
        if not capabilities.trigger or fault_mode not in capabilities.fault_modes:
            errors.append(f"{scenario.scenario_id}: trigger/fault is not executable ({fault_mode})")
        if not capabilities.observation:
            errors.append(f"{scenario.scenario_id}: observation is not executable")
        unsupported = sorted(
            set(scenario.observe.configured_predicates) - capabilities.observation_predicates
        )
        if unsupported:
            errors.append(
                f"{scenario.scenario_id}: unsupported observation predicates: "
                f"{', '.join(unsupported)}"
            )
        if not capabilities.cleanup:
            errors.append(f"{scenario.scenario_id}: cleanup is not executable")
    if errors:
        raise TestScenarioContractError(
            "RCA test scenario adapter contract invalid: " + "; ".join(errors)
        )


def validate_test_scenario_catalog(catalog_dir: Path | None = None) -> None:
    scenarios = load_test_scenario_catalog(catalog_dir)
    validate_scenario_adapter_contracts(scenarios)


def validate_scenario_cross_contracts(
    scenarios: tuple[RcaTestScenario, ...],
    *,
    cause_rules: tuple[CatalogRuleSpec, ...],
    recovery_root_causes: frozenset[str],
) -> None:
    errors: list[str] = []
    for scenario in scenarios:
        if scenario.availability != "ready":
            continue
        candidates = [
            candidate
            for rule in cause_rules
            if scenario.expected.symptom in rule.symptoms
            for candidate in rule.candidates
            if candidate.candidate_id == scenario.expected.root_cause
        ]
        if not candidates:
            errors.append(
                f"{scenario.scenario_id}: expected root candidate is absent for symptom "
                f"{scenario.expected.symptom}"
            )
            continue
        expected_evidence = {
            source for candidate in candidates for source in candidate.expected_evidence
        }
        missing_evidence = sorted(expected_evidence - set(scenario.evidence_sources))
        if missing_evidence:
            errors.append(
                f"{scenario.scenario_id}: evidence sources do not cover candidate evidence: "
                f"{', '.join(missing_evidence)}"
            )
        if (
            scenario.expected.root_cause not in recovery_root_causes
            and "*" not in recovery_root_causes
        ):
            errors.append(
                f"{scenario.scenario_id}: recovery coverage is missing for "
                f"{scenario.expected.root_cause}"
            )
    if errors:
        raise TestScenarioContractError(
            "RCA test scenario cross-contract invalid: " + "; ".join(errors)
        )
