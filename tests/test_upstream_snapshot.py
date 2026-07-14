from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "references" / "upstream"
SOURCE_REVISION = "10461f40bcfaf6dd578b24262c8f8fb84ae20766"


def test_upstream_ui_snapshot_is_complete_and_neutrally_named() -> None:
    source = UPSTREAM / "packages" / "k8s-ui" / "src"

    assert source.is_dir()
    assert sum(path.is_file() for path in source.rglob("*")) == 492
    assert not (ROOT / "references" / "radar-upstream").exists()


def test_upstream_license_and_notice_pin_the_audited_source() -> None:
    notice = (ROOT / "NOTICE").read_text(encoding="utf-8")

    assert (ROOT / "LICENSE-APACHE-2.0.txt").read_bytes() == (UPSTREAM / "LICENSE").read_bytes()
    assert "https://github.com/skyhook-io/radar" in notice
    assert SOURCE_REVISION in notice
    assert "substantially modified and rewritten" in notice
    assert "nominative use" in notice
