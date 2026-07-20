import { CirclePlay, FileCode2, LayoutGrid, X } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { ManifestWorkspace } from "./ManifestWorkspace";
import { RunWorkspace } from "./RunWorkspace";
import {
  useGitOpsPageController,
  type WorkflowFeedback,
} from "./useGitOpsPageController";

export function WorkflowEvidenceNavigation({
  page,
}: {
  page: ReturnType<typeof useGitOpsPageController>;
}) {
  const { t } = useI18n();
  if (!page.selectedPlan) return null;
  const editorActive = page.view === "overview" || page.view === "edit";
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap gap-2">
        <Button onClick={() => page.setView("edit")} size="sm" type="button" variant={editorActive ? "secondary" : "ghost"}>
          <LayoutGrid aria-hidden="true" />{t("workflows.view.edit")}
        </Button>
        <Button onClick={() => { page.setView("runs"); void page.checkReadiness(); }} size="sm" type="button" variant={page.view === "runs" ? "secondary" : "ghost"}>
          <CirclePlay aria-hidden="true" />{t("workflows.view.runs")}
        </Button>
        <Button onClick={() => page.setView("yaml")} size="sm" type="button" variant={page.view === "yaml" ? "secondary" : "ghost"}>
          <FileCode2 aria-hidden="true" />{t("workflows.view.yaml")}
        </Button>
      </div>
      {page.view === "runs" ? (
        <RunWorkspace
          applications={page.data.applications}
          onAction={(run, action) => void page.runAction(run.run_id, action)}
          onCheckReadiness={() => void page.checkReadiness()}
          onEdit={() => page.setView("edit")}
          onStart={() => void page.startPlan()}
          pending={["readiness", "start", "run"].includes(page.operation)}
          plan={page.selectedPlan}
          readiness={page.readiness}
          runs={page.data.runs}
        />
      ) : null}
      {page.view === "yaml" ? (
        <ManifestWorkspace
          onGenerate={(index) => void page.generateManifest(index)}
          onEdit={() => page.setView("edit")}
          onSafePr={(index) => void page.submitSafePr(index)}
          pending={page.operation === "generate" ? "generate" : page.operation === "safe-pr" ? "safe-pr" : "idle"}
          plan={page.selectedPlan}
          result={page.manifest}
          resultStepIndex={page.manifestStepIndex}
          safePr={page.safePr}
          safePrStepIndex={page.safePrStepIndex}
        />
      ) : null}
    </div>
  );
}

export function WorkflowFeedbackBanner({
  feedback,
  onClose,
}: {
  feedback: WorkflowFeedback;
  onClose: () => void;
}) {
  return (
    <div className={feedback.tone === "success"
      ? "flex min-w-0 items-center justify-between gap-3 rounded-xl border border-tint-ok-border bg-tint-ok-bg px-3 py-2 text-tint-ok-fg"
      : "flex min-w-0 items-center justify-between gap-3 rounded-xl border border-tint-crit-border bg-tint-crit-bg px-3 py-2 text-tint-crit-fg"}
    >
      <span className="text-label-2 font-semibold">{feedback.message}</span>
      <Button onClick={onClose} size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>
    </div>
  );
}

export function WorkflowLoadFailure({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-tint-crit-border bg-tint-crit-bg px-3 py-2">
      <span className="text-label-2 text-tint-crit-fg">{t("workflows.feedback.loadError")}</span>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">{t("common.action.retry")}</Button>
    </div>
  );
}
