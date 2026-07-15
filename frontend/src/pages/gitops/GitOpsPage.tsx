import { GitBranch, LayoutGrid, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import type { GitOpsPort, ReleasePlan } from "../../features/gitops/gitOpsContract";
import { WORKFLOW_VIEWS, settingString, type WorkflowView } from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui/primitives/tabs";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { ManifestWorkspace } from "./ManifestWorkspace";
import { PlanEditor } from "./PlanEditor";
import { PlanWizard } from "./PlanWizard";
import { RunWorkspace } from "./RunWorkspace";
import { useGitOpsPageController, type WorkflowFeedback } from "./useGitOpsPageController";
import { NativeSelect, policyLabel } from "./WorkflowFormControls";
import { WorkflowOverview } from "./WorkflowOverview";
import { WorkflowInlineHeading } from "./WorkflowInlineHeading";
import { WorkflowPlanPicker } from "./WorkflowPlanPicker";
import { GitOpsSyncTableView } from "./GitOpsSyncTableView";

type GitOpsSection = "changes" | "sync";

export function GitOpsPage({ port }: { port: GitOpsPort }) {
  const { t } = useI18n();
  const [section, setSection] = useState<GitOpsSection>("changes");

  return (
    <ProductPageFrame className="gap-4">
      <WorkflowInlineHeading
        as="h1"
        icon={<GitBranch aria-hidden="true" />}
        title={t("workflows.title")}
        variant="page"
      />
      <Tabs
        className="min-w-0 gap-4"
        onValueChange={(value) => {
          if (value === "changes" || value === "sync") setSection(value);
        }}
        value={section}
      >
        <nav aria-label={t("workflows.section.aria")} className="min-w-0 border-b">
          <TabsList
            aria-label={t("workflows.section.aria")}
            className="grid h-auto w-full max-w-sm grid-cols-2 overflow-hidden rounded-none bg-transparent p-0"
            variant="line"
          >
            <TabsTrigger className="h-10" value="changes">{t("workflows.section.changes")}</TabsTrigger>
            <TabsTrigger className="h-10" value="sync">{t("workflows.section.sync")}</TabsTrigger>
          </TabsList>
        </nav>
        <TabsContent className="min-w-0" value="changes">
          {section === "changes" ? <GitOpsChangesWorkspace port={port} /> : null}
        </TabsContent>
        <TabsContent className="min-w-0" value="sync">
          {section === "sync" ? <GitOpsSyncTableView port={port} /> : null}
        </TabsContent>
      </Tabs>
    </ProductPageFrame>
  );
}

function GitOpsChangesWorkspace({ port }: { port: GitOpsPort }) {
  const { t } = useI18n();
  const page = useGitOpsPageController(port);

  if (page.data.loading && !page.data.plans.length) {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (page.creating) {
    return (
      <div className="grid min-w-0 gap-4">
        {page.feedback ? <FeedbackBanner feedback={page.feedback} onClose={() => page.setFeedback(undefined)} /> : null}
        <PlanWizard
          applications={page.data.applications}
          clusters={page.data.clusters}
          onCancel={page.cancelCreate}
          onChange={page.setNewPlan}
          onCreate={() => void page.createPlan()}
          onCreateTarget={page.createTarget}
          pending={page.operation === "create"}
          plan={page.newPlan}
          targetPending={page.operation === "target"}
        />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      {page.selectedPlan ? (
        <div className="flex min-w-0 justify-end">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:max-w-2xl">
            <Button className="self-stretch sm:self-end" onClick={page.showPlanList} variant="outline">
              <LayoutGrid aria-hidden="true" />{t("workflows.plan.list")}
            </Button>
            <label className="grid min-w-0 flex-1 gap-1">
              <span className="text-[0.6875rem] font-medium text-muted-foreground">{t("workflows.plan.select")}</span>
              <NativeSelect
                className="w-full min-w-0 sm:w-72"
                disabled={!page.data.plans.length}
                onChange={page.selectPlan}
                value={page.selectedPlan.plan_id || ""}
              >
                {page.data.plans.map((plan) => <option key={plan.plan_id || plan.name} value={plan.plan_id || ""}>{plan.name}</option>)}
              </NativeSelect>
            </label>
          </div>
        </div>
      ) : null}

      {page.feedback ? <FeedbackBanner feedback={page.feedback} onClose={() => page.setFeedback(undefined)} /> : null}
      {page.data.error ? <LoadError onRetry={page.data.refresh} /> : null}

      {page.selectedPlan && page.draft ? (
        <Tabs
          className="min-w-0 gap-4"
          onValueChange={(value) => {
            if (!value) return;
            if (value === "edit") page.openEditor();
            else page.setView(value as WorkflowView);
          }}
          value={page.view}
        >
          <nav aria-label={t("workflows.view.aria")} className="min-w-0 border-b">
            <TabsList aria-label={t("workflows.view.aria")} className="grid h-auto w-full min-w-0 grid-cols-4 overflow-hidden rounded-none bg-transparent p-0" variant="line">
              {WORKFLOW_VIEWS.map((item) => (
                <TabsTrigger className="h-10 min-w-0 px-1 text-[0.6875rem] sm:px-3 sm:text-sm" key={item} value={item}>
                  <span className="whitespace-nowrap">{viewLabel(item, t)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </nav>
          <WorkflowContext plan={page.selectedPlan} />
          <TabsContent className="min-w-0" value="overview">
            <WorkflowOverview
              applications={page.data.applications}
              onEdit={page.openEditor}
              onOpenRuns={() => { page.setView("runs"); void page.checkReadiness(); }}
              onSelectStep={page.setSelectedStepId}
              plan={page.selectedPlan}
              run={page.latestRun}
              selectedStepId={page.selectedStepId}
            />
          </TabsContent>
          <TabsContent className="min-w-0" value="edit">
            <PlanEditor
              applications={page.data.applications}
              clusters={page.data.clusters}
              focusedField={page.editorTarget?.field}
              focusedStepId={page.editorTarget?.stepId}
              onChange={page.setDraft}
              onSave={() => void page.saveDraft()}
              onCreateTarget={page.createTarget}
              pending={page.operation === "save"}
              plan={page.draft}
              targetPending={page.operation === "target"}
            />
          </TabsContent>
          <TabsContent className="min-w-0" value="runs">
            <RunWorkspace
              applications={page.data.applications}
              onAction={(run, action) => void page.runAction(run.run_id, action)}
              onCheckReadiness={() => void page.checkReadiness()}
              onEdit={page.openEditor}
              onStart={() => void page.startPlan()}
              pending={["readiness", "start", "run"].includes(page.operation)}
              plan={page.selectedPlan}
              readiness={page.readiness}
              runs={page.data.runs}
            />
          </TabsContent>
          <TabsContent className="min-w-0" value="yaml">
            <ManifestWorkspace
              onGenerate={(index) => void page.generateManifest(index)}
              onEdit={page.openEditor}
              onSafePr={(index) => void page.submitSafePr(index)}
              pending={page.operation === "generate" ? "generate" : page.operation === "safe-pr" ? "safe-pr" : "idle"}
              plan={page.selectedPlan}
              result={page.manifest}
              resultStepIndex={page.manifestStepIndex}
              safePr={page.safePr}
              safePrStepIndex={page.safePrStepIndex}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <WorkflowPlanPicker onCreate={page.beginCreate} onSelect={page.openPlan} plans={page.data.plans} />
      )}
    </div>
  );
}

function WorkflowContext({ plan }: { plan: ReleasePlan }) {
  const { t } = useI18n();
  return (
    <dl className="grid min-w-0 grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
      <ContextFact label={t("workflows.context.status")} value={t(`workflows.status.${plan.status}`)} />
      <ContextFact label={t("workflows.context.targets")} value={String(plan.steps.length)} />
      <ContextFact label={t("workflows.context.policy")} value={policyLabel(settingString(plan, "approval_policy"), t)} />
      <ContextFact label={t("workflows.context.runtime")} value={settingString(plan, "runtime_mode", "review") === "live" ? t("workflows.option.runtime.live") : t("workflows.option.runtime.review")} />
    </dl>
  );
}

function FeedbackBanner({ feedback, onClose }: { feedback: WorkflowFeedback; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className={`flex min-w-0 items-start justify-between gap-3 rounded-lg border px-3 py-2 ${feedback.tone === "success" ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5"}`}>
      <span className="min-w-0 text-xs leading-5 [overflow-wrap:anywhere]">{feedback.message}</span>
      <Button aria-label={t("common.action.close")} onClick={onClose} size="icon-sm" variant="ghost"><X aria-hidden="true" /></Button>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-foreground">{t("workflows.feedback.loadError")}</span>
      <Button onClick={onRetry} size="sm" variant="outline"><RefreshCw aria-hidden="true" />{t("common.action.retry")}</Button>
    </div>
  );
}

function ContextFact({ label, value }: { label: string; value: string }) {
  return <div className="flex min-h-16 min-w-0 flex-col items-start justify-center gap-1 bg-card px-3 py-2.5 lg:min-h-14 lg:flex-row lg:items-center lg:justify-between lg:gap-3"><dt className="shrink-0 text-xs font-medium text-muted-foreground">{label}</dt><dd className="m-0 min-w-0 text-left text-xs font-semibold [overflow-wrap:anywhere] lg:text-right">{value}</dd></div>;
}

type T = ReturnType<typeof useI18n>["t"];
function viewLabel(view: WorkflowView, t: T): string {
  if (view === "edit") return t("workflows.view.edit");
  if (view === "runs") return t("workflows.view.runs");
  if (view === "yaml") return t("workflows.view.yaml");
  return t("workflows.view.overview");
}
