import { afterEach, describe, expect, it, vi } from "vitest";
import { createReleaseFlowClient } from "./release-flow";

afterEach(() => vi.restoreAllMocks());

describe("release flow API client", () => {
  it("reads plans through the current API contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({ plans: [planFixture()] }),
    );

    const result = await createReleaseFlowClient().listPlans();

    expect(result.plans[0]?.plan_id).toBe("plan-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/release-plans",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
  });

  it("strips response-only fields when saving a plan", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({ plan: planFixture() }),
    );

    await createReleaseFlowClient().savePlan(planFixture());

    const init = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/release-plans/plan-1");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Production release",
      description: "Verified path",
      status: "draft",
      settings: { approval_policy: "manual_each_step" },
      steps: [{
        application_id: "app-1",
        name: "storefront",
        position: 0,
        depends_on: [],
        config: { environment: "production" },
      }],
    });
  });

  it("renders the selected step without starting a release", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({
      manifest: "apiVersion: apps/v1",
      files: [],
      resources: [],
      resource_count: 0,
      diagnostics: [],
      warnings: [],
      summary: "ready",
    }));

    await createReleaseFlowClient().renderManifest(planFixture(), 0);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/release-plans/render-manifest");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).step_index).toBe(0);
  });
});

function planFixture() {
  return {
    plan_id: "plan-1",
    name: "Production release",
    description: "Verified path",
    status: "draft" as const,
    settings: { approval_policy: "manual_each_step" },
    updated_at: "2026-07-14T01:00:00Z",
    steps: [{
      step_id: "step-1",
      application_id: "app-1",
      name: "storefront",
      position: 9,
      depends_on: [],
      config: { environment: "production" },
    }],
  };
}

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
