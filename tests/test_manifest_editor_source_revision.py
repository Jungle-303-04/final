from __future__ import annotations

import pytest

from domains.manifest_editor.source_revision import SourceRevision, SourceRevisionCodec


def revision(**overrides: str) -> SourceRevision:
    values = {
        "workspace_id": "workspace-a",
        "user_id": "user-a",
        "resource_id": "resource-a",
        "application_id": "application-a",
        "repository_ref": "owner/repository",
        "branch": "main",
        "binding_manifest_path": "deploy/overlays/production",
        "resolved_manifest_path": "deploy/base/api-server.yaml",
        "base_sha": "a" * 40,
        "source_sha256": f"sha256:{'b' * 64}",
    }
    values.update(overrides)
    return SourceRevision(**values)


def test_source_revision_round_trip_is_scope_bound() -> None:
    codec = SourceRevisionCodec("s" * 32, now=lambda: 100)
    expected = revision()

    token = codec.encode(expected)

    assert codec.decode(token, expected=expected) == expected
    with pytest.raises(ValueError, match="scope changed"):
        codec.decode(token, expected=revision(resource_id="resource-b"))


def test_source_revision_rejects_tampering_and_expiry() -> None:
    encoder = SourceRevisionCodec("s" * 32, ttl_seconds=10, now=lambda: 100)
    token = encoder.encode(revision())

    with pytest.raises(ValueError, match="invalid"):
        encoder.inspect(f"{token[:-1]}x")

    expired = SourceRevisionCodec("s" * 32, ttl_seconds=10, now=lambda: 111)
    with pytest.raises(ValueError, match="expired"):
        expired.inspect(token)
