from __future__ import annotations

import struct

import pytest
from pydantic import ValidationError

from packages.contracts.parity import ResourceRef
from packages.contracts.port_forward import (
    MAX_PORT_FORWARD_FRAME_BYTES,
    PortForwardDataFrame,
    PortForwardOpen,
    PortForwardStart,
    PortForwardWindow,
    decode_port_forward_data,
    encode_port_forward_data,
    parse_agent_port_forward_request,
)

SESSION_ID = "session_0123456789abcdef"


def resource(**overrides: object) -> ResourceRef:
    return ResourceRef(
        api_group=str(overrides.get("api_group", "")),
        version=str(overrides.get("version", "v1")),
        kind=str(overrides.get("kind", "Pod")),
        namespace=overrides.get("namespace", "shop"),
        name=str(overrides.get("name", "checkout-0")),
        uid=str(overrides.get("uid", "uid-pod-1")),
    )


def test_start_and_open_bind_exact_revision_resource_uid_and_port() -> None:
    start = PortForwardStart(
        capability_revision="a" * 64,
        resource=resource(),
        remote_port=8080,
        confirmation=True,
    )
    opened = PortForwardOpen(
        session_id=SESSION_ID,
        generation=4,
        capability_revision=start.capability_revision,
        resource=start.resource,
        remote_port=start.remote_port,
    )

    assert opened.resource.uid == "uid-pod-1"
    assert opened.generation == 4
    assert parse_agent_port_forward_request(opened.model_dump()) == opened


@pytest.mark.parametrize(
    "invalid",
    [
        resource(api_group="apps"),
        resource(version="v2"),
        resource(kind="Deployment"),
        resource(namespace=None),
    ],
)
def test_start_rejects_non_core_or_non_namespaced_targets(invalid: ResourceRef) -> None:
    with pytest.raises(ValidationError):
        PortForwardStart(
            capability_revision="a" * 64,
            resource=invalid,
            remote_port=8080,
            confirmation=True,
        )


def test_window_credit_is_bounded_and_directional() -> None:
    window = PortForwardWindow(
        session_id=SESSION_ID,
        generation=1,
        connection_id=1,
        direction="desktop_to_target",
        credit_bytes=4096,
    )
    assert window.direction == "desktop_to_target"

    with pytest.raises(ValidationError):
        PortForwardWindow(
            session_id=SESSION_ID,
            generation=1,
            connection_id=1,
            direction="desktop_to_target",
            credit_bytes=10**9,
        )


def test_binary_data_frame_round_trips_without_json_or_base64_overhead() -> None:
    frame = PortForwardDataFrame(
        session_id=SESSION_ID,
        generation=7,
        connection_id=11,
        sequence=42,
        direction="target_to_desktop",
        payload=b"\x00\xffbinary\x00payload",
    )

    assert decode_port_forward_data(encode_port_forward_data(frame)) == frame


@pytest.mark.parametrize(
    "mutator",
    [
        lambda raw: raw[:3],
        lambda raw: b"BAD!" + raw[4:],
        lambda raw: raw[:-1],
        lambda raw: raw + b"extra",
        lambda raw: raw[:5] + b"\x7f" + raw[6:],
    ],
)
def test_binary_decoder_rejects_truncated_unknown_or_inconsistent_frames(mutator) -> None:
    raw = encode_port_forward_data(
        PortForwardDataFrame(
            session_id=SESSION_ID,
            generation=1,
            connection_id=1,
            sequence=0,
            direction="desktop_to_target",
            payload=b"hello",
        )
    )

    with pytest.raises(ValueError):
        decode_port_forward_data(mutator(raw))


def test_binary_decoder_rejects_declared_payload_over_budget_before_allocation() -> None:
    raw = bytearray(
        encode_port_forward_data(
            PortForwardDataFrame(
                session_id=SESSION_ID,
                generation=1,
                connection_id=1,
                sequence=0,
                direction="desktop_to_target",
                payload=b"hello",
            )
        )
    )
    struct.pack_into("!I", raw, 28, MAX_PORT_FORWARD_FRAME_BYTES + 1)

    with pytest.raises(ValueError, match="payload length"):
        decode_port_forward_data(bytes(raw))
