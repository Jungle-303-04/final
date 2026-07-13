from __future__ import annotations

import hashlib
import json
import runpy
import subprocess
import sys

import pytest
import yaml
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
SECOND_CANDIDATE_BATCH = (
    "database_connectivity_failure",
    "database_credential_or_config_error",
    "database_connection_pool_exhausted",
    "deployment_progress_deadline_exceeded",
    "replica_unavailable_after_rollout",
    "gitops_sync_failed",
    "manifest_validation_failed",
    "redis_dependency_unavailable",
    "consumer_lag_backlog",
    "external_api_timeout",
)
THIRD_CANDIDATE_BATCH = (
    "dependency_down",
    "connection_pool_exhausted",
    "wrong_endpoint_config",
    "credential_rotation_issue",
    "wrong_image_tag",
    "missing_image_pull_secret",
    "registry_unavailable",
    "registry_rate_limited",
    "image_platform_mismatch",
    "service_dns_resolution_failure",
)
FOURTH_CANDIDATE_BATCH = (
    "service_name_or_namespace_mismatch",
    "coredns_unavailable",
    "network_path_timeout",
    "network_policy_denied",
    "endpoint_unavailable_timeout",
    "upstream_unavailable",
    "backend_readiness_failure",
    "application_5xx_spike",
    "kubelet_unavailable",
    "container_runtime_unavailable",
)
FIFTH_CANDIDATE_BATCH = (
    "node_network_unavailable",
    "pod_evicted_memory_pressure",
    "pod_evicted_disk_pressure",
    "pod_evicted_pid_pressure",
    "policy_violation",
    "invalid_manifest",
    "image_vulnerability_block",
    "service_account_permission_denied",
    "certificate_expired_or_invalid",
    "probe_path_wrong",
)
SIXTH_CANDIDATE_BATCH = (
    "probe_port_wrong",
    "timeout_too_short",
    "startup_window_too_short",
    "app_real_health_failure",
    "selector_label_mismatch",
    "pods_not_ready",
    "rollout_unavailable",
    "wrong_service_port",
    "endpoint_slice_delay",
    "memory_limit_too_low",
)


