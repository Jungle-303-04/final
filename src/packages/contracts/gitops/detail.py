"""Provider-neutral GitOps application-detail boundary.

This contract intentionally reports *availability* separately from a GitOps
provider's state.  A source revision or an Opsia workflow record is not proof
of a controller-rendered desired/live diff, so callers must not infer one.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from packages.contracts.gateway.base import StrictModel
from packages.contracts.parity import ClusterScope, ResourceRef

GitOpsAvailability = Literal["available", "partial", "unavailable"]
GitOpsAuthorization = Literal["allowed", "denied"]
GitOpsAction = Literal["refresh", "sync"]


class GitOpsApplicationScope(StrictModel):
    """The one target scope only when it can be represented unambiguously."""

    availability: GitOpsAvailability
    scope: ClusterScope | None = None
    reason_code: str | None = None

    @model_validator(mode="after")
    def availability_matches_scope(self) -> GitOpsApplicationScope:
        if self.availability == "available" and self.scope is None:
            raise ValueError("available scope requires a concrete ClusterScope")
        if self.availability == "unavailable" and self.scope is not None:
            raise ValueError("unavailable scope cannot claim a ClusterScope")
        if self.availability != "available" and not self.reason_code:
            raise ValueError("non-available scope requires a reason_code")
        return self


class GitOpsSource(StrictModel):
    """Safe source identity; credentials and source contents never cross this boundary."""

    repository_ref: str | None = None
    default_branch: str | None = None
    manifest_path: str | None = None


class GitOpsDesiredLiveDiffAvailability(StrictModel):
    """Revision-bound statement about desired/live comparison availability.

    This P0 carries no diff body.  ``available`` is reserved for a later
    provider integration that can return a separately validated comparison
    artifact.  It may not be inferred from workflow history.
    """

    availability: GitOpsAvailability
    source_revision: str | None = None
    live_observation_revision: str | None = None
    reason_code: str | None = None

    @model_validator(mode="after")
    def availability_has_evidence_or_reason(self) -> GitOpsDesiredLiveDiffAvailability:
        if self.availability == "available":
            raise ValueError("an available desired/live diff requires a comparison artifact")
        if not self.reason_code:
            raise ValueError("non-available desired/live diff requires a reason_code")
        return self


class GitOpsOperationObservation(StrictModel):
    """Observed Opsia workflow state, not an assertion about an external controller."""

    availability: GitOpsAvailability
    in_progress: bool | None = None
    workflow_run_id: str | None = None
    status: str | None = None
    observed_at: str | None = None
    reason_code: str | None = None

    @model_validator(mode="after")
    def operation_state_is_explicit(self) -> GitOpsOperationObservation:
        if self.availability == "unavailable":
            if any(
                (self.in_progress is not None, self.workflow_run_id, self.status, self.observed_at)
            ):
                raise ValueError("unavailable operation cannot claim workflow observation")
        if self.in_progress is True and (not self.workflow_run_id or not self.status):
            raise ValueError("in-progress operation requires the observed workflow identity")
        if self.availability != "available" and not self.reason_code:
            raise ValueError("partial or unavailable operation requires a reason_code")
        return self


class GitOpsActionCapability(StrictModel):
    """One provider action's authorization and actual integration availability."""

    action: GitOpsAction
    authorization: GitOpsAuthorization
    availability: GitOpsAvailability
    enabled: bool
    operation_blocked: bool = False
    reason_code: str | None = None

    @model_validator(mode="after")
    def enabled_requires_authorized_available_action(self) -> GitOpsActionCapability:
        if self.enabled and (self.authorization != "allowed" or self.availability != "available"):
            raise ValueError("enabled action must be authorized and available")
        if not self.enabled and not self.reason_code:
            raise ValueError("disabled action requires a reason_code")
        if self.operation_blocked and self.action != "sync":
            raise ValueError("only sync may be blocked by a running operation")
        if self.operation_blocked and self.enabled:
            raise ValueError("operation-blocked sync cannot be enabled")
        return self


class GitOpsApplicationDetail(StrictModel):
    application_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    resource: ResourceRef
    scope: GitOpsApplicationScope
    source: GitOpsSource
    desired_live_diff: GitOpsDesiredLiveDiffAvailability
    operation: GitOpsOperationObservation
    capabilities: tuple[GitOpsActionCapability, ...]

    @model_validator(mode="after")
    def has_exactly_one_capability_per_p0_action(self) -> GitOpsApplicationDetail:
        actions = tuple(capability.action for capability in self.capabilities)
        if actions != ("refresh", "sync"):
            raise ValueError("GitOps detail capabilities must be refresh then sync")
        return self


class GitOpsApplicationDetailResponse(StrictModel):
    application: GitOpsApplicationDetail
