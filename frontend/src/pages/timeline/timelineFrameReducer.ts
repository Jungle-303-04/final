import type {
  TimelineCoverage,
  TimelineEvent,
  TimelineSnapshot,
  TimelineStreamFrame,
} from "../../features/timeline/timelineContract";

/** Keeps only server-bounded, arrival-ordered evidence records in browser memory. */
export function normalizeTimelineSnapshot(snapshot: TimelineSnapshot): TimelineSnapshot {
  const events = appendBoundedEvents([], snapshot.events, snapshot.policy.maxBatchEvents);
  const coverage = mergeCoverage([], snapshot.coverage);
  return events === snapshot.events && coverage === snapshot.coverage
    ? snapshot
    : { ...snapshot, events, coverage };
}

export function applyTimelineFrames(
  snapshot: TimelineSnapshot,
  frames: readonly TimelineStreamFrame[],
): TimelineSnapshot {
  const incomingEvents = frames.flatMap((frame) => frame.kind === "event" ? [frame.event] : []);
  const incomingCoverage = frames.flatMap((frame) => frame.kind === "coverage" ? frame.coverage : []);
  if (incomingEvents.length === 0 && incomingCoverage.length === 0) return snapshot;
  const events = appendBoundedEvents(
    snapshot.events,
    incomingEvents,
    snapshot.policy.maxBatchEvents,
  );
  const coverage = mergeCoverage(snapshot.coverage, incomingCoverage);
  return events === snapshot.events && coverage === snapshot.coverage
    ? snapshot
    : { ...snapshot, events, coverage };
}

function appendBoundedEvents(
  current: readonly TimelineEvent[],
  incoming: readonly TimelineEvent[],
  maxEvents: number,
): readonly TimelineEvent[] {
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) {
    throw new TypeError("timeline maxBatchEvents must be a positive safe integer");
  }
  const records: TimelineEvent[] = [];
  const known = new Set<string>();
  for (const event of [...current, ...incoming]) {
    const key = eventKey(event);
    if (known.has(key)) continue;
    known.add(key);
    records.push(event);
    if (records.length > maxEvents) {
      known.delete(eventKey(records.shift()!));
    }
  }
  if (
    records.length === current.length
    && records.every((event, index) => event === current[index])
  ) {
    return current;
  }
  return records;
}

function eventKey(event: TimelineEvent): string {
  return `${event.source}\u0000${event.sourceKey}`;
}

function mergeCoverage(
  current: readonly TimelineCoverage[],
  incoming: readonly TimelineCoverage[],
): readonly TimelineCoverage[] {
  const known = new Set(current.map(coverageKey));
  const additions = incoming.filter((coverage) => {
    const key = coverageKey(coverage);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  return additions.length === 0 ? current : [...current, ...additions];
}

function coverageKey(coverage: TimelineCoverage): string {
  return [
    coverage.scope.workspaceId,
    coverage.scope.clusterId,
    (coverage.scope.namespaces ?? []).join("\u0000"),
    coverage.source,
    coverage.fromMs,
    coverage.toMs,
    coverage.reason,
  ].join("\u0000");
}
