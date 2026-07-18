from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PROOF_SCRIPT = ROOT / "scripts/verify-merged-pr-gate.sh"


def git(repository: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=repository,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def commit(repository: Path, path: str, contents: str, message: str) -> str:
    target = repository / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(contents, encoding="utf-8")
    git(repository, "add", path)
    git(repository, "commit", "-m", message)
    return git(repository, "rev-parse", "HEAD")


def repository_with_merge(tmp_path: Path) -> tuple[Path, str, str]:
    repository = tmp_path / "repository"
    repository.mkdir()
    git(repository, "init", "--initial-branch=dev")
    git(repository, "config", "user.name", "Gate Proof")
    git(repository, "config", "user.email", "gate-proof@example.test")
    base_sha = commit(
        repository,
        ".github/workflows/dev-gate.yml",
        "name: trusted\n",
        "chore: 기준 / 생성",
    )
    head_sha = commit(repository, "product.txt", "change\n", "fix: 제품 / 수정")
    return repository, base_sha, head_sha


def fake_gh(tmp_path: Path) -> Path:
    bin_directory = tmp_path / "bin"
    bin_directory.mkdir()
    executable = bin_directory / "gh"
    executable.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
arguments="$*"
if [[ "${arguments}" == *"/commits/${FAKE_MERGE_SHA}/pulls"* ]]; then
  if [[ "${FAKE_GATE_MODE}" == "missing-pr" ]]; then
    printf '[]\\n'
    exit 0
  fi
  merge_sha="${FAKE_MERGE_SHA}"
  base_sha="${FAKE_BASE_SHA}"
  head_repository="${GITHUB_REPOSITORY}"
  if [[ "${FAKE_GATE_MODE}" == "wrong-merge" ]]; then
    merge_sha="0000000000000000000000000000000000000000"
  elif [[ "${FAKE_GATE_MODE}" == "foreign-head" ]]; then
    head_repository="fork/project"
  elif [[ "${FAKE_GATE_MODE}" == "wrong-base" ]]; then
    base_sha="0000000000000000000000000000000000000000"
  fi
  jq -cn \
    --arg base_sha "${base_sha}" \
    --arg head_repository "${head_repository}" \
    --arg merge_sha "${merge_sha}" \
    --arg repository "${GITHUB_REPOSITORY}" \
    --arg sha "${FAKE_PR_HEAD_SHA}" \
    '[{
      number:17,
      state:"closed",
      merged_at:"2026-07-19T00:02:00Z",
      merge_commit_sha:$merge_sha,
      base:{ref:"dev",sha:$base_sha,repo:{full_name:$repository}},
      head:{ref:"codex/change",sha:$sha,repo:{full_name:$head_repository}}
    }]'
  exit 0
fi
if [[ "${arguments}" == *"/git/commits/${FAKE_PR_HEAD_SHA}"* ]]; then
  tree_sha="${FAKE_PR_TREE_SHA}"
  if [[ "${FAKE_GATE_MODE}" == "wrong-tree" ]]; then
    tree_sha="0000000000000000000000000000000000000000"
  fi
  jq -cn --arg tree_sha "${tree_sha}" '{tree:{sha:$tree_sha}}'
  exit 0
fi
if [[ "${arguments}" == *"/actions/workflows/dev-gate.yml/runs"* ]]; then
  if [[ "${FAKE_GATE_MODE}" == "missing-gate" ]]; then
    printf '{"workflow_runs":[]}\\n'
    exit 0
  fi
  updated_at="2026-07-19T00:01:00Z"
  if [[ "${FAKE_GATE_MODE}" == "late-gate" ]]; then
    updated_at="2026-07-19T00:03:00Z"
  fi
  jq -cn \
    --arg sha "${FAKE_PR_HEAD_SHA}" \
    --arg updated_at "${updated_at}" \
    '{
      workflow_runs:[{
        id:99,
        run_attempt:1,
        event:"pull_request",
        status:"completed",
        conclusion:"success",
        head_sha:$sha,
        head_branch:"codex/change",
        path:".github/workflows/dev-gate.yml",
        updated_at:$updated_at,
        pull_requests:[{number:17}]
      }]
    }'
  exit 0
