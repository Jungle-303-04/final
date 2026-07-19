import { describe, expect, it } from "vitest";

import { gitOpsSyncCategory } from "./gitOpsPresentation";

describe("gitOpsPresentation", () => {
  it.each([
    ["Synced", "synced"],
    ["succeeded", "synced"],
    ["OutOfSync", "out-of-sync"],
    ["out-of-sync", "out-of-sync"],
    ["Running", "checking"],
    ["degraded", "failed"],
    [null, "unknown"],
    ["provider-specific-state", "unknown"],
  ] as const)("normalizes the observed status %s without inventing controller state", (value, expected) => {
    expect(gitOpsSyncCategory(value)).toBe(expected);
  });
});
