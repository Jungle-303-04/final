"""Published event body contracts.

This module keeps the historical `packages.contracts.event_bus.bodies` import
surface, but loads domain body classes lazily. Domain `events.py` modules import
`bodies.base`, so eager re-export imports here create circular imports whenever a
domain imports another domain event directly.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

from packages.contracts.event_bus.bodies.base import EventBody, JsonObject

_MODULE_BY_NAME = {
    "AlertDispatchedBody": "domains.alert.events",
    "AlertRejectedBody": "domains.alert.events",
    "AlertRequestedBody": "domains.alert.events",
    "AiMessageFailedBody": "domains.ai.events",
    "AiMessageReceivedBody": "domains.ai.events",
    "AiMessageRespondedBody": "domains.ai.events",
    "ApprovalGrantedBody": "domains.gitops.events",
    "ApprovalRecommendedBody": "domains.rca.events",
    "ApprovalRejectedBody": "domains.gitops.events",
    "ApprovalRequestedBody": "domains.gitops.events",
    "CauseCandidate": "domains.rca.events",
    "CauseEvaluation": "domains.rca.events",
    "ClusterDesiredStateChangedBody": "domains.target.events",
    "ClusterDriftDetectedBody": "domains.target.events",
    "ClusterEvidenceReceivedBody": "domains.rca.events",
    "ClusterReconcileCompletedBody": "domains.target.events",
    "ClusterReconcileFailedBody": "domains.target.events",
    "ClusterReconcileRequestedBody": "domains.target.events",
    "ClusterReconcileStartedBody": "domains.target.events",
    "CommandCompletedBody": "domains.command.events",
    "CommandDispatchReadyBody": "domains.command.events",
    "CommandDispatchedBody": "domains.command.events",
    "CommandQueuedForAgentBody": "domains.command.events",
    "CommandRejectedBody": "domains.command.events",
    "CommandRequestedBody": "domains.command.events",
    "DeadLetterCreatedBody": "packages.contracts.event_bus.bodies.platform",
    "Diff": "domains.gitops.events",
    "DiffAnalyzedBody": "domains.gitops.events",
    "DiffDetectedBody": "domains.gitops.events",
    "DiffExplainedBody": "domains.rca.events",
    "EmailVerificationRequestedBody": "domains.mail.events",
    "EmailVerificationSentBody": "domains.mail.events",
    "Evidence": "domains.rca.events",
    "EvidenceBuiltBody": "domains.rca.events",
    "EvidenceBundle": "domains.rca.events",
    "EvidenceBundleBuiltBody": "domains.rca.events",
    "EvidenceItem": "domains.rca.events",
    "GitChangedBody": "domains.gitops.events",
    "GitWebhookReceivedBody": "domains.gitops.events",
    "HealingActionDraft": "domains.rca.events",
    "IncidentDetectedBody": "domains.rca.events",
    "IncidentRecord": "domains.rca.events",
    "LeaseMetadata": "domains.command.events",
    "Manifest": "domains.gitops.events",
    "ManifestInvalidBody": "domains.gitops.events",
    "ManifestRenderedBody": "domains.gitops.events",
    "Plan": "domains.command.events",
    "RcaActionRequiredBody": "domains.rca.events",
    "RcaAiFallbackRequestedBody": "domains.rca.events",
    "RcaBacklogItemCreatedBody": "domains.rca.events",
    "RcaCandidatesEvaluatedBody": "domains.rca.events",
    "RcaCandidatesPlannedBody": "domains.rca.events",
    "RcaCompletedBody": "domains.rca.events",
    "RcaReportDetail": "domains.rca.events",
    "RcaRuleMissing": "domains.rca.events",
    "RcaRuleMissingBody": "domains.rca.events",
    "RecoveryActionCandidate": "domains.rca.events",
    "RecoveryActionSelectedBody": "domains.rca.events",
    "RecoveryPlan": "domains.rca.events",
    "RecoveryPlannedBody": "domains.rca.events",
    "RecoverySelectionRequestedBody": "domains.rca.events",
    "RenderedManifest": "domains.gitops.events",
    "RenderedMetadata": "domains.gitops.events",
    "RenderedSpec": "domains.gitops.events",
    "RetryPolicy": "domains.command.events",
    "RolloutDiagnosedBody": "domains.rca.events",
    "Route": "domains.command.events",
    "RoutingConstraint": "domains.command.events",
    "SafePrCreatedBody": "domains.scm.events",
    "SafePrFailedBody": "domains.scm.events",
    "SafePrPatchPreparedBody": "domains.rca.events",
    "SafePrRequestedBody": "domains.scm.events",
    "TargetDesiredComponent": "domains.target.events",
    "TargetDrift": "domains.target.events",
    "WorkflowCreatedBody": "domains.gitops.events",
    "WorkflowRunCompletedBody": "domains.gitops.events",
    "WorkflowRunFailedBody": "domains.gitops.events",
    "WorkflowRunStartedBody": "domains.gitops.events",
    "WorkflowStepRecordedBody": "domains.gitops.events",
}

__all__ = ["EventBody", "JsonObject", *_MODULE_BY_NAME]


def __getattr__(name: str) -> Any:
    module_name = _MODULE_BY_NAME.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    value = getattr(import_module(module_name), name)
    globals()[name] = value
    return value
