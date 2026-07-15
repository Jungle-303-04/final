from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / "scripts" / "commit-msg-gate.sh"
PROVENANCE = ROOT / "references" / "provenance" / "source.json"


def legacy_product_title() -> str:
    term = json.loads(PROVENANCE.read_text(encoding="utf-8"))["legacyProductTerms"][0]
    assert isinstance(term, str)
    return term.title()


@pytest.mark.parametrize(
    ("subject", "expected"),
    [
        ("feat(resources): 리소스 목록을 연다", "스코프를 쓰지 않는다"),
        ("feat: add settings screen", "제목은 한국어로 쓴다"),
        ("feature: 설정 화면을 연다", "형식이어야 한다"),
        ("fix: 설정 링크를 바로잡는다.", "마침표로 끝내지 않는다"),
        ("chore: 설정 변경", "모호한 단어로 끝내지 않는다"),
        (f"docs: {legacy_product_title()} 이식 범위를 기록한다", "provenance 금지어"),
    ],
)
def test_commit_message_gate_rejects_six_violation_classes(
    tmp_path: Path,
    subject: str,
    expected: str,
) -> None:
    result = run_gate(tmp_path, subject)

    assert result.returncode == 1
    assert expected in result.stderr


@pytest.mark.parametrize(
    "subject",
    [
        "feat: 사이드바에 설정 화면을 연결한다",
        "fix: 공개 배포의 커밋 범위를 검증한다",
    ],
)
def test_commit_message_gate_accepts_two_canonical_subjects(
    tmp_path: Path,
    subject: str,
) -> None:
    result = run_gate(tmp_path, subject)

    assert result.returncode == 0
    assert result.stderr == ""


def test_dev_gate_checks_only_the_bounded_new_commit_range() -> None:
    workflow = yaml.safe_load((ROOT / ".github/workflows/dev-gate.yml").read_text(encoding="utf-8"))
    steps = workflow["jobs"]["gate"]["steps"]
    checkout = next(step for step in steps if step.get("uses") == "actions/checkout@v4")
    command = next(
        step
        for step in steps
        if "scripts/commit-msg-gate.sh --range origin/dev..HEAD" in step.get("run", "")
    )

    assert "fetch-depth" not in checkout.get("with", {})
    assert command["name"] == "Enforce commit message convention"


def run_gate(tmp_path: Path, subject: str) -> subprocess.CompletedProcess[str]:
    message = tmp_path / "COMMIT_EDITMSG"
    message.write_text(f"{subject}\n", encoding="utf-8")
    return subprocess.run(
        [str(GATE), str(message)],
        cwd=ROOT,
        env={**os.environ, "LC_ALL": "C"},
        check=False,
        capture_output=True,
        text=True,
    )
