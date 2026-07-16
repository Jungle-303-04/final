import { describe, expect, it, vi } from "vitest";

import { createDiagnoseAdapter } from "./createDiagnoseAdapter";

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
    model: "configured-model",
    effort: "high",
  },
  requested_by: "operator-a",
  status: "running",
  target_key: "target-key",
  deduplication_key: "dedupe-key",
  status_reason: null,
  created_at: "2026-07-16T08:00:00Z",
  updated_at: "2026-07-16T08:00:01Z",
} as const;

describe("createDiagnoseAdapter", () => {
  it("uses server-described agent settings and maps durable replay events", async () => {
    const createDiagnoseRun = vi.fn(async () => ({
      run: RUN,
      created: true,
      deduplicated: false,
    }));
    const port = createDiagnoseAdapter({
      getDiagnoseCapabilities: async () => ({
        enabled: true,
        agent: RUN.agent,
        label: "Operations AI",
        disclosure_revision: "disclosure-v2",
        consented: true,
        reason_codes: [],
      }),
      grantDiagnoseConsent: async () => ({}),
      createDiagnoseRun,
      listDiagnoseRuns: async () => ({
        runs: [RUN],
        complete: true,
        history_status: "available",
        reason_codes: [],
      }),
      addDiagnoseTurn: async () => RUN,
      stopDiagnoseRun: async () => ({ ...RUN, status: "stopped" }),
      clearDiagnoseHistory: async () => ({ deleted_runs: 1 }),
      async *subscribeDiagnoseEvents() {
        yield {
          run_id: "run-1",
          sequence: 1,
          kind: "phase",
          payload: { status: "running" },
          occurred_at: "2026-07-16T08:00:01Z",
        };
      },
    });

    const capabilities = await port.getCapabilities();
    await port.startResourceRun({
      clusterId: "cluster-a",
      resourceType: "workload",
      apiGroup: "apps",
      apiVersion: "v1",
      kind: "Deployment",
      namespace: "shop",
      name: "checkout",
      uid: "uid-checkout",
    }, capabilities);
    expect(createDiagnoseRun).toHaveBeenCalledWith(expect.objectContaining({
      agent: {
        agent_id: "operations-ai",
        isolated: true,
        model: "configured-model",
        effort: "high",
      },
      disclosure_revision: "disclosure-v2",
    }), undefined);

    const events = [];
    for await (const event of port.subscribeEvents("run-1")) events.push(event);
    expect(events).toEqual([expect.objectContaining({
      runId: "run-1",
      sequence: 1,
      kind: "phase",
    })]);
    expect((await port.listRuns()).runs[0]?.target.uid).toBe("uid-checkout");
    expect(await port.clearFinished()).toBe(1);
  });
});
