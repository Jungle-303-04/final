import { useEffect, useRef, useState } from "react";

import type { HelmChartCatalogUrlState } from "../../features/filters/helmChartCatalogUrlState";
import {
  type HelmChartCatalogPage,
  type HelmChartDetail,
  type HelmChartSummary,
  type HelmPort,
} from "../../features/helm/helmContract";
import { HELM_COPY } from "../../features/helm/helmCopy";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import { Input } from "../../shared/ui/primitives/input";
import { Spinner } from "../../shared/ui/primitives/spinner";
import { HelmReleaseInstallDialog } from "./HelmReleaseInstallDialog";
import type { useHelmChartSources } from "./useHelmChartSources";

type CatalogState =
  | { phase: "loading" }
  | { phase: "failed" }
  | { phase: "ready"; page: HelmChartCatalogPage };

type DetailState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "failed" }
  | { phase: "ready"; detail: HelmChartDetail };

export function HelmChartCatalogPanel({
  chartSources,
  clusterId,
  onUrlStateChange,
  port,
  urlState,
}: {
  chartSources: ReturnType<typeof useHelmChartSources>;
  clusterId: string | null;
  onUrlStateChange: (state: HelmChartCatalogUrlState) => void;
  port: HelmPort;
  urlState: HelmChartCatalogUrlState;
}) {
  const [query, setQuery] = useState(urlState.query);
  const [sourceId, setSourceId] = useState(urlState.sourceId ?? "");
  const [provider, setProvider] = useState(urlState.provider ?? "");
  const [allVersions, setAllVersions] = useState(urlState.allVersions);
  const [catalog, setCatalog] = useState<CatalogState>({ phase: "loading" });
  const [detail, setDetail] = useState<DetailState>({ phase: "idle" });
  const catalogRequest = useRef<AbortController | null>(null);
  const detailRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    catalogRequest.current?.abort();
    catalogRequest.current = controller;
    void port.searchCharts({
      query: urlState.query,
      ...(urlState.sourceId ? { sourceId: urlState.sourceId } : {}),
      ...(urlState.provider ? { provider: urlState.provider } : {}),
      allVersions: urlState.allVersions,
      limit: 20,
    }, controller.signal).then(
      (page) => { if (!controller.signal.aborted) setCatalog({ phase: "ready", page }); },
      () => { if (!controller.signal.aborted) setCatalog({ phase: "failed" }); },
    );
    return () => controller.abort();
  }, [port, urlState.allVersions, urlState.provider, urlState.query, urlState.sourceId]);

  useEffect(() => {
    let active = true;
    if (urlState.sourceId === null || urlState.selectedChart === null) {
      queueMicrotask(() => { if (active) setDetail({ phase: "idle" }); });
      return () => { active = false; };
    }
    const controller = new AbortController();
    detailRequest.current?.abort();
    detailRequest.current = controller;
    queueMicrotask(() => { if (active) setDetail({ phase: "loading" }); });
    void port.getChartDetail({
      sourceId: urlState.sourceId,
      chart: urlState.selectedChart,
      ...(urlState.selectedVersion ? { version: urlState.selectedVersion } : {}),
    }, controller.signal).then(
      (value) => { if (active && !controller.signal.aborted) setDetail({ phase: "ready", detail: value }); },
      () => { if (active && !controller.signal.aborted) setDetail({ phase: "failed" }); },
    );
    return () => { active = false; controller.abort(); };
  }, [port, urlState.selectedChart, urlState.selectedVersion, urlState.sourceId]);

  const submit = () => onUrlStateChange({
    query: query.trim(),
    sourceId: sourceId || null,
    provider: provider === "repository" || provider === "oci" ? provider : null,
    allVersions,
    selectedChart: null,
    selectedVersion: null,
  });
  const select = (chart: HelmChartSummary) => onUrlStateChange({
    ...urlState,
    sourceId: chart.source.id,
    selectedChart: chart.name,
    selectedVersion: chart.version,
  });
  const sources = chartSources.state.phase === "ready" ? chartSources.state.items : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle><h2>{HELM_COPY.chartCatalog}</h2></CardTitle>
        <CardDescription>{HELM_COPY.chartCatalogDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(12rem,2fr)_minmax(10rem,1fr)_minmax(9rem,1fr)_auto] lg:items-end">
          <label className="grid gap-1 text-sm" htmlFor="helm-chart-catalog-query">
            <span className="font-medium">{HELM_COPY.chartCatalogSearchLabel}</span>
            <Input id="helm-chart-catalog-query" onChange={(event) => setQuery(event.target.value)} placeholder={HELM_COPY.chartCatalogSearchPlaceholder} value={query} />
          </label>
          <label className="grid gap-1 text-sm" htmlFor="helm-chart-catalog-source">
            <span className="font-medium">{HELM_COPY.chartCatalogSource}</span>
            <select className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm" id="helm-chart-catalog-source" onChange={(event) => setSourceId(event.target.value)} value={sourceId}>
              <option value="">{HELM_COPY.chartCatalogAllSources}</option>
              {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm" htmlFor="helm-chart-catalog-provider">
            <span className="font-medium">{HELM_COPY.chartCatalogProvider}</span>
            <select className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm" id="helm-chart-catalog-provider" onChange={(event) => setProvider(event.target.value)} value={provider}>
              <option value="">{HELM_COPY.chartCatalogAllProviders}</option>
              <option value="repository">{HELM_COPY.chartSourceRepository}</option>
              <option value="oci">{HELM_COPY.chartSourceOci}</option>
            </select>
          </label>
          <Button onClick={submit} type="button">{HELM_COPY.chartCatalogSearch}</Button>
        </div>
        <label className="flex w-fit items-center gap-2 text-sm">
          <input checked={allVersions} onChange={(event) => setAllVersions(event.target.checked)} type="checkbox" />
          {HELM_COPY.chartCatalogAllVersions}
        </label>
        <CatalogBoundary catalog={catalog} onSelect={select} />
        <DetailBoundary clusterId={clusterId} detail={detail} port={port} />
      </CardContent>
    </Card>
  );
}

