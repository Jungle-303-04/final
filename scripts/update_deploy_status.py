"""Replace the generated deployment observation without touching operator guidance."""

from __future__ import annotations

import argparse
import os
import re
from collections.abc import Sequence
from pathlib import Path
from urllib.parse import urlsplit

BEGIN_MARKER = "<!-- pipeline-observation:begin -->"
END_MARKER = "<!-- pipeline-observation:end -->"
GIT_SHA = re.compile(r"^[0-9a-f]{40}$")
IMAGE = re.compile(r"^[A-Za-z0-9._:/-]+@sha256:[0-9a-f]{64}$")
OBSERVED_AT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def validate_url(value: str) -> None:
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or any(character.isspace() for character in value)
    ):
        raise ValueError("base_url must be a public https URL without credentials or query data")


def render_observation(*, dev_sha: str, image: str, base_url: str, observed_at: str) -> str:
    if not GIT_SHA.fullmatch(dev_sha):
        raise ValueError("dev_sha must be a full lowercase Git SHA")
    if not IMAGE.fullmatch(image):
        raise ValueError("image must use an immutable sha256 digest")
    validate_url(base_url)
    if not OBSERVED_AT.fullmatch(observed_at):
        raise ValueError("observed_at must be UTC in YYYY-MM-DDTHH:MM:SSZ format")
    return "\n".join(
        (
            BEGIN_MARKER,
            "## 배포 파이프라인 관측값",
            "",
            "| 항목 | 값 |",
            "|---|---|",
            f"| 배포된 dev SHA | `{dev_sha}` |",
            f"| 서비스 이미지 | `{image}` |",
            f"| 접속 URL | <{base_url}> |",
            f"| 관측 시각 | `{observed_at}` |",
            END_MARKER,
        )
    )


def replace_observation(
    content: str, *, dev_sha: str, image: str, base_url: str, observed_at: str
) -> str:
    if content.count(BEGIN_MARKER) != 1 or content.count(END_MARKER) != 1:
        raise ValueError("deploy status must contain exactly one generated observation boundary")
    start = content.index(BEGIN_MARKER)
    end = content.index(END_MARKER, start) + len(END_MARKER)
    if start >= end:
        raise ValueError("deploy status observation boundary is invalid")
    rendered = render_observation(
        dev_sha=dev_sha,
        image=image,
        base_url=base_url.rstrip("/"),
        observed_at=observed_at,
    )
    return f"{content[:start]}{rendered}{content[end:]}"


def update_file(path: Path, *, dev_sha: str, image: str, base_url: str, observed_at: str) -> None:
    if path.is_symlink() or not path.is_file():
        raise ValueError("deploy status path must be an existing regular file")
    content = path.read_text(encoding="utf-8")
    updated = replace_observation(
        content,
        dev_sha=dev_sha,
        image=image,
        base_url=base_url,
        observed_at=observed_at,
    )
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(temporary, flags, 0o644)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(updated)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, required=True)
    parser.add_argument("--dev-sha", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--observed-at", required=True)
    args = parser.parse_args(argv)
    update_file(
        args.path,
        dev_sha=args.dev_sha,
        image=args.image,
        base_url=args.base_url,
        observed_at=args.observed_at,
    )
    print(f"updated deployment observation for {args.dev_sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
