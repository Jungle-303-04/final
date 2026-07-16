import { ArrowLeft, PackageSearch } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMatch, useNavigate } from "react-router-dom";

import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import type {
  HelmFailureCode,
  HelmPort,
  HelmPortFailure,
  HelmRelease,
  HelmUnavailableFeature,
} from "../../features/helm/helmContract";
import { HELM_COPY } from "../../features/helm/helmCopy";
import { RefreshAction } from "../../motion/RefreshAction";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import { HELM_RELEASE_DETAIL_MATCH, helmReleaseDetailHref } from "./helmNavigation";
import { useHelmReleaseDetail, useHelmReleaseList } from "./useHelmReleaseData";

const FEATURE_REASON_COPY: Readonly<Record<string, string>> = {
  helm_manifest_provider_not_integrated: HELM_COPY.manifestUnavailable,
  helm_values_provider_not_integrated: HELM_COPY.valuesUnavailable,
  owned_resources_not_correlated: HELM_COPY.resourceHealthUnavailable,
  agent_helm_executor_not_integrated: HELM_COPY.commandsUnavailable,
};

const FAILURE_DETAIL_COPY = {
  unauthorized: HELM_COPY.sessionUnavailable,
  forbidden: HELM_COPY.permissionDenied,
  "invalid-request": HELM_COPY.requestInvalid,
  "invalid-response": HELM_COPY.responseInvalid,
  "not-found": HELM_COPY.releaseNotFound,
  offline: HELM_COPY.connectionUnavailable,
  "rate-limited": HELM_COPY.rateLimited,
  error: HELM_COPY.requestFailed,
} satisfies Readonly<Record<HelmFailureCode, string>>;

export function HelmPage({ port }: { port: HelmPort }) {
  const detailMatch = useMatch(HELM_RELEASE_DETAIL_MATCH);
  const navigate = useNavigate();
  const identity = detailMatch?.params.clusterId && detailMatch.params.namespace && detailMatch.params.releaseName
    ? {
      clusterId: detailMatch.params.clusterId,
      namespace: detailMatch.params.namespace,
      releaseName: detailMatch.params.releaseName,
    }
    : null;

  if (identity) {
    return <HelmReleaseDetailPage identity={identity} onBack={() => navigate("/helm")} port={port} />;
  }
  return <HelmReleaseListPage onOpen={(release) => navigate(helmReleaseDetailHref({
    clusterId: release.scope.clusterId,
    namespace: release.storageNamespace,
    releaseName: release.name,
  }))} port={port} />;
}

