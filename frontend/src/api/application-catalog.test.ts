import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getApplicationDrift,
  getApplicationOverview,
  listApplicationCatalog,
  listApplicationDeploymentHistory,
} from "./application-catalog";

const APPLICATION = {
  id: "app-checkout",
  name: "checkout-api",
  environments: ["prod"],
  lifecycle_status: "active",
  health: { status: "degraded", ready_pods: 2, total_pods: 3, restarts: 4 },
  runtime_readiness: {
    completeness: "exact",
    status: "degraded",
    ready_pods: 2,
    total_pods: 3,
    restarts: 4,
  },
  current_deployment: {
    version: "v2.4.1",
    image: "registry/checkout:v2.4.1",
    image_digest: "sha256:abc",
    git_sha: "a3f9c2e0123",
    deployed_at: "2026-07-14T09:00:00+00:00",
    deployed_by: "operator",
  },
  delivery: {
    availability: "available",
    status: "failed",
    workflow_run_id: "run-2",
    observed_at: "2026-07-14T10:00:00+00:00",
  },
  batch_runtime: {
    availability: "available",
    completeness: "exact",
    status: "running",
    active_runs: 1,
    failed_runs: 0,
    succeeded_runs: 2,
  },
  has_drift: true,
  drift_summary: "spec.replicas differs",
  resource_counts: [{ kind: "Deployment", count: 1 }],
  resource_counts_completeness: "exact",
  open_incidents: 1,
  repository_ref: "opsia/checkout",
  default_branch: "main",
  manifest_path: "deploy/prod",
} as const;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("BQ-039~042 Application product API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("listApplicationCatalog forwards canonical common and Application filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ applications: [APPLICATION] }),
    );

    await expect(listApplicationCatalog({
      clusters: ["cluster-b", "cluster-a"],
      namespaces: ["cluster-a/shop"],
      applications: ["app-checkout"],
      labels: ["team=checkout"],
      environments: ["prod"],
      statuses: ["degraded"],
      pendingPromotion: true,
      query: " checkout ",
    })).resolves.toEqual({ applications: [APPLICATION] });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/applications?clusters=cluster-a%2Ccluster-b&namespaces=cluster-a%2Fshop&applications=app-checkout&labels=team%3Dcheckout&applications.environment=prod&applications.status=degraded&applications.pendingPromotion=true&applications.q=checkout",
    );
  });

  it("getApplicationOverview, listApplicationDeploymentHistory, and getApplicationDrift use encoded identities and strict schemas", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        application: {
          ...APPLICATION,
          endpoints: [{ id: "ingress:checkout", kind: "Ingress", name: "checkout", url: "https://checkout.test" }],
          endpoints_completeness: "exact",
          recent_activity: [{ id: "activity-1", type: "deployment", summary: "v2.4.1 deployed", occurred_at: "2026-07-14T09:00:00+00:00" }],
          recent_incidents: [{ id: "incident-1", title: "Checkout latency", status: "open", started_at: "2026-07-14T09:10:00+00:00" }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ deployments: [{
        id: "deployment-1",
        environment: "prod",
        cluster_id: "cluster-a",
        git_sha: "a3f9c2e0123",
        version: "v2.4.1",
        deployed_at: "2026-07-14T09:00:00+00:00",
        deployed_by: "operator",
        status: "succeeded",
        gitops_change_id: "change-42",
      }] }))
      .mockResolvedValueOnce(jsonResponse({
        status: "drifted",
        summary: "one field differs",
        differences: [{
          resource: "Deployment/checkout",
          field_path: "spec.replicas",
          old_value: 3,
          new_value: 1,
          value_redacted: false,
          changed_by: "operator",
          changed_at: "2026-07-14T09:10:00+00:00",
        }],
        observed_at: "2026-07-14T09:11:00+00:00",
      }));

    await getApplicationOverview("app/checkout");
    await listApplicationDeploymentHistory("app/checkout");
    await getApplicationDrift("app/checkout");
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/applications/app%2Fcheckout",
      "/api/applications/app%2Fcheckout/deployments",
      "/api/applications/app%2Fcheckout/drift",
    ]);
  });

  it("rejects unknown inner fields, contradictory pod counts, and invented drift evidence", async () => {
    const invalid = [
      { applications: [{ ...APPLICATION, provider_secret: "do-not-pass" }] },
      { applications: [{ ...APPLICATION, health: { ...APPLICATION.health, ready_pods: 4 } }] },
      {
        applications: [{
          ...APPLICATION,
          delivery: { ...APPLICATION.delivery, availability: "unavailable" },
        }],
      },
      {
        applications: [{
          ...APPLICATION,
          batch_runtime: { ...APPLICATION.batch_runtime, availability: "unavailable" },
        }],
      },
      { applications: [{ ...APPLICATION, has_drift: false }] },
    ];
    for (const payload of invalid) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse(payload));
      await expect(listApplicationCatalog()).rejects.toMatchObject({ kind: "invalid-payload" });
    }

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      status: "drifted",
      summary: null,
      differences: [],
      observed_at: null,
    }));
    await expect(getApplicationDrift("app-checkout"))
      .rejects.toMatchObject({ kind: "invalid-payload" });
  });

  it("forwards AbortSignal and validates application identities before fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({
      status: "in_sync",
      summary: null,
      differences: [],
      observed_at: null,
    }));
    await getApplicationDrift("app-checkout", controller.signal);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/applications/app-checkout/drift",
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(() => getApplicationOverview(" ")).toThrow("applicationId must not be empty");
  });
});
