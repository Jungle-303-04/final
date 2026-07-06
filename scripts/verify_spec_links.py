#!/usr/bin/env python3
"""docs/spec 링크·코드 앵커·동기화 상태 무결성 검증.

검사 항목:
1. 상대경로 마크다운 링크가 실제 파일을 가리키는가
2. 코드 앵커(`src/... :: Symbol`)의 경로가 존재하는가
3. 앵커의 심볼이 해당 소스 파일에 실제 존재하는가 (텍스트 매칭)
4. front matter(source_commit, status)가 존재하는가
5. [code-ahead 탐지] source_commit 이후 앵커 경로에 코드 커밋이 있으면 → 스펙 미갱신
6. [spec-ahead 보고] status: spec-ahead 페이지 → 코드 미반영(구현 대기) 목록

사용: python scripts/verify_spec_links.py  (리포 루트 기준, 실패 시 exit 1)
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "docs" / "spec"

MD_LINK = re.compile(r"\[[^\]]*\]\(([^)#\s]+)(#[^)\s]*)?\)")
ANCHOR = re.compile(
    r"`((?:src|frontend/src|tests|scripts|alembic|config|deploy)/[\w./\-]+)(?:\s*::\s*([\w.]+))?`"
)
FRONT = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)

# front matter 면제 페이지 (메타 문서)
META_PAGES = {"README.md", "_conventions.md"}
# 모든 검사 면제 (예시 스니펫 포함 메타 문서)
SKIP_PAGES = {"_conventions.md"}

errors: list[str] = []
code_ahead: list[str] = []
spec_ahead: list[str] = []


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    ).stdout.strip()


for page in sorted(SPEC.rglob("*.md")):
    if page.name in SKIP_PAGES:
        continue
    rel_page = page.relative_to(ROOT)
    text = page.read_text(encoding="utf-8")

    # 1. 상대 링크
    for m in MD_LINK.finditer(text):
        href = m.group(1)
        if href.startswith(("http://", "https://", "mailto:")):
            continue
        if not (page.parent / href).resolve().exists():
            errors.append(f"{rel_page}: 깨진 링크 → {href}")

    # 2·3. 코드 앵커
    anchor_paths: set[str] = set()
    for m in ANCHOR.finditer(text):
        path_str, symbol = m.group(1), m.group(2)
        target = ROOT / path_str
        if not target.exists():
            errors.append(f"{rel_page}: 없는 코드 경로 → {path_str}")
            continue
        anchor_paths.add(path_str)
        if symbol and target.is_file():
            head = symbol.split(".")[0]
            src = target.read_text(encoding="utf-8", errors="ignore")
            if not re.search(rf"\b{re.escape(head)}\b", src):
                errors.append(f"{rel_page}: 심볼 없음 → {path_str} :: {symbol}")

    # 4~6. front matter + 동기화 상태
    if page.name in META_PAGES:
        continue
    fm = FRONT.match(text)
    if not fm:
        errors.append(f"{rel_page}: front matter 없음 (source_commit/status 필요)")
        continue
    meta = dict(
        (k.strip(), v.strip())
        for k, _, v in (line.partition(":") for line in fm.group(1).splitlines())
        if _
    )
    commit = meta.get("source_commit", "")
    status = meta.get("status", "")
    if not commit:
        errors.append(f"{rel_page}: source_commit 누락")
        continue
    if status not in {"synced", "spec-ahead"}:
        errors.append(f"{rel_page}: status 값 오류 → {status!r} (synced|spec-ahead)")
        continue

    if status == "spec-ahead":
        spec_ahead.append(str(rel_page))
        continue

    if git("cat-file", "-t", commit) != "commit":
        errors.append(f"{rel_page}: source_commit이 유효한 커밋이 아님 → {commit}")
        continue

    if anchor_paths:
        newer = git("log", "--oneline", f"{commit}..HEAD", "--", *sorted(anchor_paths))
        if newer:
            lines = newer.splitlines()
            code_ahead.append(
                f"{rel_page} (기준 {commit[:8]}, 이후 코드 커밋 {len(lines)}건)\n"
                + "\n".join(f"      {line}" for line in lines[:5])
            )

# ── 보고 ──────────────────────────────────────────────
pages = len(list(SPEC.rglob("*.md")))
fail = False

if errors:
    fail = True
    print(f"✗ 무결성 오류 {len(errors)}건")
    for e in errors:
        print(f"  {e}")

if code_ahead:
    fail = True
    print(f"\n✗ code-ahead — 코드는 변경됐지만 스펙이 뒤처짐 ({len(code_ahead)}건)")
    for e in code_ahead:
        print(f"  {e}")

if spec_ahead:
    print(f"\n⚠ spec-ahead — 스펙 선행, 코드 미반영(구현 대기) ({len(spec_ahead)}건)")
    for e in spec_ahead:
        print(f"  {e}")

if fail:
    sys.exit(1)
print(f"✓ 스펙 무결성 통과 — {pages}개 페이지 검사 완료")
