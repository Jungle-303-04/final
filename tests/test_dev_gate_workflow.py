"""Dev Gate contracts that feed the automatic deployment workflow."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = ROOT / ".github/workflows/dev-gate.yml"
SCOPE_SCRIPT = ROOT / "scripts/classify-live-deploy-scope.sh"
GATE_SCOPE_SCRIPT = ROOT / "scripts/classify-dev-gate-scope.sh"


def workflow_document() -> dict[str, object]:
    return yaml.safe_load(WORKFLOW_PATH.read_text(encoding="utf-8"))


def proof_steps_by_name() -> dict[str, dict]:
    document = workflow_document()
    return {step["name"]: step for step in document["jobs"]["source-proof"]["steps"]}


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
    repository.mkdir(parents=True)
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


def classify_gate_scope(repository: Path, base_sha: str, head_sha: str = "HEAD") -> str:
    result = subprocess.run(
        ["bash", str(GATE_SCOPE_SCRIPT), base_sha, head_sha],
        cwd=repository,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def test_gate_keeps_commit_audit_bounded_but_classifies_from_last_deployment() -> None:
    document = workflow_document()
    steps = proof_steps_by_name()
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


def test_push_reuses_the_successful_pull_request_gate_before_deployment() -> None:
    steps = proof_steps_by_name()
    resolver = steps["Resolve gate scope"]

    assert resolver["id"] == "gate-scope"
    assert resolver["env"] == {
        "BASE_SHA": "${{ github.event.before || github.event.pull_request.base.sha || '' }}",
        "GH_TOKEN": "${{ github.token }}",
        "HEAD_SHA": "${{ github.event.pull_request.head.sha || github.sha }}",
    }
    assert '[[ "${GITHUB_EVENT_NAME}" == "push" ]]' in resolver["run"]
    assert (
        'scope="$(scripts/verify-merged-pr-gate.sh "${BASE_SHA}" "${HEAD_SHA}")"'
        in (resolver["run"])
    )
    assert "scripts/classify-dev-gate-scope.sh" in resolver["run"]
    assert "REUSE|FULL|BACKEND|FRONTEND|SMOKE" in resolver["run"]


def test_pull_request_runs_backend_and_frontend_after_scope_resolution() -> None:
    jobs = workflow_document()["jobs"]

    assert set(jobs) == {"source-proof", "backend", "frontend", "gate"}
    assert "needs" not in jobs["source-proof"]
    assert jobs["backend"]["needs"] == "source-proof"
    assert jobs["frontend"]["needs"] == "source-proof"
    assert jobs["source-proof"]["outputs"]["gate_scope"] == (
        "${{ steps.gate-scope.outputs.scope }}"
    )

    backend_full = next(
        step
        for step in jobs["backend"]["steps"]
        if step.get("name") == "Run backend and manifest gate"
    )
    assert backend_full == {
        "name": "Run backend and manifest gate",
        "if": "${{ needs.source-proof.outputs.gate_scope == 'FULL' || needs.source-proof.outputs.gate_scope == 'BACKEND' }}",
        "run": "make gate-backend",
    }
    frontend_full = next(
        step for step in jobs["frontend"]["steps"] if step.get("name") == "Run frontend gate"
    )
    assert frontend_full == {
        "name": "Run frontend gate",
        "if": "${{ needs.source-proof.outputs.gate_scope == 'FULL' }}",
        "run": "make gate-frontend",
    }


def test_frontend_scope_keeps_cross_boundary_contract_and_manifest_gate() -> None:
    backend = workflow_document()["jobs"]["backend"]
    minimum = next(
        step for step in backend["steps"] if step.get("name") == "Run contract and manifest gate"
    )

    assert minimum == {
        "name": "Run contract and manifest gate",
        "if": "${{ needs.source-proof.outputs.gate_scope == 'FRONTEND' }}",
        "run": "make gate-contract-manifest",
    }
    helm = next(step for step in backend["steps"] if step.get("name") == "Set up Helm")
    assert helm["if"] == (
        "${{ needs.source-proof.outputs.gate_scope == 'FULL' "
        "|| needs.source-proof.outputs.gate_scope == 'BACKEND' }}"
    )


def test_backend_scope_skips_only_the_redundant_frontend_full_gate() -> None:
    frontend = workflow_document()["jobs"]["frontend"]
    skipped = next(
        step for step in frontend["steps"] if step.get("name") == "Record frontend full-gate skip"
    )

    assert skipped["if"] == "${{ needs.source-proof.outputs.gate_scope == 'BACKEND' }}"
    assert "contract and manifest coverage" in skipped["run"]
    setup_node = next(step for step in frontend["steps"] if step.get("name") == "Set up Node.js")
    assert setup_node["if"] == (
        "${{ needs.source-proof.outputs.gate_scope != 'BACKEND' "
        "&& needs.source-proof.outputs.gate_scope != 'REUSE' }}"
    )
    assert setup_node["with"]["cache"] == "npm"
    assert setup_node["with"]["cache-dependency-path"] == "frontend/package-lock.json"


def test_frontend_scope_runs_impacted_tests_with_full_static_and_build_checks() -> None:
    frontend = workflow_document()["jobs"]["frontend"]
    changed = next(
        step for step in frontend["steps"] if step.get("name") == "Run changed frontend gate"
    )

    assert changed == {
        "name": "Run changed frontend gate",
        "if": "${{ needs.source-proof.outputs.gate_scope == 'FRONTEND' }}",
        "env": {
            "BASE_SHA": "${{ github.event.pull_request.base.sha || github.event.before || '' }}"
        },
        "run": 'GATE_BASE="${BASE_SHA}" make gate-frontend-changed',
    }


def test_smoke_scope_runs_only_bounded_deployment_gates() -> None:
    jobs = workflow_document()["jobs"]
    backend = next(
        step
        for step in jobs["backend"]["steps"]
        if step.get("name") == "Run deployment smoke backend gate"
    )
    frontend = next(
        step
        for step in jobs["frontend"]["steps"]
        if step.get("name") == "Run deployment smoke frontend gate"
    )

    assert backend == {
        "name": "Run deployment smoke backend gate",
        "if": "${{ needs.source-proof.outputs.gate_scope == 'SMOKE' }}",
        "run": "make gate-deploy-smoke-backend",
    }
    assert frontend == {
        "name": "Run deployment smoke frontend gate",
        "if": "${{ needs.source-proof.outputs.gate_scope == 'SMOKE' }}",
        "run": "make gate-deploy-smoke-frontend",
    }
    resolver = proof_steps_by_name()["Resolve gate scope"]
    assert "REUSE|FULL|BACKEND|FRONTEND|SMOKE" in resolver["run"]


def test_full_gate_status_fails_closed_over_every_parallel_job() -> None:
    gate = workflow_document()["jobs"]["gate"]

    assert gate["name"] == "Full gate"
    assert gate["if"] == "${{ always() }}"
    assert gate["needs"] == ["source-proof", "backend", "frontend"]
    assertion = gate["steps"][0]["run"]
    assert 'test "${{ needs.source-proof.result }}" = "success"' in assertion
    assert 'test "${{ needs.backend.result }}" = "success"' in assertion
    assert 'test "${{ needs.frontend.result }}" = "success"' in assertion


def test_parallel_jobs_preserve_exact_gated_source_checkout() -> None:
    jobs = workflow_document()["jobs"]
    expected = {
        "ref": "${{ github.event.pull_request.head.sha || github.sha }}",
    }

    for job_id in ("source-proof", "backend", "frontend"):
        checkout = next(
            step for step in jobs[job_id]["steps"] if step.get("uses") == "actions/checkout@v4"
        )
        assert checkout["with"] == expected


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


def test_dev_gate_scope_classifies_product_only_changes(tmp_path: Path) -> None:
    backend_repository, backend_base = make_repository(tmp_path / "backend")
    commit_file(
        backend_repository,
        "src/domains/inventory/router.py",
        "changed\n",
        "backend",
    )
    assert classify_gate_scope(backend_repository, backend_base) == "BACKEND"

    frontend_repository, frontend_base = make_repository(tmp_path / "frontend")
    commit_file(
        frontend_repository,
        "frontend/src/pages/home/HomePage.tsx",
        "changed\n",
        "frontend",
    )
    assert classify_gate_scope(frontend_repository, frontend_base) == "FRONTEND"


def test_dev_gate_scope_promotes_mixed_and_shared_changes_to_full(tmp_path: Path) -> None:
    mixed_repository, mixed_base = make_repository(tmp_path / "mixed")
    commit_file(mixed_repository, "src/backend.py", "changed\n", "backend")
    commit_file(mixed_repository, "frontend/src/app.ts", "changed\n", "frontend")
    assert classify_gate_scope(mixed_repository, mixed_base) == "FULL"

    shared_paths = (
        ".github/workflows/dev-gate.yml",
        "frontend/package-lock.json",
        "frontend/nginx.conf",
        "frontend/scripts/product-design-guard.mjs",
        "frontend/src/api/schema.ts",
        "frontend/src/features/issues/issuesContract.ts",
        "src/packages/contracts/gateway/routes.py",
        "deploy/management/kustomization.yaml",
        "scripts/test.sh",
        "uv.lock",
    )
    for index, path in enumerate(shared_paths):
        repository, base_sha = make_repository(tmp_path / f"shared-{index}")
        commit_file(repository, path, "changed\n", "shared")
        assert classify_gate_scope(repository, base_sha) == "FULL", path


def test_dev_gate_scope_classifies_only_deployment_smoke_changes_as_smoke(
    tmp_path: Path,
) -> None:
    smoke_paths = (
        "frontend/scripts/post-deploy-route-smoke.mjs",
        "frontend/scripts/post-deploy-route-smoke.test.mjs",
        "scripts/post-deploy-smoke.sh",
        "scripts/post-deploy-console-smoke.sh",
        "scripts/post_deploy_read_smoke.sh",
        "scripts/pre-deploy-smoke.sh",
        "scripts/lib/public-edge.sh",
        "scripts/lib/cluster-curl.sh",
        "tests/test_deploy_smoke_phases.py",
    )
    for index, path in enumerate(smoke_paths):
        repository, base_sha = make_repository(tmp_path / f"smoke-{index}")
        commit_file(repository, path, "changed\n", "smoke")
        assert classify_gate_scope(repository, base_sha) == "SMOKE", path

    mixed_repository, mixed_base = make_repository(tmp_path / "smoke-mixed")
    commit_file(
        mixed_repository,
        "scripts/post-deploy-smoke.sh",
        "changed\n",
        "smoke",
    )
    commit_file(
        mixed_repository,
        "frontend/src/pages/home/HomePage.tsx",
        "changed\n",
        "product",
    )
    assert classify_gate_scope(mixed_repository, mixed_base) == "FULL"


def test_dev_gate_scope_fails_closed_for_unknown_or_invalid_ranges(tmp_path: Path) -> None:
    unknown_repository, unknown_base = make_repository(tmp_path / "unknown")
    commit_file(unknown_repository, "new-root/tool.txt", "changed\n", "unknown")
    assert classify_gate_scope(unknown_repository, unknown_base) == "FULL"

    empty_repository, empty_base = make_repository(tmp_path / "empty")
    assert classify_gate_scope(empty_repository, empty_base) == "FULL"
    assert classify_gate_scope(empty_repository, "missing-base") == "FULL"
