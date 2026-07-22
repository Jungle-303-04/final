import { describe, expect, it } from "vitest";

import { selectScenarioRuns } from "./scenarioGateSelection";

const runs = [
  { repositoryRef: "team/newest", workflowRunId: "workflow-newest" },
  { repositoryRef: "team/checkout", workflowRunId: "workflow-connect-validation-1" },
  { repositoryRef: "team/checkout", workflowRunId: "workflow-checkout" },
  { repositoryRef: "team/newest", workflowRunId: "workflow-older" },
];

describe("selectScenarioRuns", () => {
  it("scopes evidence to the repository selected by the operator", () => {
    const selected = selectScenarioRuns(runs, "TEAM/CHECKOUT");

    expect(selected.repositoryRef).toBe("TEAM/CHECKOUT");
    expect(selected.runs.map((run) => run.workflowRunId)).toEqual(["workflow-checkout"]);
  });

  it("uses the latest deploy run repository when no repository is selected", () => {
    const selected = selectScenarioRuns(runs, null);

    expect(selected.repositoryRef).toBe("team/newest");
    expect(selected.runs.map((run) => run.workflowRunId)).toEqual([
      "workflow-newest",
      "workflow-older",
    ]);
  });
});
