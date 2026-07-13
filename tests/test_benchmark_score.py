from __future__ import annotations

import json
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
