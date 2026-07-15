from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "references" / "upstream"
PROVENANCE = ROOT / "references" / "provenance" / "source.json"
SOURCE_LEDGER = ROOT / "docs" / "migration" / "reference-source-ledger.json"
UI_SOURCE_PREFIX = "packages/k8s-ui/src/"


def load_source_ledger() -> dict[str, object]:
    return json.loads(SOURCE_LEDGER.read_text(encoding="utf-8"))


def load_provenance() -> dict[str, object]:
    return json.loads(PROVENANCE.read_text(encoding="utf-8"))


def source_files() -> dict[str, Path]:
    return {
        path.relative_to(UPSTREAM).as_posix(): path
        for path in UPSTREAM.rglob("*")
        if path.is_file()
    }


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_frozen_upstream_snapshot_matches_committed_source_ledger() -> None:
    ledger = load_source_ledger()
    provenance = load_provenance()
    rows = ledger["files"]
    assert isinstance(rows, list)
    assert ledger["schemaVersion"] == 2
    assert ledger["sourceRevision"] == provenance["revision"]
    assert ledger["sourceProvenance"] == "references/provenance/source.json"
    assert ledger["fileCount"] == len(rows)

    files = source_files()
    ledger_by_path = {str(row["path"]): row for row in rows}
    assert len(ledger_by_path) == len(rows)
    assert set(files) == set(ledger_by_path)
    for relative_path, file_path in files.items():
        row = ledger_by_path[relative_path]
        assert file_path.stat().st_size == row["size"]
        assert sha256(file_path) == row["sha256"]

    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
    assert "reference-provenance.mjs revision" in makefile
    assert "node scripts/reference-ledger.mjs" in makefile


def test_upstream_ui_snapshot_is_complete_and_neutrally_named() -> None:
    source = UPSTREAM / UI_SOURCE_PREFIX
    ledger = load_source_ledger()
    rows = ledger["files"]
    assert isinstance(rows, list)
    ledger_paths = {
        str(row["path"]) for row in rows if str(row["path"]).startswith(UI_SOURCE_PREFIX)
    }
    snapshot_paths = {
        path.relative_to(UPSTREAM).as_posix() for path in source.rglob("*") if path.is_file()
    }

    assert source.is_dir()
    assert snapshot_paths == ledger_paths
    provenance = load_provenance()
    legacy_directory = f"{provenance['legacyProductTerms'][0]}-upstream"
    assert not (ROOT / "references" / legacy_directory).exists()


def test_upstream_license_and_notice_pin_the_audited_source() -> None:
    notice = (ROOT / "NOTICE").read_text(encoding="utf-8")
    provenance = load_provenance()

    assert (ROOT / "LICENSE-APACHE-2.0.txt").read_bytes() == (UPSTREAM / "LICENSE").read_bytes()
    assert str(provenance["repository"]).removesuffix(".git") in notice
    assert provenance["revision"] in notice
    assert "substantially modified and rewritten" in notice
    assert "nominative use" in notice
