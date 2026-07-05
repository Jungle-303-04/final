from __future__ import annotations

from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT_DIR / "docs"


def test_docs_do_not_exceed_three_levels_from_repo_root() -> None:
    too_deep = [
        str(path.relative_to(ROOT_DIR))
        for path in DOCS_DIR.rglob("*")
        if path.is_file() and len(path.relative_to(ROOT_DIR).parts) > 4
    ]

    assert too_deep == []


def test_all_markdown_docs_are_linked_from_docs_root() -> None:
    index = (DOCS_DIR / "README.md").read_text(encoding="utf-8")
    missing = []

    for path in sorted(DOCS_DIR.rglob("*.md")):
        rel = path.relative_to(DOCS_DIR).as_posix()
        if rel == "README.md":
            continue
        if f"({rel})" not in index:
            missing.append(rel)

    assert missing == []


def test_docs_do_not_reference_removed_local_kind_recovery_logs() -> None:
    removed_names = (
        "demo-recovery-2026-07-01",
        "dev-branch-error-audit-2026-07-01",
    )

    offenders = []
    for path in DOCS_DIR.rglob("*.md"):
        text = path.read_text(encoding="utf-8")
        if any(name in text for name in removed_names):
            offenders.append(path.relative_to(ROOT_DIR).as_posix())

    assert offenders == []
