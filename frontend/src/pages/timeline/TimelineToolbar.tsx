import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { resolveTimelineActivitySelection, validateTimelineKinds } from "../../features/timeline/timelineControlState";
import {
  timelineActivityKeysFromActivities,
  type TimelineActivityKey,
  type TimelineCapabilities,
  type TimelineControlOption,
  type TimelineGrouping,
  type TimelineSort,
  type TimelineViewMode,
} from "../../features/timeline/timelineContract";
import type { TimelineUrlState } from "../../features/timeline/timelineUrlState";
import type { I18nController } from "../../shared/i18n";
import { TIMELINE_SOURCE_LABEL } from "./timelineLabels";
import type { TimelineOverviewFrame } from "./useTimelineOverviewFrame";

export function TimelineToolbar({
  capabilities,
  overview,
  state,
  onActivityFilterChange,
  onGroupingChange,
  onKindFilterChange,
  onSearchChange,
  onShowDeletedChange,
  onSortChange,
  onViewModeChange,
  t,
}: {
  capabilities: TimelineCapabilities;
  overview: TimelineOverviewFrame;
  state: TimelineUrlState;
  onActivityFilterChange: (activity: readonly TimelineActivityKey[]) => void;
  onGroupingChange: (grouping: TimelineGrouping) => void;
  onKindFilterChange: (kinds: readonly string[]) => void;
  onSearchChange: (search: string) => void;
  onShowDeletedChange: (showDeleted: boolean) => void;
  onSortChange: (sort: TimelineSort) => void;
  onViewModeChange: (viewMode: TimelineViewMode) => void;
  t: I18nController["t"];
}) {
  const controls = capabilities.controlSurface;
  const searchRef = useRef<HTMLInputElement>(null);
  const activitySelection = resolveTimelineActivitySelection(capabilities, state.activityFilter);
  const selectedKinds = useMemo(
    () => validateTimelineKinds(state.kindFilter, overview.phase === "ready" ? overview.overview : null),
    [overview, state.kindFilter],
  );
  const activityId = useId();
  const groupingId = useId();
  const sortId = useId();
  const viewGroupRef = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.defaultPrevented || isEditableTarget(event.target)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const selectActivity = (id: string) => {
    const option = controls.activity.find((candidate) => candidate.id === id);
    if (option === undefined) return;
    onActivityFilterChange(timelineActivityKeysFromActivities(option.activity));
  };
  const toggleProblems = (checked: boolean) => {
    const activities = checked ? activitySelection.option.problemsActivity : activitySelection.option.activity;
    onActivityFilterChange(timelineActivityKeysFromActivities(activities));
  };
  const toggleKind = (kind: string, checked: boolean) => {
    const next = checked ? [...selectedKinds, kind] : selectedKinds.filter((selected) => selected !== kind);
    onKindFilterChange(next);
  };
  const navigateView = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const available = controls.views.filter(
      (option) => capabilities.namespaceFilterPolicy !== "required" || option.id === "list",
    );
    const current = available.findIndex((option) => option.id === state.viewMode);
    const targetIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? available.length - 1
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? (current + 1) % available.length
            : event.key === "ArrowLeft" || event.key === "ArrowUp"
              ? (current - 1 + available.length) % available.length
              : null;
    if (targetIndex === null || available.length === 0) return;
    event.preventDefault();
    const target = available[targetIndex];
    if (target === undefined) return;
    onViewModeChange(target.id as TimelineViewMode);
    requestAnimationFrame(() =>
      viewGroupRef.current?.querySelector<HTMLInputElement>(`[data-timeline-view="${target.id}"]`)?.focus(),
    );
  };

  return (
    <section
      aria-label={t("timeline.toolbar.aria")}
      className="grid min-w-0 gap-3 rounded-xl border bg-card p-3 shadow-sm"
      data-slot="timeline-toolbar"
    >
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium sm:max-w-md">
          <span>{t("timeline.search")}</span>
          <input
            aria-label={t("timeline.search")}
            className="h-9 min-w-0 rounded-md border bg-background px-3 text-sm shadow-xs outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              onSearchChange("");
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
            ref={searchRef}
            type="search"
            value={state.search}
          />
        </label>

        <label className="grid min-w-36 gap-1 text-sm font-medium" htmlFor={activityId}>
          <span>{t("timeline.toolbar.activity")}</span>
          <select
            className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id={activityId}
            onChange={(event) => selectActivity(event.currentTarget.value)}
            value={activitySelection.option.id}
          >
            {controls.activity.map((option) => (
              <option key={option.id} title={option.description ?? undefined} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {activitySelection.option.problemsActivity.length > 0 ? (
          <label className="flex h-9 items-center gap-2 rounded-md border px-2 text-sm font-medium">
            <input
              checked={activitySelection.problemsOnly}
              className="size-4 accent-primary"
              onChange={(event) => toggleProblems(event.currentTarget.checked)}
              type="checkbox"
            />
            {t("timeline.toolbar.problems")}
          </label>
        ) : null}

        <label className="flex h-9 items-center gap-2 rounded-md border px-2 text-sm font-medium">
          <input
            checked={state.showDeleted}
            className="size-4 accent-primary"
            onChange={(event) => onShowDeletedChange(event.currentTarget.checked)}
            type="checkbox"
          />
          {controls.deleted.label}
        </label>

        <KindMenu
          frame={overview}
          label={controls.kinds.label}
          onKindChange={toggleKind}
          selectedKinds={selectedKinds}
          t={t}
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-end gap-2 border-t pt-3">
        <fieldset className="flex min-w-0 flex-wrap gap-1" aria-label={t("timeline.view")} ref={viewGroupRef}>
          <legend className="sr-only">{t("timeline.view")}</legend>
          {controls.views.map((option) => {
            const disabled = capabilities.namespaceFilterPolicy === "required" && option.id !== "list";
            return (
              <label
                className="inline-flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors has-[:checked]:border-primary has-[:checked]:bg-secondary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 motion-reduce:transition-none"
                key={option.id}
                title={option.description ?? undefined}
              >
                <input
                  checked={state.viewMode === option.id}
                  className="sr-only"
                  data-timeline-view={option.id}
                  disabled={disabled}
                  name="timeline-view"
                  onChange={() => onViewModeChange(option.id as TimelineViewMode)}
                  onKeyDown={navigateView}
                  tabIndex={state.viewMode === option.id ? 0 : -1}
                  type="radio"
                  value={option.id}
                />
                {option.label}
              </label>
            );
          })}
        </fieldset>

        <label className="grid min-w-32 gap-1 text-sm font-medium" htmlFor={groupingId}>
          <span>{t("timeline.toolbar.grouping")}</span>
          <select
            className="h-8 min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id={groupingId}
            onChange={(event) => onGroupingChange(event.currentTarget.value as TimelineGrouping)}
            value={state.grouping}
          >
            {controls.groupings.map((option) => (
              <option key={option.id} title={option.description ?? undefined} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-32 gap-1 text-sm font-medium" htmlFor={sortId}>
          <span>{t("timeline.toolbar.sort")}</span>
          <select
            className="h-8 min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id={sortId}
            onChange={(event) => onSortChange(event.currentTarget.value as TimelineSort)}
            value={state.sort}
          >
            {controls.sorts.map((option) => (
              <option key={option.id} title={option.description ?? undefined} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <LegendMenu frame={overview} items={controls.legend.items} label={controls.legend.label} t={t} />
      </div>
    </section>
  );
}

function KindMenu({
  frame,
  label,
  onKindChange,
  selectedKinds,
  t,
}: {
  frame: TimelineOverviewFrame;
  label: string;
  onKindChange: (kind: string, checked: boolean) => void;
  selectedKinds: readonly string[];
  t: I18nController["t"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="relative min-w-28"
      onKeyDown={closeDetailsOnEscape}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border px-2 text-sm font-medium outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring">
        {label}
      </summary>
      {open ? (
        <div className="absolute z-20 mt-1 grid min-w-56 max-w-[min(24rem,calc(100vw-2rem))] gap-2 rounded-lg border bg-popover p-2 text-popover-foreground shadow-md">
          {frame.phase === "loading" ? (
            <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
              {t("timeline.toolbar.overviewLoading")}
            </p>
          ) : frame.phase === "failed" ? (
            <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
              {t("timeline.toolbar.overviewUnavailable")}
            </p>
          ) : frame.overview.facets.kinds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("timeline.toolbar.noKinds")}</p>
          ) : (
            <ul className="grid max-h-60 gap-1 overflow-y-auto" aria-label={label}>
              {frame.overview.facets.kinds.map((facet) => (
                <li key={facet.kind}>
                  <label className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <input
                      checked={selectedKinds.includes(facet.kind)}
                      className="size-4 accent-primary"
                      onChange={(event) => onKindChange(facet.kind, event.currentTarget.checked)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1 break-words">{facet.kind}</span>
                    <output className="shrink-0 text-xs text-muted-foreground">{facet.count}</output>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </details>
  );
}

function LegendMenu({
  frame,
  items,
  label,
  t,
}: {
  frame: TimelineOverviewFrame;
  items: readonly TimelineControlOption[];
  label: string;
  t: I18nController["t"];
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="relative min-w-28"
      onKeyDown={closeDetailsOnEscape}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex h-8 cursor-pointer list-none items-center rounded-md border px-2 text-sm font-medium outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-ring">
        {label}
      </summary>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 grid min-w-56 max-w-[min(24rem,calc(100vw-2rem))] gap-2 rounded-lg border bg-popover p-2 text-popover-foreground shadow-md">
          {frame.phase === "loading" ? (
            <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
              {t("timeline.toolbar.overviewLoading")}
            </p>
          ) : frame.phase === "failed" ? (
            <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
              {t("timeline.toolbar.overviewUnavailable")}
            </p>
          ) : (
            <>
              <ul className="grid gap-1 text-sm">
                {items.map((item) => (
                  <li className="min-w-0 break-words" key={item.id} title={item.description ?? undefined}>
                    {item.label}
                  </li>
                ))}
              </ul>
              <ul className="grid gap-1 border-t pt-2 text-sm">
                {frame.overview.coverageSources.map((coverage) => (
                  <li className="flex min-w-0 items-center justify-between gap-3" key={coverage.source}>
                    <span className="min-w-0 break-words">{t(TIMELINE_SOURCE_LABEL[coverage.source])}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {coverage.availability === "observed"
                        ? t("timeline.toolbar.coverageObserved")
                        : t("timeline.toolbar.coverageUnavailable")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </details>
  );
}

function closeDetailsOnEscape(event: ReactKeyboardEvent<HTMLDetailsElement>) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.currentTarget.open = false;
  event.currentTarget.querySelector<HTMLElement>("summary")?.focus();
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select, [contenteditable=true]");
}
