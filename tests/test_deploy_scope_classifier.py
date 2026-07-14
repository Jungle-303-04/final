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


def test_mixed_or_empty_range_fails_closed_to_full_scope(tmp_path: Path) -> None:
    repo, base = initialized_repo(tmp_path)

    assert classify(repo, base, base) == "FULL"

    frontend = repo / "frontend"
    frontend.mkdir()
    (frontend / "app.tsx").write_text("ui\n", encoding="utf-8")
    (repo / "service.py").write_text("backend\n", encoding="utf-8")
    head = commit(repo, "mixed")

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
