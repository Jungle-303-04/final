from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

from packages.contracts.event_bus.payloads import Diff, DiffAnalyzedPayload
from packages.runtime.app import EventContext

ROOT_DIR = Path(__file__).resolve().parents[1]
APP_PATH = ROOT_DIR / "services" / "repo-gateway-worker" / "app.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class FakeDb:
    def __init__(self) -> None:
        self.pull_requests: list[Any] = []

    def latest_github_token_ref(self) -> str | None:
        return None

    def save_pull_request(self, correlation_id, pr_url, title, body, status):
        self.pull_requests.append((correlation_id, pr_url, status))


def _analyzed(safe: bool) -> DiffAnalyzedPayload:
    diff = Diff(
        resource="deployment/checkout-api",
        namespace="sandbox",
        desired_image="img:new",
        actual_image="img:old",
        risk="sandbox-only",
    )
    return DiffAnalyzedPayload(
        diff=diff, safe=safe, risk="sandbox-only", reason="r"
    )


def test_repo_gateway_opens_pr_when_safe() -> None:
    module = load_module(APP_PATH, "test_repo_app")
    db = FakeDb()
    ctx = EventContext(
        event_id="e1",
        subject="diff.analyzed",
        correlation_id="c1",
        causation_id=None,
        db=db,
    )

    async def run(payload: DiffAnalyzedPayload) -> list[Any]:
        return [out async for out in module.on_diff_analyzed(payload, ctx)]

    safe = asyncio.run(run(_analyzed(True)))
    assert [o.__subject__ for o in safe] == ["safe_pr.created"]
    assert db.pull_requests

    unsafe = asyncio.run(run(_analyzed(False)))
    assert unsafe == []
