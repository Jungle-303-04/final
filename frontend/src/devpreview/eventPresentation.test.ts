import { describe, expect, it } from "vitest";

import { presentEventMessage } from "./eventPresentation";

describe("presentEventMessage", () => {
  it("translates Kubernetes messages without losing identifiers", () => {
    const raw = "Successfully assigned apps/api-7f9 to worker-a";
    const result = presentEventMessage(raw);
    expect(result.label).not.toMatch(/Successfully assigned/);
    expect(result.label).toContain("apps/api-7f9");
    expect(result.label).toContain("worker-a");
    expect(result.original).toBe(raw);
  });

  it("preserves captured identifiers and numbers", () => {
    for (const [raw, values] of [
      ["Started container api", ["api"]],
      ["Pulled image IMG:v1 in 3s", ["IMG:v1", "3s"]],
      ["ScalingReplicaSet web from 1 to 3", ["web", "1", "3"]],
    ] as const) {
      const result = presentEventMessage(raw);
      expect(result.label).not.toMatch(/Started|Pulled|ScalingReplicaSet/);
      for (const value of values) expect(result.label).toContain(value);
    }
  });

  it("keeps an unknown original for the diagnostic tooltip", () => {
    const raw = "UnrecognizedReason pod/api retry=3";
    const result = presentEventMessage(raw);
    expect(result.label).toBe("이벤트 세부 정보");
    expect(result.original).toBe(raw);
  });
});
