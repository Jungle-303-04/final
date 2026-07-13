from __future__ import annotations

import subprocess
import sys

import pytest
from conftest import ROOT

SCORER = ROOT / "benchmark" / "score.py"


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
