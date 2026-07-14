import { GitBranch, Plus, RefreshCw, X } from "lucide-react";
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

export function GitOpsPage({ port }: { port: GitOpsPort }) {
  const { t } = useI18n();
  const page = useGitOpsPageController(port);

  if (page.data.loading && !page.data.plans.length) {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (page.creating) {
    return (
      <ProductPageFrame>
        {page.feedback ? <FeedbackBanner feedback={page.feedback} onClose={() => page.setFeedback(undefined)} /> : null}
        <PlanWizard
          applications={page.data.applications}
          onCancel={page.cancelCreate}
          onChange={page.setNewPlan}
          onCreate={() => void page.createPlan()}
          pending={page.operation === "create"}
          plan={page.newPlan}
        />
      </ProductPageFrame>
    );
  }

  return (
    <ProductPageFrame className="gap-4">
      <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-card text-primary shadow-sm">
            <GitBranch aria-hidden="true" className="size-5" />
          </span>
          <div className="grid min-w-0 gap-1">
            <h1 className="m-0 text-xl font-semibold [overflow-wrap:anywhere]">{t("workflows.title")}</h1>
            <p className="m-0 max-w-2xl text-sm leading-5 text-muted-foreground">{t("workflows.description")}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:max-w-xl">
          <label className="grid min-w-0 flex-1 gap-1">
            <span className="text-[0.6875rem] font-medium text-muted-foreground">{t("workflows.plan.select")}</span>
            <NativeSelect
              className="w-full min-w-0 sm:w-72"
              disabled={!page.data.plans.length}
              onChange={page.selectPlan}
              value={page.selectedPlan?.plan_id || ""}
            >
              {page.data.plans.map((plan) => <option key={plan.plan_id || plan.name} value={plan.plan_id || ""}>{plan.name}</option>)}
            </NativeSelect>
          </label>
          <Button className="self-stretch sm:self-end" onClick={page.beginCreate}>
            <Plus aria-hidden="true" />{t("workflows.plan.new")}
          </Button>
        </div>
      </header>

      {page.feedback ? <FeedbackBanner feedback={page.feedback} onClose={() => page.setFeedback(undefined)} /> : null}
      {page.data.error ? <LoadError onRetry={page.data.refresh} /> : null}

      {page.selectedPlan && page.draft ? (
        <Tabs className="min-w-0 gap-4" onValueChange={(value) => value && page.setView(value as WorkflowView)} value={page.view}>
          <nav aria-label={t("workflows.view.aria")} className="min-w-0 border-b">
            <TabsList aria-label={t("workflows.view.aria")} className="grid h-auto w-full min-w-0 grid-cols-4 overflow-hidden rounded-none bg-transparent p-0" variant="line">
              {WORKFLOW_VIEWS.map((item) => (
                <TabsTrigger className="h-10 min-w-0 px-1 text-[0.6875rem] sm:px-3 sm:text-sm" key={item} value={item}>
                  <span className="min-w-0 truncate">{viewLabel(item, t)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </nav>
          <WorkflowContext plan={page.selectedPlan} />
          <TabsContent className="min-w-0" value="overview">
            <WorkflowOverview
              applications={page.data.applications}
              onEdit={() => page.setView("edit")}
              onOpenRuns={() => { page.setView("runs"); void page.checkReadiness(); }}
              onSelectStep={page.setSelectedStepId}
              plan={page.selectedPlan}
              run={page.latestRun}
              selectedStepId={page.selectedStepId}
            />
          </TabsContent>
          <TabsContent className="min-w-0" value="edit">
            <PlanEditor applications={page.data.applications} onChange={page.setDraft} onSave={() => void page.saveDraft()} pending={page.operation === "save"} plan={page.draft} />
          </TabsContent>
          <TabsContent className="min-w-0" value="runs">
            <RunWorkspace
              onAction={(run, action) => void page.runAction(run.run_id, action)}
              onCheckReadiness={() => void page.checkReadiness()}
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
              onSafePr={(index) => void page.submitSafePr(index)}
              pending={page.operation === "generate" ? "generate" : page.operation === "safe-pr" ? "safe-pr" : "idle"}
              plan={page.selectedPlan}
              result={page.manifest}
              safePr={page.safePr}
            />
          </TabsContent>
        </Tabs>
      ) : <EmptyWorkflow onCreate={page.beginCreate} />}
    </ProductPageFrame>
  );
}

function WorkflowContext({ plan }: { plan: ReleasePlan }) {
  const { t } = useI18n();
  return (
    <dl className="grid min-w-0 grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
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

function EmptyWorkflow({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-[28rem] place-items-center border-y px-6 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        <GitBranch aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="m-0 text-base font-semibold">{t("workflows.plan.none")}</h2>
        <p className="m-0 text-sm leading-6 text-muted-foreground">{t("workflows.plan.noneDescription")}</p>
        <Button onClick={onCreate}><Plus aria-hidden="true" />{t("workflows.plan.new")}</Button>
      </div>
    </div>
  );
}

function ContextFact({ label, value }: { label: string; value: string }) {
  return <div className="flex min-h-14 min-w-0 items-center justify-between gap-3 bg-card px-3 py-2.5"><dt className="shrink-0 text-xs font-medium text-muted-foreground">{label}</dt><dd className="m-0 min-w-0 text-right text-xs font-semibold [overflow-wrap:anywhere]">{value}</dd></div>;
}

type T = ReturnType<typeof useI18n>["t"];
function viewLabel(view: WorkflowView, t: T): string {
  if (view === "edit") return t("workflows.view.edit");
  if (view === "runs") return t("workflows.view.runs");
  if (view === "yaml") return t("workflows.view.yaml");
  return t("workflows.view.overview");
}
