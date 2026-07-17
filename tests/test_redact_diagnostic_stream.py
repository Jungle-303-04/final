"""Secret-safe output contract for deployment crash diagnostics."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_diagnostic_stream_redacts_assignments_and_bearer_tokens() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/redact_diagnostic_stream.py")],
        cwd=ROOT,
        input=(
            'password="very-secret" token=token-value\n'
            "Authorization: Bearer abc.def.ghi\n"
            "ordinary rollout state\n"
        ),
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0
    assert "very-secret" not in result.stdout
    assert "token-value" not in result.stdout
    assert "abc.def.ghi" not in result.stdout
    assert result.stdout.count("<redacted>") == 3
    assert "ordinary rollout state" in result.stdout
