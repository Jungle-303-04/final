"""Dev Gate contracts that feed the automatic deployment workflow."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github/workflows/dev-gate.yml"
SCOPE_SCRIPT = ROOT / "scripts/classify-live-deploy-scope.sh"


def workflow_document() -> dict[str, object]:
    return yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))


def steps_by_name() -> dict[str, dict]:
    document = workflow_document()
    return {step["name"]: step for step in document["jobs"]["gate"]["steps"]}


def git(repository: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=repository,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def commit_file(repository: Path, path: str, contents: str, message: str) -> str:
    target = repository / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(contents, encoding="utf-8")
    git(repository, "add", path)
    git(repository, "commit", "-m", message)
    return git(repository, "rev-parse", "HEAD")


def make_repository(tmp_path: Path) -> tuple[Path, str]:
    repository = tmp_path / "repository"
    repository.mkdir()
    git(repository, "init", "--initial-branch=dev")
    git(repository, "config", "user.name", "Dev Gate Test")
    git(repository, "config", "user.email", "dev-gate@example.test")
    deployed_sha = commit_file(repository, "README.md", "initial\n", "initial")
    return repository, deployed_sha


def make_fake_gh(tmp_path: Path) -> Path:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    executable = bin_dir / "gh"
    executable.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_GH_FAILURE:-0}" == "1" ]]; then
  exit 1
fi
event_filter=0
for argument in "$@"; do
  if [[ "${argument}" == "event=workflow_run" ]]; then
    event_filter=1
  fi
done
if [[ "${event_filter}" != "1" ]]; then
  echo "automatic deployment lookup must exclude workflow_dispatch runs" >&2
  exit 2
fi
printf '%s\n' "${FAKE_DEPLOYED_SHA:-}"
""",
        encoding="utf-8",
    )
    executable.chmod(0o755)
    return bin_dir


def classify_scope(
    repository: Path,
    bin_dir: Path,
    *,
    deployed_sha: str = "",
    fail_api: bool = False,
) -> subprocess.CompletedProcess[str]:
    environment = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "GITHUB_REPOSITORY": "example/project",
        "FAKE_DEPLOYED_SHA": deployed_sha,
        "FAKE_GH_FAILURE": "1" if fail_api else "0",
    }
    return subprocess.run(
        ["bash", str(SCOPE_SCRIPT), "HEAD"],
        cwd=repository,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )


def test_gate_keeps_commit_audit_bounded_but_classifies_from_last_deployment() -> None:
    document = workflow_document()
    steps = steps_by_name()
    audit = steps["Enforce commit message convention"]
    classify = steps["Classify automatic deployment scope"]
    upload = steps["Upload automatic deployment scope"]

    assert document["permissions"] == {"contents": "read", "actions": "read"}
    assert audit["run"] == "scripts/commit-msg-gate.sh --range origin/dev..HEAD"
    assert "scripts/classify-live-deploy-scope.sh HEAD" in classify["run"]
    assert "scripts/classify-deploy-scope.sh origin/dev HEAD" not in classify["run"]
    assert classify["env"] == {"GH_TOKEN": "${{ github.token }}"}
    assert upload["uses"] == "actions/upload-artifact@v4"
    assert upload["with"] == {
        "name": "dev-deploy-scope",
        "path": "${{ runner.temp }}/dev-deploy-scope/scope",
        "if-no-files-found": "error",
        "retention-days": 1,
    }


def test_scope_includes_backend_changes_from_an_earlier_undeployed_push(tmp_path: Path) -> None:
    repository, deployed_sha = make_repository(tmp_path)
    commit_file(repository, "src/backend.py", "changed\n", "backend")
    commit_file(repository, "frontend/app.ts", "changed\n", "frontend")

    result = classify_scope(
        repository,
        make_fake_gh(tmp_path),
        deployed_sha=deployed_sha,
    )

    assert result.stdout == "FULL\n"


def test_scope_remains_console_for_a_cumulative_frontend_only_delta(tmp_path: Path) -> None:
    repository, deployed_sha = make_repository(tmp_path)
    commit_file(repository, "frontend/app.ts", "one\n", "frontend one")
    commit_file(repository, "frontend/app.ts", "two\n", "frontend two")

    result = classify_scope(
        repository,
        make_fake_gh(tmp_path),
        deployed_sha=deployed_sha,
    )

    assert result.stdout == "CONSOLE\n"


def test_scope_fails_safe_to_full_when_deploy_lookup_fails(tmp_path: Path) -> None:
    repository, _ = make_repository(tmp_path)
    commit_file(repository, "frontend/app.ts", "changed\n", "frontend")

    result = classify_scope(repository, make_fake_gh(tmp_path), fail_api=True)

    assert result.stdout == "FULL\n"


def test_scope_fails_safe_to_full_when_deployed_sha_is_not_an_ancestor(tmp_path: Path) -> None:
    repository, branch_point = make_repository(tmp_path)
    git(repository, "switch", "-c", "unrelated")
    unrelated_sha = commit_file(repository, "unrelated.txt", "changed\n", "unrelated")
    git(repository, "switch", "dev")
    assert git(repository, "rev-parse", "HEAD") == branch_point
    commit_file(repository, "frontend/app.ts", "changed\n", "frontend")

    result = classify_scope(
        repository,
        make_fake_gh(tmp_path),
        deployed_sha=unrelated_sha,
    )

    assert result.stdout == "FULL\n"
