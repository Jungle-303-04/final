from __future__ import annotations

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


def test_pre_push_hook_calls_the_canonical_gate() -> None:
    config = yaml.safe_load((ROOT / ".pre-commit-config.yaml").read_text())
    assert set(config["default_install_hook_types"]) == {"pre-commit", "pre-push"}

    hooks = [hook for repo in config["repos"] for hook in repo["hooks"]]
    hook_by_id = {hook["id"]: hook for hook in hooks}
    assert "ruff-format" in hook_by_id
    assert hook_by_id["dev-full-gate"]["entry"] == "make gate"
    assert hook_by_id["dev-full-gate"]["stages"] == ["pre-push"]
    assert hook_by_id["dev-full-gate"]["pass_filenames"] is False

    hooks_recipe = make_recipe("hooks")
    assert "--hook-type pre-commit" in hooks_recipe
    assert "--hook-type pre-push" in hooks_recipe


def test_dev_push_ci_calls_the_canonical_gate_before_any_deploy_job() -> None:
    workflow = yaml.safe_load((ROOT / ".github/workflows/dev-gate.yml").read_text())
    triggers = workflow_triggers(workflow)

    assert triggers["push"]["branches"] == ["dev"]
    assert triggers["pull_request"]["branches"] == ["dev"]
    jobs = workflow["jobs"]
    assert any(
        step.get("run") == "make gate" for step in jobs["gate"]["steps"] if isinstance(step, dict)
    )
    for job_id, job in jobs.items():
        if "deploy" not in job_id.lower():
            continue
        needs = job.get("needs", [])
        assert "gate" in ([needs] if isinstance(needs, str) else needs)
