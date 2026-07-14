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

    assert "bash scripts/test.sh" in recipe
    assert "bash scripts/manifest-check.sh" in recipe
    assert "npm ci" in recipe
    assert "npm run typecheck" in recipe
    assert "npm run lint" in recipe
    assert "npm test" in recipe
    assert "npm run build" in recipe


def test_make_gate_fast_keeps_static_checks_and_explicit_changed_tests() -> None:
    makefile = (ROOT / "Makefile").read_text()
    recipe = make_recipe("gate-fast")

    assert "FAST_TESTS ?= tests/test_dev_gate_contract.py" in makefile
    assert "uv run ruff check ." in recipe
    assert "uv run ruff format --check ." in recipe
    assert "uv run lint-imports --config .importlinter" in recipe
    assert "uv run python -m compileall -q src scripts" in recipe
    assert "uv run pytest -q $(FAST_TESTS)" in recipe
    assert "npm run typecheck" in recipe
    assert "npm run lint" in recipe
    assert "npm test" in recipe
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


def test_dev_push_ci_calls_the_canonical_gate_before_any_deploy_job() -> None:
    workflow = yaml.safe_load((ROOT / ".github/workflows/dev-gate.yml").read_text())
    triggers = workflow_triggers(workflow)

    assert triggers["push"]["branches"] == ["dev"]
    assert triggers["pull_request"]["branches"] == ["dev"]
    jobs = workflow["jobs"]
    helm_step = next(step for step in jobs["gate"]["steps"] if step.get("name") == "Set up Helm")
    assert helm_step["uses"] == "Azure/setup-helm@9bc31f4ebc9c6b171d7bfbaa5d006ae7abdb4310"
    assert helm_step["with"]["version"] == "v4.2.2"
    assert any(
        step.get("run") == "make gate" for step in jobs["gate"]["steps"] if isinstance(step, dict)
    )
    for job_id, job in jobs.items():
        if "deploy" not in job_id.lower():
            continue
        needs = job.get("needs", [])
        assert "gate" in ([needs] if isinstance(needs, str) else needs)
