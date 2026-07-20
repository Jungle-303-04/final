"""Automatic dev deployment scope classification contracts."""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLASSIFIER = ROOT / "scripts/classify-deploy-scope.sh"


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def commit(repo: Path, message: str) -> str:
    git(repo, "add", "--all")
    git(repo, "commit", "-m", message)
    return git(repo, "rev-parse", "HEAD")


def classify(repo: Path, base: str, head: str) -> str:
    return subprocess.run(
        ["bash", str(CLASSIFIER), base, head],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def initialized_repo(tmp_path: Path) -> tuple[Path, str]:
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init")
    git(repo, "config", "user.name", "test")
    git(repo, "config", "user.email", "test@example.com")
    (repo / "README.md").write_text("base\n", encoding="utf-8")
    return repo, commit(repo, "base")


def test_frontend_only_range_selects_console_scope(tmp_path: Path) -> None:
    repo, base = initialized_repo(tmp_path)
    frontend = repo / "frontend"
    frontend.mkdir()
    (frontend / "app.tsx").write_text("first\n", encoding="utf-8")
    commit(repo, "frontend one")
    (frontend / "app.tsx").write_text("second\n", encoding="utf-8")
    head = commit(repo, "frontend two")

    assert classify(repo, base, head) == "CONSOLE"


def test_operational_reports_only_select_no_deployment(tmp_path: Path) -> None:
    repo, base = initialized_repo(tmp_path)
    for path in (
        "docs/BLOCKERS.md",
        "docs/GOAL-LOG.md",
        "docs/STATUS-REPORT.md",
    ):
        target = repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("changed\n", encoding="utf-8")
    head = commit(repo, "operational reports")

    assert classify(repo, base, head) == "NONE"


def test_operational_reports_do_not_promote_product_scope(tmp_path: Path) -> None:
    console_parent = tmp_path / "console"
    console_parent.mkdir()
    console_repo, console_base = initialized_repo(console_parent)
    report = console_repo / "docs" / "STATUS-REPORT.md"
    report.parent.mkdir(parents=True)
    report.write_text("changed\n", encoding="utf-8")
    frontend = console_repo / "frontend" / "app.tsx"
    frontend.parent.mkdir()
    frontend.write_text("changed\n", encoding="utf-8")
    console_head = commit(console_repo, "frontend and report")
    assert classify(console_repo, console_base, console_head) == "CONSOLE"

    full_parent = tmp_path / "full"
    full_parent.mkdir()
    full_repo, full_base = initialized_repo(full_parent)
    report = full_repo / "docs" / "GOAL-LOG.md"
    report.parent.mkdir(parents=True)
    report.write_text("changed\n", encoding="utf-8")
    (full_repo / "service.py").write_text("changed\n", encoding="utf-8")
    full_head = commit(full_repo, "backend and report")
    assert classify(full_repo, full_base, full_head) == "FULL"


def test_mixed_or_empty_range_fails_closed_to_full_scope(tmp_path: Path) -> None:
    repo, base = initialized_repo(tmp_path)

    assert classify(repo, base, base) == "FULL"

    frontend = repo / "frontend"
    frontend.mkdir()
    (frontend / "app.tsx").write_text("ui\n", encoding="utf-8")
    (repo / "service.py").write_text("backend\n", encoding="utf-8")
    head = commit(repo, "mixed")

    assert classify(repo, base, head) == "FULL"


def test_other_documentation_remains_fail_closed(tmp_path: Path) -> None:
    repo, base = initialized_repo(tmp_path)
    contract = repo / "docs" / "spec" / "runtime.md"
    contract.parent.mkdir(parents=True)
    contract.write_text("changed\n", encoding="utf-8")
    head = commit(repo, "contract docs")

    assert classify(repo, base, head) == "FULL"


def test_move_from_backend_into_frontend_remains_full_scope(tmp_path: Path) -> None:
    repo, base = initialized_repo(tmp_path)
    source = repo / "service.py"
    source.write_text("backend\n", encoding="utf-8")
    source_commit = commit(repo, "backend")
    frontend = repo / "frontend"
    frontend.mkdir()
    source.rename(frontend / "service.py")
    head = commit(repo, "move")

    assert base != source_commit
    assert classify(repo, source_commit, head) == "FULL"
