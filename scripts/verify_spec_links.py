#!/usr/bin/env python3
"""docs/spec 링크·코드 앵커 무결성 검증.

검사 항목:
1. 스펙 페이지 내 상대경로 마크다운 링크가 실제 파일을 가리키는가
2. 코드 앵커(`src/... :: Symbol`, `frontend/src/...`)의 경로가 존재하는가
3. 앵커의 심볼이 해당 소스 파일에 실제 존재하는가 (텍스트 매칭)

사용: python scripts/verify_spec_links.py  (리포 루트 기준, 실패 시 exit 1)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "docs" / "spec"

MD_LINK = re.compile(r"\[[^\]]*\]\(([^)#\s]+)(#[^)\s]*)?\)")
ANCHOR = re.compile(r"`((?:src|frontend/src|tests|scripts|alembic|config|deploy)/[\w./\-]+)(?:\s*::\s*([\w.]+))?`")

errors: list[str] = []

for page in sorted(SPEC.rglob("*.md")):
    rel_page = page.relative_to(ROOT)
    text = page.read_text(encoding="utf-8")

    for m in MD_LINK.finditer(text):
        href = m.group(1)
        if href.startswith(("http://", "https://", "mailto:")):
            continue
        target = (page.parent / href).resolve()
        if not target.exists():
            errors.append(f"{rel_page}: 깨진 링크 → {href}")

    for m in ANCHOR.finditer(text):
        path_str, symbol = m.group(1), m.group(2)
        target = ROOT / path_str
        if not target.exists():
            errors.append(f"{rel_page}: 없는 코드 경로 → {path_str}")
            continue
        if symbol and target.is_file():
            head = symbol.split(".")[0]
            src = target.read_text(encoding="utf-8", errors="ignore")
            if not re.search(rf"\b{re.escape(head)}\b", src):
                errors.append(f"{rel_page}: 심볼 없음 → {path_str} :: {symbol}")

if errors:
    print(f"✗ 스펙 무결성 실패 ({len(errors)}건)")
    for e in errors:
        print(f"  {e}")
    sys.exit(1)

pages = len(list(SPEC.rglob("*.md")))
print(f"✓ 스펙 무결성 통과 — {pages}개 페이지 검사 완료")
