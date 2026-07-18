import { useMemo } from "react";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { ClusterScopeFailure } from "../../features/cluster-scope/clusterScopeContract";
import { IssuesSurface } from "../../features/issues/IssuesSurface";
import type {
  IssuesFailureCode,
  IssuesPort,
} from "../../features/issues/issuesContract";
import type { IssuesSurfaceCopy } from "../../features/issues/issuesSurfaceContract";
import {
  issueAuditEventLabel,
  issueAuditStageLabel,
} from "../../features/issues/issueAuditPresentation";
import {
  evidenceCollectorLabel,
  evidenceFallbackLabel,
  evidenceKindToken,
  evidenceRecordSources,
  evidenceRecordSubject,
  evidenceSourceKind,
  evidenceSummaryFacts,
  type EvidenceCountKind,
} from "../../features/issues/issueEvidencePresentation";
import { useI18n } from "../../shared/i18n";
import { ISSUE_STATUS_MESSAGE } from "../../features/issues/issuePresentation";
import type { MessageKey, TranslationFunction } from "../../shared/i18n/types";
import { humanizeFilterValue } from "../../shared/presentation/humanizeFilterValue";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";

const FAILURE_MESSAGE: Record<IssuesFailureCode, MessageKey> = {
  unauthorized: "issues.surface.failure.unauthorized",
  forbidden: "issues.surface.failure.forbidden",
  "invalid-request": "issues.surface.failure.invalidRequest",
  "invalid-response": "issues.surface.failure.invalidResponse",
  "not-found": "issues.surface.failure.notFound",
  offline: "issues.surface.failure.offline",
  "rate-limited": "issues.surface.failure.rateLimited",
  unavailable: "issues.surface.failure.unavailable",
  error: "issues.surface.failure.error",
};

const RECOVERY_CARD_MESSAGE: Record<
  Parameters<IssuesSurfaceCopy["recoveryCardProgress"]>[0],
  MessageKey
> = {
  active: "issues.recovery.card.active",
  approval: "issues.recovery.card.approval",
  completed: "issues.recovery.card.completed",
  failed: "issues.recovery.card.failed",
};

const CAUSE_MESSAGE: Record<string, MessageKey> = {
  oom_killed: "issues.cause.oomKilled",
  memory_limit_too_low: "issues.cause.oomKilled",
  node_affinity_or_taint_mismatch: "issues.cause.nodePlacementMismatch",
  node_selector_mismatch: "issues.cause.nodePlacementMismatch",
  untolerated_taint: "issues.cause.nodePlacementMismatch",
  upstream_unavailable: "issues.cause.ingressUnavailable",
  backend_readiness_failure: "issues.cause.ingressUnavailable",
  insufficient_evidence: "issues.cause.insufficientEvidence",
  wrong_image_tag: "issues.cause.wrongImageTag",
  bad_image_rollout: "issues.cause.wrongImageTag",
  registry_unavailable: "issues.cause.registryUnavailable",
};

const EVIDENCE_NAME_MESSAGE: Record<string, MessageKey> = {
  broken_image_startup_log: "issues.evidence.name.brokenImageStartupLog",
  cluster_resource_state: "issues.evidence.name.clusterResourceState",
  config_error_log: "issues.evidence.name.configErrorLog",
  current_workload_snapshots: "issues.evidence.name.currentWorkloadSnapshots",
  dependency_error_log: "issues.evidence.name.dependencyErrorLog",
  port_bind_failure_signal: "issues.evidence.name.portBindFailureSignal",
  related_logs: "issues.evidence.name.relatedLogs",
  related_traces: "issues.evidence.name.relatedTraces",
  startup_crash_signal: "issues.evidence.name.startupCrashSignal",
  startup_permission_denied_signal: "issues.evidence.name.startupPermissionDeniedSignal",
  telemetry_metrics: "issues.evidence.name.telemetryMetrics",
};

