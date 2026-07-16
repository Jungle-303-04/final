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
        ("feat(resources): 리소스 목록 / 화면 진입", "스코프를 쓰지 않는다"),
        ("feat: add settings screen", "제목은 한국어로 쓴다"),
        ("feature: 설정 화면 / 화면 진입", "형식이어야 한다"),
        ("fix: 설정 링크 / 경로 정합성.", "문장부호로 끝내지 않는다"),
        ("fix: 설정 링크 / 경로 정합성!", "문장부호로 끝내지 않는다"),
        ("fix: 설정 링크 / 경로 정합성?", "문장부호로 끝내지 않는다"),
        ("fix: 설정 링크 / 경로 정합성。", "문장부호로 끝내지 않는다"),
        ("fix: 설정 링크 / 경로 정합성！", "문장부호로 끝내지 않는다"),
        ("fix: 설정 링크 / 경로 정합성？", "문장부호로 끝내지 않는다"),
        ("fix: 설정 링크 / 경로 정합성…", "문장부호로 끝내지 않는다"),
        ("chore: 설정 / 변경", "모호한 단어로 끝내지 않는다"),
        (f"docs: {legacy_product_title()} 이식 / 범위 기록", "provenance 금지어"),
        ("feat: 설정 화면", "명사 키워드가 둘 이상"),
        ("feat:  / 설정 화면", "명사 키워드가 둘 이상"),
        ("feat: 설정 화면 / ", "명사 키워드가 둘 이상"),
        ("feat: 설정 화면/ 경로 연결", "명사 키워드가 둘 이상"),
        ("feat: 설정 화면 연결한다 / 경로 정합성", "서술형·동사형"),
        ("fix: 설정 링크 / 연결했다", "서술형·동사형"),
        ("docs: 계약 규칙 / 정리합니다", "서술형·동사형"),
        ("chore: 오류 안내 / 수정한다", "서술형·동사형"),
        ("feat: 비교 흐름 / 추가한다", "서술형·동사형"),
        ("fix: 경로 상태 / 모은다", "서술형·동사형"),
        ("feat: 메뉴 열기 / 연다", "서술형·동사형"),
        ("fix: 상태 표시 / 보인다", "서술형·동사형"),
        ("fix: 상태 표시 / 막는다", "서술형·동사형"),
        ("fix: 상태 표시 / 늘린다", "서술형·동사형"),
        ("Merge pull request #603 from example/branch", "형식이어야 한다"),
        ('Revert "feat: 설정 화면 / 경로 연결"', "형식이어야 한다"),
        ("docs: 내부 문서 / VP-014 근거", "denylist 금지어"),
    ],
)
def test_commit_message_gate_rejects_hard_and_narrative_violation_classes(
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
        "feat: 사이드바 설정 / 화면 연결",
        "fix: 공개 배포 / 커밋 범위",
        "ci: 커밋 게이트 / GitHub Actions",
        "feat: Tauri API / 데스크톱 브리지",
        "revert: 경로 상태 / 이전 동작",
    ],
)
def test_commit_message_gate_accepts_nominal_korean_keyword_subjects(
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

    assert checkout["with"] == {
        "ref": "${{ github.event.pull_request.head.sha || github.sha }}",
    }
    assert command["name"] == "Enforce commit message convention"


def test_pull_request_gate_audits_head_commits_not_the_synthetic_merge_subject() -> None:
    workflow = yaml.safe_load((ROOT / ".github/workflows/dev-gate.yml").read_text(encoding="utf-8"))
    steps = workflow["jobs"]["gate"]["steps"]
    prepare = next(
        step for step in steps if step.get("name") == "Prepare bounded commit message range"
    )

    assert (
        prepare["env"]["AUDIT_HEAD_SHA"]
        == "${{ github.event.pull_request.head.sha || github.sha }}"
    )
    assert 'origin "${AUDIT_HEAD_SHA}"' in prepare["run"]
    assert "GITHUB_SHA" not in prepare["run"]


def test_dev_gate_runs_commit_message_unit_tests_before_the_full_gate() -> None:
    workflow = yaml.safe_load((ROOT / ".github/workflows/dev-gate.yml").read_text(encoding="utf-8"))
    steps = workflow["jobs"]["gate"]["steps"]
    names = [step.get("name") for step in steps]
    unit_test_index = names.index("Verify commit message gate rules")
    full_gate_index = names.index("Run canonical gate")

    assert steps[unit_test_index]["run"] == "uv run pytest -q tests/test_commit_msg_gate.py"
    assert unit_test_index < full_gate_index


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
