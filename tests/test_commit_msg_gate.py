from __future__ import annotations

import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
GATE = ROOT_DIR / "scripts" / "commit-msg-gate.sh"


def run_gate(tmp_path: Path, subject: str) -> subprocess.CompletedProcess[str]:
    msg_file = tmp_path / "COMMIT_EDITMSG"
    msg_file.write_text(subject + "\n\n본문은 선택입니다.\n", encoding="utf-8")
    return subprocess.run(
        [str(GATE), str(msg_file)],
        cwd=ROOT_DIR,
        check=False,
        text=True,
        capture_output=True,
    )


def test_commit_msg_gate_accepts_valid_korean_subjects(tmp_path: Path) -> None:
    subjects = [
        "docs: 문서 색인을 정본화한다",
        "fix: 자식 노드 비교 순서를 바로잡는다",
    ]

    failures = [
        result.stderr for subject in subjects if (result := run_gate(tmp_path, subject)).returncode
    ]

    assert failures == []


def test_commit_msg_gate_rejects_required_violation_types(tmp_path: Path) -> None:
    cases = {
        "scope": "feat(ui): 상세 패널을 정리한다",
        "english": "feat: add workflow plan picker",
        "period": "docs: 문서 색인을 정리한다.",
        "vague": "fix: 인증 흐름 수정",
        "denylist_reference": "docs: radar 이식 범위를 정리한다",
        "denylist_internal_id": "docs: VP-019 지시서를 정리한다",
    }

    results = {name: run_gate(tmp_path, subject) for name, subject in cases.items()}

    assert {name for name, result in results.items() if result.returncode == 0} == set()
    assert "스코프를 쓰지 않는다" in results["scope"].stderr
    assert "제목은 한국어로 쓴다" in results["english"].stderr
    assert "마침표로 끝내지 않는다" in results["period"].stderr
    assert "모호한 단어로 끝내지 않는다" in results["vague"].stderr
    assert "commit-denylist.txt" in results["denylist_reference"].stderr
    assert "commit-denylist.txt" in results["denylist_internal_id"].stderr
