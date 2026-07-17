import { ArrowLeft, PackageSearch } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useMatch, useNavigate } from "react-router-dom";

import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import {
  parseHelmArtifactUrlState,
  writeHelmArtifactSearchParams,
  type HelmArtifactUrlState,
} from "../../features/filters/helmArtifactUrlState";
import {
  parseHelmChartCatalogUrlState,
  writeHelmChartCatalogSearchParams,
  type HelmChartCatalogUrlState,
} from "../../features/filters/helmChartCatalogUrlState";
import { useFilterSearchParams } from "../../features/filters/routeSearchAdapter";
import type {
  HelmArtifactKind,
  HelmFailureCode,
  HelmHookDiffItem,
  HelmOwnedResources,
  HelmPort,
  HelmPortFailure,
  HelmRelease,
  HelmReleaseDetail,
  HelmReleaseUpgradeInfo,
  HelmResourceHealth,
  HelmUnavailableFeature,
} from "../../features/helm/helmContract";
import { toHelmArtifactOperationResult } from "../../features/helm/createHelmAdapter";
import { useHelmCopy, type HelmCopy } from "../../features/helm/helmCopy";
import {
  type OperationStatusSnapshot,
  useOptionalOperationStatus,
  useOptionalOperationStatusStore,
} from "../../features/operations/OperationStatusStore";
import { RefreshAction } from "../../motion/RefreshAction";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { useI18n } from "../../shared/i18n";
import { UnifiedDiff } from "../../shared/ui/UnifiedDiff";
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
import { HelmChartCatalogPanel } from "./HelmChartCatalogPanel";
import { HelmChartSourcesPanelContent } from "./HelmChartSourcesPanel";
import { HelmArtifactHubPanel } from "./HelmArtifactHubPanel";
import { HelmReleaseInstallDialog } from "./HelmReleaseInstallDialog";
import { HelmReleaseUpgradeDialog } from "./HelmReleaseUpgradeDialog";
import { HelmReleaseOperationDialogs } from "./HelmReleaseOperationDialogs";
import { HelmResourcesDiffView, StructuredParseNotice } from "./HelmResourcesDiffView";
import {
  useHelmReleaseDetail,
  useHelmReleaseList,
  type HelmReleaseDetailView,
} from "./useHelmReleaseData";
import { useHelmChartSources } from "./useHelmChartSources";

export function HelmPage({ port }: { port: HelmPort }) {
  const detailMatch = useMatch(HELM_RELEASE_DETAIL_MATCH);
  const navigate = useNavigate();
  const searchParams = useFilterSearchParams();
  const artifactUrlState = useMemo(
    () => parseHelmArtifactUrlState(searchParams),
    [searchParams],
  );
  const chartCatalogUrlState = useMemo(
    () => parseHelmChartCatalogUrlState(searchParams),
    [searchParams],
  );
  const updateArtifactUrlState = useCallback((next: HelmArtifactUrlState) => {
    const params = writeHelmArtifactSearchParams(searchParams, next);
    const nextSearch = params.toString();
    navigate({ search: nextSearch ? `?${nextSearch}` : "" }, { replace: true });
  }, [navigate, searchParams]);
  const updateChartCatalogUrlState = useCallback((next: HelmChartCatalogUrlState) => {
    const params = writeHelmChartCatalogSearchParams(searchParams, next);
    const nextSearch = params.toString();
    navigate({ search: nextSearch ? `?${nextSearch}` : "" }, { replace: true });
  }, [navigate, searchParams]);
  const identity = detailMatch?.params.clusterId && detailMatch.params.namespace && detailMatch.params.releaseName
    ? {
      clusterId: detailMatch.params.clusterId,
      namespace: detailMatch.params.namespace,
      releaseName: detailMatch.params.releaseName,
    }
    : null;

  if (identity) {
    return (
      <HelmReleaseDetailPage
        artifactUrlState={artifactUrlState}
        identity={identity}
        onArtifactUrlStateChange={updateArtifactUrlState}
        onBack={() => navigate("/helm")}
        port={port}
      />
    );
  }
  return (
    <HelmReleaseListPage
      chartCatalogUrlState={chartCatalogUrlState}
      onChartCatalogUrlStateChange={updateChartCatalogUrlState}
      onOpen={(release) => navigate(helmReleaseDetailHref({
        clusterId: release.scope.clusterId,
        namespace: release.storageNamespace,
        releaseName: release.name,
      }))}
      port={port}
    />
  );
}

