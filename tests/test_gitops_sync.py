from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

from packages.events.envelope import event

ROOT_DIR = Path(__file__).resolve().parents[1]
GITOPS_PATH = ROOT_DIR / "services" / "gitops-sync-worker" / "gitops_sync.py"


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


class FakeRepo:
    def __init__(self) -> None:
        self.changes: list[tuple[str, str, dict[str, Any]]] = []

    def save_repo_change(
        self, correlation_id: str, commit_sha: str, manifest: dict[str, Any]
    ) -> None:
        self.changes.append((correlation_id, commit_sha, manifest))


def test_gitops_validates_webhook_and_emits_typed_payloads() -> None:
    async def run() -> None:
        module = load_module(GITOPS_PATH, "test_gitops_sync")
        events = FakeEvents()
        repo = FakeRepo()
        workflow = module.GitOpsSyncWorkflow(events, repo)

        evt = event(
            "git.webhook.received",
            "api-gateway",
            {"commit_sha": "abc123"},
            "corr-7",
        )

        await workflow.handle(evt)

        assert repo.changes[0][1] == "abc123"
        assert [e.subject for e in events.published] == [
            "git.changed",
            "manifest.rendered",
            "desired.diff.detected",
            "command.requested",
        ]
        git_changed = events.published[0].payload
        assert git_changed["commit_sha"] == "abc123"
        assert set(git_changed["manifest"]) == {
            "app",
            "image",
            "replicas",
            "namespace",
        }

    asyncio.run(run())
