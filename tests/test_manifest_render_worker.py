from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

from packages.contracts.event_bus.payloads import GitChangedPayload
from packages.runtime.app import EventContext

ROOT_DIR = Path(__file__).resolve().parents[1]
APP_PATH = ROOT_DIR / "services" / "manifest-render-worker" / "app.py"


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
        self.changes: list[Any] = []

    def save_repo_change(self, correlation_id, commit_sha, manifest) -> None:
        self.changes.append((correlation_id, commit_sha, manifest))


def test_render_emits_manifest_rendered() -> None:
    module = load_module(APP_PATH, "test_render_app")
    db = FakeDb()
    payload = GitChangedPayload(
        commit_sha="abc123", image="img:new", replicas=2
    )
    ctx = EventContext(
        event_id="e1",
        subject="git.changed",
        correlation_id="c1",
        causation_id=None,
        db=db,
    )

    async def run() -> list[Any]:
        return [out async for out in module.on_git_changed(payload, ctx)]

    outs = asyncio.run(run())
    assert [o.__subject__ for o in outs] == ["manifest.rendered"]
    rendered = outs[0].rendered_manifest
    assert rendered.spec.image == "img:new"
    assert rendered.api_version == "apps/v1"
    assert db.changes
