from __future__ import annotations

import asyncio
import ssl
from pathlib import Path
from typing import Any

import yaml
from conftest import ROOT, load_file

from domains.target.install_manifest import target_install_manifest
from packages.contracts.gateway.requests import TargetRegisterRequest
from packages.contracts.terminal import (
    TerminalClose,
    TerminalConnected,
    TerminalEnd,
    TerminalError,
    TerminalExec,
    TerminalInput,
    TerminalOutput,
)


def load_terminal_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "target" / "cluster-agent" / "terminal_exec.py",
        "test_cluster_agent_terminal_exec_module",
    )


class FakeExecConnection:
    def __init__(self, frames: list[bytes]) -> None:
        self.frames: asyncio.Queue[bytes] = asyncio.Queue()
        for frame in frames:
            self.frames.put_nowait(frame)
        self.sent: list[bytes] = []

    async def recv(self) -> bytes:
        return await self.frames.get()

    async def send(self, message: bytes) -> None:
        self.sent.append(message)


class FakeConnector:
    def __init__(self, connection: FakeExecConnection) -> None:
        self.connection = connection
        self.calls: list[tuple[str, dict[str, str], ssl.SSLContext]] = []

    def __call__(self, url: str, headers: dict[str, str], context: ssl.SSLContext) -> Any:
        self.calls.append((url, headers, context))
        connection = self.connection

        class Manager:
            async def __aenter__(self) -> FakeExecConnection:
                return connection

            async def __aexit__(self, *_args: object) -> None:
                return None

        return Manager()


def controller_for(
    tmp_path: Path,
    monkeypatch: Any,
    connection: FakeExecConnection,
) -> tuple[Any, FakeConnector]:
    module = load_terminal_module()
    token = tmp_path / "token"
    token.write_text("service-account-token", encoding="utf-8")
    connector = FakeConnector(connection)
    controller = module.PodExecController(
        connector=connector,
        token_path=str(token),
        ca_cert_path=str(tmp_path / "unused-ca"),
        base_url="https://kubernetes.default.svc:443",
    )
    monkeypatch.setenv("POD_EXEC_ALLOWED_NAMESPACES", "sandbox")
    monkeypatch.setattr(controller, "_ssl_context", ssl.create_default_context)
    return controller, connector


def exec_request(command: str = "printf done") -> TerminalExec:
    return TerminalExec(
        session_id="terminal-1",
        namespace="sandbox",
        pod="api-0",
        container="app",
        command=command,
        timeout_seconds=10,
        tty=False,
    )


def test_agent_exec_streams_redacted_output_and_real_exit_code(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    module = load_terminal_module()
    status = b'{"status":"Failure","details":{"causes":[{"reason":"ExitCode","message":"7"}]}}'
    connection = FakeExecConnection(
        [
            bytes([module.STDOUT_CHANNEL]) + b"password=top-secret\n",
            bytes([module.STDERR_CHANNEL]) + b"warning\n",
            bytes([module.STATUS_CHANNEL]) + status,
        ]
    )
    controller, connector = controller_for(tmp_path, monkeypatch, connection)
    events: list[object] = []

    async def emit(value: object) -> None:
        events.append(value)

    async def run() -> None:
        handled = await controller.handle(
            exec_request("printf 'password=top-secret\\n'; exit 7").model_dump(),
            emit,
        )
        assert handled is True
        task = controller.sessions["terminal-1"].task
        assert task is not None
        await task

    asyncio.run(run())

    assert isinstance(events[0], TerminalConnected)
    output = "".join(event.data for event in events if isinstance(event, TerminalOutput))
    assert "top-secret" not in output
    assert "[REDACTED]" in output
    assert "warning" in output
    assert events[-1] == TerminalEnd(
        session_id="terminal-1",
        exit_code=7,
        reason="completed",
    )
    url, headers, _context = connector.calls[0]
    assert "/api/v1/namespaces/sandbox/pods/api-0/exec?" in url
    assert "command=%2Fbin%2Fsh&command=-lc" in url
    assert "tty=false" in url
    assert headers == {"Authorization": "Bearer service-account-token"}


def test_agent_forwards_bounded_stdin_and_cancels_session(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    connection = FakeExecConnection([])
    controller, _connector = controller_for(tmp_path, monkeypatch, connection)
    events: list[object] = []
    connected = asyncio.Event()

    async def emit(value: object) -> None:
        events.append(value)
        if isinstance(value, TerminalConnected):
            connected.set()

    async def run() -> None:
        await controller.handle(exec_request().model_dump(), emit)
        await asyncio.wait_for(connected.wait(), timeout=1)
        await controller.handle(
            TerminalInput(session_id="terminal-1", data="confirm\n").model_dump(), emit
        )
        for _ in range(20):
            if connection.sent:
                break
            await asyncio.sleep(0)
        await controller.handle(TerminalClose(session_id="terminal-1").model_dump(), emit)
        task = controller.sessions.get("terminal-1")
        if task is not None and task.task is not None:
            await task.task

    asyncio.run(run())

    assert connection.sent == [b"\x00confirm\n"]
    assert events[-1] == TerminalEnd(
        session_id="terminal-1",
        exit_code=None,
        reason="closed",
    )


def test_agent_rejects_namespace_outside_shared_allowlist(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    connection = FakeExecConnection([])
    controller, connector = controller_for(tmp_path, monkeypatch, connection)
    events: list[object] = []

    async def emit(value: object) -> None:
        events.append(value)

    request = exec_request().model_copy(update={"namespace": "kube-system"})
    asyncio.run(controller.handle(request.model_dump(), emit))

    assert connector.calls == []
    assert len(events) == 1
    assert isinstance(events[0], TerminalError)
    assert events[0].code == "invalid_target"


def test_pod_exec_rbac_is_present_in_generated_static_and_helm_manifests() -> None:
    request = TargetRegisterRequest(
        cluster_id="cluster-a",
        name="Cluster A",
        environment="sandbox",
        management_base_url="http://management.local:30080",
        image="ghcr.io/example/opsia-agent:test",
    )
    manifests = [
        target_install_manifest(request, "agent-secret"),
        (ROOT / "deploy" / "target" / "target.yaml").read_text(encoding="utf-8"),
        (ROOT / "charts" / "opsia" / "templates" / "agent-rbac.yaml")
        .read_text(encoding="utf-8")
        .replace('{{ include "opsia.fullname" . }}', "opsia")
        .replace('{{- include "opsia.labels" . | nindent 4 }}', "app: opsia")
        .replace("{{ .Release.Namespace }}", "opsia"),
    ]
    for manifest in manifests:
        docs = [item for item in yaml.safe_load_all(manifest) if item]
        cluster_role = next(item for item in docs if item.get("kind") == "ClusterRole")
        assert any(
            rule.get("apiGroups") == [""]
            and rule.get("resources") == ["pods/exec"]
            and rule.get("verbs") == ["create"]
            for rule in cluster_role["rules"]
        )
