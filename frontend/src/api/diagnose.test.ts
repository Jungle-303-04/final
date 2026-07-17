import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addDiagnoseTurn,
  clearDiagnoseHistory,
  createDiagnoseRun,
  getDiagnoseCapabilities,
  grantDiagnoseConsent,
  listDiagnoseRuns,
  stopDiagnoseRun,
  subscribeDiagnoseEvents,
} from "./diagnose";
import { diagnoseEventSchema } from "./diagnose-schemas";

const RUN = {
  run_id: "run-1",
  target: {
    scope: {
      workspace_id: "workspace-a",
      cluster_id: "cluster-a",
      namespaces: ["shop"],
      freshness: "live",
    },
    resource: {
      api_group: "apps",
      version: "v1",
      kind: "Deployment",
      namespace: "shop",
      name: "checkout",
      uid: "uid-checkout",
    },
  },
  agent: {
    agent_id: "operations-ai",
    isolated: true,
    model: null,
    effort: "medium",
  },
  requested_by: "operator-a",
  status: "completed",
  target_key: "target-key",
  deduplication_key: "dedupe-key",
  status_reason: null,
  created_at: "2026-07-16T08:00:00Z",
  updated_at: "2026-07-16T08:00:01Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("subscribeDiagnoseEvents", () => {
  it("binds every composed REST endpoint to its strict response schema", async () => {
    const capability = {
      enabled: true,
      agent: RUN.agent,
      label: "Operations AI",
      disclosure_revision: "v1",
      consented: false,
      reason_codes: [],
    };
    const consent = {
      scope: RUN.target.scope,
      agent_id: "operations-ai",
      disclosure_revision: "v1",
      surface: "browser",
      granted_at: "2026-07-16T08:00:00Z",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(capability))
      .mockResolvedValueOnce(json(consent, 201))
      .mockResolvedValueOnce(json({ run: RUN, created: true, deduplicated: false }, 202))
      .mockResolvedValueOnce(json({
        runs: [RUN],
        complete: true,
        history_status: "available",
        reason_codes: [],
      }))
      .mockResolvedValueOnce(json(RUN))
      .mockResolvedValueOnce(json({ ...RUN, status: "stopped" }))
      .mockResolvedValueOnce(json({ deleted_runs: 1 }));

    await getDiagnoseCapabilities();
    await grantDiagnoseConsent({ scope: RUN.target.scope });
    await createDiagnoseRun({ uid: "uid-checkout" });
    await listDiagnoseRuns(40);
    await addDiagnoseTurn("run-1", "What changed?");
    await stopDiagnoseRun("run-1");
    await clearDiagnoseHistory();

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/diagnose/capabilities",
      "/api/diagnose/consents",
      "/api/diagnose/runs",
      "/api/diagnose/runs?limit=40",
      "/api/diagnose/runs/run-1/turns",
      "/api/diagnose/runs/run-1/stop",
      "/api/diagnose/history",
    ]);
  });

  it("resumes from Last-Event-ID and stops on a durable closed event", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      [
        "id: 3",
        "event: diagnose",
        'data: {"run_id":"run-1","sequence":3,"kind":"verdict","payload":{"answer":"evidence"},"occurred_at":"2026-07-16T08:00:00Z"}',
        "",
        "id: 4",
        "event: diagnose",
        'data: {"run_id":"run-1","sequence":4,"kind":"closed","payload":{"status":"completed"},"occurred_at":"2026-07-16T08:00:01Z"}',
        "",
        "",
      ].join("\n"),
      { headers: { "content-type": "text/event-stream" } },
    ));

    const events = [];
    for await (const event of subscribeDiagnoseEvents("run-1", { afterSequence: 2 })) {
      events.push(diagnoseEventSchema.parse(event));
    }

    expect(events.map((event) => event.sequence)).toEqual([3, 4]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/diagnose/runs/run-1/events",
      expect.objectContaining({
        credentials: "include",
        headers: expect.any(Headers),
      }),
    );
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("last-event-id")).toBe("2");
  });
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status,
  });
}
