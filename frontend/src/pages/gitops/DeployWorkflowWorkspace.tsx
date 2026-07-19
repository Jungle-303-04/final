import { Plus } from "lucide-react";
import { useState } from "react";

import type { GitOpsPort } from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import {
  WorkflowCreation,
  WorkflowEditor,
  WorkflowPreview,
} from "./DeployWorkflowCards";
import {
  selectedWorkflowNode,
  type SelectedWorkflowNode,
} from "./DeployWorkflowNodes";
import {
  WorkflowEvidenceNavigation,
  WorkflowFeedbackBanner,
  WorkflowLoadFailure,
} from "./DeployWorkflowSupport";
import { useGitOpsPageController } from "./useGitOpsPageController";

export function DeployWorkflowWorkspace({ port }: { port: GitOpsPort }) {
  const { t } = useI18n();
  const page = useGitOpsPageController(port);
  const [selectedNode, setSelectedNode] = useState<SelectedWorkflowNode>("preflight");

  if (page.data.loading && !page.data.plans.length) {
    return <ProductStateScreen kind="loading" placement="content" />;
  }

  if (page.creating) {
    return (
      <div className="grid min-w-0 gap-3">
        {page.feedback ? (
          <WorkflowFeedbackBanner
            feedback={page.feedback}
            onClose={() => page.setFeedback(undefined)}
          />
        ) : null}
        <WorkflowCreation page={page} />
      </div>
    );
  }

  if (page.selectedPlan && page.draft) {
    return (
      <div className="grid min-w-0 gap-3">
        {page.feedback ? (
          <WorkflowFeedbackBanner
            feedback={page.feedback}
            onClose={() => page.setFeedback(undefined)}
          />
        ) : null}
        <WorkflowEditor
          applications={page.data.applications}
          clusters={page.data.clusters}
          createTarget={page.createTarget}
          draft={page.draft}
          onBack={page.showPlanList}
          onChange={page.setDraft}
          onSave={() => void page.saveDraft()}
          onSelectNode={setSelectedNode}
          pending={page.operation === "save"}
          selectedNode={selectedWorkflowNode(page.draft, selectedNode)}
          targetPending={page.operation === "target"}
        />
        <WorkflowEvidenceNavigation page={page} />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      {page.feedback ? (
        <WorkflowFeedbackBanner
          feedback={page.feedback}
          onClose={() => page.setFeedback(undefined)}
        />
      ) : null}
      {page.data.error ? <WorkflowLoadFailure onRetry={page.data.refresh} /> : null}
      {page.data.plans.map((plan) => (
        <WorkflowPreview
          applications={page.data.applications}
          key={plan.plan_id || plan.name}
          onOpen={() => page.openPlan(plan.plan_id || "")}
          plan={plan}
        />
      ))}
      <button
        className="flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-card border border-dashed bg-transparent px-4 text-label-2 font-bold text-primary transition-[border-color,background-color] duration-(--motion-fade) hover:border-primary/50 hover:bg-tint-blue-bg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
        onClick={page.beginCreate}
        type="button"
      >
        <Plus aria-hidden="true" className="size-4" />
        {t("workflows.plan.new")}
      </button>
    </div>
  );
}