function HelmReleaseListPage({
  chartCatalogUrlState,
  onChartCatalogUrlStateChange,
  onOpen,
  port,
}: {
  chartCatalogUrlState: HelmChartCatalogUrlState;
  onChartCatalogUrlStateChange: (state: HelmChartCatalogUrlState) => void;
  onOpen: (release: HelmRelease) => void;
  port: HelmPort;
}) {
  const copy = useHelmCopy();
  const scope = useClusterScope();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const scopeResolution = helmScopeClusterIds(scope);
  const data = useHelmReleaseList(port, scopeResolution.clusterIds);
  const chartSources = useHelmChartSources(port);

  if (scopeResolution.kind === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (scopeResolution.kind === "empty") return <ProductStateScreen kind="empty" placement="content" />;
  if (scopeResolution.kind === "error") {
    return <ProductStateScreen kind="error" issue={{ code: "unknown", safeDetail: scopeResolution.detail }} placement="content" />;
  }

  return (
    <ProductPageFrame className="gap-4">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{copy.description}</p>
        </div>
        {scopeResolution.clusterIds.length === 1 ? (
          <HelmReleaseInstallDialog clusterId={scopeResolution.clusterIds[0] as string} port={port} />
        ) : null}
      </header>
      <HelmListBoundary
        frame={data.frame}
        onOpen={onOpen}
        onRefresh={data.refresh}
        query={query}
        searchInputRef={searchInputRef}
        setQuery={setQuery}
      />
      <HelmChartCatalogPanel
        chartSources={chartSources}
        clusterId={scopeResolution.clusterIds.length === 1 ? scopeResolution.clusterIds[0] ?? null : null}
        key={`${chartCatalogUrlState.query}\u001f${chartCatalogUrlState.sourceId ?? ""}\u001f${chartCatalogUrlState.provider ?? ""}\u001f${chartCatalogUrlState.allVersions}`}
        onUrlStateChange={onChartCatalogUrlStateChange}
        port={port}
        urlState={chartCatalogUrlState}
      />
      <HelmChartSourcesPanelContent data={chartSources} port={port} />
      <HelmArtifactHubPanel port={port} />
    </ProductPageFrame>
  );
}

function HelmListBoundary({
  frame,
  onOpen,
  onRefresh,
  query,
  searchInputRef,
  setQuery,
}: {
  frame: ReturnType<typeof useHelmReleaseList>["frame"];
  onOpen: (release: HelmRelease) => void;
  onRefresh: () => void;
  query: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  setQuery: (value: string) => void;
}) {
  const copy = useHelmCopy();
  if (frame.phase === "idle" || frame.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (frame.phase === "failed") return <HelmFailureScreen failure={frame.failure} onRefresh={onRefresh} />;

  const { coverage, releases, upgrades } = frame.data;
  return (
    <section aria-labelledby="helm-release-list-title" className="grid min-w-0 gap-3">
      <CoverageNotice availability={coverage.availability} reasons={coverage.reasonCodes} />
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="grid min-w-0 max-w-xl flex-1 gap-1" htmlFor="helm-release-filter">
          <span className="text-xs font-medium text-muted-foreground">{copy.searchLabel}</span>
          <Input
            id="helm-release-filter"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            ref={searchInputRef}
            value={query}
          />
        </label>
        <HelmRefreshAction
          hasFailed={frame.refreshFailure !== null}
          isRefreshing={frame.refreshing}
          onRefresh={onRefresh}
        />
      </div>
      <h2 className="sr-only" id="helm-release-list-title">{copy.title}</h2>
      <HelmReleaseTable
        onOpen={onOpen}
        query={query}
        releases={releases}
        searchInputRef={searchInputRef}
        upgrades={upgrades.releases}
      />
    </section>
  );
}

function HelmReleaseTable({
  onOpen,
  query,
  releases,
  searchInputRef,
  upgrades,
}: {
  onOpen: (release: HelmRelease) => void;
  query: string;
  releases: readonly HelmRelease[];
  searchInputRef: RefObject<HTMLInputElement | null>;
  upgrades: Readonly<Record<string, HelmReleaseUpgradeInfo>>;
}) {
  const copy = useHelmCopy();
  const filtered = useMemo(() => releases.filter((release) => matchesRelease(release, query)), [query, releases]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const activeIndex = Math.min(highlightedIndex, Math.max(filtered.length - 1, 0));

  useLayoutEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isSearchShortcutExcluded(event)) return;
      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
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
  }, [activeIndex, filtered, onOpen, searchInputRef]);

  if (filtered.length === 0) {
    return <EmptyReleaseList query={query} />;
  }
  return (
    <Table scrollAreaLabel={copy.title}>
      <TableHeader>
        <TableRow>
          <TableHead>{copy.releaseName}</TableHead>
          <TableHead>{copy.cluster}</TableHead>
          <TableHead>{copy.namespace}</TableHead>
          <TableHead>{copy.chart}</TableHead>
          <TableHead>{copy.status}</TableHead>
          <TableHead>{copy.resourceHealth}</TableHead>
          <TableHead>{copy.upgradeAvailability}</TableHead>
          <TableHead>{copy.revision}</TableHead>
          <TableHead>{copy.observed}</TableHead>
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
            upgrade={upgrades[releaseUpgradeKey(release)] ?? null}
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
  upgrade,
}: {
  highlighted: boolean;
  onOpen: () => void;
  onPointerEnter: () => void;
  release: HelmRelease;
  upgrade: HelmReleaseUpgradeInfo | null;
}) {
  const copy = useHelmCopy();
  const { t } = useI18n();
  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  return (
    <TableRow
      aria-label={t("helm.ui.openRelease", { name: release.name })}
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
      <TableCell className="text-muted-foreground">{chartText(release, copy)}</TableCell>
      <TableCell><StatusBadge status={release.status} /></TableCell>
      <TableCell><ResourceHealthBadge health={release.resourceHealth} /></TableCell>
      <TableCell><UpgradeAvailability info={upgrade} /></TableCell>
      <TableCell className="text-muted-foreground">{release.revision ?? copy.unavailableValue}</TableCell>
      <TableCell className="text-muted-foreground">{formatObservedAt(release.observedAt, copy)}</TableCell>
    </TableRow>
  );
}

