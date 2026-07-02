"""테스트 공용 헬퍼 — 워커 로드/실행/검증을 한 줄로."""

from __future__ import annotations

import asyncio
import importlib.util
import inspect
import sys
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

from packages.runtime.app import EventContext

ROOT = Path(__file__).resolve().parents[1]

SERVICE_LOCAL_MODULES = (
    "settings",
    "config",
    "kubernetes_api",
    "metric_collectors",
    "prometheus_metrics",
    "node_collector",
    "node_collector_manager",
    "commands",
    "commands.context",
    "commands.kubernetes",
    "commands.registry",
    "control",
    "control.policy",
    "control.reconciler",
    "control.store",
    "evidence",
    "evidence.collector",
    "evidence.scheduler",
    "evidence.store",
    "evidence.uploader",
    "providers",
    "providers.base",
    "providers.loki_providers",
    "providers.prometheus_providers",
    "providers.tempo_providers",
    "queries",
    "queries.payloads",
    "queries.registry",
    "span",
    "span.base",
    "span.otel",
    "workload",
    "workload.controller",
)


def load_file(path: Path, name: str) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    previous_modules = {
        module_name: sys.modules.pop(module_name, None) for module_name in SERVICE_LOCAL_MODULES
    }
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(path.parent))
        for module_name in SERVICE_LOCAL_MODULES:
            sys.modules.pop(module_name, None)
            if previous_modules[module_name] is not None:
                sys.modules[module_name] = previous_modules[module_name]


def load_service(name: str) -> Any:
    module = name.replace("/", "_")
    return load_file(ROOT / "src" / "services" / name / "app.py", f"svc_{module}")


def make_context(db: Any = None, **fields: Any) -> EventContext:
    base: dict[str, Any] = {
        "event_id": "evt-1",
        "subject": "test",
        "correlation_id": "corr-1",
        "causation_id": None,
        "db": db,
    }
    base.update(fields)
    return EventContext(**base)


def run_handler(
    handler: Callable[..., AsyncIterator[Any]], payload: Any, db: Any = None, **fields: Any
) -> list[Any]:
    ctx = make_context(db=db, **fields)

    async def go() -> list[Any]:
        result = handler(payload, ctx)
        if inspect.isasyncgen(result):
            return [out async for out in result]
        value = await result
        if value is None:
            return []
        return value if isinstance(value, list) else [value]

    return asyncio.run(go())


def subjects_of(payloads: list[Any]) -> list[str]:
    return [p.__subject__ for p in payloads]


class SpyDb:
    """모든 호출을 기록하는 범용 가짜 저장소(기본 반환 None)."""

    def __init__(self, **returns: Any) -> None:
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self._returns = returns

    def __getattr__(self, name: str) -> Callable[..., Any]:
        async def method(*args: Any) -> Any:
            self.calls.append((name, args))
            return self._returns.get(name)

        return method

    def called(self, name: str) -> bool:
        return any(c[0] == name for c in self.calls)
