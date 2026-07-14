import { describe, expect, it } from "vitest";

import { physicalTopologyColumnCount } from "./usePhysicalTopologyLayout";

describe("physical topology grid", () => {
  it("keeps two servers side by side and packs larger fleets into rows", () => {
    expect(physicalTopologyColumnCount(0)).toBe(1);
    expect(physicalTopologyColumnCount(2)).toBe(2);
    expect(physicalTopologyColumnCount(20)).toBe(7);
  });
});
