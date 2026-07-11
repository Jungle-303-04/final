import { describe, expect, it } from "vitest";

import { SyntheticTopologyHierarchyGateway } from "./SyntheticTopologyHierarchyGateway";

describe("SyntheticTopologyHierarchyGateway", () => {
  it("returns an explicitly synthetic snapshot with self-consistent freshness", async () => {
    const subject = new SyntheticTopologyHierarchyGateway();
    const snapshot = await subject.getSnapshot(new AbortController().signal);

    expect(snapshot.dataOrigin.kind).toBe("synthetic");
    expect(snapshot.freshness.state).toBe("fresh");
    if (snapshot.freshness.state !== "fresh") {
      throw new Error("Synthetic dataset must remain a fresh canonical fixture");
    }

    expect(snapshot.freshness.ageMs).toBe(
      Date.parse(snapshot.freshness.receivedAt) -
        Date.parse(snapshot.freshness.observedAt),
    );
    expect(snapshot.freshness.ageMs).toBeLessThanOrEqual(
      snapshot.freshness.staleAfterMs,
    );
    expect(Date.parse(snapshot.freshness.observedAt)).toBeLessThanOrEqual(
      Date.parse(snapshot.observedAt),
    );
    expect(Date.parse(snapshot.observedAt)).toBeLessThanOrEqual(
      Date.parse(snapshot.freshness.receivedAt),
    );
  });

  it("honors cancellation before returning demo data", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      new SyntheticTopologyHierarchyGateway().getSnapshot(controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