function HelmReleaseListPage({
  onOpen,
  port,
}: {
  onOpen: (release: HelmRelease) => void;
  port: HelmPort;
}) {
  const scope = useClusterScope();
  const [query, setQuery] = useState("");
  const scopeResolution = helmScopeClusterIds(scope);
  const data = useHelmReleaseList(port, scopeResolution.clusterIds);

  if (scopeResolution.kind === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (scopeResolution.kind === "empty") return <ProductStateScreen kind="empty" placement="content" />;
  if (scopeResolution.kind === "error") {
    return <ProductStateScreen kind="error" issue={{ code: "unknown", safeDetail: scopeResolution.detail }} placement="content" />;
  }

  return (
    <ProductPageFrame className="gap-4">
      <header className="grid min-w-0 gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{HELM_COPY.title}</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{HELM_COPY.description}</p>
      </header>
      <HelmListBoundary frame={data.frame} onOpen={onOpen} onRefresh={data.refresh} query={query} setQuery={setQuery} />
    </ProductPageFrame>
  );
}

function HelmListBoundary({
  frame,
  onOpen,
  onRefresh,
  query,
  setQuery,
}: {
  frame: ReturnType<typeof useHelmReleaseList>["frame"];
  onOpen: (release: HelmRelease) => void;
  onRefresh: () => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  if (frame.phase === "idle" || frame.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (frame.phase === "failed") return <HelmFailureScreen failure={frame.failure} onRefresh={onRefresh} />;

  const { coverage, releases } = frame.data;
  return (
    <section aria-labelledby="helm-release-list-title" className="grid min-w-0 gap-3">
      <CoverageNotice availability={coverage.availability} reasons={coverage.reasonCodes} />
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="grid min-w-0 max-w-xl flex-1 gap-1" htmlFor="helm-release-filter">
          <span className="text-xs font-medium text-muted-foreground">{HELM_COPY.searchLabel}</span>
          <Input
            id="helm-release-filter"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={HELM_COPY.searchPlaceholder}
            value={query}
          />
        </label>
        <HelmRefreshAction
          hasFailed={frame.refreshFailure !== null}
          isRefreshing={frame.refreshing}
          onRefresh={onRefresh}
        />
      </div>
      <h2 className="sr-only" id="helm-release-list-title">{HELM_COPY.title}</h2>
      <HelmReleaseTable releases={releases} onOpen={onOpen} query={query} />
    </section>
  );
}

function HelmReleaseTable({
  onOpen,
  query,
  releases,
}: {
  onOpen: (release: HelmRelease) => void;
  query: string;
  releases: readonly HelmRelease[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => releases.filter((release) => matchesRelease(release, query)), [query, releases]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const activeIndex = Math.min(highlightedIndex, Math.max(filtered.length - 1, 0));

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (filtered.length === 0) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedIndex(Math.min(activeIndex + 1, filtered.length - 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedIndex(Math.max(activeIndex - 1, 0));
      } else if (event.key === "Enter") {
        const selected = filtered[activeIndex];
        if (selected) {
          event.preventDefault();
          onOpen(selected);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filtered, onOpen]);

  if (filtered.length === 0) {
    return <EmptyReleaseList query={query} />;
  }
  return (
    <Table scrollAreaLabel="Helm releases">
      <TableHeader>
        <TableRow>
          <TableHead>{HELM_COPY.releaseName}</TableHead>
          <TableHead>{HELM_COPY.cluster}</TableHead>
          <TableHead>{HELM_COPY.namespace}</TableHead>
          <TableHead>{HELM_COPY.chart}</TableHead>
          <TableHead>{HELM_COPY.status}</TableHead>
          <TableHead>{HELM_COPY.revision}</TableHead>
          <TableHead>{HELM_COPY.observed}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((release, index) => (
          <ReleaseRow
            highlighted={index === activeIndex}
            key={`${release.scope.clusterId}:${release.storageNamespace}:${release.name}:${release.storage.uid}`}
            onOpen={() => onOpen(release)}
            onPointerEnter={() => setHighlightedIndex(index)}
            release={release}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function ReleaseRow({
  highlighted,
  onOpen,
  onPointerEnter,
  release,
}: {
  highlighted: boolean;
  onOpen: () => void;
  onPointerEnter: () => void;
  release: HelmRelease;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  return (
    <TableRow
      aria-label={`Open ${release.name}`}
      className={highlighted ? "bg-muted" : undefined}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      onPointerEnter={onPointerEnter}
      role="button"
      tabIndex={0}
    >
      <TableCell className="max-w-56 truncate font-medium">{release.name}</TableCell>
      <TableCell className="max-w-40 truncate text-muted-foreground">{release.scope.clusterId}</TableCell>
      <TableCell className="max-w-40 truncate text-muted-foreground">{release.storageNamespace}</TableCell>
      <TableCell className="text-muted-foreground">{HELM_COPY.unavailableValue}</TableCell>
      <TableCell><StatusBadge status={release.status} /></TableCell>
      <TableCell className="text-muted-foreground">{release.revision ?? HELM_COPY.unavailableValue}</TableCell>
      <TableCell className="text-muted-foreground">{formatObservedAt(release.observedAt)}</TableCell>
    </TableRow>
  );
}

function HelmReleaseDetailPage({
  identity,
  onBack,
  port,
}: {
  identity: { clusterId: string; namespace: string; releaseName: string };
  onBack: () => void;
  port: HelmPort;
}) {
  const data = useHelmReleaseDetail(port, identity);
  return (
    <ProductPageFrame className="gap-4">
      <Button className="w-fit" onClick={onBack} size="sm" type="button" variant="ghost">
        <ArrowLeft aria-hidden="true" />{HELM_COPY.backToReleases}
      </Button>
      <HelmDetailBoundary frame={data.frame} onRefresh={data.refresh} />
    </ProductPageFrame>
  );
}

function HelmDetailBoundary({
  frame,
  onRefresh,
}: {
  frame: ReturnType<typeof useHelmReleaseDetail>["frame"];
  onRefresh: () => void;
}) {
  if (frame.phase === "idle" || frame.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (frame.phase === "failed") return <HelmFailureScreen failure={frame.failure} onRefresh={onRefresh} />;
  const detail = frame.data;
  return (
    <section aria-labelledby="helm-release-detail-title" className="grid min-w-0 gap-4">
      <header className="flex min-w-0 flex-col gap-2 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{HELM_COPY.detailTitle}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight" id="helm-release-detail-title">{detail.release.name}</h1>
          <p className="mt-1 break-words text-sm text-muted-foreground">{scopeText(detail.release)}</p>
        </div>
        <HelmRefreshAction
          hasFailed={frame.refreshFailure !== null}
          isRefreshing={frame.refreshing}
          onRefresh={onRefresh}
        />
      </header>
      <dl className="grid min-w-0 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Fact label={HELM_COPY.status} value={<StatusBadge status={detail.release.status} />} />
        <Fact label={HELM_COPY.revision} value={detail.release.revision ?? HELM_COPY.unavailableValue} />
        <Fact label={HELM_COPY.observed} value={formatObservedAt(detail.release.observedAt)} />
        <Fact label={HELM_COPY.storage} value={`${detail.release.storage.kind}/${detail.release.storage.name}`} />
      </dl>
      <section className="grid gap-2" aria-labelledby="helm-release-history-title">
        <h2 className="text-base font-semibold" id="helm-release-history-title">{HELM_COPY.history}</h2>
        {detail.history.length === 0 ? <p className="text-sm text-muted-foreground">{HELM_COPY.unavailableValue}</p> : (
          <ul className="grid gap-2">
            {detail.history.map((entry) => (
              <li className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm" key={entry.storage.uid}>
                <span className="min-w-0 truncate font-medium">{entry.storage.name}</span>
                <span className="text-muted-foreground">{entry.revision ?? HELM_COPY.unavailableValue}</span>
                <StatusBadge status={entry.status} />
                <span className="text-muted-foreground">{formatObservedAt(entry.observedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-2" aria-labelledby="helm-release-integrations-title">
        <h2 className="text-base font-semibold" id="helm-release-integrations-title">{HELM_COPY.integrations}</h2>
        <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
          <UnavailableFact feature={detail.release.resourceHealth} label={HELM_COPY.resourceHealth} />
          <UnavailableFact feature={detail.manifest} label={HELM_COPY.manifest} />
          <UnavailableFact feature={detail.values} label={HELM_COPY.values} />
          <UnavailableFact feature={detail.ownedResources} label={HELM_COPY.ownedResources} />
          <UnavailableFact feature={detail.commands} label={HELM_COPY.commands} />
        </dl>
      </section>
    </section>
  );
}

function CoverageNotice({
  availability,
  reasons,
}: {
  availability: "available" | "partial" | "unavailable";
  reasons: readonly string[];
}) {
  if (availability === "available") return null;
  return (
    <div className="grid gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm" role="status">
      <span className="font-medium">{availability === "partial" ? HELM_COPY.partialCoverage : HELM_COPY.unavailableCoverage}</span>
      <ul className="grid gap-0.5 break-words text-muted-foreground">
        {coverageReasonCopy(reasons).map((message) => <li key={message}>{message}</li>)}
      </ul>
    </div>
  );
}

function HelmFailureScreen({ failure, onRefresh }: { failure: HelmPortFailure; onRefresh: () => void }) {
  const safeDetail = helmFailureDetail(failure.code);
  if (failure.code === "forbidden") {
    return <ProductStateScreen kind="forbidden" issue={{ code: "forbidden", safeDetail }} placement="content" />;
  }
  if (failure.code === "offline") {
    return <ProductStateScreen kind="offline" issue={{ code: "network", safeDetail }} placement="content" retry={{ pending: false, onRetry: onRefresh }} />;
  }
  return <ProductStateScreen kind="error" issue={{ code: "server", safeDetail }} placement="content" retry={{ pending: false, onRetry: onRefresh }} />;
}

function HelmRefreshAction({
  hasFailed,
  isRefreshing,
  onRefresh,
}: {
  hasFailed: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <RefreshAction
      hasFailed={hasFailed}
      isRefreshing={isRefreshing}
      label={HELM_COPY.refresh}
      onRefresh={onRefresh}
      statusCopy={{
        cancelled: HELM_COPY.refreshCancelled,
        failed: HELM_COPY.refreshFailed,
        pending: HELM_COPY.refreshPending,
        reconnecting: HELM_COPY.refreshReconnecting,
        succeeded: HELM_COPY.refreshSucceeded,
      }}
    />
  );
}

function helmFailureDetail(code: HelmFailureCode | string): string {
  return FAILURE_DETAIL_COPY[code as HelmFailureCode] ?? HELM_COPY.requestFailed;
}

function EmptyReleaseList({ query }: { query: string }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      <div className="grid justify-items-center gap-2">
        <PackageSearch aria-hidden="true" className="size-7" />
        <span>{query.trim() ? "No releases match this filter." : HELM_COPY.noReleases}</span>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid min-w-0 gap-1 bg-card px-3 py-2"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="m-0 min-w-0 break-words text-sm">{value}</dd></div>;
}

function UnavailableFact({ feature, label }: { feature: HelmUnavailableFeature; label: string }) {
  return <div className="grid min-w-0 gap-1 rounded-lg border bg-card px-3 py-2"><dt className="text-sm font-medium">{label}</dt><dd className="m-0 break-words text-xs text-muted-foreground">{featureReasonCopy(feature.reasonCode)}</dd></div>;
}

function coverageReasonCopy(reasonCodes: readonly string[]): readonly string[] {
  const messages = new Set<string>();
  for (const reasonCode of reasonCodes) {
    if (reasonCode === "authorization_scope_empty") messages.add(HELM_COPY.coverageReasonAuthorization);
    else if (reasonCode.startsWith("inventory_snapshot_unavailable:")) messages.add(HELM_COPY.coverageReasonUnavailable);
    else if (reasonCode === "source_resources_incomplete" || reasonCode === "helm_storage_labels_incomplete") {
      messages.add(HELM_COPY.coverageReasonPartial);
    } else {
      messages.add(HELM_COPY.coverageReasonGeneric);
    }
  }
  const safeMessages = Array.from(messages);
  return safeMessages.length > 0 ? safeMessages : [HELM_COPY.coverageReasonGeneric];
}

function featureReasonCopy(reasonCode: string): string {
  return FEATURE_REASON_COPY[reasonCode] ?? HELM_COPY.featureUnavailable;
}

function StatusBadge({ status }: { status: string | null }) {
  return <Badge variant={status?.toLowerCase() === "deployed" ? "secondary" : "outline"}>{status ?? HELM_COPY.unavailableValue}</Badge>;
}

function matchesRelease(release: HelmRelease, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized === "") return true;
  return [release.name, release.scope.clusterId, release.storageNamespace, release.status ?? ""]
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}

function formatObservedAt(value: string | null): string {
  if (value === null) return HELM_COPY.unavailableValue;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

function scopeText(release: HelmRelease): string {
  return `${HELM_COPY.scope}: ${release.scope.clusterId} / ${release.storageNamespace} (${release.scope.freshness})`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function helmScopeClusterIds(scope: ReturnType<typeof useClusterScope>):
  | { kind: "ready"; clusterIds: readonly string[] }
  | { kind: "loading"; clusterIds: readonly string[] }
  | { kind: "empty"; clusterIds: readonly string[] }
  | { kind: "error"; clusterIds: readonly string[]; detail: string } {
  if (scope.selection.kind === "resolving") return { kind: "loading", clusterIds: [] };
  if (scope.selection.kind === "empty") return { kind: "empty", clusterIds: [] };
  if (scope.selection.kind === "unavailable") return { kind: "error", clusterIds: [], detail: scope.selection.failure.code };
  if (scope.selection.kind === "unknown") return { kind: "error", clusterIds: [], detail: scope.selection.requestedId };
  if (scope.selection.kind === "multiple" && scope.selection.unresolvedIds.length > 0) {
    return { kind: "error", clusterIds: [], detail: scope.selection.unresolvedIds.join(", ") };
  }
  if (scope.selection.kind === "unfiltered") return { kind: "ready", clusterIds: [] };
  if (scope.selection.kind === "multiple") return { kind: "ready", clusterIds: scope.selection.clusters.map((cluster) => cluster.id) };
  return { kind: "ready", clusterIds: [scope.selection.cluster.id] };
}
