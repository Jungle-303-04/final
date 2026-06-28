from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

from packages.contracts.event_bus.payloads import (
    ManifestRenderedPayload,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)
from packages.runtime.app import EventContext

ROOT_DIR = Path(__file__).resolve().parents[1]
APP_PATH = ROOT_DIR / "services" / "diff-worker" / "app.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def test_diff_emits_desired_diff() -> None:
    module = load_module(APP_PATH, "test_diff_app")
    payload = ManifestRenderedPayload(
        rendered_manifest=RenderedManifest(
            api_version="apps/v1",
            kind="Deployment",
            metadata=RenderedMetadata(name="checkout-api", namespace="sandbox"),
            spec=RenderedSpec(replicas=2, image="img:new"),
        )
    )
    ctx = EventContext(
        event_id="e1",
        subject="manifest.rendered",
        correlation_id="c1",
        causation_id=None,
        db=None,
    )

    async def run() -> list[Any]:
        return [
            out async for out in module.on_manifest_rendered(payload, ctx)
        ]

    outs = asyncio.run(run())
    assert [o.__subject__ for o in outs] == ["desired.diff.detected"]
    assert outs[0].diff.desired_image == "img:new"
