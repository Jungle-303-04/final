import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_make_clean_removes_only_regenerable_artifacts(tmp_path: Path) -> None:
    removable = (
        ".pytest_cache/state",
        ".ruff_cache/state",
        ".import_linter_cache/state",
        ".playwright-cli/state",
        "frontend/.playwright-cli/state",
        "references/ui-layer-lab/.playwright-cli/state",
        "frontend/dist/app.js",
        "references/ui-layer-lab/dist/app.js",
        "alembic/__pycache__/cache.pyc",
        "src/example/__pycache__/cache.pyc",
        "tests/__pycache__/cache.pyc",
        "scripts/__pycache__/cache.pyc",
    )
    protected = (
        ".env",
        ".env.local-test",
        ".env.plural-cloud",
        ".env.plural-cloud-instances",
        "outputs/local-bruno/environments/aws-live.local.bru",
        "node_modules/package/index.js",
        "frontend/node_modules/package/index.js",
        "references/ui-layer-lab/node_modules/package/index.js",
        ".venv/lib/python/site-packages/package/__pycache__/cache.pyc",
        "infra/terraform.tfstate",
        "infra/terraform.tfstate.backup",
        ".git/keep",
    )
    for relative_path in (*removable, *protected):
        path = tmp_path / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("keep until clean decides", encoding="utf-8")

    subprocess.run(
        ["make", "-f", str(ROOT / "Makefile"), "clean"],
        cwd=tmp_path,
        check=True,
        capture_output=True,
        text=True,
    )

    assert all(not (tmp_path / path).exists() for path in removable)
    assert all((tmp_path / path).exists() for path in protected)
