from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]


def test_event_catalog_script_loads_all_app_workers() -> None:
    result = subprocess.run(
        [sys.executable, "scripts/events.py"],
        cwd=ROOT_DIR,
        capture_output=True,
        check=True,
        text=True,
    )

    output = result.stdout
    assert "git.webhook.received" in output
    assert "git-pull-worker/on_git_webhook" in output
    assert "workflow-controller/on_git_webhook" in output
    assert "target-reconcile-worker/on_desired_state_changed" in output
    assert "mail-worker/on_email_verification_requested" in output
    assert "audit-worker/on_event" in output
