import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopeFailure } from "../../features/cluster-scope/clusterScopeContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { IssuesSurface } from "../../features/issues/IssuesSurface";
import type { IssuesPort } from "../../features/issues/issuesContract";
import { useI18n } from "../../shared/i18n";
import type { MessageKey, TranslationFunction } from "../../shared/i18n/types";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ProductSurfaceTitle } from "../../shared/ui/ProductSurfaceTitle";
import { createIssuesCopy } from "./issuesPageCopy";

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
    <ProductPageFrame className="gap-4">
      <header className="flex min-w-0 items-center gap-2.5">
        <ProductSurfaceTitle icon={AlertTriangle} title={copy.listLabel} />
      </header>
      <IssuesSurface
        clusterId={clusterId}
        copy={copy}
        filters={issueFilters}
        initialIssueId={filters.detail.detail}
        port={port}
        recoverySelection={{ state: "enabled" }}
      />
    </ProductPageFrame>
  );
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
