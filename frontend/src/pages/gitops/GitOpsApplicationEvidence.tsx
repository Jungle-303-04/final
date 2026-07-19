import type { ReactNode } from "react";

import type {
  GitOpsApplicationDetail,
  GitOpsAvailability,
  GitOpsReasonCode,
} from "../../features/gitops/gitOpsContract";
import type { I18nController, MessageKey } from "../../shared/i18n";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { StatusPill } from "../../shared/ui/status";

export function GitOpsApplicationEvidence({ detail }: { detail: GitOpsApplicationDetail }) {
  const { t } = useI18n();
  return (
    <Surface
      aria-label={t("workflows.detail.evidence")}
      as="section"
      className="grid min-w-0 overflow-hidden p-0 sm:grid-cols-2 xl:grid-cols-3"
    >
      <EvidenceSection title={t("workflows.detail.source")}>
        <Fact label={t("workflows.detail.repository")} value={detail.source.repositoryRef} />
        <Fact label={t("workflows.detail.branch")} value={detail.source.defaultBranch} />
        <Fact label={t("workflows.detail.manifest")} value={detail.source.manifestPath} />
      </EvidenceSection>
      <EvidenceSection title={t("workflows.detail.scope")}>
        <Fact label={t("workflows.detail.availability")} value={availabilityLabel(detail.scope.availability, t)} />
        <Fact label={t("workflows.detail.workspace")} value={detail.scope.scope?.workspaceId} />
        <Fact label={t("workflows.detail.cluster")} value={detail.scope.scope?.clusterId} />
        <Fact label={t("workflows.detail.namespaces")} value={detail.scope.scope?.namespaces.join(", ")} />
        <Fact label={t("workflows.detail.reason")} value={reasonLabel(detail.scope.reasonCode, t)} />
      </EvidenceSection>
      <EvidenceSection title={t("workflows.detail.desiredLive")}>
        <Fact label={t("workflows.detail.availability")} value={availabilityLabel(detail.desiredLiveDiff.availability, t)} />
        <Fact label={t("workflows.detail.sourceRevision")} value={detail.desiredLiveDiff.sourceRevision} />
        <Fact label={t("workflows.detail.liveObservationRevision")} value={detail.desiredLiveDiff.liveObservationRevision} />
        <Fact label={t("workflows.detail.reason")} value={reasonLabel(detail.desiredLiveDiff.reasonCode, t)} />
      </EvidenceSection>
      <EvidenceSection title={t("workflows.detail.resource")}>
        <Fact label={t("workflows.detail.kind")} value={`${detail.resource.apiGroup}/${detail.resource.version} · ${detail.resource.kind}`} />
        <Fact label={t("workflows.target.name")} value={detail.resource.name} />
        <Fact label={t("workflows.details.namespace")} value={detail.resource.namespace} />
        <Fact label={t("workflows.detail.uid")} value={detail.resource.uid} mono />
      </EvidenceSection>
      <EvidenceSection title={t("workflows.detail.operation")}>
        <Fact label={t("workflows.detail.availability")} value={availabilityLabel(detail.operation.availability, t)} />
        <Fact label={t("workflows.detail.progress")} value={progressLabel(detail.operation.inProgress, t)} />
        <Fact label={t("workflows.detail.status")} value={detail.operation.status} />
        <Fact label={t("workflows.detail.workflow")} value={detail.operation.workflowRunId} />
        <Fact label={t("workflows.sync.table.observed")} value={detail.operation.observedAt} mono />
        <Fact label={t("workflows.detail.reason")} value={reasonLabel(detail.operation.reasonCode, t)} />
      </EvidenceSection>
      <EvidenceSection title={t("workflows.detail.capabilities")}>
        <div className="grid min-w-0 gap-2">
          {detail.capabilities.map((capability) => (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5" key={capability.action}>
              <StatusPill
                label={`${capability.action === "refresh" ? t("common.action.refresh") : t("workflows.detail.action.sync")} · ${capabilityStatus(capability, t)}`}
                tone="unknown"
              />
              <span className="min-w-0 truncate text-caption text-caption-foreground" title={reasonLabel(capability.reasonCode, t)}>
                {reasonLabel(capability.reasonCode, t)}
              </span>
            </span>
          ))}
        </div>
      </EvidenceSection>
    </Surface>
  );
}

function EvidenceSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid min-w-0 content-start gap-2 border-b border-border-subtle p-3 last:border-b-0 sm:border-r">
      <h4 className="text-label font-bold">{title}</h4>
      <dl className="grid min-w-0 gap-1.5">{children}</dl>
    </section>
  );
}

function Fact({ label, mono = false, value }: { label: string; mono?: boolean; value: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="grid min-w-0 grid-cols-[minmax(6.5rem,0.4fr)_minmax(0,1fr)] gap-2 text-caption-2">
      <dt className="text-caption-foreground">{label}</dt>
      <dd className={`m-0 truncate text-right ${mono ? "font-mono" : ""}`} title={typeof value === "string" ? value : undefined}>
        {value || t("common.value.unavailable")}
      </dd>
    </div>
  );
}

function availabilityLabel(value: GitOpsAvailability, t: I18nController["t"]): string {
  if (value === "available") return t("workflows.detail.available");
  if (value === "partial") return t("common.state.partial");
  return t("common.state.unavailable");
}

const REASON_KEYS = {
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

function reasonLabel(value: GitOpsReasonCode | null, t: I18nController["t"]): string {
  return value ? t(REASON_KEYS[value]) : t("common.value.unavailable");
}

function progressLabel(value: boolean | null, t: I18nController["t"]): string {
  if (value === true) return t("workflows.detail.operationInProgress");
  if (value === false) return t("workflows.detail.notInProgress");
  return t("common.value.unavailable");
}

function capabilityStatus(
  capability: GitOpsApplicationDetail["capabilities"][number],
  t: I18nController["t"],
): string {
  if (capability.operationBlocked) return t("workflows.detail.operationInProgress");
  if (capability.authorization === "denied") return t("common.state.forbidden");
  if (!capability.enabled) return t("workflows.detail.executionUnavailable");
  return availabilityLabel(capability.availability, t);
}
