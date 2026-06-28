from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

from packages.contracts.event_bus.payloads import DesiredDiffPayload, Diff
from packages.runtime.app import EventContext

ROOT_DIR = Path(__file__).resolve().parents[1]
APP_PATH = ROOT_DIR / "services" / "diff-analyze-worker" / "app.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _diff(risk: str) -> Diff:
    return Diff(
        resource="deployment/checkout-api",
        namespace="sandbox",
        desired_image="img:new",
        actual_image="img:old",
        risk=risk,
    )


def test_analyze_marks_sandbox_safe() -> None:
    module = load_module(APP_PATH, "test_analyze_app")
    ctx = EventContext(
        event_id="e1",
        subject="desired.diff.detected",
        correlation_id="c1",
        causation_id=None,
        db=None,
    )

    async def run(diff: Diff) -> list[Any]:
        payload = DesiredDiffPayload(diff=diff)
        return [out async for out in module.on_desired_diff(payload, ctx)]

    safe = asyncio.run(run(_diff("sandbox-only")))
    assert [o.__subject__ for o in safe] == ["diff.analyzed"]
    assert safe[0].safe is True

    unsafe = asyncio.run(run(_diff("production")))
    assert unsafe[0].safe is False
