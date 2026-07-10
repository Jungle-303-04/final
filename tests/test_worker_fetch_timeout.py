from __future__ import annotations

import asyncio
import json
import os
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
import yaml

from packages.runtime import worker
from packages.runtime.worker import EventHandlerSpec, EventRetryPolicy, WorkerRuntime

ROOT = Path(__file__).resolve().parents[1]
FETCH_TIMEOUT_ENV = "WORKER_FETCH_TIMEOUT_SECONDS"


def read_default_fetch_timeout(configured_value: str | None) -> dict[str, object]:
    process_env = os.environ.copy()
    process_env["PYTHONPATH"] = str(ROOT / "src")
    if configured_value is None:
        process_env.pop(FETCH_TIMEOUT_ENV, None)
    else:
        process_env[FETCH_TIMEOUT_ENV] = configured_value

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import json; "
                "from packages.runtime.worker import EventRetryPolicy; "
                "value = EventRetryPolicy().fetch_timeout_seconds; "
                "print(json.dumps({'value': value, 'type': type(value).__name__}))"
            ),
        ],
        cwd=ROOT,
        env=process_env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_fetch_timeout_accepts_fractional_seconds() -> None:
    assert read_default_fetch_timeout("0.05") == {"value": 0.05, "type": "float"}


def test_fetch_timeout_keeps_one_second_global_default() -> None:
    assert read_default_fetch_timeout(None) == {"value": 1.0, "type": "float"}


@pytest.mark.parametrize("configured_value", ["0", "-0.5", "not-a-number"])
def test_fetch_timeout_falls_back_for_unsafe_values(configured_value: str) -> None:
    assert read_default_fetch_timeout(configured_value) == {"value": 1.0, "type": "float"}


def test_only_workflow_controller_overrides_fetch_timeout() -> None:
    configured_deployments: list[tuple[str, str]] = []
    for manifest_path in sorted((ROOT / "deploy" / "management").glob("*.yaml")):
        for document in yaml.safe_load_all(manifest_path.read_text(encoding="utf-8")):
            if not document or document.get("kind") != "Deployment":
                continue
            container = document["spec"]["template"]["spec"]["containers"][0]
            for item in container.get("env", []):
                if item.get("name") == FETCH_TIMEOUT_ENV:
                    configured_deployments.append(
                        (document["metadata"]["name"], item.get("value", ""))
                    )

    assert configured_deployments == [("workflow-controller", "0.05")]


def test_worker_runtime_fetches_subjects_independently(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    async def run() -> None:
        signal_handlers: dict[signal.Signals, Any] = {}
        subscribed_subjects: list[str] = []
        fetch_calls: list[tuple[str, int, float]] = []
        first_fetch_started = asyncio.Event()
        release_first_fetch = asyncio.Event()

        class Subscription:
            def __init__(self, subject: str) -> None:
                self.subject = subject

            async def fetch(self, batch: int, timeout: float) -> list[Any]:
                fetch_calls.append((self.subject, batch, timeout))
                if self.subject == "subject.first":
                    first_fetch_started.set()
                    await release_first_fetch.wait()
                if self.subject == "subject.second":
                    await first_fetch_started.wait()
                    release_first_fetch.set()
                    signal_handlers[signal.SIGTERM]()
                return []

        class Bus:
            async def connect(self) -> None:
                return None

            async def subscribe(self, subject: str, durable: str) -> Subscription:
                subscribed_subjects.append(subject)
                return Subscription(subject)

            async def close(self) -> None:
                return None

        class Db:
            def dispose(self) -> None:
                return None

        class Relay:
            def __init__(self, *_args: Any) -> None:
                pass

            async def run_once(self) -> int:
                return 0

        async def wait_for_database(_db: Any) -> None:
            return None

        async def handler(_event: Any) -> list[Any]:
            return []

        from packages.storage import database

        monkeypatch.setattr(database, "wait_for_database", wait_for_database)
        monkeypatch.setattr(worker, "OutboxRelay", Relay)
        monkeypatch.setattr(worker, "HEARTBEAT_PATH", str(tmp_path / "heartbeat"))
        monkeypatch.setattr(
            worker.signal,
            "signal",
            lambda signum, callback: signal_handlers.__setitem__(signum, callback),
        )

        spec = EventHandlerSpec(
            service_name="ordered-worker",
            subjects=("subject.first", "subject.second"),
            handler_factory=lambda _events, _db: handler,
            retry_policy=EventRetryPolicy(fetch_timeout_seconds=0.05, idle_sleep_seconds=0),
        )
        runtime = WorkerRuntime(spec, bus=Bus(), db=Db())  # type: ignore[arg-type]

        await asyncio.wait_for(runtime.run(), timeout=1)

        assert subscribed_subjects == ["subject.first", "subject.second"]
        assert sorted(fetch_calls) == [
            ("subject.first", 1, 0.05),
            ("subject.second", 1, 0.05),
        ]

    asyncio.run(run())
