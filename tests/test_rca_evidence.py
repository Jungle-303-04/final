from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

from packages.contracts.event_bus.payloads import ClusterEvidenceReceived
from packages.contracts.event_bus.registry import EventContext

ROOT_DIR = Path(__file__).resolve().parents[1]
RCA_WORKER_PATH = ROOT_DIR / "services" / "rca-worker" / "app.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    previous_settings = sys.modules.pop("settings", None)
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(path.parent))
        sys.modules.pop("settings", None)
        if previous_settings is not None:
            sys.modules["settings"] = previous_settings


class FakeDb:
    def __init__(self) -> None:
        self.evidence: list[Any] = []
        self.reports: list[Any] = []
        self.pull_requests: list[Any] = []

    def latest_github_token_ref(self) -> str | None:
        return None

    def save_evidence(self, correlation_id, kind, payload) -> None:
        self.evidence.append((correlation_id, kind, payload))

    def save_rca_report(
        self, correlation_id, root_cause, action, payload
    ) -> None:
        self.reports.append((correlation_id, root_cause, action))

    def save_pull_request(
        self, correlation_id, pr_url, title, body, status
    ) -> None:
        self.pull_requests.append((correlation_id, pr_url))


def test_rca_subscriber_yields_typed_event_chain() -> None:
    module = load_module(RCA_WORKER_PATH, "test_rca_worker")
    db = FakeDb()
    payload = ClusterEvidenceReceived(
        cluster_id="target-cluster-01",
        kubernetes={"pods": []},
        metrics={"cpu": 0.8},
        logs=[{"line": "boom"}],
        traces={"slow_span": "GET /x"},
        correlation_id="corr-9",
    )
    ctx = EventContext(
        event_id="evt-1",
        subject="cluster.evidence.received",
        correlation_id="corr-9",
        causation_id=None,
        db=db,
    )

    async def run() -> list[Any]:
        return [out async for out in module.on_cluster_evidence(payload, ctx)]

    outs = asyncio.run(run())

    # 한 핸들러가 yield 로 세 이벤트를 체이닝 (타입 있는 payload).
    assert [out.__subject__ for out in outs] == [
        "evidence.built",
        "rca.completed",
        "safe_pr.created",
    ]
    # 부수효과(저장)도 일어났다.
    assert db.evidence and db.reports and db.pull_requests
