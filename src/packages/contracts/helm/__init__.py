"""Typed contracts for read-only Helm release observations."""

from packages.contracts.helm.artifacts import (
    HELM_ARTIFACT_CONTENT_MAX_BYTES,
    HELM_ARTIFACT_MAX_ACTIVE_PER_CLUSTER,
    HELM_RELEASE_ARTIFACT_READ_ACTION,
    HELM_RELEASE_ARTIFACT_READ_CAPABILITY,
    HelmArtifactCommandPayload,
    HelmArtifactReadRequest,
    HelmArtifactResult,
)
from packages.contracts.helm.releases import (
    HelmAvailability,
    HelmFeatureAvailability,
    HelmObservationCoverage,
    HelmOwnedResource,
    HelmOwnedResourceObservation,
    HelmRelease,
    HelmReleaseDetail,
    HelmReleaseDetailResponse,
    HelmReleaseHistoryEntry,
    HelmReleaseListResponse,
    HelmResourceHealthAvailability,
    HelmResourceHealthObservation,
)

__all__ = [
    "HELM_ARTIFACT_CONTENT_MAX_BYTES",
    "HELM_ARTIFACT_MAX_ACTIVE_PER_CLUSTER",
    "HELM_RELEASE_ARTIFACT_READ_ACTION",
    "HELM_RELEASE_ARTIFACT_READ_CAPABILITY",
    "HelmAvailability",
    "HelmArtifactCommandPayload",
    "HelmArtifactReadRequest",
    "HelmArtifactResult",
    "HelmFeatureAvailability",
    "HelmObservationCoverage",
    "HelmOwnedResource",
    "HelmOwnedResourceObservation",
    "HelmRelease",
    "HelmReleaseDetail",
    "HelmReleaseDetailResponse",
    "HelmReleaseHistoryEntry",
    "HelmReleaseListResponse",
    "HelmResourceHealthAvailability",
    "HelmResourceHealthObservation",
]