function CatalogBoundary({ catalog, onSelect }: { catalog: CatalogState; onSelect: (chart: HelmChartSummary) => void }) {
  if (catalog.phase === "loading") return <Status>{HELM_COPY.chartCatalogLoading}</Status>;
  if (catalog.phase === "failed") return <Alert variant="destructive"><AlertDescription>{HELM_COPY.chartCatalogFailed}</AlertDescription></Alert>;
  return (
    <div className="grid min-w-0 gap-2">
      {catalog.page.availability === "partial" ? <Alert><AlertDescription>{HELM_COPY.chartCatalogPartial}</AlertDescription></Alert> : null}
      {catalog.page.items.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{HELM_COPY.chartCatalogEmpty}</p> : (
        <ul className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {catalog.page.items.map((chart) => (
            <li key={`${chart.source.id}:${chart.name}:${chart.version}`}>
              <Button aria-label={`${chart.source.name}/${chart.name} ${chart.version}`} className="h-auto w-full min-w-0 justify-start whitespace-normal p-3 text-left" onClick={() => onSelect(chart)} type="button" variant="outline">
                <span className="grid min-w-0 gap-1">
                  <span className="truncate font-medium">{chart.source.name}/{chart.name} {chart.version}</span>
                  {chart.description ? <span className="line-clamp-2 text-xs font-normal text-muted-foreground">{chart.description}</span> : null}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DetailBoundary({ clusterId, detail, port }: { clusterId: string | null; detail: DetailState; port: HelmPort }) {
  if (detail.phase === "idle") return null;
  if (detail.phase === "loading") return <Status>{HELM_COPY.chartCatalogDetailLoading}</Status>;
  if (detail.phase === "failed" || detail.detail.chart === null) return <Alert variant="destructive"><AlertDescription>{HELM_COPY.chartCatalogDetailFailed}</AlertDescription></Alert>;
  const chart = detail.detail.chart;
  return (
    <section className="grid min-w-0 gap-3 rounded-lg border p-4" aria-labelledby="helm-chart-detail-title">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h3 className="truncate text-lg font-semibold" id="helm-chart-detail-title">{chart.source.name}/{chart.name}</h3>
          <span className="text-sm text-muted-foreground">{chart.version}</span>
        </div>
        {detail.detail.install.availability === "available" && clusterId ? (
          <HelmReleaseInstallDialog clusterId={clusterId} port={port} preferredTarget={detail.detail.install.target} triggerLabel={HELM_COPY.chartCatalogInstall(`${chart.source.name}/${chart.name}`)} />
        ) : <Badge variant="outline">{HELM_COPY.chartCatalogInstallUnavailable}</Badge>}
      </div>
      <div className="grid gap-1 text-sm">
        <span className="font-medium">{HELM_COPY.chartCatalogVersions}</span>
        <span className="break-words text-muted-foreground">{detail.detail.versions.map((item) => item.version).join(", ") || chart.version}</span>
      </div>
      <div className="grid min-w-0 gap-1 text-sm">
        <span className="font-medium">{HELM_COPY.chartCatalogValuesSchema}</span>
        {detail.detail.valuesSchema.availability === "available" ? (
          <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(detail.detail.valuesSchema.schema, null, 2)}</pre>
        ) : <span className="text-muted-foreground">{HELM_COPY.chartCatalogValuesSchemaUnavailable}</span>}
      </div>
    </section>
  );
}

function Status({ children }: { children: string }) {
  return <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Spinner decorative />{children}</div>;
}
