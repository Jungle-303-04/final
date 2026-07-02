from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_PATH = ROOT_DIR / "services" / "target-cluster-agent" / "agent.py"


def load_agent_module():
    spec = importlib.util.spec_from_file_location(
        "test_target_agent_command_module",
        TARGET_AGENT_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {TARGET_AGENT_PATH}")

    module = importlib.util.module_from_spec(spec)
    module_names = (
        "settings",
        "telemetry_queries",
        "span",
        "span.base",
        "span.otel",
        "providers",
        "providers.base",
        "providers.loki_providers",
        "providers.prometheus_providers",
        "providers.tempo_providers",
        "evidence",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(TARGET_AGENT_PATH.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(TARGET_AGENT_PATH.parent))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


def test_agent_unwraps_queued_command_payload() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)

    payload = agent.command_payload(
        {
            "payload": {
                "command_id": "cmd-1",
                "action": module.QUERY_RUN_ACTION,
                "payload": {
                    "query": {
                        "source": "prometheus",
                        "name": "one_off_up",
                        "query": "up",
                    }
                },
            }
        }
    )

    assert payload["query"]["source"] == "prometheus"
