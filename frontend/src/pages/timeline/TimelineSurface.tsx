import { useEffect, useMemo, useState } from "react";
import { useI18n, type I18nController } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { Button } from "../../shared/ui/primitives/button";
import type {
  TimelineFailure,
  TimelinePort,
  TimelineQuery,
} from "../../features/timeline/timelineContract";
import { TimelineFailure as TimelinePortFailure } from "../../features/timeline/timelineContract";
import { DEFAULT_MAX_RANGE_DAYS } from "../../features/timeline/timelineUrlState";
import { useTimelineUrlState } from "../../features/timeline/useTimelineUrlState";
import type { ClusterScope } from "../../shared/parity/referenceParity";

type TimelineLoadState =
  | { phase: "loading" }
  | { phase: "ready"; eventCount: number }
  | { phase: "failed"; failure: TimelineFailure };

interface TimelineResolution {
  requestSignature: string;
  state: Exclude<TimelineLoadState, { phase: "loading" }>;
}

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
  const [reloadToken, setReloadToken] = useState(0);
  const requestSignature = useMemo(
    () => JSON.stringify({ query, reloadToken }),
    [query, reloadToken],
  );
  const [resolution, setResolution] = useState<TimelineResolution | null>(null);
  const loadState: TimelineLoadState = resolution?.requestSignature === requestSignature
    ? resolution.state
    : { phase: "loading" };

  useEffect(() => {
    const controller = new AbortController();
    void port.readTimeline(query, controller.signal)
      .then((snapshot) => {
        if (controller.signal.aborted) return;
        if (!Number.isSafeInteger(snapshot.eventCount) || snapshot.eventCount < 0) {
          setResolution({
            requestSignature,
            state: { phase: "failed", failure: new TimelinePortFailure("invalid-response") },
          });
          return;
        }
        setResolution({ requestSignature, state: { phase: "ready", eventCount: snapshot.eventCount } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResolution({
          requestSignature,
          state: { phase: "failed", failure: toTimelineFailure(error) },
        });
      });
    return () => controller.abort();
  }, [port, query, requestSignature]);

  const namespaceLocked = port.capabilities.requiresNamespaceFilter;
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
        <div aria-label={t("timeline.view")} className="flex items-center gap-1" role="radiogroup">
          <Button
            aria-checked={url.state.viewMode === "list"}
            onClick={() => url.setViewMode("list")}
            role="radio"
            size="sm"
            type="button"
            variant={url.state.viewMode === "list" ? "secondary" : "ghost"}
          >
            {t("timeline.view.list")}
          </Button>
          <Button
            aria-checked={url.state.viewMode === "swimlane"}
            aria-disabled={namespaceLocked}
            disabled={namespaceLocked}
            onClick={() => url.setViewMode("swimlane")}
            role="radio"
            size="sm"
            type="button"
            variant={url.state.viewMode === "swimlane" ? "secondary" : "ghost"}
          >
            {t("timeline.view.swimlane")}
          </Button>
        </div>
      </div>
      <TimelineLoadBoundary
        formatNumber={formatNumber}
        loadState={loadState}
        onRetry={() => setReloadToken((token) => token + 1)}
        t={t}
      />
    </ProductPageFrame>
  );
}

function TimelineLoadBoundary({
  loadState,
  onRetry,
  formatNumber,
  t,
}: {
  loadState: TimelineLoadState;
  onRetry: () => void;
  formatNumber: I18nController["formatNumber"];
  t: I18nController["t"];
}) {
  if (loadState.phase === "loading") {
    return <p aria-live="polite" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground" role="status">{t("timeline.loading")}</p>;
  }
  if (loadState.phase === "failed") {
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
  if (loadState.eventCount === 0) {
    return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{t("timeline.empty")}</p>;
  }
  return (
    <p aria-live="polite" className="rounded-xl border bg-card p-6 text-sm" role="status">
      {t(
        loadState.eventCount === 1 ? "timeline.count.one" : "timeline.count.other",
        { count: formatNumber(loadState.eventCount) },
      )}
    </p>
  );
}

function toTimelineFailure(error: unknown): TimelineFailure {
  return error instanceof TimelinePortFailure ? error : new TimelinePortFailure("unknown");
}
