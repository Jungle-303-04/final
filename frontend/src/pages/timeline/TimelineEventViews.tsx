import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

import type { I18nController } from "../../shared/i18n";
import type { MessageKey } from "../../shared/i18n/types";
import type {
  TimelineEvent,
  TimelineGrouping,
  TimelineSeverity,
  TimelineSort,
  TimelineSource,
  TimelineEventType,
} from "../../features/timeline/timelineContract";
import type { TimelineEventGroup } from "../../features/timeline/timelinePresentation";
import {
  chronologicalTimelineEvents,
  timelinePositionPercent,
} from "../../features/timeline/timelinePresentation";

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

export interface TimelineEventInteraction {
  selectedEventKey: string | null;
  onNavigate: (event: TimelineEvent, direction: -1 | 1) => void;
  onSelect: (event: TimelineEvent, origin: HTMLButtonElement) => void;
  registerControl: (event: TimelineEvent, control: HTMLButtonElement | null) => void;
}

interface TimelineEventViewProps {
  formatDate: I18nController["formatDate"];
  grouping: TimelineGrouping;
  groups: readonly TimelineEventGroup[];
  interaction: TimelineEventInteraction;
  sort: TimelineSort;
  t: I18nController["t"];
}

export function TimelineEventList({
  formatDate,
  grouping: _grouping,
  groups,
  interaction,
  sort: _sort,
  t,
}: TimelineEventViewProps) {
  const isFlat = groups.length === 1 && groups[0]?.label === null;
  if (isFlat) {
    return (
      <ol aria-label={t("timeline.list.label")} className="grid min-w-0 gap-2">
        {groups[0]?.events.map((event) => (
          <TimelineEventListItem
            event={event}
            formatDate={formatDate}
            interaction={interaction}
            key={event.sourceKey}
            t={t}
          />
        ))}
      </ol>
    );
  }
  return (
    <div aria-label={t("timeline.list.label")} className="grid min-w-0 gap-4" role="list">
      {groups.map((group) => (
        <section className="grid min-w-0 gap-2" data-timeline-group={group.id} key={group.id}>
          <h3 className="min-w-0 truncate text-sm font-medium text-muted-foreground" title={group.label ?? undefined}>
            {group.label}
          </h3>
          <ol className="grid min-w-0 gap-2">
            {group.events.map((event) => (
              <TimelineEventListItem
                event={event}
                formatDate={formatDate}
                interaction={interaction}
                key={event.sourceKey}
                t={t}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function TimelineSwimlane({
  formatDate,
  grouping,
  groups,
  interaction,
  sort,
  t,
}: TimelineEventViewProps) {
  const allEvents = groups.flatMap((group) => group.events);
  return (
    <section
      aria-label={t("timeline.swimlane.label")}
      className="min-w-0 overflow-hidden rounded-xl border bg-card p-3 shadow-sm"
      data-timeline-grouping={grouping}
      data-timeline-sort={sort}
      role="region"
    >
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[32rem] gap-3">
          {groups.map((group) => (
            <TimelineSwimlaneRow
              allEvents={allEvents}
              formatDate={formatDate}
              group={group}
              interaction={interaction}
              key={group.id}
              t={t}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function TimelineEventListItem({
  event,
  formatDate,
  interaction,
  t,
}: {
  event: TimelineEvent;
  formatDate: I18nController["formatDate"];
  interaction: TimelineEventInteraction;
  t: I18nController["t"];
}) {
  return (
    <li className="min-w-0">
      <EventControl
        className="grid w-full min-w-0 gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition-[border-color,box-shadow,transform] hover:border-ring/50 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40 motion-reduce:transition-none"
        event={event}
        interaction={interaction}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 break-words font-medium">{event.title}</span>
          <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.occurredAt}>
            {formatDate(new Date(event.occurredAt), { dateStyle: "medium", timeStyle: "medium" })}
          </time>
        </div>
        <span className="flex min-w-0 flex-wrap gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-md border px-2 py-0.5">{t(SOURCE_LABEL[event.source])}</span>
          <span className="rounded-md border px-2 py-0.5">{t(TYPE_LABEL[event.type])}</span>
          <span className={severityClass(event.severity)}>{t(SEVERITY_LABEL[event.severity])}</span>
          <span className="min-w-0 break-words py-0.5">{event.scope.clusterId}</span>
        </span>
      </EventControl>
    </li>
  );
}

function TimelineSwimlaneRow({
  allEvents,
  formatDate,
  group,
  interaction,
  t,
}: {
  allEvents: readonly TimelineEvent[];
  formatDate: I18nController["formatDate"];
  group: TimelineEventGroup;
  interaction: TimelineEventInteraction;
  t: I18nController["t"];
}) {
  const events = chronologicalTimelineEvents(group.events);
  return (
    <div
      className="grid grid-cols-[minmax(7rem,12rem)_minmax(18rem,1fr)] gap-3"
      data-timeline-lane
      data-timeline-group={group.id}
    >
      <h3 className="min-w-0 self-center truncate text-sm font-medium" title={group.label ?? undefined}>
        {group.label ?? t("timeline.list.label")}
      </h3>
      <div className="relative h-16 rounded-lg border bg-muted/20" role="list">
        <div aria-hidden="true" className="absolute top-1/2 right-2 left-2 border-t border-dashed" />
        {events.map((event, index) => (
          <EventControl
            ariaLabel={event.title}
            className={`absolute z-10 size-4 -translate-x-1/2 rounded-full border-2 border-background ${markerClass(event.severity)} ${index % 2 === 0 ? "top-3" : "top-9"}`}
            dataTimelineMarker
            event={event}
            interaction={interaction}
            key={event.sourceKey}
            style={{ left: `clamp(0.75rem, ${timelinePositionPercent(event, allEvents)}%, calc(100% - 0.75rem))` }}
          >
            <span className="sr-only">{event.title}</span>
            <span aria-hidden="true" className="sr-only">
              {formatDate(new Date(event.occurredAt), { dateStyle: "medium", timeStyle: "medium" })}
            </span>
          </EventControl>
        ))}
      </div>
    </div>
  );
}

function EventControl({
  ariaLabel,
  children,
  className,
  dataTimelineMarker = false,
  event,
  interaction,
  style,
}: {
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  dataTimelineMarker?: boolean;
  event: TimelineEvent;
  interaction: TimelineEventInteraction;
  style?: CSSProperties;
}) {
  const selected = interaction.selectedEventKey === event.sourceKey;
  return (
    <button
      aria-current={selected ? "true" : undefined}
      aria-label={ariaLabel ?? event.title}
      className={className}
      data-event-id={event.id}
      data-event-key={event.sourceKey}
      data-selected={selected || undefined}
      data-timeline-event-control
      data-timeline-marker={dataTimelineMarker || undefined}
      data-timeline-time={dataTimelineMarker ? event.occurredAt : undefined}
      onClick={(clickEvent) => interaction.onSelect(event, clickEvent.currentTarget)}
      onKeyDown={(keyEvent) => navigateWithArrow(keyEvent, event, interaction)}
      ref={(element) => interaction.registerControl(event, element)}
      style={style}
      type="button"
    >
      {children}
    </button>
  );
}

function navigateWithArrow(
  event: KeyboardEvent<HTMLButtonElement>,
  timelineEvent: TimelineEvent,
  interaction: TimelineEventInteraction,
) {
  const direction = event.key === "ArrowDown" || event.key === "ArrowRight"
    ? 1
    : event.key === "ArrowUp" || event.key === "ArrowLeft"
      ? -1
      : null;
  if (direction === null) return;
  event.preventDefault();
  interaction.onNavigate(timelineEvent, direction);
}

function severityClass(severity: TimelineSeverity): string {
  if (severity === "critical") return "rounded-md border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-destructive";
  if (severity === "warning") return "rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-amber-700 dark:text-amber-300";
  return "rounded-md border px-2 py-0.5";
}

function markerClass(severity: TimelineSeverity): string {
  if (severity === "critical") return "bg-destructive";
  if (severity === "warning") return "bg-amber-500";
  return "bg-primary";
}
