import { describe, expect, it, vi } from "vitest";

import { createHomeActivityAdapter } from "./createHomeActivityAdapter";
import { activityWindowForPeriod } from "./homeActivityWindow";

describe("home activity adapter", () => {
  it("maps only server-zero-filled aggregate buckets", async () => {
    const getActivityOverview = vi.fn().mockResolvedValue({
      from_ms: 0,
      to_ms: 60_000,
      bucket_ms: 60_000,
      buckets: [{
        from_ms: 0,
        to_ms: 60_000,
        deployments: 0,
        alerts: 2,
        critical: 1,
      }],
    });

    await expect(createHomeActivityAdapter({ getActivityOverview }).loadOverview({
      fromMs: 0,
      toMs: 60_000,
      bucketMs: 60_000,
    })).resolves.toEqual({
      fromMs: 0,
      toMs: 60_000,
      bucketMs: 60_000,
      buckets: [{
        fromMs: 0,
        toMs: 60_000,
        deployments: 0,
        alerts: 2,
        critical: 1,
      }],
    });
  });

  it("bounds the shared periods without raw timeline aggregation", () => {
    const now = Date.parse("2026-07-19T12:00:00+09:00");
    expect(activityWindowForPeriod("today", now)).toMatchObject({
      toMs: now,
      bucketMs: 3_600_000,
    });
    expect(activityWindowForPeriod("7d", now)).toEqual({
      fromMs: now - 7 * 86_400_000,
      toMs: now,
      bucketMs: 21_600_000,
    });
    expect(activityWindowForPeriod("30d", now)).toEqual({
      fromMs: now - 30 * 86_400_000,
      toMs: now,
      bucketMs: 86_400_000,
    });
  });
});
