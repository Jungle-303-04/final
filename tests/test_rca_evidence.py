from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

from packages.events.envelope import event

ROOT_DIR = Path(__file__).resolve().parents[1]
RCA_WORKER_PATH = ROOT_DIR / "services" / "rca-worker" / "rca_worker.py"


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


class FakeEvents:
    def __init__(self) -> None:
        self.published: list[Any] = []

    async def publish(
        self,
        subject: str,
        source: str,
        payload: dict[str, Any],
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> Any:
        evt = event(subject, source, payload, correlation_id, causation_id)
        self.published.append(evt)
        return evt


class FakeRcaStore:
    def __init__(self) -> None:
        self.evidence: list[tuple[str, str, dict[str, Any]]] = []
        self.reports: list[tuple[str, str, str]] = []
        self.pull_requests: list[tuple[str, str]] = []

    def save_evidence(
        self, correlation_id: str, kind: str, payload: dict[str, Any]
    ) -> None:
        self.evidence.append((correlation_id, kind, payload))

    def save_rca_report(
        self,
        correlation_id: str,
        root_cause: str,
        action: str,
        payload: dict[str, Any],
    ) -> None:
        self.reports.append((correlation_id, root_cause, action))

    def save_pull_request(
        self,
        correlation_id: str,
        pr_url: str,
        title: str,
        body: str,
        status: str,
    ) -> None:
        self.pull_requests.append((correlation_id, pr_url))


class FakeOAuthAccounts:
    def latest_github_token_ref(self) -> str | None:
        return None


def test_rca_validates_evidence_and_emits_safe_pr() -> None:
    async def run() -> None:
        module = load_module(RCA_WORKER_PATH, "test_rca_worker")
        events = FakeEvents()
        rca_store = FakeRcaStore()
        workflow = module.RcaWorkflow(events, rca_store, FakeOAuthAccounts())

        evt = event(
            "cluster.evidence.received",
            "api-gateway",
            {
                "cluster_id": "target-cluster-01",
                "correlation_id": "corr-9",
                "kubernetes": {"pods": []},
                "metrics": {"cpu": 0.8},
                "logs": [{"line": "boom"}],
                "traces": {"slow_span": "GET /x"},
            },
            "corr-9",
        )

        await workflow.handle(evt)

        # 검증된 evidence가 저장되고 안전 PR까지 발행된다.
        assert rca_store.evidence[0][0] == "corr-9"
        assert rca_store.pull_requests and rca_store.reports
        subjects = [e.subject for e in events.published]
        assert subjects == [
            "evidence.built",
            "rca.completed",
            "safe_pr.created",
        ]

    asyncio.run(run())
