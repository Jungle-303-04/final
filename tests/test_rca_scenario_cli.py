from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import yaml
from conftest import ROOT

SCRIPT = ROOT / "scripts" / "rca_scenario.py"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "PYTHONPATH": str(ROOT / "src")}
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def test_validate_checks_scenario_adapter_cause_evidence_and_recovery_contracts() -> None:
    result = _run("validate")

    assert result.returncode == 0, result.stderr
    assert "scenario schema" in result.stdout
    assert "adapter" in result.stdout
    assert "cause/evidence/recovery" in result.stdout


def test_scaffold_creates_detector_gap_yaml_and_fixture_test_without_overwrite(
    tmp_path: Path,
) -> None:
    catalog_dir = tmp_path / "catalog"
    tests_dir = tmp_path / "tests"
    command = (
        "scaffold",
        "image.new-failure",
        "--root-cause",
        "wrong_image_tag",
        "--symptom",
        "ImagePullBackOff",
        "--fault-mode",
        "wrong_image_tag",
        "--catalog-dir",
        str(catalog_dir),
        "--tests-dir",
        str(tests_dir),
    )

    first = _run(*command)
    assert first.returncode == 0, first.stderr

    yaml_path = catalog_dir / "image_new_failure.yaml"
    test_path = tests_dir / "test_rca_scenario_image_new_failure.py"
    assert yaml_path.is_file()
    assert test_path.is_file()

    document = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
    scenario = document["scenarios"][0]
    assert scenario["availability"] == "verification_pending"
    assert scenario["verification_work_needed"]
    assert scenario["cleanup"]["adapter"] == "kubernetes.manifest_delete"
    serialized = yaml_path.read_text(encoding="utf-8").casefold()
    assert "availability: ready" not in serialized
    assert "raw_manifest" not in serialized
    assert "shell" not in serialized
    assert 'SCENARIO_FILE = Path(__file__).resolve().parent / "../catalog/' in test_path.read_text(
        encoding="utf-8"
    )

    original_yaml = yaml_path.read_text(encoding="utf-8")
    original_test = test_path.read_text(encoding="utf-8")
    second = _run(*command)
    assert second.returncode != 0
    assert "already exists" in second.stderr
    assert yaml_path.read_text(encoding="utf-8") == original_yaml
    assert test_path.read_text(encoding="utf-8") == original_test
