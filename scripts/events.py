"""등록된 이벤트와 구독자를 한눈에 출력한다.

사용: python scripts/events.py   (또는 make events)
body 정의(@event)와 서비스 핸들러(@app.on)를 import 해 레지스트리를
채운 뒤 표로 보여준다. 서비스 목록은 수동 관리하지 않는다 —
discovery 가 App 기반(worker) 서비스를 자동 발견해 로드한다.
"""

from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SRC_DIR = str(ROOT_DIR / "src")
sys.path = [entry for entry in sys.path if entry != SRC_DIR]
sys.path.insert(0, SRC_DIR)

from packages.runtime.discovery import discover_services  # noqa: E402


def _load(path: Path, name: str) -> None:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load: {path}")
    # 서비스 내부 모듈(command_config 등) import 를 위해 디렉토리를 path 에.
    sys.path.insert(0, str(path.parent))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(path.parent))


def main() -> None:
    # 이벤트 타입 정의(@event) 등록 — domains/*/events.py 자동 발견.
    importlib.import_module("domains.registry").load_domain_events()

    # 서비스 핸들러(@app.on) 등록 — App 기반(worker) 서비스 자동 발견.
    for svc in discover_services(ROOT_DIR):
        if svc.kind != "worker":
            continue
        _load(ROOT_DIR / svc.path, f"app_{svc.name.replace('-', '_')}")

    from packages.contracts.event_bus.registry import events

    print(events.describe())


if __name__ == "__main__":
    main()
