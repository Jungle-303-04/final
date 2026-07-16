import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../../features/timeline/timelineContract";
import {
  filterTimelineEventsForLens,
  moveTimelineLens,
  resizeTimelineLens,
  resolveTimelineLens,
  timelineLensAtPosition,
  timelineLensWindow,
} from "./timelineStripModel";

describe("timelineStripModel", () => {
  const window = { fromMs: 1_000, toMs: 2_000 };

  it("clamps the locally rendered lens to the server overview window", () => {
    expect(timelineLensWindow(window, 300)).toEqual({ fromMs: 1_700, toMs: 2_000 });
    expect(timelineLensAtPosition(window, 300, 0)).toEqual({ fromMs: 1_000, toMs: 1_300 });
    expect(timelineLensAtPosition(window, 300, 1)).toEqual({ fromMs: 1_700, toMs: 2_000 });
    expect(moveTimelineLens(window, { fromMs: 1_700, toMs: 2_000 }, -100)).toEqual({ fromMs: 1_600, toMs: 1_900 });
  });

  it("keeps the selection and visible lens independent", () => {
    expect(resolveTimelineLens(window, { kind: "selection" })).toEqual(window);
    expect(resolveTimelineLens(window, { kind: "trailing", widthMs: 300 })).toEqual({ fromMs: 1_700, toMs: 2_000 });
    expect(resolveTimelineLens(window, { kind: "window", fromMs: 1_200, toMs: 1_500 })).toEqual({ fromMs: 1_200, toMs: 1_500 });
    expect(resolveTimelineLens(window, { kind: "window", fromMs: 0, toMs: 100 })).toEqual(window);
    expect(resizeTimelineLens(window, { fromMs: 1_200, toMs: 1_500 }, 600)).toEqual({ fromMs: 1_050, toMs: 1_650 });
  });

  it("filters list and swimlane inputs locally without replacing the snapshot", () => {
    const events = [event("early", "1970-01-01T00:00:01.500Z"), event("late", "1970-01-01T00:00:01.900Z")];
    expect(filterTimelineEventsForLens(events, { fromMs: 1_700, toMs: 2_000 }).map((item) => item.id)).toEqual(["late"]);
  });
});

function event(id: string, occurredAt: string): TimelineEvent {
  return {
    id,
    source: "inventory",
    sourceKey: `inventory:${id}`,
    nativeId: id,
    activity: "change",
    occurredAt,
    scope: { workspaceId: "workspace-a", clusterId: "cluster-a", freshness: "live" },
    subject: { kind: "incident", incidentId: id, correlationId: null },
    resource: null,
    type: "update",
    severity: "info",
    title: id,
    owner: null,
    metadata: {},
  };
}
