from __future__ import annotations

import base64

import pytest
from packages.contracts.resource_files import (
    MAX_RESOURCE_FILE_CHUNK_BYTES,
    MAX_RESOURCE_FILE_PAGE_SIZE,
    ResourceFileCommandPayload,
    ResourceFileCommandRequest,
    ResourceFileDirectoryResult,
    ResourceFileEntry,
    ResourceFileReadResult,
)
from pydantic import ValidationError

from packages.contracts.parity import ResourceRef

POD_REF = ResourceRef(
    api_group="",
    version="v1",
    kind="Pod",
    namespace="shop",
    name="checkout-api-0",
    uid="pod-uid-1",
)


def request(**changes: object) -> ResourceFileCommandRequest:
    values: dict[str, object] = {
        "capability_id": "pod.filesystem",
        "capability_revision": "a" * 64,
        "resource_id": "pod:shop/checkout-api-0",
        "snapshot_id": "snapshot-42",
        "resource": POD_REF,
        "operation": "pod.list",
        "container": "app",
        "path": "/var/log",
        "cursor": 0,
        "limit": 40,
        "confirmation": True,
        "idempotency_key": "files-session-0001",
    }
    values.update(changes)
    return ResourceFileCommandRequest.model_validate(values)


def test_resource_file_request_normalizes_absolute_paths_and_bounds_pages() -> None:
    parsed = request(path="/var//log/../run/", limit=MAX_RESOURCE_FILE_PAGE_SIZE)

    assert parsed.path == "/var/run"
    assert parsed.operation == "pod.list"

    with pytest.raises(ValidationError, match="absolute POSIX"):
        request(path="../../etc/passwd")
    with pytest.raises(ValidationError, match="directory page"):
        request(limit=MAX_RESOURCE_FILE_PAGE_SIZE + 1)


def test_operation_specific_authority_rejects_browser_supplied_image_and_mixed_handles() -> None:
    image_metadata = request(
        capability_id="image.filesystem",
        operation="image.metadata",
        path=None,
        cursor=None,
        limit=None,
    )
    assert image_metadata.container == "app"

    with pytest.raises(ValidationError, match="artifact handle"):
        request(
            capability_id="image.filesystem",
            operation="image.list",
            artifact_id=None,
        )
    with pytest.raises(ValidationError, match="Pod operations"):
        request(operation="pod.list", artifact_id="artifact-" + "b" * 64)


def test_agent_payload_binds_exact_pod_resource_version() -> None:
    payload = ResourceFileCommandPayload(
        **request().model_dump(exclude={"confirmation", "idempotency_key"}),
        pod_resource_version="9981",
    )

    assert payload.resource == POD_REF
    assert payload.pod_resource_version == "9981"


def test_directory_and_file_results_are_bounded_and_checksum_each_chunk() -> None:
    directory = ResourceFileDirectoryResult(
        operation="pod.list",
        path="/var/log",
        entries=(
            ResourceFileEntry(
                name="app.log",
                path="/var/log/app.log",
                type="file",
                size=12,
                permissions="-rw-r--r--",
            ),
        ),
        cursor=0,
        next_cursor=None,
        total_entries=1,
        truncated=False,
    )
    assert directory.entries[0].name == "app.log"

    content = b"bounded file bytes"
    chunk = ResourceFileReadResult.from_bytes(
        operation="pod.read",
        path="/var/log/app.log",
        offset=0,
        content=content,
        eof=True,
        total_size=len(content),
    )
    assert base64.b64decode(chunk.data_base64) == content
    assert len(chunk.sha256) == 64

    with pytest.raises(ValidationError, match="chunk"):
        ResourceFileReadResult.from_bytes(
            operation="pod.read",
            path="/var/log/app.log",
            offset=0,
            content=b"x" * (MAX_RESOURCE_FILE_CHUNK_BYTES + 1),
            eof=False,
            total_size=None,
        )