def _score(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCORER), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def _score_without_site_packages(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-S", str(SCORER), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def _live_candidate_index() -> list[dict[str, object]]:
    catalog_dir = ROOT / "src/services/ai/agent/causes/catalog"
    paths = sorted(path for pattern in ("*.yaml", "*.yml") for path in catalog_dir.glob(pattern))
    candidates: list[dict[str, object]] = []
    for path in paths:
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
        for rule in document["rules"]:
            for candidate in rule["candidates"]:
                candidates.append(
                    {
                        "ordinal": len(candidates) + 1,
                        "catalog_source": path.relative_to(ROOT).as_posix(),
                        "rule_id": rule["id"],
                        "candidate_id": candidate["candidate_id"],
                        "required_evidence": candidate["expected_evidence"],
                        "supporting_signals": candidate["signals"],
                    }
                )
    return candidates


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
    assert "RESULT PASS (60 candidate contracts; ordinals=1..60)" in result.stdout

    document = json.loads(CONTRACTS.read_text(encoding="utf-8"))
    assert tuple(item["candidate_id"] for item in document["contracts"][:10]) == (
        FIRST_CANDIDATE_BATCH
    )
    assert document["contracts"][5]["patch_capabilities"] == []
    for contract in document["contracts"]:
        assert contract["required_evidence"]
        assert contract["supporting_signals"]
        assert contract["contradicting_signals"] == []
        assert contract["contradiction_policy"] == "not_modeled_v0.1"
        assert (
            contract["missing_evidence_policy"]
            == "all_required_evidence_and_supporting_signal_groups"
        )


def test_second_candidate_contract_batch_is_machine_verified_in_catalog_order() -> None:
    result = _score("--candidate-contracts")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "RESULT PASS (60 candidate contracts; ordinals=1..60)" in result.stdout

    document = json.loads(CONTRACTS.read_text(encoding="utf-8"))
    second_batch = document["contracts"][10:20]
    assert tuple(item["candidate_id"] for item in second_batch) == SECOND_CANDIDATE_BATCH
    assert all(item["patch_capabilities"] == [] for item in second_batch)
    assert all(item["benchmark_fixtures"] == [] for item in second_batch)
    assert all(
        [action["action_type"] for action in item["allowed_remediations"]] == ["manual_analysis"]
        for item in second_batch
    )
    forbidden_actions = [item["forbidden_remediations"][0]["action_type"] for item in second_batch]
    assert len(forbidden_actions) == len(set(forbidden_actions)) == 10
    assert all(
        item["forbidden_remediations"][0]["blast_radius"] in {"cluster", "fleet"}
        for item in second_batch
    )


def test_third_candidate_contract_batch_is_machine_verified_in_catalog_order() -> None:
    result = _score("--candidate-contracts")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "RESULT PASS (60 candidate contracts; ordinals=1..60)" in result.stdout

    document = json.loads(CONTRACTS.read_text(encoding="utf-8"))
    third_batch = document["contracts"][20:30]
    assert tuple(item["candidate_id"] for item in third_batch) == THIRD_CANDIDATE_BATCH
    assert {item["candidate_id"]: item["patch_capabilities"] for item in third_batch} == {
        **{candidate_id: [] for candidate_id in THIRD_CANDIDATE_BATCH},
        "wrong_image_tag": ["safe_pr"],
    }
    assert {
        item["candidate_id"]: [action["action_type"] for action in item["allowed_remediations"]]
        for item in third_batch
    } == {
        **{candidate_id: ["manual_analysis"] for candidate_id in THIRD_CANDIDATE_BATCH},
        "wrong_image_tag": ["image_tag_fix", "manual_analysis"],
        "missing_image_pull_secret": ["image_pull_secret_fix", "manual_analysis"],
        "registry_unavailable": ["registry_recovery", "manual_analysis"],
    }
    assert {item["candidate_id"]: item["benchmark_fixtures"] for item in third_batch} == {
        **{candidate_id: [] for candidate_id in THIRD_CANDIDATE_BATCH},
        "wrong_image_tag": ["benchmark/scenarios/imagepull/imagepull-wrong-tag/scenario.json"],
        "missing_image_pull_secret": [
            "benchmark/scenarios/imagepull/imagepull-secret-missing/scenario.json"
        ],
    }


def test_fourth_candidate_contract_batch_is_machine_verified_in_catalog_order() -> None:
    result = _score("--candidate-contracts")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "RESULT PASS (60 candidate contracts; ordinals=1..60)" in result.stdout

    document = json.loads(CONTRACTS.read_text(encoding="utf-8"))
    fourth_batch = document["contracts"][30:40]
    assert tuple(item["candidate_id"] for item in fourth_batch) == FOURTH_CANDIDATE_BATCH
    assert {item["candidate_id"]: item["patch_capabilities"] for item in fourth_batch} == {
        **{candidate_id: [] for candidate_id in FOURTH_CANDIDATE_BATCH},
        "upstream_unavailable": ["command"],
        "backend_readiness_failure": ["command"],
        "application_5xx_spike": ["command", "safe_pr"],
    }
    assert {
        item["candidate_id"]: [action["action_type"] for action in item["allowed_remediations"]]
        for item in fourth_batch
    } == {
        **{candidate_id: ["manual_analysis"] for candidate_id in FOURTH_CANDIDATE_BATCH},
        "upstream_unavailable": ["rollout_restart", "deployment_scale", "manual_analysis"],
        "backend_readiness_failure": [
            "rollout_restart",
            "deployment_scale",
            "manual_analysis",
        ],
        "application_5xx_spike": [
            "replica_scale",
            "gitops_recovery_review",
            "deployment_scale",
            "rollout_restart",
            "manual_analysis",
        ],
    }
    assert all(item["benchmark_fixtures"] == [] for item in fourth_batch)


def test_fifth_candidate_contract_batch_is_machine_verified_in_catalog_order() -> None:
    result = _score("--candidate-contracts")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "RESULT PASS (60 candidate contracts; ordinals=1..60)" in result.stdout

    document = json.loads(CONTRACTS.read_text(encoding="utf-8"))
    fifth_batch = document["contracts"][40:50]
    assert tuple(item["candidate_id"] for item in fifth_batch) == FIFTH_CANDIDATE_BATCH
    assert {item["candidate_id"]: item["patch_capabilities"] for item in fifth_batch} == {
        **{candidate_id: [] for candidate_id in FIFTH_CANDIDATE_BATCH},
        "probe_path_wrong": ["safe_pr"],
    }
    assert {
        item["candidate_id"]: [action["action_type"] for action in item["allowed_remediations"]]
        for item in fifth_batch
    } == {
        **{candidate_id: ["manual_analysis"] for candidate_id in FIFTH_CANDIDATE_BATCH},
        "probe_path_wrong": ["probe_fix", "manual_analysis"],
    }
    assert {item["candidate_id"]: item["benchmark_fixtures"] for item in fifth_batch} == {
        **{candidate_id: [] for candidate_id in FIFTH_CANDIDATE_BATCH},
        "probe_path_wrong": ["benchmark/scenarios/probe/probe-wrong-path/scenario.json"],
    }


def test_sixth_candidate_contract_batch_is_machine_verified_in_catalog_order() -> None:
    result = _score("--candidate-contracts")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "RESULT PASS (60 candidate contracts; ordinals=1..60)" in result.stdout

    document = json.loads(CONTRACTS.read_text(encoding="utf-8"))
    sixth_batch = document["contracts"][50:60]
    assert document["next_ordinal"] == 61
    assert tuple(item["candidate_id"] for item in sixth_batch) == SIXTH_CANDIDATE_BATCH
    assert {item["candidate_id"]: item["patch_capabilities"] for item in sixth_batch} == {
        **{candidate_id: [] for candidate_id in SIXTH_CANDIDATE_BATCH},
        "probe_port_wrong": ["safe_pr"],
        "timeout_too_short": ["safe_pr"],
        "startup_window_too_short": ["safe_pr"],
        "selector_label_mismatch": ["safe_pr"],
    }
    assert {
        item["candidate_id"]: [action["action_type"] for action in item["allowed_remediations"]]
        for item in sixth_batch
    } == {
        **{candidate_id: ["manual_analysis"] for candidate_id in SIXTH_CANDIDATE_BATCH},
        "probe_port_wrong": ["probe_fix", "manual_analysis"],
        "timeout_too_short": ["probe_fix", "manual_analysis"],
        "startup_window_too_short": ["probe_fix", "manual_analysis"],
        "selector_label_mismatch": ["selector_fix", "manual_analysis"],
    }
    assert {item["candidate_id"]: item["benchmark_fixtures"] for item in sixth_batch} == {
        **{candidate_id: [] for candidate_id in SIXTH_CANDIDATE_BATCH},
        "probe_port_wrong": ["benchmark/scenarios/probe/probe-wrong-port/scenario.json"],
        "selector_label_mismatch": [
            "benchmark/scenarios/service-selector/service-selector-label-mismatch/scenario.json"
        ],
        "pods_not_ready": [
            "benchmark/scenarios/service-selector/service-selector-pods-not-ready/scenario.json"
        ],
    }


def test_public_candidate_contract_scorer_needs_no_site_packages() -> None:
    result = _score_without_site_packages("--candidate-contracts")

    assert result.returncode == 0, result.stdout + result.stderr
    assert "RESULT PASS (60 candidate contracts; ordinals=1..60)" in result.stdout


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


def test_candidate_contract_index_matches_live_loader_order_and_metadata() -> None:
    candidate_index = json.loads(
        (ROOT / "benchmark/candidate-contract-index.json").read_text(encoding="utf-8")
    )

    assert candidate_index["candidates"] == _live_candidate_index()


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


def test_candidate_contract_rejects_fixture_path_traversal() -> None:
    document = _candidate_contracts()
    document["contracts"][0]["benchmark_fixtures"] = [
        "benchmark/scenarios/../../benchmark/catalog-snapshot.json"
    ]

    errors = _contract_validation_errors(document)

    assert any("fixture path must remain under benchmark/scenarios" in error for error in errors)


@pytest.mark.parametrize(
    ("contract_index", "batch_number"),
    ((3, 1), (10, 2), (20, 3), (30, 4), (40, 5), (50, 6)),
)
def test_candidate_contract_rejects_completed_batch_annotation_drift(
    contract_index: int, batch_number: int
) -> None:
    document = _candidate_contracts()
    document["contracts"][contract_index]["forbidden_remediations"][0]["reason"] += " drift"

    errors = _contract_validation_errors(document)

    assert any(f"completed batch {batch_number} digest mismatch" in error for error in errors)


def test_candidate_contract_terminal_digest_uses_only_ordinals_81_through_87() -> None:
    scorer = runpy.run_path(str(SCORER))
    contracts = [{"ordinal": ordinal} for ordinal in range(1, 88)]
    expected = hashlib.sha256(
        json.dumps(
            contracts[80:87],
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()

    assert scorer["candidate_contract_batch_ranges"](87)[-1] == (81, 87)
    assert scorer["candidate_contract_batch_digest"](contracts, 81, 87) == expected


def test_candidate_contract_batch_commitments_reject_unlocked_complete_batch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scorer = runpy.run_path(str(SCORER))
    contracts = [{"ordinal": ordinal} for ordinal in range(1, 61)]
    locks = {
        batch_range: scorer["candidate_contract_batch_digest"](contracts, *batch_range)
        for batch_range in ((1, 10), (11, 20), (21, 30), (31, 40), (41, 50))
    }
    monkeypatch.setitem(
        scorer["validate_candidate_batch_commitments"].__globals__,
        "CANDIDATE_BATCH_SHA256",
        locks,
    )

    errors = scorer["validate_candidate_batch_commitments"](contracts)

    assert any("completed batch digest coverage mismatch" in error for error in errors)


def test_candidate_contract_rejects_supporting_signal_drift() -> None:
    document = _candidate_contracts()
    document["contracts"][0]["supporting_signals"][0]["any_of"][0] = {
        "event_pattern": "fabricated signal"
    }

    errors = _contract_validation_errors(document)

    assert any("supporting_signals" in error and "loader-order index" in error for error in errors)


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
    (
        (10, 11),
        (20, 21),
        (30, 31),
        (40, 41),
        (50, 51),
        (60, 61),
        (80, 81),
        (87, None),
    ),
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


@pytest.mark.parametrize("next_ordinal", (11.0, True))
def test_candidate_contract_progress_rejects_non_integer_cursor(next_ordinal: object) -> None:
    scorer = runpy.run_path(str(SCORER))

    errors = scorer["validate_candidate_contract_progress"](10, next_ordinal)

    assert any("next_ordinal must be an integer" in error for error in errors)


def test_candidate_contract_rejects_boolean_ordinal_and_float_batch_size() -> None:
    document = _candidate_contracts()
    document["batch_size"] = 10.0
    document["contracts"][0]["ordinal"] = True

    errors = _contract_validation_errors(document)

    assert any("batch_size must be integer 10" in error for error in errors)
    assert any("ordinal must be integer 1" in error for error in errors)


def test_candidate_contract_index_rejects_boolean_ordinal() -> None:
    scorer = runpy.run_path(str(SCORER))
    candidate_index = json.loads(
        (ROOT / "benchmark/candidate-contract-index.json").read_text(encoding="utf-8")
    )
    candidate_index["candidates"][0]["ordinal"] = True

    errors = scorer["validate_candidate_index"](candidate_index)

    assert any("ordinal must be integer 1" in error for error in errors)


def test_recovery_contract_loader_accumulates_duplicate_root_cause_rules(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "recovery.py"
    action = """RecoveryActionSpec(
        action_type={action_type!r},
        route=routes.approval_required,
        blast_radius="unknown",
        approval_required=True,
        rollback_plan="none",
        validation_checks=("review",),
    )"""
    source.write_text(
        "\n".join(
            (
                f'@rca.recovery(root_causes=("shared",), actions=({action.format(action_type="first")},))',
                "class First: pass",
                f'@rca.recovery(root_causes=("shared",), actions=({action.format(action_type="second")},))',
                "class Second: pass",
                f"@rca.fallback(actions=({action.format(action_type='fallback')},))",
                "class Fallback: pass",
            )
        ),
        encoding="utf-8",
    )
    scorer = runpy.run_path(str(SCORER))
    monkeypatch.setitem(scorer["load_recovery_contracts"].__globals__, "RECOVERY_SOURCE", source)

    recovery, fallback = scorer["load_recovery_contracts"]()

    assert [item["action_type"] for item in recovery["shared"]] == ["first", "second"]
    assert [item["action_type"] for item in fallback] == ["fallback"]


def test_recovery_contract_loader_accumulates_multiple_fallback_rules(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "recovery.py"
    action = """RecoveryActionSpec(
        action_type={action_type!r},
        route=routes.approval_required,
        blast_radius="unknown",
        approval_required=True,
        rollback_plan="none",
        validation_checks=("review",),
    )"""
    source.write_text(
        "\n".join(
            (
                f"@rca.fallback(actions=({action.format(action_type='first_fallback')},))",
                "class FirstFallback: pass",
                f"@rca.fallback(actions=({action.format(action_type='second_fallback')},))",
                "class SecondFallback: pass",
            )
        ),
        encoding="utf-8",
    )
    scorer = runpy.run_path(str(SCORER))
    monkeypatch.setitem(scorer["load_recovery_contracts"].__globals__, "RECOVERY_SOURCE", source)

    recovery, fallback = scorer["load_recovery_contracts"]()

    assert recovery == {}
    assert [item["action_type"] for item in fallback] == [
        "first_fallback",
        "second_fallback",
    ]


def test_candidate_contract_validator_accepts_full_live_catalog_terminal_shape() -> None:
    scorer = runpy.run_path(str(SCORER))
    candidate_index = json.loads(
        (ROOT / "benchmark/candidate-contract-index.json").read_text(encoding="utf-8")
    )
    catalog = json.loads((ROOT / "benchmark/catalog-snapshot.json").read_text(encoding="utf-8"))
    recovery, fallback = scorer["load_recovery_contracts"]()
    command_actions, safe_pr_actions = scorer["load_dispatch_capabilities"]()
    completed_prefix = _candidate_contracts()["contracts"]
    contracts = []
    for entry in candidate_index["candidates"]:
        if entry["ordinal"] <= len(completed_prefix):
            contracts.append(completed_prefix[entry["ordinal"] - 1])
            continue
        allowed = [*recovery.get(entry["candidate_id"], []), *fallback]
        capabilities = [
            capability
            for capability, supported_actions, route in (
                ("command", command_actions, "auto"),
                ("safe_pr", safe_pr_actions, "draft_pr"),
            )
            if any(
                action["route"] == route and action["action_type"] in supported_actions
                for action in allowed
            )
        ]
        contracts.append(
            {
                **entry,
                "contradicting_signals": [],
                "contradiction_policy": "not_modeled_v0.1",
                "missing_evidence_policy": ("all_required_evidence_and_supporting_signal_groups"),
                "patch_capabilities": capabilities,
                "allowed_remediations": allowed,
                "forbidden_remediations": [
                    {
                        "action_type": f"forbidden_catalog_scope_{entry['ordinal']}",
                        "blast_radius": "cluster",
                        "reason": "validator terminal shape fixture",
                    }
                ],
                "benchmark_fixtures": [],
            }
        )
    document = {
        "schema_version": "opsiabench/candidate-contracts/v0.1",
        "ordering": "catalog_path_lexical_then_rule_then_candidate",
        "batch_size": 10,
        "next_ordinal": None,
        "contracts": contracts,
    }
    batch_ranges = scorer["candidate_contract_batch_ranges"](len(contracts))
    scorer["validate_candidate_contracts"].__globals__["CANDIDATE_BATCH_SHA256"] = {
        batch_range: scorer["candidate_contract_batch_digest"](contracts, *batch_range)
        for batch_range in batch_ranges
    }

    errors = scorer["validate_candidate_contracts"](
        document, catalog, candidate_index, recovery, fallback
    )

    assert errors == []
