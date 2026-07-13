#!/usr/bin/env python3
"""Validate a RemediationBundle and print its canonical JSON SHA-256."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from packages.contracts.gateway.responses import RemediationBundleResponse  # noqa: E402


def canonical_bytes(path: Path) -> bytes:
    payload = json.loads(path.read_text(encoding="utf-8"))
    validated = RemediationBundleResponse.model_validate(payload).model_dump(mode="json")
    return json.dumps(validated, sort_keys=True, separators=(",", ":")).encode()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--expected-sha256", default="")
    args = parser.parse_args()
    digest = hashlib.sha256(canonical_bytes(args.bundle)).hexdigest()
    if args.expected_sha256 and digest != args.expected_sha256:
        raise SystemExit(f"bundle sha256 mismatch: expected={args.expected_sha256} actual={digest}")
    print(digest)


if __name__ == "__main__":
    main()
