import { describe, expect, it } from "vitest";
import type { ReleasePlan } from "../../features/gitops/gitOpsContract";
import type { TranslationFunction } from "../../shared/i18n/types";
import { buildWorkflowGraph } from "./workflowGraphModel";
import type { GraphOptions } from "./workflowGraphTypes";

const options: GraphOptions = {
  showCheckpoints: true,
  showMetadata: true,
  compact: false,
  direction: "TB",
  narrow: false,
};
const t = ((key: string) => key) as TranslationFunction;

describe("buildWorkflowGraph approvals", () => {
  it("groups inherited production-only approvals by wave", () => {
    const graph = buildWorkflowGraph(productionPlan("production_only"), [], undefined, "prod-b", options, t);
    const approvals = graph.nodes.filter((node) => node.data.kind === "approval");

    expect(approvals).toHaveLength(1);
    expect(approvals[0].id).toBe("approval-wave::1");
    expect(approvals[0].data.eyebrow).toBe("APPROVAL · WAVE 1");
    expect(approvals[0].data.ownerStepId).toBe("prod-b");
    expect(approvals[0].data.selected).toBe(true);
    expect(graph.edges.filter((edge) => edge.source === "approval-wave::1").map((edge) => edge.target).sort())
      .toEqual(["prod-a", "prod-b"]);
    expect(graph.edges.filter((edge) => edge.source === "preflight" && edge.target === "approval-wave::1"))
      .toHaveLength(1);
  });

  it("keeps manual-each-step approvals separate", () => {
    const graph = buildWorkflowGraph(productionPlan("manual_each_step"), [], undefined, undefined, options, t);
    const approvals = graph.nodes.filter((node) => node.data.kind === "approval");

    expect(approvals.map((node) => node.id).sort()).toEqual([
      "approval::prod-a",
      "approval::prod-b",
      "approval::staging",
    ]);
  });
});

function productionPlan(approvalPolicy: string): ReleasePlan {
  return {
    plan_id: "plan-1",
    name: "Release",
    description: "",
    status: "draft",
    settings: { approval_policy: approvalPolicy },
    steps: [
      releaseStep("prod-a", "production"),
      releaseStep("prod-b", "production"),
      releaseStep("staging", "staging"),
    ],
  };
}

function releaseStep(id: string, environment: string): ReleasePlan["steps"][number] {
  return {
    step_id: id,
    application_id: id,
    name: id,
    position: 0,
    depends_on: [],
    config: { environment, approval_gate: "inherit" },
  };
}
