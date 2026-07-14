import { describe, expect, it } from "vitest";
import type { ReleaseApplication, ReleasePlanStep } from "./gitOpsContract";
import {
  createEmptyPlan,
  planValidationCodes,
  releaseWaves,
  syncSelectedApplications,
} from "./workflowModel";

const applications: ReleaseApplication[] = [{
  id: "storefront",
  name: "Storefront",
  repository: "team/storefront",
  branch: "main",
  clusterId: "staging-a",
  manifestPath: "deploy/storefront.yaml",
}, {
  id: "checkout",
  name: "Checkout",
  repository: "team/checkout",
  branch: "main",
  clusterId: "staging-b",
  manifestPath: "deploy/checkout.yaml",
}, {
  id: "payments",
  name: "Payments",
  repository: "team/payments",
  branch: "main",
  clusterId: "prod-a",
  manifestPath: "deploy/payments.yaml",
}];

describe("workflowModel", () => {
  it("creates an ordered dependency chain from selected applications", () => {
    const plan = syncSelectedApplications(
      createEmptyPlan(),
      ["storefront", "checkout", "payments"],
      applications,
    );

    expect(plan.steps.map((step) => ({
      id: step.application_id,
      position: step.position,
      dependsOn: step.depends_on,
      cluster: step.config.cluster_id,
    }))).toEqual([
      { id: "storefront", position: 0, dependsOn: [], cluster: "staging-a" },
      { id: "checkout", position: 1, dependsOn: ["storefront"], cluster: "staging-b" },
      { id: "payments", position: 2, dependsOn: ["checkout"], cluster: "prod-a" },
    ]);
    expect(planValidationCodes({ ...plan, name: "Production release" })).toEqual([]);
  });

  it("calculates parallel and dependent release waves", () => {
    const steps: ReleasePlanStep[] = [
      step("api", []),
      step("worker", []),
      step("web", ["api", "worker"]),
    ];

    expect(Object.fromEntries(releaseWaves(steps))).toEqual({
      api: 1,
      worker: 1,
      web: 2,
    });
  });

  it("reports missing names, targets, duplicates, and dangling dependencies", () => {
    const invalid = {
      ...createEmptyPlan(),
      steps: [step("api", ["missing"]), step("api", [])],
    };

    expect(planValidationCodes(invalid)).toEqual([
      "name",
      "duplicate",
      "dependency",
    ]);
  });
});

function step(applicationId: string, dependsOn: string[]): ReleasePlanStep {
  return {
    application_id: applicationId,
    name: applicationId,
    position: 0,
    depends_on: dependsOn,
    config: {},
  };
}
