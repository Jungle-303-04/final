import { vi } from "vitest";
import type { ChangeTimelinePort } from "../../features/resources/changeTimelineContract";

export function resourcesChangeTimelinePort(
  overrides: Partial<ChangeTimelinePort> = {},
): ChangeTimelinePort {
  return {
    loadChangeTimeline: vi.fn().mockImplementation((_state, options) => Promise.resolve({
      ...options,
      buckets: [
        { startMs: options.fromMs, endMs: options.fromMs + options.bucketMs, total: 1, warnings: 1 },
        { startMs: options.fromMs + options.bucketMs, endMs: options.toMs, total: 0, warnings: 0 },
      ],
      events: [{
        id: "incident-1",
        kind: "incident",
        occurredMs: options.fromMs + options.bucketMs,
        title: "Readiness failed",
        severity: "critical",
      }],
      gaps: [],
      freshnessPolicy: {
        staleAfterSeconds: 5,
        refreshAfterSeconds: 15,
        keepLastSuccess: true,
        pauseWhenHidden: true,
        eventInvalidation: true,
        retryAfterSeconds: null,
        retryLimit: null,
        postMutationRefreshAfterSeconds: null,
      },
    })),
    ...overrides,
  };
}
