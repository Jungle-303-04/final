import { useMemo, useRef, type KeyboardEvent } from "react";
import { useI18n, type I18nController } from "../../shared/i18n";
import type { MessageKey } from "../../shared/i18n/types";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { Button } from "../../shared/ui/primitives/button";
import type {
  TimelineEvent,
  TimelinePort,
  TimelineQuery,
  TimelineSeverity,
  TimelineSource,
  TimelineStreamLifecycle,
  TimelineViewMode,
  TimelineEventType,
} from "../../features/timeline/timelineContract";
import { DEFAULT_MAX_RANGE_DAYS } from "../../features/timeline/timelineUrlState";
import { useTimelineUrlState } from "../../features/timeline/useTimelineUrlState";
import type { ClusterScope } from "../../shared/parity/referenceParity";
import { useTimelineDataFrame, type TimelineDataFrame } from "./useTimelineDataFrame";

const VIEW_MODES: readonly TimelineViewMode[] = ["list", "swimlane"];

const SOURCE_LABEL: Record<TimelineSource, MessageKey> = {
  inventory: "timeline.source.inventory",
  incident: "timeline.source.incident",
  application_workflow: "timeline.source.applicationWorkflow",
  kubernetes_event: "timeline.source.kubernetesEvent",
  gitops: "timeline.source.gitops",
};

const TYPE_LABEL: Record<TimelineEventType, MessageKey> = {
  add: "timeline.type.add",
  update: "timeline.type.update",
  delete: "timeline.type.delete",
  k8s_event: "timeline.type.k8sEvent",
  incident: "timeline.type.incident",
  deployment: "timeline.type.deployment",
  gitops_change: "timeline.type.gitopsChange",
};

const SEVERITY_LABEL: Record<TimelineSeverity, MessageKey> = {
  info: "timeline.severity.info",
  warning: "timeline.severity.warning",
  critical: "timeline.severity.critical",
  unknown: "timeline.severity.unknown",
};

