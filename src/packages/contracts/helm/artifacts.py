"""Typed, bounded contracts for agent-sanitized Helm revision artifacts."""

from __future__ import annotations

from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from packages.contracts.modeling import StrictModel

HELM_RELEASE_ARTIFACT_READ_ACTION = "helm.release.artifact.read"
HELM_RELEASE_ARTIFACT_READ_CAPABILITY = "helm_release_artifact_read_v1"
HELM_ARTIFACT_MAX_ACTIVE_PER_CLUSTER = 8
HELM_ARTIFACT_CONTENT_MAX_BYTES = 4 * 1024 * 1024

HelmArtifactKind = Literal["manifest", "values", "manifest_diff", "values_diff"]
HelmArtifactFormat = Literal["yaml", "unified_diff"]


class HelmArtifactReadRequest(StrictModel):
    cluster_id: str = Field(min_length=1, max_length=253)
    artifact: HelmArtifactKind
    revision: int = Field(ge=1)
    comparison_revision: int | None = Field(default=None, ge=1)
    all_values: bool = False

    @model_validator(mode="after")
    def comparison_matches_artifact(self) -> Self:
        is_diff = self.artifact.endswith("_diff")
        if is_diff and self.comparison_revision is None:
            raise ValueError("Helm diff artifacts require a comparison revision")
        if not is_diff and self.comparison_revision is not None:
            raise ValueError("single Helm artifacts cannot carry a comparison revision")
        if self.comparison_revision == self.revision:
            raise ValueError("Helm artifact revisions must be distinct")
        if self.artifact not in {"values", "values_diff"} and self.all_values:
            raise ValueError("all_values is valid only for values artifacts")
        return self


class HelmArtifactCommandPayload(HelmArtifactReadRequest):
    namespace: str = Field(min_length=1, max_length=253)
    release_name: str = Field(min_length=1, max_length=253)

    @field_validator("namespace", "release_name")
    @classmethod
    def safe_cli_identity(cls, value: str) -> str:
        normalized = value.strip()
        if normalized.startswith("-") or any(
            character in normalized for character in ("\0", "\r", "\n", "/")
        ):
            raise ValueError("Helm artifact identity is unsafe")
        return normalized


class HelmArtifactResult(StrictModel):
    artifact: HelmArtifactKind
    format: HelmArtifactFormat
    namespace: str = Field(min_length=1, max_length=253)
    release_name: str = Field(min_length=1, max_length=253)
    revision: int = Field(ge=1)
    comparison_revision: int | None = Field(default=None, ge=1)
    all_values: bool = False
    content: str
    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    content_bytes: int = Field(ge=0, le=HELM_ARTIFACT_CONTENT_MAX_BYTES)
    source_bytes: int = Field(ge=0)
    redaction_applied: Literal[True] = True
    truncated: bool = False

    @model_validator(mode="after")
    def content_metadata_matches(self) -> Self:
        encoded = self.content.encode("utf-8")
        if len(encoded) != self.content_bytes:
            raise ValueError("Helm artifact byte count does not match content")
        is_diff = self.artifact.endswith("_diff")
        if is_diff != (self.comparison_revision is not None):
            raise ValueError("Helm artifact comparison metadata is inconsistent")
        if is_diff != (self.format == "unified_diff"):
            raise ValueError("Helm artifact format is inconsistent")
        return self
