"""등록된 이벤트와 구독자를 한눈에 출력한다.

사용: python scripts/events.py   (또는 make events)
body 정의(@events.reg)와 서비스 핸들러(@app.sub)를 import 해 레지스트리를
채운 뒤 표로 보여준다. App 으로 마이그레이션한 서비스를 SERVICES 에 추가.
"""

from __future__ import annotations

import importlib
import importlib.util
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

# App 기반 서비스의 진입 파일(app.py). import 하면 @app.sub 가 등록된다.
SERVICES = ["rca-worker", "command-worker", "gitops/git-pull-worker", "gitops/manifest-render-worker", "gitops/diff-worker", "gitops/diff-analyze-worker", "gitops/repo-gateway-worker", "demo/ping-worker", "demo/ping-gateway", "projection/dashboard-projection-service", "projection/audit-timeline-service"]


def _load(path: Path, name: str) -> None:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load: {path}")
    # 서비스 내부 모듈(command_config 등) import 를 위해 디렉토리를 path 에.
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(importlib.util.module_from_spec(spec))
    finally:
        sys.path.remove(str(path.parent))


def main() -> None:
    # 이벤트 타입 정의(@events.reg) 등록.
    importlib.import_module("packages.contracts.event_bus.bodies")

    # 서비스 핸들러(@app.sub) 등록.
    for service in SERVICES:
        module = service.replace("/", "_")
        _load(ROOT_DIR / "services" / service / "app.py", f"app_{module}")

    from packages.contracts.event_bus.registry import events

    print(events.describe())


if __name__ == "__main__":
    main()
