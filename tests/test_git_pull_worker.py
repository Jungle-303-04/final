from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

from packages.contracts.event_bus.payloads import GitWebhookReceived
from packages.runtime.app import EventContext

ROOT_DIR = Path(__file__).resolve().parents[1]
APP_PATH = ROOT_DIR / "services" / "git-pull-worker" / "app.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def test_git_pull_emits_git_changed() -> None:
    module = load_module(APP_PATH, "test_git_pull_app")
    payload = GitWebhookReceived(
        commit_sha="abc123", image="img:new", replicas=2
    )
    ctx = EventContext(
        event_id="e1",
        subject="git.webhook.received",
        correlation_id="c1",
        causation_id=None,
        db=None,
    )

    async def run() -> list[Any]:
        return [out async for out in module.on_git_webhook(payload, ctx)]

    outs = asyncio.run(run())
    assert [o.__subject__ for o in outs] == ["git.changed"]
    assert outs[0].commit_sha == "abc123"
    assert outs[0].image == "img:new"
    assert outs[0].replicas == 2
