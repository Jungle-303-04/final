import { describe, expect, it } from "vitest";
import type { ReleaseApplication, ReleasePlan, ReleasePlanStep } from "./gitOpsContract";
import {
  createEmptyPlan,
  planValidationCodes,
  releaseStepSetupIssues,
  releaseWaves,
  stepSetupFields,
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
    expect(planValidationCodes({
      ...plan,
      name: "Production release",
      settings: {
        ...plan.settings,
        commit_sha: "abc123",
        image: "ghcr.io/team/platform@sha256:123",
      },
    }, applications)).toEqual([]);
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
    const invalidApplications: ReleaseApplication[] = [{
      id: "api",
      name: "API",
      repository: "team/api",
      branch: "main",
      clusterId: "staging-a",
      manifestPath: "deploy/api.yaml",
    }];
    const invalid = {
      ...createEmptyPlan(),
      settings: { commit_sha: "abc123", image: "ghcr.io/team/api@sha256:123" },
      steps: [step("api", ["missing"]), step("api", [])],
    };

    expect(planValidationCodes(invalid, invalidApplications)).toEqual([
      "name",
      "duplicate",
      "dependency",
    ]);
  });

  it("finds the exact release fields that must be fixed before execution", () => {
    const completePlan: ReleasePlan = {
      ...createEmptyPlan(),
      name: "Production release",
      settings: { commit_sha: "abc123" },
      steps: [{
        ...step("storefront", []),
        config: { image: "ghcr.io/team/storefront@sha256:123", cluster_id: "prod-a" },
      }],
    };

    expect(stepSetupFields(completePlan, completePlan.steps[0], applications[0])).toEqual([]);

    const missingPlan: ReleasePlan = {
      ...completePlan,
      settings: {},
      steps: [{ ...completePlan.steps[0], config: {} }],
    };
    const applicationWithoutCluster = { ...applications[0], clusterId: "" };

    expect(releaseStepSetupIssues(missingPlan, [applicationWithoutCluster])).toEqual([
      { field: "commit_sha", stepId: "storefront", stepIndex: 0, stepName: "storefront" },
      { field: "image", stepId: "storefront", stepIndex: 0, stepName: "storefront" },
      { field: "cluster_id", stepId: "storefront", stepIndex: 0, stepName: "storefront" },
    ]);
  });

  it("mirrors registered application context required by release readiness", () => {
    const plan: ReleasePlan = {
      ...createEmptyPlan(),
      name: "Production release",
      settings: { commit_sha: "abc123", image: "ghcr.io/team/api@sha256:123" },
      steps: [step("api", [])],
    };

    expect(releaseStepSetupIssues(plan, [])).toEqual([
      { field: "application_id", stepId: "api", stepIndex: 0, stepName: "api" },
    ]);
    expect(releaseStepSetupIssues(plan, [{
      id: "api",
      name: "API",
      repository: "",
      branch: "",
      clusterId: "",
      manifestPath: "",
    }]).map((issue) => issue.field)).toEqual([
      "repo_ref",
      "branch",
      "manifest_path",
      "cluster_id",
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
