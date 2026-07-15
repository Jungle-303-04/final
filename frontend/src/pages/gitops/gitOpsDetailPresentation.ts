import type { GitOpsReasonCode } from "../../features/gitops/gitOpsContract";
import type { I18nController, MessageKey } from "../../shared/i18n";

const reasonKeyByCode = {
  binding_scope_unavailable: "workflows.detail.reason.bindingScopeUnavailable",
  multiple_target_scopes: "workflows.detail.reason.multipleTargetScopes",
  live_observation_not_integrated: "workflows.detail.reason.liveObservationNotIntegrated",
  source_revision_unavailable: "workflows.detail.reason.sourceRevisionUnavailable",
  workflow_operation_unobserved: "workflows.detail.reason.workflowOperationUnobserved",
  provider_operation_not_integrated: "workflows.detail.reason.providerOperationNotIntegrated",
  not_authorized: "workflows.detail.reason.notAuthorized",
  operation_in_progress: "workflows.detail.reason.operationInProgress",
  provider_refresh_not_integrated: "workflows.detail.reason.providerRefreshNotIntegrated",
  provider_sync_not_integrated: "workflows.detail.reason.providerSyncNotIntegrated",
} as const satisfies Record<GitOpsReasonCode, MessageKey>;

export function gitOpsReasonLabel(
  reasonCode: GitOpsReasonCode | null,
  t: I18nController["t"],
): string {
  return reasonCode === null ? t("common.value.unavailable") : t(reasonKeyByCode[reasonCode]);
}
