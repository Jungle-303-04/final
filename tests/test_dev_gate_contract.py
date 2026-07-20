from __future__ import annotations

import os
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def make_recipe(target: str) -> str:
    lines = (ROOT / "Makefile").read_text().splitlines()
    start = next(index for index, line in enumerate(lines) if line.startswith(f"{target}:"))
    recipe: list[str] = []
    for line in lines[start + 1 :]:
        if line and not line.startswith(("\t", " ")):
            break
        recipe.append(line)
    return "\n".join(recipe)


def workflow_triggers(document: dict[object, object]) -> dict[str, object]:
    triggers = document.get("on") or document.get(True)
    assert isinstance(triggers, dict)
    return triggers


def test_make_gate_is_the_single_full_gate_entrypoint() -> None:
    recipe = make_recipe("gate")

    assert "$(MAKE) gate-backend" in recipe
    assert "$(MAKE) gate-frontend" in recipe

    backend_recipe = make_recipe("gate-backend")
    assert "bash scripts/test.sh" in backend_recipe
    assert "bash scripts/manifest-check.sh" in backend_recipe

    makefile = (ROOT / "Makefile").read_text()
    minimum_recipe = make_recipe("gate-contract-manifest")
    assert (
        "gate-contract-manifest: product-brand-boundary-check reference-ledger-check "
        "reference-feature-ledger-check"
    ) in makefile
    assert "tests/test_dev_gate_workflow.py" in minimum_recipe
    assert "tests/test_merged_pr_gate_reuse.py" in minimum_recipe
    assert "tests/test_commit_msg_gate.py" not in minimum_recipe
    assert "bash scripts/manifest-check.sh" in minimum_recipe

    frontend_recipe = make_recipe("gate-frontend")
    assert "npm ci" in frontend_recipe
    assert "npm run typecheck" in frontend_recipe
    assert "npm run lint" in frontend_recipe
    assert "npm test" in frontend_recipe
    assert "npm run build" in frontend_recipe

    changed_frontend_recipe = make_recipe("gate-frontend-changed")
    assert 'git cat-file -e "$(GATE_BASE)^{commit}"' in changed_frontend_recipe
    assert 'npm test -- --changed "$(GATE_BASE)"' in changed_frontend_recipe
    assert "npm run typecheck" in changed_frontend_recipe
    assert "npm run lint" in changed_frontend_recipe
    assert "npm run build" in changed_frontend_recipe


def test_make_gate_fast_keeps_static_checks_without_repeating_ci_product_tests() -> None:
    makefile = (ROOT / "Makefile").read_text()
    recipe = make_recipe("gate-fast")

    assert "FAST_TESTS" not in makefile
    assert "uv run ruff check ." in recipe
    assert "uv run ruff format --check ." in recipe
    assert "uv run lint-imports --config .importlinter" in recipe
    assert "uv run python -m compileall -q src scripts" in recipe
    assert "npm run typecheck" in recipe
    assert "npm run lint" in recipe
    assert "product-design-guard.mjs --release-gate" in recipe
    assert "uv run pytest" not in recipe
    assert "npm test" not in recipe
    assert "npm run build" not in recipe


def test_python_quality_gate_matches_pre_commit_repository_scope() -> None:
    script = (ROOT / "scripts/test.sh").read_text()
    lint_recipe = make_recipe("lint")
    format_recipe = make_recipe("format")

    assert "uv run ruff check ." in script
    assert "uv run ruff format --check ." in script
    assert "uv run ruff check ." in lint_recipe
    assert "uv run ruff format ." in format_recipe


