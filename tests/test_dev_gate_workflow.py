"""Dev Gate contracts that feed the automatic deployment workflow."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github/workflows/dev-gate.yml"


def steps_by_name() -> dict[str, dict]:
    document = yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))
    return {step["name"]: step for step in document["jobs"]["gate"]["steps"]}


def test_gate_classifies_the_bounded_push_range_and_uploads_scope_proof() -> None:
    steps = steps_by_name()
    classify = steps["Classify automatic deployment scope"]
    upload = steps["Upload automatic deployment scope"]

    assert "scripts/classify-deploy-scope.sh origin/dev HEAD" in classify["run"]
    assert upload["uses"] == "actions/upload-artifact@v4"
    assert upload["with"] == {
        "name": "dev-deploy-scope",
        "path": "${{ runner.temp }}/dev-deploy-scope/scope",
        "if-no-files-found": "error",
        "retention-days": 1,
    }