export function IssuesPage({ port }: { port: IssuesPort }) {
  const scope = useClusterScope();
  const filters = useUnifiedFilter();
  const { formatDate, formatNumber, t } = useI18n();
  const copy = useMemo(
    () => createIssuesCopy(t, formatNumber, formatDate),
    [formatDate, formatNumber, t],
  );
  const issueFilters = useMemo(
    () => ({
      namespaces: filters.state.common.namespaces.map(
        (item) => `${item.clusterId}/${item.namespace}`,
      ),
      severities: filters.state.issues.severity.filter(
        (value): value is "critical" | "warning" => (
          value === "critical" || value === "warning"
        ),
      ),
      categories: filters.state.issues.category,
    }),
    [
      filters.state.common.namespaces,
      filters.state.issues.category,
      filters.state.issues.severity,
    ],
  );

  if (scope.selection.kind === "resolving") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (scope.selection.kind === "empty") {
    return <ProductStateScreen kind="empty" placement="content" />;
  }
  if (scope.selection.kind === "multiple") {
    return <ProductStateScreen kind="empty" placement="content" />;
  }
  if (scope.selection.kind === "unavailable") {
    return (
      <ClusterScopeFailureScreen
        failure={scope.selection.failure}
        onRetry={scope.refresh}
        t={t}
      />
    );
  }
  if (scope.selection.kind === "unknown") {
    if (scope.selection.requestedId === "") {
      return <ProductStateScreen kind="loading" placement="content" />;
    }
    return (
      <ProductStateScreen
        issue={{
          code: "unknown",
          safeDetail: t("issues.scope.unknown", {
            cluster: scope.selection.requestedId,
          }),
        }}
        kind="error"
        placement="content"
      />
    );
  }

  const clusterId = scope.selection.kind === "unfiltered"
    ? null
    : scope.selection.cluster.id;

  return (
    <ProductPageFrame>
      <IssuesSurface
        clusterId={clusterId}
        copy={copy}
        filters={issueFilters}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />
    </ProductPageFrame>
  );
}

