from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_static_remediation_source_scorer_passes_declared_adapters() -> None:
    result = subprocess.run(
        ["uv", "run", "python", "scripts/verify-remediation-source-contract.py"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert json.loads(result.stdout.splitlines()[-1]) == {
        "failed": 0,
        "passed": 6,
        "total": 6,
    }
