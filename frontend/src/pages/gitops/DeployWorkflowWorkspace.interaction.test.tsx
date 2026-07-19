// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ReleaseApplication,
  ReleasePlan,
} from "../../features/gitops/gitOpsContract";
import { I18nProvider } from "../../shared/i18n";
import { WorkflowEditor } from "./DeployWorkflowCards";
import {
  selectedWorkflowNode,
  type SelectedWorkflowNode,
} from "./DeployWorkflowNodes";

afterEach(cleanup);

describe("deployment workflow editor interactions", () => {
  it("adds, configures, saves, and removes a real deployment step", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn<(plan: ReleasePlan) => void>();
    render(<WorkflowEditorHarness onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Source" }));
    await user.click(screen.getByRole("button", { name: "Add target" }));
    await user.click(screen.getByRole("button", { name: "Payments Worker" }));
    await user.selectOptions(screen.getByLabelText("Environment"), "production");
    await user.clear(screen.getByLabelText("Namespace"));
    await user.type(screen.getByLabelText("Namespace"), "payments-live");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenNthCalledWith(1, expect.objectContaining({
      steps: [
        expect.objectContaining({ application_id: "checkout-api" }),
        expect.objectContaining({
          application_id: "payments-worker",
          config: expect.objectContaining({
            environment: "production",
            namespace: "payments-live",
          }),
        }),
      ],
    }));

    await user.click(screen.getByRole("button", { name: "Remove step" }));
    expect(screen.queryByRole("button", { name: "Payments Worker" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenNthCalledWith(2, expect.objectContaining({
      steps: [expect.objectContaining({ application_id: "checkout-api" })],
    }));
  });
});

function WorkflowEditorHarness({ onSave }: { onSave: (plan: ReleasePlan) => void }) {
  const [draft, setDraft] = useState<ReleasePlan>(initialPlan);
  const [selectedNode, setSelectedNode] = useState<SelectedWorkflowNode>("preflight");
  return (
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <WorkflowEditor
        applications={applications}
        clusters={[]}
        createTarget={async () => null}
        draft={draft}
        onBack={() => undefined}
        onChange={setDraft}
        onSave={() => onSave(draft)}
        onSelectNode={setSelectedNode}
        pending={false}
        selectedNode={selectedWorkflowNode(draft, selectedNode)}
        targetPending={false}
      />
    </I18nProvider>
  );
}

const applications: ReleaseApplication[] = [{
  id: "checkout-api",
  name: "Checkout API",
  repository: "team/checkout-api",
  branch: "main",
  clusterId: "production-cluster",
  manifestPath: "deploy/checkout.yaml",
}, {
  id: "payments-worker",
  name: "Payments Worker",
  repository: "team/payments-worker",
  branch: "main",
  clusterId: "production-cluster",
  manifestPath: "deploy/payments.yaml",
}];

const initialPlan: ReleasePlan = {
  plan_id: "plan-a",
  name: "Production release",
  description: "Checkout and payment deployment",
  status: "draft",
  settings: {
    approval_policy: "manual_each_step",
    default_strategy: "rolling",
  },
  steps: [{
    step_id: "checkout-step",
    application_id: "checkout-api",
    name: "Checkout API",
    position: 0,
    depends_on: [],
    config: {
      environment: "production",
      strategy: "rolling",
      cluster_id: "production-cluster",
      namespace: "checkout",
      approval_gate: "inherit",
    },
  }],
};
