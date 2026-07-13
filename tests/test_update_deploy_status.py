"""Tests for the generated deploy status boundary."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "update_deploy_status", ROOT / "scripts/update_deploy_status.py"
)
assert SPEC is not None and SPEC.loader is not None
update_deploy_status = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = update_deploy_status
SPEC.loader.exec_module(update_deploy_status)
assert isinstance(update_deploy_status, ModuleType)

SHA = "a" * 40
IMAGE = "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/opsia@sha256:" + "b" * 64
OBSERVED_AT = "2026-07-14T00:00:00Z"


def template() -> str:
    return """# Status

before
<!-- pipeline-observation:begin -->
old
<!-- pipeline-observation:end -->
after
"""


def test_replace_observation_preserves_operator_owned_content() -> None:
    result = update_deploy_status.replace_observation(
        template(),
        dev_sha=SHA,
        image=IMAGE,
        base_url="https://k8s.example.test/",
        observed_at=OBSERVED_AT,
    )

    assert result.startswith("# Status\n\nbefore\n")
    assert result.endswith("\nafter\n")
    assert f"| 배포된 dev SHA | `{SHA}` |" in result
    assert f"| 서비스 이미지 | `{IMAGE}` |" in result
    assert "| 접속 URL | <https://k8s.example.test> |" in result


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("dev_sha", "short"),
        ("image", "opsia:latest"),
        ("base_url", "https://user:password@example.test"),
        ("base_url", "http://example.test"),
        ("observed_at", "2026-07-14"),
    ],
)
def test_replace_observation_rejects_untrusted_values(field: str, value: str) -> None:
    values = {
        "dev_sha": SHA,
        "image": IMAGE,
        "base_url": "https://k8s.example.test",
        "observed_at": OBSERVED_AT,
    }
    values[field] = value

    with pytest.raises(ValueError):
        update_deploy_status.replace_observation(template(), **values)


def test_replace_observation_requires_one_boundary() -> None:
    with pytest.raises(ValueError, match="exactly one"):
        update_deploy_status.replace_observation(
            "# no generated boundary\n",
            dev_sha=SHA,
            image=IMAGE,
            base_url="https://k8s.example.test",
            observed_at=OBSERVED_AT,
        )


def test_update_file_refuses_symlink(tmp_path: Path) -> None:
    target = tmp_path / "target.md"
    target.write_text(template(), encoding="utf-8")
    link = tmp_path / "status.md"
    link.symlink_to(target)

    with pytest.raises(ValueError, match="regular file"):
        update_deploy_status.update_file(
            link,
            dev_sha=SHA,
            image=IMAGE,
            base_url="https://k8s.example.test",
            observed_at=OBSERVED_AT,
        )
