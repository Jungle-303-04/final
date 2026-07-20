from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "references" / "upstream"
PROVENANCE = ROOT / "references" / "provenance" / "source.json"


def load_provenance() -> dict[str, object]:
    return json.loads(PROVENANCE.read_text(encoding="utf-8"))


def test_upstream_license_and_notice_pin_the_audited_source() -> None:
    notice = (ROOT / "NOTICE").read_text(encoding="utf-8")
    provenance = load_provenance()

    assert (ROOT / "LICENSE-APACHE-2.0.txt").read_bytes() == (UPSTREAM / "LICENSE").read_bytes()
    assert str(provenance["repository"]).removesuffix(".git") in notice
    assert provenance["revision"] in notice
    assert "substantially modified and rewritten" in notice
    assert "nominative use" in notice