fi
if [[ "${arguments}" == *"/actions/runs/99/jobs"* ]]; then
  if [[ "${FAKE_GATE_MODE}" == "missing-job" ]]; then
    printf '{"jobs":[]}\\n'
    exit 0
  fi
  jq -cn '{
    jobs:[
      {name:"Commit and deployment proof",status:"completed",conclusion:"success"},
      {name:"Backend and manifest gate",status:"completed",conclusion:"success"},
      {name:"Frontend gate",status:"completed",conclusion:"success"},
      {name:"Full gate",status:"completed",conclusion:"success"}
    ]
  }'
  exit 0
fi
echo "unexpected gh request: ${arguments}" >&2
exit 2
""",
        encoding="utf-8",
    )
    executable.chmod(0o755)
    return bin_directory


def verify(
    repository: Path,
    bin_directory: Path,
    base_sha: str,
    head_sha: str,
    *,
    mode: str,
) -> subprocess.CompletedProcess[str]:
    environment = {
        **os.environ,
        "FAKE_BASE_SHA": base_sha,
        "FAKE_GATE_MODE": mode,
        "FAKE_MERGE_SHA": head_sha,
        "FAKE_PR_HEAD_SHA": "a" * 40,
        "FAKE_PR_TREE_SHA": git(repository, "rev-parse", f"{head_sha}^{{tree}}"),
        "GITHUB_REPOSITORY": "example/project",
        "PATH": f"{bin_directory}:{os.environ['PATH']}",
    }
    return subprocess.run(
        ["bash", str(PROOF_SCRIPT), base_sha, head_sha],
        cwd=repository,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )


def test_reuses_the_exact_successful_gate_from_the_merged_pull_request(
    tmp_path: Path,
) -> None:
    repository, base_sha, head_sha = repository_with_merge(tmp_path)

    result = verify(
        repository,
        fake_gh(tmp_path),
        base_sha,
        head_sha,
        mode="success",
    )

    assert result.returncode == 0
    assert result.stdout == "REUSE\n"


@pytest.mark.parametrize(
    "mode",
    (
        "missing-pr",
        "wrong-merge",
        "wrong-base",
        "foreign-head",
        "wrong-tree",
        "missing-gate",
        "late-gate",
        "missing-job",
    ),
)
def test_falls_back_to_full_for_untrusted_or_stale_pull_request_evidence(
    tmp_path: Path,
    mode: str,
) -> None:
    repository, base_sha, head_sha = repository_with_merge(tmp_path)

    result = verify(
        repository,
        fake_gh(tmp_path),
        base_sha,
        head_sha,
        mode=mode,
    )

    assert result.returncode == 0
    assert result.stdout == "FULL\n"
    assert "running the full merged gate" in result.stderr


def test_falls_back_to_full_when_the_gate_trust_root_changes(tmp_path: Path) -> None:
    repository, base_sha, _ = repository_with_merge(tmp_path)
    git(repository, "reset", "--hard", base_sha)
    head_sha = commit(
        repository,
        ".github/workflows/dev-gate.yml",
        "name: changed\n",
        "ci: 게이트 / 변경",
    )

    result = verify(
        repository,
        fake_gh(tmp_path),
        base_sha,
        head_sha,
        mode="success",
    )

    assert result.returncode == 0
    assert result.stdout == "FULL\n"
    assert "gate trust root changed" in result.stderr


def test_falls_back_to_full_for_a_multi_commit_push(tmp_path: Path) -> None:
    repository, base_sha, _ = repository_with_merge(tmp_path)
    head_sha = commit(repository, "second.txt", "second\n", "fix: 추가 / 수정")

    result = verify(
        repository,
        fake_gh(tmp_path),
        base_sha,
        head_sha,
        mode="success",
    )

    assert result.returncode == 0
    assert result.stdout == "FULL\n"
    assert "not one squash commit" in result.stderr
