import type {
  TimelineEvent,
  TimelineGrouping,
  TimelineSort,
} from "./timelineContract";

export interface TimelineEventGroup {
  id: string;
  label: string | null;
  events: readonly TimelineEvent[];
}

/** Derives display order without changing the server-owned evidence set. */
export function sortTimelineEvents(
  events: readonly TimelineEvent[],
  sort: TimelineSort,
): readonly TimelineEvent[] {
  return [...events].sort((left, right) => compareEvents(left, right, sort));
}

/** Groups the same event records used by both List and Swimlane. */
export function groupTimelineEvents(
  events: readonly TimelineEvent[],
  grouping: TimelineGrouping,
  sort: TimelineSort,
): readonly TimelineEventGroup[] {
  const ordered = sortTimelineEvents(events, sort);
  if (grouping === "flat") {
    return [{ id: "flat", label: null, events: ordered }];
  }
  const groups = new Map<string, { label: string; events: TimelineEvent[] }>();
  for (const event of ordered) {
    const identity = groupIdentity(event, grouping);
    const current = groups.get(identity.id) ?? { label: identity.label, events: [] };
    current.events.push(event);
    groups.set(identity.id, current);
  }
  return [...groups.entries()]
    .map(([id, group]) => ({ id, label: group.label, events: group.events }))
    .sort((left, right) => {
      const firstLeft = left.events[0];
      const firstRight = right.events[0];
      if (firstLeft === undefined || firstRight === undefined) return left.id.localeCompare(right.id);
      return compareEvents(firstLeft, firstRight, sort) || left.id.localeCompare(right.id);
    });
}

/** Places an event on a shared time axis while keeping the source timestamp authoritative. */
export function timelinePositionPercent(
  event: TimelineEvent,
  events: readonly TimelineEvent[],
): number {
  if (events.length < 2) return 50;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const item of events) {
    const value = eventTimestamp(item);
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  if (!Number.isFinite(minimum) || maximum <= minimum) return 50;
  return Math.max(0, Math.min(100, ((eventTimestamp(event) - minimum) / (maximum - minimum)) * 100));
}

export function chronologicalTimelineEvents(events: readonly TimelineEvent[]): readonly TimelineEvent[] {
  return [...events].sort((left, right) => (
    eventTimestamp(left) - eventTimestamp(right)
    || left.sourceKey.localeCompare(right.sourceKey)
  ));
}

function compareEvents(left: TimelineEvent, right: TimelineEvent, sort: TimelineSort): number {
  if (sort === "name") {
    return left.title.localeCompare(right.title) || chronologicalTieBreak(left, right);
  }
  if (sort === "importance") {
    return severityRank(right) - severityRank(left) || chronologicalTieBreak(left, right);
  }
  return chronologicalTieBreak(left, right);
}

function chronologicalTieBreak(left: TimelineEvent, right: TimelineEvent): number {
  return eventTimestamp(right) - eventTimestamp(left) || left.sourceKey.localeCompare(right.sourceKey);
}

function severityRank(event: TimelineEvent): number {
  switch (event.severity) {
    case "critical": return 3;
    case "warning": return 2;
    case "info": return 1;
    case "unknown": return 0;
  }
}

function groupIdentity(
  event: TimelineEvent,
  grouping: Exclude<TimelineGrouping, "flat">,
): { id: string; label: string } {
  if (grouping === "owner") {
    const owner = event.owner;
    const label = owner === null
      ? event.scope.clusterId
      : resourceIdentity(owner) ?? event.scope.clusterId;
    return { id: `owner:${label}`, label };
  }
  if (event.subject.kind === "application_workflow") {
    return {
      id: `application:${event.subject.applicationId}`,
      label: event.subject.applicationId,
    };
  }
  const resource = event.resource
    ?? (event.subject.kind === "resource" ? event.subject.resource : null);
  const namespace = resource?.namespace
    ?? (event.subject.kind === "inventory_locator" ? event.subject.namespace : null);
  const label = namespace ?? event.scope.clusterId;
  return { id: `application:${event.scope.clusterId}:${label}`, label };
}

function resourceIdentity(resource: NonNullable<TimelineEvent["owner"]>): string | null {
  const namespace = resource.namespace === null ? "" : `${resource.namespace}/`;
  return `${namespace}${resource.kind}/${resource.name}`.trim() || null;
}

function eventTimestamp(event: TimelineEvent): number {
  const value = Date.parse(event.occurredAt);
  return Number.isFinite(value) ? value : 0;
}
