import { describe, expect, it } from "vitest";

import {
  podAbnormalBadge,
  podAbnormalBadgeTone,
  podHealthTone,
  podResourcePressureTone,
  podUsageLabel,
} from "./podVisualState";

describe("podVisualState", () => {
  it("keeps capacity pressure out of the critical health tone", () => {
    expect(podResourcePressureTone(1.32)).toBe("danger");
    expect(podHealthTone({
      health: "healthy",
      phase: "Running",
      restartCount: 0,
    })).toBe("healthy");
  });

  it("keeps simple restart history in evidence instead of creating a badge", () => {
    const pod = {
      health: "healthy",
      phase: "Running",
      restartCount: 2,
    };

    const badge = podAbnormalBadge(pod);
    expect(badge).toBeNull();
    expect(podAbnormalBadgeTone(badge)).toBe("healthy");
    expect(podHealthTone(pod)).toBe("healthy");
  });

  it("keeps real failure states critical", () => {
    const badge = podAbnormalBadge({
      health: "critical",
      phase: "CrashLoopBackOff",
      restartCount: 2,
    });

    expect(badge).toBe("crash-loop");
    expect(podAbnormalBadgeTone(badge)).toBe("critical");
  });

  it("uses a neutral missing-value label for unavailable usage", () => {
    expect(podUsageLabel(null)).toBe("\u2014");
  });
});
