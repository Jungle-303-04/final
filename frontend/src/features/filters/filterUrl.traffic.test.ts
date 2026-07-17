import { describe, expect, it } from "vitest";

import { parseProductFilterUrl, serializeProductFilterUrl } from "./filterUrl";

describe("traffic URL state", () => {
  it("round-trips filters, ordering, flow drawer, and signed pagination", () => {
    const cursor = `${"a".repeat(48)}.${"b".repeat(48)}`;
    const parsed = parseProductFilterUrl(
      `?traffic.since=15m&traffic.protocols=udp,tcp,tcp` +
      `&traffic.verdicts=error,dropped&traffic.sort=source&traffic.order=asc` +
      `&traffic.flow=${"c".repeat(64)}&traffic.cursor=${cursor}`,
    );

    expect(parsed.detail).toMatchObject({
      trafficSince: "15m",
      trafficProtocols: ["tcp", "udp"],
      trafficVerdicts: ["dropped", "error"],
      trafficSort: "source",
      trafficOrder: "asc",
      trafficFlow: "c".repeat(64),
      trafficCursor: cursor,
    });
    expect(serializeProductFilterUrl(parsed.state, parsed.detail)).toBe(
      `?traffic.since=15m&traffic.protocols=tcp,udp&traffic.verdicts=dropped,error` +
      `&traffic.sort=source&traffic.order=asc&traffic.flow=${"c".repeat(64)}` +
      `&traffic.cursor=${cursor}`,
    );
  });

  it("drops unsupported traffic values instead of sending browser-derived filters", () => {
    const parsed = parseProductFilterUrl(
      "?traffic.since=7d&traffic.protocols=tcp,invalid&traffic.sort=random" +
      "&traffic.order=sideways&traffic.flow=not-a-flow&traffic.cursor=%3Cscript%3E",
    );

    expect(parsed.detail.trafficSince).toBeUndefined();
    expect(parsed.detail.trafficProtocols).toEqual(["tcp"]);
    expect(parsed.detail.trafficSort).toBeUndefined();
    expect(parsed.detail.trafficOrder).toBeUndefined();
    expect(parsed.detail.trafficFlow).toBeUndefined();
    expect(parsed.detail.trafficCursor).toBeUndefined();
    expect(parsed.needsCanonicalWrite).toBe(true);
  });
});
