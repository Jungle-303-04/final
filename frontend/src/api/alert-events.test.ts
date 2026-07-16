import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acknowledgeAlertEvent,
  createTestAlertEvent,
  listAlertEvents,
  promoteAlertEvent,
} from "./alert-events";

const EVENT = {
  event_id: "ale/1",
  rule_id: "alr-1",
  rule_name: "파드 CPU 과부하",
  source: "opsia",
  severity: "high",
  subject: { cluster: "cluster-2", namespace: "sandbox", kind: "Pod", name: "arena-0" },
  fired_at: "2026-07-15T02:00:00Z",
  resolved_at: null,
  status: "firing",
  observed_value: 91,
  threshold: 80,
  evidence: [{
    type: "metric_sample",
    metric: "cpu_pct",
    observed_at: "2026-07-15T02:00:00Z",
    subject: { cluster: "cluster-2", namespace: "sandbox", kind: "Pod", name: "arena-0" },
    value: 91,
    summary: null,
    link: null,
  }],
  incident_id: null,
  acknowledged_at: null,
  acknowledged_by: null,
  promoted_at: null,
  promoted_by: null,
} as const;

afterEach(() => vi.restoreAllMocks());

describe("alert event API", () => {
  it("lists the latest measured occurrences without inventing wrapper fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json([EVENT]));

    await expect(listAlertEvents({ limit: 200 })).resolves.toEqual([EVENT]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/alert-events?limit=200",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("acknowledges and promotes opaque event identifiers through bodyless mutations", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ ...EVENT, status: "acked" }))
      .mockResolvedValueOnce(json({ incident_id: "inc-alert-1" }));

    await expect(acknowledgeAlertEvent("ale/1")).resolves.toMatchObject({ status: "acked" });
    await expect(promoteAlertEvent("ale/1")).resolves.toEqual({ incident_id: "inc-alert-1" });
    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method])).toEqual([
      ["/api/alert-events/ale%2F1/ack", "POST"],
      ["/api/alert-events/ale%2F1/promote-incident", "POST"],
    ]);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-service-csrf"))
      .toBe("same-origin");
  });

  it("creates a development test occurrence through a bodyless mutation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(EVENT));

    await expect(createTestAlertEvent()).resolves.toEqual(EVENT);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/alert-events/test",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
  });

  it("rejects Opsia occurrences without observed threshold evidence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json([{ ...EVENT, observed_value: null }]));

    await expect(listAlertEvents()).rejects.toMatchObject({ kind: "invalid-payload" });
  });
});

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