def test_pre_push_hook_calls_the_fast_gate() -> None:
    config = yaml.safe_load((ROOT / ".pre-commit-config.yaml").read_text())
    assert set(config["default_install_hook_types"]) == {"pre-commit", "pre-push"}

    hooks = [hook for repo in config["repos"] for hook in repo["hooks"]]
    hook_by_id = {hook["id"]: hook for hook in hooks}
    assert "ruff-format" in hook_by_id
    assert hook_by_id["dev-fast-gate"]["entry"] == "bash scripts/pre-push-gate.sh"
    assert hook_by_id["dev-fast-gate"]["stages"] == ["pre-push"]
    assert hook_by_id["dev-fast-gate"]["pass_filenames"] is False

    wrapper = (ROOT / "scripts/pre-push-gate.sh").read_text()
    assert "set -- make gate-fast" in wrapper
    assert "set -- make gate\n" not in wrapper

    hooks_recipe = make_recipe("hooks")
    assert "--hook-type pre-commit" in hooks_recipe
    assert "--hook-type pre-push" in hooks_recipe


def test_pre_push_wrapper_scrubs_parent_repository_git_environment() -> None:
    environment = {**os.environ, "GIT_INDEX_FILE": "/tmp/parent-index"}
    result = subprocess.run(
        ["bash", "scripts/pre-push-gate.sh", "env"],
        cwd=ROOT,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )

    exported = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    assert "GIT_INDEX_FILE" not in exported
    assert exported["PRE_COMMIT_ALLOW_NO_CONFIG"] == "1"


def test_dev_ci_reuses_pr_proof_on_push_and_keeps_full_pr_checks() -> None:
    workflow = yaml.safe_load((ROOT / ".github/workflows/dev-gate.yml").read_text())
    triggers = workflow_triggers(workflow)

    assert triggers["push"]["branches"] == ["dev"]
    assert triggers["pull_request"]["branches"] == ["dev"]
    jobs = workflow["jobs"]
    assert set(jobs) == {"source-proof", "backend", "frontend", "gate"}
    assert "needs" not in jobs["source-proof"]
    assert jobs["backend"]["needs"] == "source-proof"
    assert jobs["frontend"]["needs"] == "source-proof"
    resolver = next(
        step for step in jobs["source-proof"]["steps"] if step.get("name") == "Resolve gate scope"
    )
    assert "verify-merged-pr-gate.sh" in resolver["run"]
    assert "classify-dev-gate-scope.sh" in resolver["run"]
    assert jobs["source-proof"]["outputs"]["gate_scope"] == (
        "${{ steps.gate-scope.outputs.scope }}"
    )
    assert jobs["gate"]["needs"] == ["source-proof", "backend", "frontend"]
    helm_step = next(step for step in jobs["backend"]["steps"] if step.get("name") == "Set up Helm")
    assert helm_step["uses"] == "Azure/setup-helm@9bc31f4ebc9c6b171d7bfbaa5d006ae7abdb4310"
    assert helm_step["with"]["version"] == "v4.2.2"
    assert helm_step["if"] == (
        "${{ needs.source-proof.outputs.gate_scope == 'FULL' "
        "|| needs.source-proof.outputs.gate_scope == 'BACKEND' }}"
    )
    full_or_backend = (
        "${{ needs.source-proof.outputs.gate_scope == 'FULL' "
        "|| needs.source-proof.outputs.gate_scope == 'BACKEND' }}"
    )
    commit_gate_runs = [
        step["run"]
        for job in jobs.values()
        for step in job.get("steps", [])
        if "commit-msg-gate.sh" in str(step.get("run", ""))
    ]
    assert commit_gate_runs == ["scripts/commit-msg-gate.sh --range origin/dev..HEAD"]
    assert all(
        step.get("name") != "Verify commit message gate rules" for step in jobs["backend"]["steps"]
    )
    assert jobs["backend"]["steps"][-1]["run"] == "make gate-backend"
    assert jobs["backend"]["steps"][-1]["if"] == full_or_backend
    assert jobs["frontend"]["steps"][-1]["run"] == "make gate-frontend"
    assert jobs["frontend"]["steps"][-1]["if"] == (
        "${{ needs.source-proof.outputs.gate_scope == 'FULL' }}"
    )
    for job_id in jobs:
        if "deploy" not in job_id.lower():
            continue
        raise AssertionError(f"Dev Gate must not contain a deployment job: {job_id}")