export function TimelineSurface({
  port,
  scopes,
}: {
  port: TimelinePort;
  scopes: readonly ClusterScope[];
}) {
  const { formatNumber, t } = useI18n();
  const url = useTimelineUrlState({
    isRetained: port.capabilities.sourceMode === "retained",
    maxRangeDays: port.capabilities.maxRangeDays ?? DEFAULT_MAX_RANGE_DAYS,
    requiresNamespaceFilter: port.capabilities.requiresNamespaceFilter,
  });
  const query = useMemo<TimelineQuery>(() => ({
    scopes,
    mode: url.state.mode,
    filters: {
      activity: url.state.activityFilter,
      kinds: url.state.kindFilter,
      showDeleted: url.state.showDeleted,
      pinnedOnly: url.state.pinnedOnly,
      search: url.state.search,
      grouping: url.state.grouping,
      sort: url.state.sort,
      selectedEventId: url.state.selectedEventId,
    },
  }), [scopes, url.state]);
  const timeline = useTimelineDataFrame(port, query);
  const viewGroupRef = useRef<HTMLDivElement>(null);
  const namespaceLocked = port.capabilities.requiresNamespaceFilter;

  const setViewMode = (viewMode: TimelineViewMode) => {
    if (namespaceLocked && viewMode !== "list") return;
    url.setViewMode(viewMode);
  };
  const navigateViewMode = (event: KeyboardEvent<HTMLDivElement>) => {
    const available = namespaceLocked ? ["list"] as const : VIEW_MODES;
    const currentIndex = available.indexOf(url.state.viewMode);
    const key = event.key;
    const nextIndex = key === "Home"
      ? 0
      : key === "End"
        ? available.length - 1
        : key === "ArrowRight" || key === "ArrowDown"
          ? (currentIndex + 1) % available.length
          : key === "ArrowLeft" || key === "ArrowUp"
            ? (currentIndex - 1 + available.length) % available.length
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = available[nextIndex] ?? "list";
    setViewMode(next);
    viewGroupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-timeline-view="${next}"]`)
      ?.focus();
  };

  return (
    <ProductPageFrame>
      <header className="grid min-w-0 gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{t("timeline.title")}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("timeline.description")}
        </p>
      </header>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium">
          <span>{t("timeline.search")}</span>
          <input
            aria-label={t("timeline.search")}
            className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => url.setSearch(event.currentTarget.value)}
            type="search"
            value={url.state.search}
          />
        </label>
        <div
          aria-label={t("timeline.view")}
          className="flex items-center gap-1"
          onKeyDown={navigateViewMode}
          ref={viewGroupRef}
          role="radiogroup"
        >
          <Button
            aria-checked={url.state.viewMode === "list"}
            data-timeline-view="list"
            onClick={() => setViewMode("list")}
            role="radio"
            size="sm"
            tabIndex={url.state.viewMode === "list" ? 0 : -1}
            type="button"
            variant={url.state.viewMode === "list" ? "secondary" : "ghost"}
          >
            {t("timeline.view.list")}
          </Button>
          <Button
            aria-checked={url.state.viewMode === "swimlane"}
            aria-disabled={namespaceLocked}
            data-timeline-view="swimlane"
            disabled={namespaceLocked}
            onClick={() => setViewMode("swimlane")}
            role="radio"
            size="sm"
            tabIndex={url.state.viewMode === "swimlane" && !namespaceLocked ? 0 : -1}
            type="button"
            variant={url.state.viewMode === "swimlane" ? "secondary" : "ghost"}
          >
            {t("timeline.view.swimlane")}
          </Button>
        </div>
      </div>
      <TimelineDataBoundary
        formatNumber={formatNumber}
        frame={timeline.frame}
        onRetry={timeline.retry}
        selectedEventId={url.state.selectedEventId}
        t={t}
        viewMode={url.state.viewMode}
      />
    </ProductPageFrame>
  );
}

function TimelineDataBoundary({
  formatNumber,
  frame,
  onRetry,
  selectedEventId,
  t,
  viewMode,
}: {
  formatNumber: I18nController["formatNumber"];
  frame: TimelineDataFrame;
  onRetry: () => void;
  selectedEventId: string | null;
  t: I18nController["t"];
  viewMode: TimelineViewMode;
}) {
  if (frame.phase === "loading") {
    return <p aria-live="polite" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground" role="status">{t("timeline.loading")}</p>;
  }
  if (frame.phase === "failed") {
    return (
      <section className="grid gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6" role="alert">
        <div>
          <h3 className="font-semibold">{t("timeline.error.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("timeline.error.description")}</p>
        </div>
        <div><Button aria-label={t("timeline.action.retry")} onClick={onRetry} type="button" variant="outline">{t("timeline.action.retry")}</Button></div>
      </section>
    );
  }
  const snapshot = frame.snapshot;
  return (
    <section className="grid min-w-0 gap-3" data-timeline-view={viewMode}>
      <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
        {t(
          snapshot.events.length === 1 ? "timeline.count.one" : "timeline.count.other",
          { count: formatNumber(snapshot.events.length) },
        )}
      </p>
      {frame.phase === "resyncing" ? (
        <p aria-live="polite" className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground" role="status">
          {t("timeline.stream.resyncing")}
        </p>
      ) : <TimelineStreamStatus stream={frame.stream} t={t} />}
      {snapshot.coverage.length > 0 ? (
        <aside className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground" role="status">
          {t("timeline.coverage")}
        </aside>
      ) : null}
      {snapshot.events.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t("timeline.empty")}</p>
      ) : (
        <TimelineEventList events={snapshot.events} selectedEventId={selectedEventId} t={t} />
      )}
    </section>
  );
}

function TimelineStreamStatus({
  stream,
  t,
}: {
  stream: TimelineStreamLifecycle;
  t: I18nController["t"];
}) {
  const key: MessageKey = stream.state === "connecting"
    ? "timeline.stream.connecting"
    : stream.state === "connected"
      ? "timeline.stream.connected"
      : stream.state === "reconnecting"
        ? "timeline.stream.reconnecting"
        : stream.state === "closed"
          ? "timeline.stream.closed"
          : "timeline.stream.failed";
  return (
    <p
      aria-live="polite"
      className={stream.state === "failed"
        ? "rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-muted-foreground"
        : "text-sm text-muted-foreground"}
      role={stream.state === "failed" ? "alert" : "status"}
    >
      {t(key)}
    </p>
  );
}

function TimelineEventList({
  events,
  selectedEventId,
  t,
}: {
  events: readonly TimelineEvent[];
  selectedEventId: string | null;
  t: I18nController["t"];
}) {
  const { formatDate } = useI18n();
  return (
    <ol aria-label={t("timeline.list.label")} className="grid min-w-0 gap-2">
      {events.map((event) => {
        const selected = event.id === selectedEventId;
        return (
          <li
            aria-current={selected ? "true" : undefined}
            className="grid min-w-0 gap-2 rounded-xl border bg-card p-4 shadow-sm"
            data-selected={selected || undefined}
            key={`${event.source}:${event.id}`}
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <h3 className="min-w-0 break-words font-medium">{event.title}</h3>
              <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.occurredAt}>
                {formatDate(new Date(event.occurredAt), { dateStyle: "medium", timeStyle: "medium" })}
              </time>
            </div>
            <div className="flex min-w-0 flex-wrap gap-1.5 text-xs text-muted-foreground">
              <span className="rounded-md border px-2 py-0.5">{t(SOURCE_LABEL[event.source])}</span>
              <span className="rounded-md border px-2 py-0.5">{t(TYPE_LABEL[event.type])}</span>
              <span className={severityClass(event.severity)}>{t(SEVERITY_LABEL[event.severity])}</span>
              <span className="min-w-0 break-words py-0.5">{event.scope.clusterId}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function severityClass(severity: TimelineSeverity): string {
  if (severity === "critical") return "rounded-md border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-destructive";
  if (severity === "warning") return "rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-amber-700 dark:text-amber-300";
  return "rounded-md border px-2 py-0.5";
}
