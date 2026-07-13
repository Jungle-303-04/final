from __future__ import annotations

import json
import runpy
import subprocess
import sys

import pytest
from conftest import ROOT

SCORER = ROOT / "benchmark" / "score.py"
CONTRACTS = ROOT / "benchmark" / "candidate-contracts.json"
FIRST_CANDIDATE_BATCH = (
    "metrics_server_unavailable",
    "missing_resource_requests",
    "max_replica_limit_reached",
    "oom_killed",
    "bad_image_rollout",
    "config_env_error",
    "app_port_bind_failed",
    "permission_denied_startup",
    "app_startup_failure",
    "dependency_connection_failure",
)


def _score(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCORER), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


@pytest.mark.parametrize("category", ("scheduling", "pvc"))
def test_public_benchmark_scores_two_scenarios_per_new_category(category: str) -> None:
    result = _score("--category", category)

    assert result.returncode == 0, result.stdout + result.stderr
    assert f"RESULT PASS (2 scenarios; {category}=2)" in result.stdout


def test_public_benchmark_full_suite_includes_scheduling_and_pvc() -> None:
    result = _score()

    assert result.returncode == 0, result.stdout + result.stderr
    assert "pvc=2" in result.stdout
    assert "scheduling=2" in result.stdout


def test_first_candidate_contract_batch_is_machine_verified_in_catalog_order() -> None:
    result = _score("--candidate-contracts")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "RESULT PASS (10 candidate contracts; ordinals=1..10)" in result.stdout

    document = json.loads(CONTRACTS.read_text(encoding="utf-8"))
    assert tuple(item["candidate_id"] for item in document["contracts"]) == (FIRST_CANDIDATE_BATCH)
    assert document["contracts"][5]["patch_capabilities"] == []


def _contract_validation_errors(document: dict[str, object]) -> list[str]:
    scorer = runpy.run_path(str(SCORER))
    catalog = json.loads((ROOT / "benchmark/catalog-snapshot.json").read_text(encoding="utf-8"))
    candidate_index = json.loads(
        (ROOT / "benchmark/candidate-contract-index.json").read_text(encoding="utf-8")
    )
    recovery, fallback = scorer["load_recovery_contracts"]()
    return scorer["validate_candidate_contracts"](
        document,
        catalog,
        candidate_index,
        recovery,
        fallback,
    )


def _candidate_contracts() -> dict[str, object]:
    return json.loads(CONTRACTS.read_text(encoding="utf-8"))


def test_candidate_contract_rejects_live_recovery_action_drift() -> None:
    document = _candidate_contracts()
    oom = document["contracts"][3]
    oom["allowed_remediations"] = [
        action for action in oom["allowed_remediations"] if action["action_type"] != "oom_memory"
    ]

    errors = _contract_validation_errors(document)

    assert any("allowed_remediations must exactly match live recovery" in error for error in errors)


def test_candidate_contract_rejects_rollback_or_verification_drift() -> None:
    document = _candidate_contracts()
    action = document["contracts"][4]["allowed_remediations"][0]
    action["rollback"] = "different rollback"
    action["post_verification"] = []

    errors = _contract_validation_errors(document)

    assert any("allowed_remediations must exactly match live recovery" in error for error in errors)
    assert any("post_verification requires non-empty strings" in error for error in errors)


def test_candidate_contract_rejects_allowed_forbidden_overlap() -> None:
    document = _candidate_contracts()
    document["contracts"][0]["forbidden_remediations"][0]["action_type"] = "manual_analysis"

    errors = _contract_validation_errors(document)

    assert any("allowed and forbidden actions must be disjoint" in error for error in errors)


def test_candidate_contract_index_rejects_source_hash_drift() -> None:
    scorer = runpy.run_path(str(SCORER))
    candidate_index = json.loads(
        (ROOT / "benchmark/candidate-contract-index.json").read_text(encoding="utf-8")
    )
    source = next(iter(candidate_index["source_sha256"]))
    candidate_index["source_sha256"][source] = "0" * 64

    errors = scorer["validate_candidate_index"](candidate_index)

    assert any(f"source drift for {source}" in error for error in errors)


def test_candidate_contract_index_rejects_invalid_hash_type_without_crashing() -> None:
    scorer = runpy.run_path(str(SCORER))
    candidate_index = json.loads(
        (ROOT / "benchmark/candidate-contract-index.json").read_text(encoding="utf-8")
    )
    source = next(iter(candidate_index["source_sha256"]))
    candidate_index["source_sha256"][source] = 123

    errors = scorer["validate_candidate_index"](candidate_index)

    assert any("source hash entry is invalid" in error for error in errors)


def test_candidate_contract_index_rejects_loader_order_content_drift() -> None:
    scorer = runpy.run_path(str(SCORER))
    candidate_index = json.loads(
        (ROOT / "benchmark/candidate-contract-index.json").read_text(encoding="utf-8")
    )
    candidate_index["candidates"][19]["candidate_id"] = "fabricated_candidate"

    errors = scorer["validate_candidate_index"](candidate_index)

    assert any("does not match live loader order" in error for error in errors)


def test_candidate_contract_index_rejects_unhashable_candidate_identity() -> None:
    scorer = runpy.run_path(str(SCORER))
    candidate_index = json.loads(
        (ROOT / "benchmark/candidate-contract-index.json").read_text(encoding="utf-8")
    )
    candidate_index["candidates"][0]["candidate_id"] = {}

    errors = scorer["validate_candidate_index"](candidate_index)

    assert any("candidate_id is required" in error for error in errors)


def test_candidate_contract_rejects_fixture_outside_scenario_tree() -> None:
    document = _candidate_contracts()
    document["contracts"][0]["benchmark_fixtures"] = ["benchmark/catalog-snapshot.json"]

    errors = _contract_validation_errors(document)

    assert any("fixture must exist under benchmark/scenarios" in error for error in errors)


def test_candidate_contract_rejects_unhashable_identity_without_crashing() -> None:
    document = _candidate_contracts()
    document["contracts"][0]["rule_id"] = []

    errors = _contract_validation_errors(document)

    assert any("rule_id is required" in error for error in errors)


def test_candidate_contract_rejects_non_string_capability_without_crashing() -> None:
    document = _candidate_contracts()
    document["contracts"][0]["patch_capabilities"] = [{}]

    errors = _contract_validation_errors(document)

    assert any("patch_capabilities require unique strings" in error for error in errors)


@pytest.mark.parametrize(
    ("contract_count", "next_ordinal"),
    ((10, 11), (80, 81), (87, None)),
)
def test_candidate_contract_progress_accepts_complete_batches_and_terminal_catalog(
    contract_count: int, next_ordinal: int | None
) -> None:
    scorer = runpy.run_path(str(SCORER))

    errors = scorer["validate_candidate_contract_progress"](contract_count, next_ordinal)

    assert errors == []


@pytest.mark.parametrize(
    ("contract_count", "next_ordinal"),
    ((9, 10), (81, 82), (87, 88), (88, None)),
)
def test_candidate_contract_progress_rejects_partial_or_past_terminal_batches(
    contract_count: int, next_ordinal: int | None
) -> None:
    scorer = runpy.run_path(str(SCORER))

    errors = scorer["validate_candidate_contract_progress"](contract_count, next_ordinal)

    assert errors