function createIssuesCopy(
  t: TranslationFunction,
  formatNumber: (value: number | bigint, options?: Intl.NumberFormatOptions) => string,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
): IssuesSurfaceCopy {
  return {
    listLabel: t("issues.surface.list"),
    listEmpty: t("issues.surface.listEmpty"),
    listLoading: t("issues.surface.listLoading"),
    listCount: (count) => formatNumber(count),
    listMatchedCount: (returned, matched) => t("issues.surface.matchedCount", {
      returned: formatNumber(returned),
      matched: formatNumber(matched),
    }),
    visibilityLabel: t("issues.surface.visibility.label"),
    visibilityPartial: t("issues.surface.visibility.partial"),
    visibilityRestricted: t("issues.surface.visibility.restricted"),
    listBrowseResources: t("issues.empty.resources"),
    listBrowseAlerts: t("issues.empty.alerts"),
    detailLabel: t("issues.surface.detail"),
    detailEmpty: t("issues.surface.detailEmpty"),
    detailLoading: t("issues.surface.detailLoading"),
    detailClose: t("issues.detail.close"),
    detailExpand: t("issues.detail.expand"),
    detailCollapse: t("issues.detail.collapse"),
    auditLabel: t("issues.audit.title"),
    auditUnavailable: t("issues.audit.unavailable"),
    auditRoot: t("issues.audit.root"),
    auditCause: (causationId) => t("issues.audit.cause", { causationId }),
    auditEvent: (subject) => issueAuditEventLabel(subject, t),
    auditStage: (stage) => issueAuditStageLabel(stage, t),
    auditPayload: t("issues.audit.payload"),
    auditLoadMore: t("issues.audit.loadMore"),
    auditLoadingMore: t("issues.audit.loadingMore"),
    auditTimeUnknown: t("issues.audit.timeUnknown"),
    auditTime: (value) => formatAuditTime(value, formatDate, t),
    recentChangesLabel: t("issues.recentChanges.title"),
    recentChangesUnavailable: t("issues.recentChanges.unavailable"),
    recentChangesPullRequest: t("issues.recentChanges.pullRequest"),
    recentChangesTime: (value) => formatAuditTime(value, formatDate, t),
    recentChangesImageBeforeLabel: t("issues.recentChanges.imageBefore"),
    recentChangesImageAfterLabel: t("issues.recentChanges.imageAfter"),
    recentChangesCommitLabel: t("issues.recentChanges.commit"),
    recentChangesRepositoryLabel: t("issues.recentChanges.repository"),
    recentChangesWorkflowLabel: t("issues.recentChanges.workflow"),
    evidenceLabel: t("issues.surface.evidence"),
    evidenceRecordLabel: (summary) => evidenceRecordLabel(summary, t),
    evidenceKindLabel: (kind) => evidenceKindLabel(kind, t),
    evidenceSourceLabel: (source) => evidenceSourceLabel(source, t),
    evidenceCollectorLabel: (collector) => /^cluster-agent(?:@unknown)?$/i.test(collector.trim())
      ? t("issues.evidence.collector.clusterAgent")
      : evidenceCollectorLabel(collector),
    evidenceSummaryLabel: (source, summary) => evidenceSummaryLabel(
      source,
      summary,
      t,
      formatNumber,
    ),
    reportsLabel: t("issues.surface.reports"),
    reportsEmpty: t("issues.surface.reportsEmpty"),
    recoveryLabel: t("issues.surface.recovery"),
    sectionLoading: t("issues.surface.sectionLoading"),
    sectionEmpty: t("issues.surface.sectionEmpty"),
    evidenceUnavailable: t("issues.surface.evidenceUnavailable"),
    reportsUnavailable: t("issues.surface.reportsUnavailable"),
    recoveryUnavailable: t("issues.surface.recoveryUnavailable"),
    refresh: t("common.action.refresh"),
    status: t("issues.surface.status"),
    statusLabel: (status) => translateOperationalValue(status, ISSUE_STATUS_MESSAGE, t),
    lifecycleOpen: t("issues.lifecycle.open"),
    lifecycleClosed: t("issues.lifecycle.closed"),
    actionReviewRequired: t("issues.action.reviewRequired"),
    actionReviewAgainRequired: t("issues.action.reviewAgainRequired"),
    actionAutoApprovalAvailable: t("issues.action.autoApprovalAvailable"),
    scope: t("issues.surface.scope"),
    namespaceSuffix: t("issues.surface.namespaceSuffix"),
    cluster: t("issues.context.cluster"),
    namespace: t("issues.context.namespace"),
    resourceKind: t("issues.context.resourceKind"),
    analysisComplete: t("issues.analysis.complete"),
    severityFilterLabel: t("issues.severity.filter"),
    severityFilterAll: t("issues.severity.all"),
    severityCritical: t("issues.severity.critical"),
    severityWarning: t("issues.severity.warning"),
    severityHealthy: t("issues.severity.healthy"),
    severityTooltip: (value) => t("issues.severity.tooltip", { value }),
    valueUnknown: t("issues.value.unknown"),
    recoveryCardProgress: (state) => t(RECOVERY_CARD_MESSAGE[state]),
    situationSummary: t("issues.summary.situation"),
    situationSummaryText: (symptom, cause, status) => t("issues.summary.text", {
      cause: cause || t("issues.value.unknown"),
      status,
      symptom,
    }),
    noAdditionalAction: t("issues.action.none"),
    impactScope: t("issues.report.impactScope"),
    finalJudgement: t("issues.report.finalJudgement"),
    finalCause: t("issues.report.finalCause"),
    evidenceSummaryTitle: t("issues.report.evidenceSummary"),
    evidenceDetailsTitle: t("issues.report.evidenceDetails"),
    recommendedActionTitle: t("issues.report.recommendedAction"),
    viewRecoveryAction: t("issues.report.viewRecovery"),
    actionRisk: t("issues.report.actionRisk"),
    time: t("issues.report.time"),
    evidenceCoverage: (confirmed, total) => t("issues.report.evidenceCoverage", {
      confirmed: formatNumber(confirmed),
      total: formatNumber(total),
    }),
    causeCandidates: t("issues.report.causeCandidates"),
    itemCount: (count) => t("issues.count.items", { count: formatNumber(count) }),
    finalJudgementText: (cause, symptom) => t("issues.report.judgementText", { cause, symptom }),
    memoryRecommendation: t("issues.report.memoryRecommendation"),
    reviewRecoveryPlan: t("issues.report.reviewRecovery"),
    evidenceNameLabel: (name) => translateOperationalValue(name, EVIDENCE_NAME_MESSAGE, t),
    recommendedRecoveryActions: t("issues.recovery.recommendedActions"),
    otherRecoveryCandidates: t("issues.recovery.otherCandidates"),
    recommendationReason: t("issues.recovery.recommendationReason"),
    expectedOutcome: t("issues.recovery.expectedOutcome"),
    riskExplanation: t("issues.recovery.riskExplanation"),
    actionToRun: t("issues.recovery.actionToRun"),
    validationChecks: t("issues.recovery.validationChecks"),
    rollbackAction: t("issues.recovery.rollbackAction"),
    selectRecoveryAction: t("issues.recovery.selectAction"),
    riskLabel: (severity) => {
      const normalized = severity?.trim().toLowerCase();
      if (normalized === "critical") return t("issues.risk.critical");
      if (normalized === "medium" || normalized === "warning") return t("issues.risk.medium");
      if (normalized === "low" || normalized === "info") return t("issues.risk.low");
      return t("issues.value.unknown");
    },
    severityLabel: (severity) => t(
      severity === "critical"
        ? "issues.severity.critical"
        : "issues.severity.warning",
    ),
    causeLabel: (cause) => translateOperationalValue(cause, CAUSE_MESSAGE, t),
    target: t("issues.table.target"),
    updated: t("issues.table.updated"),
    confidence: t("issues.detail.meta.confidence"),
    symptom: t("issues.detail.section.symptom"),
    supportingEvidence: t("issues.detail.section.evidence"),
    missingEvidence: t("issues.detail.section.missingEvidence"),
    rootCause: t("issues.surface.rootCause"),
    recommended: t("issues.surface.recommended"),
    narrativeLabel: t("issues.report.narrative.label"),
    narrativeSummary: t("issues.report.narrative.summary"),
    narrativeImpact: t("issues.report.narrative.impact"),
    narrativeReasoning: t("issues.report.narrative.reasoning"),
    narrativeRecommendedAction: t("issues.report.narrative.recommendedAction"),
    narrativeRecurrencePrevention: t("issues.report.narrative.recurrencePrevention"),
    narrativeLimitations: t("issues.report.narrative.limitations"),
    approvalRequired: t("issues.surface.approvalRequired"),
    recoveryProgressAccepted: t("issues.recovery.progress.accepted"),
    recoveryProgressApproval: t("issues.recovery.progress.approval"),
    recoveryProgressApprovalWaiting: t("issues.recovery.progress.approvalWaiting"),
    recoveryProgressCompletion: t("issues.recovery.progress.completion"),
    recoveryProgressExecution: t("issues.recovery.progress.execution"),
    recoveryProgressFailed: t("issues.recovery.progress.failed"),
    recoveryProgressLabel: t("issues.recovery.progress.label"),
    recoveryProgressLatest: t("issues.recovery.progress.latest"),
    recoveryProgressStopped: t("issues.recovery.progress.stopped"),
    recoveryProgressSubmission: t("issues.recovery.progress.submission"),
    recoveryProgressVerification: t("issues.recovery.progress.verification"),
    selectionPending: t("issues.surface.selectionPending"),
    selectionReceived: (eventId) => t("issues.surface.selectionReceived", { eventId }),
    genericFailure: t("issues.surface.genericFailure"),
    failureDetail: (code) => t(FAILURE_MESSAGE[code]),
    partial: (excludedCount) => t("issues.surface.partial", {
      count: formatNumber(excludedCount),
    }),
  };
}

