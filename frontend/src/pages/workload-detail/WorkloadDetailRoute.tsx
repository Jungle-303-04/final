import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useBottomDock } from "../../features/bottom-dock/BottomDockProvider";
import { useFilterSearchParams } from "../../features/filters/routeSearchAdapter";
import type {
  WorkloadDetail,
  WorkloadDetailPort,
  WorkloadDetailTab,
} from "../../features/workload-detail/workloadDetailContract";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { cn } from "../../shared/lib/cn";
import { parseWorkloadDetailRoute, workloadDetailHref } from "./workloadDetailNavigation";
import { useWorkloadDetail } from "./useWorkloadDetail";
import { WorkloadExecution } from "./WorkloadExecution";
import { RightsizingStrip } from "../../features/rightsizing/RightsizingStrip";
import { useI18n } from "../../shared/i18n/I18nProvider";
import type { TranslationFunction } from "../../shared/i18n/types";

export function WorkloadDetailRoute({ port }: { port: WorkloadDetailPort }) {
  const params = useParams();
  const search = useFilterSearchParams();
  const navigate = useNavigate();
  const identity = useMemo(() => parseWorkloadDetailRoute(params, search), [params, search]);
  const { frame, refresh } = useWorkloadDetail(port, identity);

  if (identity === null) {
    return <ProductStateScreen kind="error" issue={{ code: "invalid-response" }} placement="content" />;
  }
  if (frame.phase === "loading") return <ProductStateScreen kind="loading" placement="content" />;
  if (frame.phase === "failed") return <FailureScreen failure={frame.failure.code} onRefresh={refresh} />;

  const setTab = (tab: WorkloadDetailTab) => {
    navigate(workloadDetailHref(identity, tab), { replace: true });
  };
  return (
    <WorkloadDetailPage
      detail={frame.data}
      onBack={() => navigate(-1)}
      onRefresh={refresh}
      onTabChange={setTab}
      refreshing={frame.refreshing}
      tab={identity.tab}
      port={port}
      request={identity}
    />
  );
}

function WorkloadDetailPage({
  detail,
  onBack,
  onRefresh,
  onTabChange,
  refreshing,
  tab,
  port,
  request,
}: {
  detail: WorkloadDetail;
  onBack: () => void;
  onRefresh: () => void;
  onTabChange: (tab: WorkloadDetailTab) => void;
  refreshing: boolean;
  tab: WorkloadDetailTab;
  port: WorkloadDetailPort;
  request: import("../../features/workload-detail/workloadDetailContract").WorkloadDetailRequest;
}) {
  const { t } = useI18n();
  const dock = useBottomDock();
  const resource = detail.observation.resource;
  const openLogs = () => {
    if (detail.logStream.availability !== "available" || detail.logStream.streamKind === null || resource.namespace === null) return;
    dock.openLogs({
      type: "workload",
      clusterId: detail.scope.clusterId,
      kind: detail.logStream.streamKind,
      namespace: resource.namespace,
      name: resource.name,
    });
  };
  const executionAvailable = detail.features.some((feature) => feature.name === "execution" && feature.availability !== "unavailable");
  const tabs: readonly WorkloadDetailTab[] = [
    "overview",
    "pods",
    "events",
    ...(detail.logStream.availability === "available" ? ["logs" as const] : []),
    ...(executionAvailable ? ["execution" as const] : []),
  ];

  return (
    <ProductPageFrame className="gap-4">
      <header className="flex min-w-0 flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button className="-ml-2 mb-2" onClick={onBack} size="sm" type="button" variant="ghost">
            <ArrowLeft aria-hidden="true" />{t("common.action.back")}
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{resource.name}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {resource.kind} · {resource.namespace ?? t("workloadDetail.clusterScope")} · {detail.scope.clusterId}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="outline">{detail.scope.freshness}</Badge>
          <Badge variant="outline">{detail.coverage.availability}</Badge>
          <Button disabled={refreshing} onClick={onRefresh} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" className={cn(refreshing && "motion-safe:animate-spin motion-reduce:animate-none")} />{t("common.action.refresh")}
          </Button>
        </div>
      </header>
      {detail.coverage.availability !== "available" ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-foreground" role="status">
          {t("workloadDetail.partialWarning")}
        </p>
      ) : null}
      <div aria-label={t("workloadDetail.sections")} className="flex min-w-0 gap-1 overflow-x-auto border-b" role="tablist">
        {tabs.map((candidate) => (
          <button
            aria-selected={tab === candidate}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm capitalize transition-colors",
              tab === candidate ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            key={candidate}
            onClick={() => onTabChange(candidate)}
            role="tab"
            type="button"
          >
            {tabLabel(candidate, t)}
          </button>
        ))}
      </div>
      {tab === "overview" ? <Overview detail={detail} /> : null}
      {tab === "pods" ? <Pods detail={detail} /> : null}
      {tab === "events" ? <Events detail={detail} /> : null}
      {tab === "logs" ? <Logs detail={detail} onOpen={openLogs} /> : null}
      {tab === "execution" && executionAvailable ? <WorkloadExecution port={port} request={request} /> : null}
    </ProductPageFrame>
  );
}

