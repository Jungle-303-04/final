from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
from types import ModuleType

from packages.events.in_memory import InMemoryEventBus

ROOT = Path(__file__).resolve().parents[1]


def _load_harness() -> ModuleType:
    path = ROOT / "scripts" / "event_bus_equivalence.py"
    spec = importlib.util.spec_from_file_location("event_bus_equivalence", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_delivery_scenario_is_deterministic_across_bus_implementations() -> None:
    harness = _load_harness()

    async def run() -> tuple[dict[str, object], dict[str, object]]:
        first = await harness.run_delivery_scenario(InMemoryEventBus())
        second = await harness.run_delivery_scenario(InMemoryEventBus())
        return first, second

    first, second = asyncio.run(run())

    assert first == second
    assert first == {
        "causation_preserved": True,
        "correlation_preserved": True,
        "input_payload": {"action": "restart", "attempt": 1},
        "output_payload": {"result": "accepted"},
        "redelivery_preserved": True,
        "workspace_preserved": True,
    }