function translateOperationalValue(
  raw: string,
  messages: Readonly<Record<string, MessageKey>>,
  t: TranslationFunction,
): string {
  const normalized = raw.trim().toLowerCase().replace(/[.\s-]+/g, "_");
  const message = messages[normalized];
  return message === undefined ? humanizeFilterValue(raw) : t(message);
}

const EVIDENCE_COUNT_MESSAGE: Record<EvidenceCountKind, MessageKey> = {
  pods: "issues.evidence.count.pods",
  nodes: "issues.evidence.count.nodes",
  events: "issues.evidence.count.events",
  results: "issues.evidence.count.results",
  entries: "issues.evidence.count.entries",
  queries: "issues.evidence.count.queries",
};

function evidenceSourceLabel(source: string, t: TranslationFunction): string {
  const key: Record<ReturnType<typeof evidenceSourceKind>, MessageKey | null> = {
    kubernetes: "issues.evidence.source.kubernetes",
    metrics: "issues.evidence.source.metrics",
    logs: "issues.evidence.source.logs",
    traces: "issues.evidence.source.traces",
    unknown: null,
  };
  const message = key[evidenceSourceKind(source)];
  return message === null ? evidenceFallbackLabel(source) : t(message);
}

function evidenceKindLabel(kind: string, t: TranslationFunction): string {
  return evidenceKindToken(kind) === "rca_bundle"
    ? t("issues.evidence.kind.rcaBundle")
    : evidenceFallbackLabel(kind);
}