function Overview({ detail }: { detail: WorkloadDetail }) {
  const { t } = useI18n();
  const { replicas } = detail.observation;
  const rows: readonly [string, number | null][] = [
    [t("workloadDetail.replica.desired"), replicas.desired],
    [t("workloadDetail.replica.ready"), replicas.ready],
    [t("workloadDetail.replica.available"), replicas.available],
    [t("workloadDetail.replica.updated"), replicas.updated],
    [t("workloadDetail.replica.unavailable"), replicas.unavailable],
  ];
  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="workload-overview-title">
      <div className="grid gap-1"><h2 className="text-base font-semibold" id="workload-overview-title">{t("workloadDetail.overview.title")}</h2><p className="text-sm text-muted-foreground">{t("workloadDetail.overview.description")}</p></div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {rows.map(([label, value]) => <div className="min-w-0 rounded-xl border bg-card p-3" key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-medium">{value ?? "—"}</dd></div>)}
      </dl>
      {detail.observation.labels.length > 0 ? (
        <section className="grid gap-2" aria-labelledby="workload-labels-title"><h2 className="text-base font-semibold" id="workload-labels-title">{t("workloadDetail.labels")}</h2><ul className="flex flex-wrap gap-2">{detail.observation.labels.map((label) => <li className="max-w-full truncate rounded-md border px-2 py-1 font-mono text-xs" key={label.key}>{label.key}={label.value}</li>)}</ul></section>
      ) : null}
      <RightsizingStrip evidence={detail.rightsizing} />
    </section>
  );
}

function Pods({ detail }: { detail: WorkloadDetail }) {
  const { t } = useI18n();
  return <section className="grid gap-3" aria-labelledby="workload-pods-title"><h2 className="text-base font-semibold" id="workload-pods-title">{t("workloadDetail.pods.title")}</h2>{detail.pods.items.length === 0 ? <EmptyNotice text={t("workloadDetail.pods.empty")} /> : <ul className="grid gap-2">{detail.pods.items.map((pod) => <li className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2" key={pod.resource.uid}><span className="truncate font-medium">{pod.resource.name}</span><Badge variant="outline">{pod.health}</Badge></li>)}</ul>}</section>;
}

function Events({ detail }: { detail: WorkloadDetail }) {
  const { t } = useI18n();
  return <section className="grid gap-3" aria-labelledby="workload-events-title"><h2 className="text-base font-semibold" id="workload-events-title">{t("workloadDetail.events.title")}</h2>{detail.events.items.length === 0 ? <EmptyNotice text={t("workloadDetail.events.empty")} /> : <ul className="grid gap-2">{detail.events.items.map((event) => <li className="grid min-w-0 gap-1 rounded-lg border bg-card px-3 py-2" key={event.resource.uid}><span className="truncate font-medium">{event.reason ?? event.resource.name}</span><span className="text-sm text-muted-foreground">{event.eventType ?? "Event"}{event.occurrenceCount === null ? "" : ` · ${event.occurrenceCount}`}</span></li>)}</ul>}</section>;
}

function Logs({ detail, onOpen }: { detail: WorkloadDetail; onOpen: () => void }) {
  const { t } = useI18n();
  if (detail.logStream.availability !== "available") return <EmptyNotice text={t("workloadDetail.logs.unavailable")} />;
  return <section className="grid gap-3" aria-labelledby="workload-logs-title"><h2 className="text-base font-semibold" id="workload-logs-title">{t("workloadDetail.logs.title")}</h2><p className="text-sm text-muted-foreground">{t("workloadDetail.logs.description")}</p><div><Button onClick={onOpen} type="button"><ExternalLink aria-hidden="true" />{t("workloadDetail.logs.open")}</Button></div></section>;
}

function tabLabel(tab: WorkloadDetailTab, t: TranslationFunction): string {
  const keys = {
    overview: "workloadDetail.tab.overview",
    pods: "workloadDetail.tab.pods",
    events: "workloadDetail.tab.events",
    logs: "workloadDetail.tab.logs",
    execution: "workloadDetail.tab.execution",
  } as const;
  return t(keys[tab]);
}

function EmptyNotice({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{text}</p>;
}

function FailureScreen({ failure, onRefresh }: { failure: string; onRefresh: () => void }) {
  if (failure === "forbidden") return <ProductStateScreen kind="error" issue={{ code: "unknown" }} placement="content" retry={{ onRetry: onRefresh, pending: false }} />;
  if (failure === "unauthorized") return <ProductStateScreen kind="error" issue={{ code: "unknown" }} placement="content" retry={{ onRetry: onRefresh, pending: false }} />;
  if (failure === "not-found" || failure === "identity-incomplete") return <ProductStateScreen kind="empty" placement="content" />;
  return <ProductStateScreen kind="error" issue={{ code: failure === "invalid-request" ? "invalid-response" : "unknown" }} placement="content" retry={{ onRetry: onRefresh, pending: false }} />;
}