function HelmReleaseDetailPage({
  artifactUrlState,
  identity,
  onArtifactUrlStateChange,
  onBack,
  port,
}: {
  artifactUrlState: HelmArtifactUrlState;
  identity: { clusterId: string; namespace: string; releaseName: string };
  onArtifactUrlStateChange: (next: HelmArtifactUrlState) => void;
  onBack: () => void;
  port: HelmPort;
}) {
  const copy = useHelmCopy();
  const data = useHelmReleaseDetail(port, identity);
  return (
    <ProductPageFrame className="gap-4">
      <Button className="w-fit" onClick={onBack} size="sm" type="button" variant="ghost">
        <ArrowLeft aria-hidden="true" />{copy.backToReleases}
      </Button>
      <HelmDetailBoundary
        artifactUrlState={artifactUrlState}
        frame={data.frame}
        onArtifactUrlStateChange={onArtifactUrlStateChange}
        onMutationAccepted={data.refreshAfterMutation}
        onRefresh={data.refresh}
        port={port}
      />
    </ProductPageFrame>
  );
}

function HelmDetailBoundary({
  artifactUrlState,
  frame,
  onArtifactUrlStateChange,
  onMutationAccepted,
  onRefresh,
  port,
}: {
  artifactUrlState: HelmArtifactUrlState;
  frame: ReturnType<typeof useHelmReleaseDetail>["frame"];
  onArtifactUrlStateChange: (next: HelmArtifactUrlState) => void;
  onMutationAccepted: () => void;
  onRefresh: () => void;
  port: HelmPort;
}) {
  const copy = useHelmCopy();
  if (frame.phase === "idle" || frame.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (frame.phase === "failed") return <HelmFailureScreen failure={frame.failure} onRefresh={onRefresh} />;
  const detail = frame.data;
  return (
    <section aria-labelledby="helm-release-detail-title" className="grid min-w-0 gap-4">
      <header className="flex min-w-0 flex-col gap-2 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{copy.detailTitle}</p>
          <h1 className="truncate text-2xl font-semibold tracking-tight" id="helm-release-detail-title">{detail.release.name}</h1>
          <p className="mt-1 break-words text-sm text-muted-foreground">{scopeText(detail.release, copy)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {detail.commands.availability === "available" ? (
            <>
              <HelmReleaseUpgradeDialog
                availableVersions={detail.availableVersions}
                detail={detail}
                onAccepted={onMutationAccepted}
                port={port}
              />
              <HelmReleaseOperationDialogs
                detail={detail}
                onAccepted={onMutationAccepted}
                port={port}
              />
            </>
          ) : null}
          <HelmRefreshAction
            hasFailed={frame.refreshFailure !== null}
            isRefreshing={frame.refreshing}
            onRefresh={onRefresh}
          />
        </div>
      </header>
      <HelmUpgradeEvidence detail={detail} />
      <dl className="grid min-w-0 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Fact label={copy.status} value={<StatusBadge status={detail.release.status} />} />
        <Fact label={copy.revision} value={detail.release.revision ?? copy.unavailableValue} />
        <Fact label={copy.observed} value={formatObservedAt(detail.release.observedAt, copy)} />
        <Fact label={copy.storage} value={`${detail.release.storage.kind}/${detail.release.storage.name}`} />
      </dl>
      <section className="grid gap-2" aria-labelledby="helm-release-history-title">
        <h2 className="text-base font-semibold" id="helm-release-history-title">{copy.history}</h2>
        {detail.history.length === 0 ? <p className="text-sm text-muted-foreground">{copy.unavailableValue}</p> : (
          <ul className="grid gap-2">
            {detail.history.map((entry) => (
              <li className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm" key={entry.storage.uid}>
                <span className="min-w-0 truncate font-medium">{entry.storage.name}</span>
                <span className="text-muted-foreground">{entry.revision ?? copy.unavailableValue}</span>
                <StatusBadge status={entry.status} />
                <span className="text-muted-foreground">{formatObservedAt(entry.observedAt, copy)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <HelmArtifactsPanel
        detail={detail}
        onUrlStateChange={onArtifactUrlStateChange}
        port={port}
        urlState={artifactUrlState}
      />
      <section className="grid gap-2" aria-labelledby="helm-release-integrations-title">
        <h2 className="text-base font-semibold" id="helm-release-integrations-title">{copy.integrations}</h2>
        <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
          <ResourceHealthFact health={detail.release.resourceHealth} />
          <UnavailableFact feature={detail.manifest} label={copy.manifest} />
          <UnavailableFact feature={detail.values} label={copy.values} />
          <OwnedResourcesFact ownedResources={detail.ownedResources} />
          {detail.commands.availability === "unavailable" ? (
            <UnavailableFact feature={detail.commands} label={copy.commands} />
          ) : (
            <Fact label={copy.commands} value={detail.commands.actions.join(", ")} />
          )}
        </dl>
      </section>
      <OwnedResourcesPanel ownedResources={detail.ownedResources} />
    </section>
  );
}

function HelmUpgradeEvidence({ detail }: { detail: HelmReleaseDetailView }) {
  const copy = useHelmCopy();
  const { availableVersions, upgradeInfo } = detail;
  const transition = upgradeInfo.currentVersion !== null && upgradeInfo.latestVersion !== null
    ? `${upgradeInfo.currentVersion} → ${upgradeInfo.latestVersion}`
    : copy.unavailableValue;
  const source = upgradeInfo.source ?? availableVersions.source;
  const versions = availableVersions.versions.map((item) => item.version).join(", ");

  return (
    <section aria-labelledby="helm-release-upgrade-evidence-title" className="grid min-w-0 gap-2 rounded-lg border bg-card p-3">
      <h2 className="text-base font-semibold" id="helm-release-upgrade-evidence-title">
        {copy.upgradeAvailability}
      </h2>
      <dl className="grid min-w-0 gap-2 sm:grid-cols-3">
        <Fact label={copy.upgradeVersionTransition} value={transition} />
        <Fact
          label={copy.upgradeSource}
          value={source ? `${source.name} · ${source.provider}` : copy.upgradeSourceUnavailable}
        />
        <Fact
          label={copy.upgradeVersions}
          value={versions || copy.unavailableValue}
        />
      </dl>
      {availableVersions.truncated ? (
        <p className="text-xs text-muted-foreground">{copy.upgradeVersionsTruncated}</p>
      ) : null}
    </section>
  );
}

function artifactActionCopy(copy: HelmCopy): Readonly<Record<HelmArtifactKind, string>> {
  return {
    manifest: copy.manifestAction,
    values: copy.valuesAction,
    manifest_diff: copy.manifestDiffAction,
    values_diff: copy.valuesDiffAction,
    notes_diff: copy.notesDiffAction,
    hooks_diff: copy.hooksDiffAction,
    resources_diff: copy.resourcesDiffAction,
  };
}

function HelmArtifactsPanel({
  detail,
  onUrlStateChange,
  port,
  urlState,
}: {
  detail: HelmReleaseDetail;
  onUrlStateChange: (next: HelmArtifactUrlState) => void;
  port: HelmPort;
  urlState: HelmArtifactUrlState;
}) {
  const copy = useHelmCopy();
  const artifactActions = artifactActionCopy(copy);
  const revisions = useMemo(() => Array.from(new Set(
    detail.history
      .map((entry) => entry.revision)
      .filter((revision): revision is number => revision !== null),
  )).sort((left, right) => right - left), [detail.history]);
  const revision = urlState.revision !== null && revisions.includes(urlState.revision)
    ? urlState.revision
    : detail.release.revision ?? revisions[0] ?? null;
  const comparisonRevision = (
    urlState.comparisonRevision !== null
    && urlState.comparisonRevision !== revision
    && revisions.includes(urlState.comparisonRevision)
  )
    ? urlState.comparisonRevision
    : revisions.find((candidate) => candidate !== revision) ?? null;
  const allValues = urlState.allValues;
  const commandId = urlState.commandId ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [submitFailure, setSubmitFailure] = useState<string | null>(null);
  const resumedCommandRef = useRef("");
  const operationStore = useOptionalOperationStatusStore();
  const snapshot = useOptionalOperationStatus(commandId);
  const artifact = snapshot?.event
    ? toHelmArtifactOperationResult(snapshot.event.payload)
    : null;
  const pending = submitting || (
    snapshot !== null
    && ["connecting", "running", "reconnecting"].includes(snapshot.status)
  );

  useEffect(() => {
    const comparisonRequired = urlState.artifact?.endsWith("_diff") === true;
    const normalized: HelmArtifactUrlState = {
      ...urlState,
      revision,
      comparisonRevision,
      commandId:
        urlState.commandId !== null
        && urlState.revision === revision
        && (!comparisonRequired || urlState.comparisonRevision === comparisonRevision)
          ? urlState.commandId
          : null,
    };
    if (!sameArtifactUrlState(normalized, urlState)) onUrlStateChange(normalized);
  }, [comparisonRevision, onUrlStateChange, revision, urlState]);

  useEffect(() => {
    if (!operationStore || commandId === "" || resumedCommandRef.current === commandId) return;
    resumedCommandRef.current = commandId;
    operationStore.start(commandId);
  }, [commandId, operationStore]);

  const selectRevision = (next: number) => {
    onUrlStateChange({
      revision: next,
      comparisonRevision:
        comparisonRevision === next
          ? revisions.find((candidate) => candidate !== next) ?? null
          : comparisonRevision,
      artifact: null,
      commandId: null,
      allValues,
    });
  };

  const startRead = async (kind: HelmArtifactKind) => {
    if (revision === null) return;
    const isDiff = kind.endsWith("_diff");
    if (isDiff && comparisonRevision === null) return;
    setSubmitFailure(null);
    setSubmitting(true);
    onUrlStateChange({
      revision,
      comparisonRevision: isDiff ? comparisonRevision : null,
      artifact: kind,
      commandId: null,
      allValues: kind === "values" || kind === "values_diff" ? allValues : false,
    });
    try {
      const receipt = await port.readArtifact({
        clusterId: detail.release.scope.clusterId,
        namespace: detail.release.storageNamespace,
        releaseName: detail.release.name,
        artifact: kind,
        revision,
        comparisonRevision: isDiff ? comparisonRevision ?? undefined : undefined,
        allValues: kind === "values" || kind === "values_diff" ? allValues : false,
      });
      resumedCommandRef.current = receipt.commandId;
      if (operationStore) operationStore.start(receipt.commandId);
      else setSubmitFailure(copy.artifactStreamUnavailable);
      onUrlStateChange({
        revision,
        comparisonRevision: isDiff ? comparisonRevision : null,
        artifact: kind,
        commandId: receipt.commandId,
        allValues: kind === "values" || kind === "values_diff" ? allValues : false,
      });
    } catch {
      setSubmitFailure(copy.artifactFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="helm-artifacts-title" className="grid min-w-0 gap-3 rounded-lg border bg-card p-3">
      <div className="grid min-w-0 gap-1">
        <h2 className="text-base font-semibold" id="helm-artifacts-title">{copy.artifacts}</h2>
        <p className="text-sm text-muted-foreground">{copy.artifactDescription}</p>
      </div>
      {revisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.unavailableValue}</p>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              {copy.primaryRevision}
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                onChange={(event) => selectRevision(Number(event.target.value))}
                value={revision ?? ""}
              >
                {revisions.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              {copy.comparisonRevision}
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                disabled={revisions.length < 2}
                onChange={(event) => onUrlStateChange({
                  ...urlState,
                  revision,
                  comparisonRevision: Number(event.target.value),
                  artifact: null,
                  commandId: null,
                })}
                value={comparisonRevision ?? ""}
              >
                {revisions
                  .filter((candidate) => candidate !== revision)
                  .map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
              </select>
            </label>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                checked={allValues}
                onChange={(event) => onUrlStateChange({
                  ...urlState,
                  revision,
                  comparisonRevision,
                  artifact: null,
                  commandId: null,
                  allValues: event.target.checked,
                })}
                type="checkbox"
              />
              {copy.allValues}
            </label>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            {(Object.keys(artifactActions) as HelmArtifactKind[]).map((kind) => (
              <Button
                disabled={pending || (kind.endsWith("_diff") && comparisonRevision === null)}
                key={kind}
                onClick={() => void startRead(kind)}
                size="sm"
                type="button"
                variant={kind.endsWith("_diff") ? "outline" : "secondary"}
              >
                {artifactActions[kind]}
              </Button>
            ))}
          </div>
        </>
      )}
      <HelmArtifactOperationResult
        artifact={artifact}
        failure={
          submitFailure
          ?? (commandId !== "" && !operationStore ? copy.artifactStreamUnavailable : null)
        }
        snapshot={snapshot}
      />
    </section>
  );
}

function HelmArtifactOperationResult({
  artifact,
  failure,
  snapshot,
}: {
  artifact: ReturnType<typeof toHelmArtifactOperationResult>;
  failure: string | null;
  snapshot: OperationStatusSnapshot | null;
}) {
  const copy = useHelmCopy();
  const artifactActions = artifactActionCopy(copy);
  if (failure) {
    return <p className="text-sm text-destructive" role="alert">{failure}</p>;
  }
  if (snapshot === null || snapshot.status === "idle") return null;
  if (["connecting", "running", "reconnecting"].includes(snapshot.status)) {
    return <p className="text-sm text-muted-foreground" role="status">{copy.artifactReading}</p>;
  }
  if (snapshot.status !== "completed" || artifact === null) {
    return <p className="text-sm text-destructive" role="alert">{copy.artifactFailed}</p>;
  }
  let result: React.ReactNode;
  if (artifact.artifact === "hooks_diff") {
    result = <HelmHooksDiffResult artifact={artifact} />;
  } else if (artifact.artifact === "resources_diff") {
    result = <HelmResourcesDiffResult artifact={artifact} />;
  } else if (artifact.content === "") {
    result = <p className="text-sm text-muted-foreground">{copy.artifactEmpty}</p>;
  } else if (artifact.format === "unified-diff") {
    result = (
      <UnifiedDiff
        aria-label={artifactActions[artifact.artifact]}
        className="max-h-[32rem] rounded-md border bg-background"
        diff={artifact.content}
        numbered
      />
    );
  } else {
    result = (
      <pre className="max-h-[32rem] min-w-0 overflow-auto rounded-md border bg-background p-3 font-mono text-xs leading-5">
        <code>{artifact.content}</code>
      </pre>
    );
  }
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{artifactActions[artifact.artifact]}</Badge>
        <span>{copy.artifactRedacted}</span>
        {artifact.truncated ? <span className="text-amber-600">{copy.artifactTruncated}</span> : null}
      </div>
      {result}
    </div>
  );
}

function sameArtifactUrlState(left: HelmArtifactUrlState, right: HelmArtifactUrlState): boolean {
  return left.revision === right.revision
    && left.comparisonRevision === right.comparisonRevision
    && left.artifact === right.artifact
    && left.commandId === right.commandId
    && left.allValues === right.allValues;
}

function HelmHooksDiffResult({
  artifact,
}: {
  artifact: Extract<
    NonNullable<ReturnType<typeof toHelmArtifactOperationResult>>,
    { artifact: "hooks_diff" }
  >;
}) {
  const copy = useHelmCopy();
  const diff = artifact.hooksDiff;
  const sections = [
    { heading: copy.hooksAdded, items: diff.added },
    { heading: copy.hooksRemoved, items: diff.removed },
    { heading: copy.hooksModified, items: diff.modified },
  ] as const;
  return (
    <div className="grid min-w-0 gap-3">
      <StructuredParseNotice
        count={diff.parseErrorCount}
        singular={copy.hookParseError}
        plural={copy.hookParseErrors}
      />
      {sections.map((section) => (
        section.items.length > 0 ? (
          <section className="grid min-w-0 gap-2" key={section.heading}>
            <h3 className="text-sm font-semibold">{section.heading}</h3>
            <ul className="grid min-w-0 gap-2">
              {section.items.map((item) => (
                <HelmHookDiffItemCard
                  item={item}
                  key={`${item.apiVersion}:${item.kind}:${item.namespace}:${item.name}`}
                />
              ))}
            </ul>
          </section>
        ) : null
      ))}
      {diff.added.length + diff.removed.length + diff.modified.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.artifactEmpty}</p>
      ) : null}
      {diff.unchanged.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {copy.hooksUnchanged}: {diff.unchanged.length}
        </p>
      ) : null}
    </div>
  );
}

function HelmHookDiffItemCard({ item }: { item: HelmHookDiffItem }) {
  const copy = useHelmCopy();
  return (
    <li className="grid min-w-0 gap-2 rounded-md border bg-background p-3 text-xs">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-mono font-medium">{item.kind}/{item.name}</span>
        {item.manifestChanged ? (
          <Badge variant="outline">{copy.hookManifestChanged}</Badge>
        ) : null}
      </div>
      <dl className="grid min-w-0 gap-1 text-muted-foreground sm:grid-cols-2">
        <StructuredFact
          label={copy.namespace}
          value={item.namespace || copy.unavailableValue}
        />
        <StructuredFact
          label={copy.events}
          value={item.events.join(", ") || copy.unavailableValue}
        />
        <StructuredFact label={copy.weight} value={String(item.weight)} />
        <StructuredFact
          label={copy.deletePolicies}
          value={item.deletePolicies.join(", ") || copy.unavailableValue}
        />
        <StructuredFact
          label={copy.outputLogPolicies}
          value={item.outputLogPolicies.join(", ") || copy.unavailableValue}
        />
      </dl>
    </li>
  );
}

function HelmResourcesDiffResult({
  artifact,
}: {
  artifact: Extract<
    NonNullable<ReturnType<typeof toHelmArtifactOperationResult>>,
    { artifact: "resources_diff" }
  >;
}) {
  return <HelmResourcesDiffView diff={artifact.resourcesDiff} />;
}

function StructuredFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="font-medium text-foreground">{label}</dt>
      <dd className="m-0 break-words">{value}</dd>
    </div>
  );
}


function CoverageNotice({
  availability,
  reasons,
}: {
  availability: "available" | "partial" | "unavailable";
  reasons: readonly string[];
}) {
  const copy = useHelmCopy();
  if (availability === "available") return null;
  return (
    <div className="grid gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm" role="status">
      <span className="font-medium">{availability === "partial" ? copy.partialCoverage : copy.unavailableCoverage}</span>
      <ul className="grid gap-0.5 break-words text-muted-foreground">
        {coverageReasonCopy(reasons, copy).map((message) => <li key={message}>{message}</li>)}
      </ul>
    </div>
  );
}

function HelmFailureScreen({ failure, onRefresh }: { failure: HelmPortFailure; onRefresh: () => void }) {
  const copy = useHelmCopy();
  const safeDetail = helmFailureDetail(failure.code, copy);
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
  const copy = useHelmCopy();
  return (
    <RefreshAction
      hasFailed={hasFailed}
      isRefreshing={isRefreshing}
      label={copy.refresh}
      onRefresh={onRefresh}
      statusCopy={{
        cancelled: copy.refreshCancelled,
        failed: copy.refreshFailed,
        pending: copy.refreshPending,
        reconnecting: copy.refreshReconnecting,
        succeeded: copy.refreshSucceeded,
      }}
    />
  );
}

function helmFailureDetail(code: HelmFailureCode | string, copy: HelmCopy): string {
  const messages = {
    unauthorized: copy.sessionUnavailable,
    forbidden: copy.permissionDenied,
    "invalid-request": copy.requestInvalid,
    "invalid-response": copy.responseInvalid,
    "not-found": copy.releaseNotFound,
    offline: copy.connectionUnavailable,
    "rate-limited": copy.rateLimited,
    error: copy.requestFailed,
  } satisfies Readonly<Record<HelmFailureCode, string>>;
  return messages[code as HelmFailureCode] ?? copy.requestFailed;
}

function EmptyReleaseList({ query }: { query: string }) {
  const copy = useHelmCopy();
  const { t } = useI18n();
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      <div className="grid justify-items-center gap-2">
        <PackageSearch aria-hidden="true" className="size-7" />
        <span>{query.trim() ? t("helm.releaseList.noMatches") : copy.noReleases}</span>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="grid min-w-0 gap-1 bg-card px-3 py-2"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="m-0 min-w-0 break-words text-sm">{value}</dd></div>;
}

function UnavailableFact({ feature, label }: { feature: HelmUnavailableFeature; label: string }) {
  const copy = useHelmCopy();
  return <div className="grid min-w-0 gap-1 rounded-lg border bg-card px-3 py-2"><dt className="text-sm font-medium">{label}</dt><dd className="m-0 break-words text-xs text-muted-foreground">{featureReasonCopy(feature.reasonCode, copy)}</dd></div>;
}

function ResourceHealthFact({ health }: { health: HelmResourceHealth }) {
  const copy = useHelmCopy();
  if (health.availability === "unavailable") {
    return <UnavailableFact feature={health} label={copy.resourceHealth} />;
  }
  return (
    <div className="grid min-w-0 gap-1 rounded-lg border bg-card px-3 py-2">
      <dt className="text-sm font-medium">{copy.resourceHealth}</dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <HealthBadge health={health.health} />
        <span>{copy.resourceCount}: {health.resourceCount}</span>
        {health.availability === "partial" ? <span>{copy.ownedResourcesPartial}</span> : null}
      </dd>
    </div>
  );
}

function OwnedResourcesFact({ ownedResources }: { ownedResources: HelmOwnedResources }) {
  const copy = useHelmCopy();
  if (ownedResources.availability === "unavailable") {
    return <UnavailableFact feature={ownedResources} label={copy.ownedResources} />;
  }
  return (
    <div className="grid min-w-0 gap-1 rounded-lg border bg-card px-3 py-2">
      <dt className="text-sm font-medium">{copy.ownedResources}</dt>
      <dd className="m-0 break-words text-xs text-muted-foreground">
        {copy.resourceCount}: {ownedResources.items.length}
        {ownedResources.availability === "partial" ? ` · ${copy.ownedResourcesPartial}` : ""}
      </dd>
    </div>
  );
}

function OwnedResourcesPanel({ ownedResources }: { ownedResources: HelmOwnedResources }) {
  const copy = useHelmCopy();
  if (ownedResources.availability === "unavailable") return null;
  return (
    <section aria-labelledby="helm-owned-resources-title" className="grid min-w-0 gap-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold" id="helm-owned-resources-title">{copy.ownedResources}</h2>
        <span className="text-xs text-muted-foreground">{copy.resourceCount}: {ownedResources.items.length}</span>
      </div>
      {ownedResources.availability === "partial" ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground" role="status">
          {ownedResources.truncated ? copy.ownedResourcesTruncated : copy.ownedResourcesPartial}
        </div>
      ) : null}
      {ownedResources.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{copy.ownedResourcesEmpty}</p>
      ) : (
        <Table scrollAreaLabel={copy.ownedResources}>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.resourceKind}</TableHead>
              <TableHead>{copy.resourceName}</TableHead>
              <TableHead>{copy.namespace}</TableHead>
              <TableHead>{copy.status}</TableHead>
              <TableHead>{copy.health}</TableHead>
              <TableHead>{copy.observed}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ownedResources.items.map((item) => (
              <TableRow key={item.resource.uid}>
                <TableCell>{item.resource.kind}</TableCell>
                <TableCell className="max-w-56 truncate font-medium">{item.resource.name}</TableCell>
                <TableCell className="max-w-40 truncate text-muted-foreground">{item.resource.namespace ?? copy.unavailableValue}</TableCell>
                <TableCell><StatusBadge status={item.status} /></TableCell>
                <TableCell><HealthBadge health={item.health} /></TableCell>
                <TableCell className="text-muted-foreground">{formatObservedAt(item.observedAt, copy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function coverageReasonCopy(reasonCodes: readonly string[], copy: HelmCopy): readonly string[] {
  const messages = new Set<string>();
  for (const reasonCode of reasonCodes) {
    if (reasonCode === "authorization_scope_empty") messages.add(copy.coverageReasonAuthorization);
    else if (reasonCode.startsWith("inventory_snapshot_unavailable:")) messages.add(copy.coverageReasonUnavailable);
    else if (reasonCode === "source_resources_incomplete" || reasonCode === "helm_storage_labels_incomplete") {
      messages.add(copy.coverageReasonPartial);
    } else {
      messages.add(copy.coverageReasonGeneric);
    }
  }
  const safeMessages = Array.from(messages);
  return safeMessages.length > 0 ? safeMessages : [copy.coverageReasonGeneric];
}

function featureReasonCopy(reasonCode: string, copy: HelmCopy): string {
  const messages: Readonly<Record<string, string>> = {
    helm_manifest_provider_not_integrated: copy.manifestUnavailable,
    helm_values_provider_not_integrated: copy.valuesUnavailable,
    owned_resources_not_correlated: copy.resourceHealthUnavailable,
    owned_resources_snapshot_unavailable: copy.resourceSnapshotUnavailable,
    agent_helm_executor_not_integrated: copy.commandsUnavailable,
  };
  return messages[reasonCode] ?? copy.featureUnavailable;
}

function StatusBadge({ status }: { status: string | null }) {
  const copy = useHelmCopy();
  return <Badge variant={status?.toLowerCase() === "deployed" ? "secondary" : "outline"}>{status ?? copy.unavailableValue}</Badge>;
}

function ResourceHealthBadge({ health }: { health: HelmResourceHealth }) {
  const copy = useHelmCopy();
  if (health.availability === "unavailable") {
    return <span className="text-muted-foreground">{copy.unavailableValue}</span>;
  }
  return <HealthBadge health={health.health} />;
}

function HealthBadge({ health }: { health: string }) {
  return <Badge variant={health.toLowerCase() === "healthy" ? "secondary" : "outline"}>{health}</Badge>;
}

function UpgradeAvailability({ info }: { info: HelmReleaseUpgradeInfo | null }) {
  const copy = useHelmCopy();
  if (info?.availability === "available" && info.updateAvailable === true && info.latestVersion) {
    return <Badge variant="secondary">{info.latestVersion} {copy.upgradeAvailableSuffix}</Badge>;
  }
  if (info?.availability === "available" && info.updateAvailable === false) {
    return <span className="text-muted-foreground">{copy.upgradeUpToDate}</span>;
  }
  return <span className="text-muted-foreground">{copy.unavailableValue}</span>;
}

function chartText(release: HelmRelease, copy: HelmCopy): string {
  if (release.chart === null || release.chartVersion === null) return copy.unavailableValue;
  return `${release.chart} ${release.chartVersion}`;
}

function releaseUpgradeKey(release: HelmRelease): string {
  return [release.scope.clusterId, release.storageNamespace, release.name].join("/");
}

function matchesRelease(release: HelmRelease, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized === "") return true;
  return [release.name, release.scope.clusterId, release.storageNamespace, release.status ?? ""]
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}

function formatObservedAt(value: string | null, copy: HelmCopy): string {
  if (value === null) return copy.unavailableValue;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

function scopeText(release: HelmRelease, copy: HelmCopy): string {
  return `${copy.scope}: ${release.scope.clusterId} / ${release.storageNamespace} (${release.scope.freshness})`;
}

function isSearchShortcutExcluded(event: globalThis.KeyboardEvent): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.getModifierState("AltGraph")
  ) return true;

  return event.composedPath().some(isSearchShortcutExcludedTarget);
}

function isSearchShortcutExcludedTarget(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.isContentEditable ||
    target.getAttribute("contenteditable") === "true" ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  ) return true;

  const role = target.getAttribute("role");
  return role === "combobox" || role === "dialog" || role === "textbox" || target.getAttribute("aria-modal") === "true";
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
