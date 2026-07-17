from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from conftest import ROOT, load_file

from packages.contracts.parity import ResourceRef
from packages.contracts.port_forward import (
    PortForwardConnectionOpen,
    PortForwardDataFrame,
    PortForwardOpen,
    PortForwardWindow,
    decode_port_forward_data,
    encode_port_forward_data,
)

MODULE = load_file(
    ROOT / "src/services/target/cluster-agent/port_forward_stream.py",
    "agent_port_forward_stream",
)
SESSION = "session_0123456789abcdef"


@dataclass
class FakeReader:
    values: asyncio.Queue[bytes] = field(default_factory=asyncio.Queue)

    async def read(self, _size: int = -1) -> bytes:
        return await self.values.get()


@dataclass
class FakeWriter:
    written: bytearray = field(default_factory=bytearray)
    closed: bool = False
    eof: bool = False

    def write(self, data: bytes) -> None:
        self.written.extend(data)

    async def drain(self) -> None:
        return None

    def can_write_eof(self) -> bool:
        return True

    def write_eof(self) -> None:
        self.eof = True

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        return None


def open_request() -> PortForwardOpen:
    return PortForwardOpen(
        session_id=SESSION,
        generation=1,
        capability_revision="a" * 64,
        resource=ResourceRef(
            api_group="",
            version="v1",
            kind="Pod",
            namespace="shop",
            name="checkout-0",
            uid="uid-pod-1",
        ),
        remote_port=8080,
    )


def test_controller_relays_bounded_ordered_bytes_and_returns_credit_after_target_write() -> None:
    async def scenario() -> None:
        reader = FakeReader()
        writer = FakeWriter()
        events = []
        frames: list[bytes] = []

        async def resolve(_resource, _port):
            return MODULE.ResolvedTcpTarget("Pod", "checkout-0", "uid-pod-1", "10.0.0.9", 8080)

        async def connect(host, port):
            assert (host, port) == ("10.0.0.9", 8080)
            return reader, writer

        async def emit_event(event):
            events.append(event)

        async def emit_data(frame):
            frames.append(frame)

        controller = MODULE.PortForwardController(resolver=resolve, connector=connect)
        request = open_request()
        assert await controller.handle_control(request.model_dump(), emit_event, emit_data)
        connection_open = PortForwardConnectionOpen(
            session_id=SESSION,
            generation=1,
            connection_id=3,
        )
        assert await controller.handle_control(connection_open.model_dump(), emit_event, emit_data)

        inbound = PortForwardDataFrame(
            session_id=SESSION,
            generation=1,
            connection_id=3,
            sequence=0,
            direction="desktop_to_target",
            payload=b"request",
        )
        assert await controller.handle_data(encode_port_forward_data(inbound))
        assert bytes(writer.written) == b"request"
        assert any(
            isinstance(event, PortForwardWindow)
            and event.direction == "desktop_to_target"
            and event.credit_bytes == len(b"request")
            for event in events
        )

        await reader.values.put(b"response")
        for _ in range(20):
            if frames:
                break
            await asyncio.sleep(0)
        outbound = decode_port_forward_data(frames[0])
        assert outbound.connection_id == 3
        assert outbound.sequence == 0
        assert outbound.direction == "target_to_desktop"
        assert outbound.payload == b"response"

        window = PortForwardWindow(
            session_id=SESSION,
            generation=1,
            connection_id=3,
            direction="target_to_desktop",
            credit_bytes=len(b"response"),
        )
        assert await controller.handle_control(window.model_dump(), emit_event, emit_data)
        await controller.close_all()
        assert writer.closed

    asyncio.run(scenario())


def test_controller_fences_stale_generation_and_out_of_order_connection_data() -> None:
    async def scenario() -> None:
        reader = FakeReader()
        writer = FakeWriter()
        events = []

        async def resolve(_resource, _port):
            return MODULE.ResolvedTcpTarget("Pod", "checkout-0", "uid-pod-1", "10.0.0.9", 8080)

        async def connect(_host, _port):
            return reader, writer

        async def emit_event(event):
            events.append(event)

        async def emit_data(_frame):
            return None

        controller = MODULE.PortForwardController(resolver=resolve, connector=connect)
        request = open_request()
        await controller.handle_control(request.model_dump(), emit_event, emit_data)
        await controller.handle_control(
            PortForwardConnectionOpen(
                session_id=SESSION,
                generation=1,
                connection_id=1,
            ).model_dump(),
            emit_event,
            emit_data,
        )

        stale = PortForwardDataFrame(
            session_id=SESSION,
            generation=2,
            connection_id=1,
            sequence=0,
            direction="desktop_to_target",
            payload=b"stale",
        )
        assert await controller.handle_data(encode_port_forward_data(stale))
        assert bytes(writer.written) == b""

        out_of_order = PortForwardDataFrame(
            session_id=SESSION,
            generation=1,
            connection_id=1,
            sequence=9,
            direction="desktop_to_target",
            payload=b"forged",
        )
        assert await controller.handle_data(encode_port_forward_data(out_of_order))
        assert bytes(writer.written) == b""
        assert any(getattr(event, "code", None) == "protocol_violation" for event in events)
        await controller.close_all()

    asyncio.run(scenario())


def test_resolver_rejects_external_name_and_undeclared_pod_port() -> None:
    service = {
        "metadata": {"namespace": "shop", "name": "checkout", "uid": "uid-service"},
        "spec": {"type": "ExternalName", "ports": [{"port": 443, "protocol": "TCP"}]},
    }
    pod = {
        "metadata": {"namespace": "shop", "name": "checkout-0", "uid": "uid-pod"},
        "spec": {"containers": [{"ports": [{"containerPort": 9090, "protocol": "TCP"}]}]},
        "status": {"phase": "Running", "podIP": "10.0.0.9"},
    }

    for body, port, resolver in (
        (service, 443, MODULE._resolve_service),
        (pod, 8080, MODULE._resolve_pod),
    ):
        try:
            resolver(body, port)
        except MODULE.PortForwardTargetError:
            pass
        else:
            raise AssertionError("unsafe target was accepted")