function evidenceRecordLabel(summary: string, t: TranslationFunction): string {
  const subject = evidenceRecordSubject(summary);
  const sources = evidenceRecordSources(summary).map((source) => evidenceSourceLabel(source, t));
  if (subject !== null && sources.length > 0) return [subject, ...sources].join(" · ");
  return evidenceFallbackLabel(summary);
}

function evidenceSummaryLabel(
  source: string,
  summary: string,
  t: TranslationFunction,
  formatNumber: (value: number | bigint, options?: Intl.NumberFormatOptions) => string,
): string {
  const facts = evidenceSummaryFacts(summary);
  if (facts.length > 0) {
    return facts.map(({ kind, count }) => t(EVIDENCE_COUNT_MESSAGE[kind], {
      count: formatNumber(count),
    })).join(" · ");
  }
  if (evidenceSourceKind(source) !== "unknown") return t("issues.evidence.summary.collected");
  return evidenceFallbackLabel(summary);
}

function formatAuditTime(
  raw: string,
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string,
  t: TranslationFunction,
): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return t("issues.audit.timeUnknown");
  return formatDate(parsed, { dateStyle: "medium", timeStyle: "short" });
}

function ClusterScopeFailureScreen({
  failure,
  onRetry,
  t,
}: {
  failure: ClusterScopeFailure;
  onRetry: () => void;
  t: TranslationFunction;
}) {
  if (failure.code === "forbidden") {
    return (
      <ProductStateScreen
        issue={{
          code: "forbidden",
          safeDetail: t("issues.surface.failure.forbidden"),
        }}
        kind="forbidden"
        placement="content"
      />
    );
  }
  if (failure.code === "offline") {
    return (
      <ProductStateScreen
        issue={{
          code: "network",
          safeDetail: t("issues.surface.failure.offline"),
        }}
        kind="offline"
        placement="content"
        retry={{ onRetry, pending: false }}
      />
    );
  }
  return (
    <ProductStateScreen
      issue={{
        code: failure.code === "invalid-response" ? "invalid-response" : "server",
        safeDetail: scopeFailureDetail(failure, t),
      }}
      kind="error"
      placement="content"
      retry={{ onRetry, pending: false }}
    />
  );
}

function scopeFailureDetail(
  failure: ClusterScopeFailure,
  t: TranslationFunction,
): string {
  const message: Record<ClusterScopeFailure["code"], MessageKey> = {
    unauthorized: "issues.surface.failure.unauthorized",
    forbidden: "issues.surface.failure.forbidden",
    offline: "issues.surface.failure.offline",
    "not-found": "issues.surface.failure.notFound",
    "rate-limited": "issues.surface.failure.rateLimited",
    "invalid-response": "issues.surface.failure.invalidResponse",
    error: "issues.surface.failure.error",
  };
  return t(message[failure.code]);
}
