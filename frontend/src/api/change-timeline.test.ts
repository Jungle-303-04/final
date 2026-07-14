import { beforeEach, describe, expect, it, vi } from "vitest";
import { getChangeTimeline } from "./change-timeline";

const RESPONSE = {
  buckets: [{ startMs: 1_000, endMs: 2_000, total: 2, warnings: 1 }],
  events: [{
    id: "incident-1",
    kind: "incident",
    occurredMs: 1_500,
    title: "Readiness failed",
    severity: "critical",
  }],
  gaps: [{ from: 2_000, to: 3_000 }],
};

describe("change timeline API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("forwards the bounded window and canonical filters without includeDeleted", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify(RESPONSE),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    await getChangeTimeline({
      fromMs: 1_000,
      toMs: 3_000,
      bucketMs: 1_000,
      clusters: ["cluster-a"],
      namespaces: ["cluster-a/shop"],
      applications: ["checkout"],
      resourceTypes: ["pod"],
      health: ["critical"],
      labels: ["team=checkout"],
      query: "checkout",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/changes?from=1000&to=3000&bucket=1000&clusters=cluster-a" +
      "&namespaces=cluster-a%2Fshop&applications=checkout&resources.types=pod" +
      "&resources.health=critical&labels=team%3Dcheckout&resources.q=checkout",
    );
  });

  it("rejects unordered events, overlapping gaps, and unknown response fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ...RESPONSE,
      events: [
        { ...RESPONSE.events[0], id: "late", occurredMs: 1_900 },
        { ...RESPONSE.events[0], id: "early", occurredMs: 1_100 },
      ],
      gaps: [{ from: 2_000, to: 3_000 }, { from: 2_500, to: 3_500 }],
      synthetic: true,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(getChangeTimeline({ fromMs: 1_000, toMs: 4_000, bucketMs: 1_000 }))
      .rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("fails closed on invalid query windows", () => {
    expect(() => getChangeTimeline({ fromMs: 3_000, toMs: 1_000, bucketMs: 1_000 }))
      .toThrow(RangeError);
  });
});
