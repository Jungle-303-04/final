import { useMemo } from "react";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopeFailure } from "../../features/cluster-scope/clusterScopeContract";
import { IssuesSurface } from "../../features/issues/IssuesSurface";
import type {
  IssuesFailureCode,
  IssuesPort,
} from "../../features/issues/issuesContract";
import type { IssuesSurfaceCopy } from "../../features/issues/issuesSurfaceContract";
import { useI18n } from "../../shared/i18n";
import type { MessageKey, TranslationFunction } from "../../shared/i18n/types";
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

export function IssuesPage({ port }: { port: IssuesPort }) {
  const scope = useClusterScope();
  const { formatDate, formatNumber, t } = useI18n();
  const copy = useMemo(
    () => createIssuesCopy(t, formatNumber, formatDate),
    [formatDate, formatNumber, t],
  );

  if (scope.selection.kind === "resolving") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (scope.selection.kind === "empty") {
    return <ProductStateScreen kind="empty" placement="content" />;
  }
  if (scope.selection.kind === "unfiltered" || scope.selection.kind === "multiple") {
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

  return (
    <ProductPageFrame>
      <IssuesSurface
        clusterId={scope.selection.cluster.id}
        copy={copy}
        port={port}
        recoverySelection={{ state: "hidden" }}
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
    detailLabel: t("issues.surface.detail"),
    detailEmpty: t("issues.surface.detailEmpty"),
    detailLoading: t("issues.surface.detailLoading"),
    auditLabel: t("issues.audit.title"),
    auditUnavailable: t("issues.audit.unavailable"),
    auditRoot: t("issues.audit.root"),
    auditCause: (causationId) => t("issues.audit.cause", { causationId }),
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
    reportsLabel: t("issues.surface.reports"),
    recoveryLabel: t("issues.surface.recovery"),
    sectionLoading: t("issues.surface.sectionLoading"),
    sectionEmpty: t("issues.surface.sectionEmpty"),
    evidenceUnavailable: t("issues.surface.evidenceUnavailable"),
    reportsUnavailable: t("issues.surface.reportsUnavailable"),
    recoveryUnavailable: t("issues.surface.recoveryUnavailable"),
    refresh: t("common.action.refresh"),
    status: t("issues.surface.status"),
    rootCause: t("issues.surface.rootCause"),
    recommended: t("issues.surface.recommended"),
    approvalRequired: t("issues.surface.approvalRequired"),
    selectionPending: t("issues.surface.selectionPending"),
    selectionReceived: (eventId) => t("issues.surface.selectionReceived", { eventId }),
    genericFailure: t("issues.surface.genericFailure"),
    failureDetail: (code) => t(FAILURE_MESSAGE[code]),
    partial: (excludedCount) => t("issues.surface.partial", {
      count: formatNumber(excludedCount),
    }),
  };
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
