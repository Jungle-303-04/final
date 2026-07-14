import { AlertTriangle, CheckCircle2, Settings2 } from "lucide-react";
import type { ReactNode } from "react";
import type {
  ReleaseApplication,
  ReleasePlan,
  ReleasePlanStep,
  ReleaseRun,
} from "../../features/gitops/gitOpsContract";
import {
  applicationForStep,
  configString,
  releaseWaves,
  releaseStepSetupIssues,
  stepKey,
  type StepSetupField,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../shared/ui/primitives/sheet";
import { environmentLabel, strategyLabel } from "./WorkflowFormControls";
import { WorkflowGraph } from "./WorkflowGraph";
import { WorkflowWorkspaceHeader } from "./WorkflowWorkspaceHeader";

export function WorkflowOverview({
  plan,
  applications,
  run,
  selectedStepId,
  onSelectStep,
  onEdit,
  onOpenRuns,
}: {
  plan: ReleasePlan;
  applications: ReleaseApplication[];
  run?: ReleaseRun;
  selectedStepId: string;
  onSelectStep: (stepId: string) => void;
  onEdit: (stepIndex?: number, field?: StepSetupField) => void;
  onOpenRuns: () => void;
}) {
  const { t } = useI18n();
  const waves = releaseWaves(plan.steps);
  const selectedIndex = plan.steps.findIndex((step, index) => stepKey(step, index) === selectedStepId);
  const selectedStep = selectedIndex >= 0 ? plan.steps[selectedIndex] : undefined;
  const selectedApplication = selectedStep ? applicationForStep(selectedStep, applications) : undefined;
  const setupIssues = releaseStepSetupIssues(plan, applications);
  const firstSetupIssue = setupIssues[0];

  return (
    <div className="grid min-w-0 gap-4">
      <WorkflowWorkspaceHeader
        actions={firstSetupIssue ? (
          <Button onClick={() => onEdit(firstSetupIssue.stepIndex, firstSetupIssue.field)}>
            <AlertTriangle aria-hidden="true" />
            {t("workflows.overview.setupActionCount", { count: setupIssues.length })}
          </Button>
        ) : (
          <Button onClick={onOpenRuns}>
            <CheckCircle2 aria-hidden="true" />
            {t("workflows.runs.check")}
          </Button>
        )}
        title={t("workflows.view.overview")}
      />

      <WorkflowGraph
        applications={applications}
        onSelectStep={onSelectStep}
        plan={plan}
        run={run}
        selectedStepId={selectedStepId}
      />

      <StepDetailSheet
        application={selectedApplication}
        index={selectedIndex}
        onClose={() => onSelectStep("")}
        onEdit={() => onEdit(selectedIndex)}
        open={Boolean(selectedStep)}
        step={selectedStep}
        wave={selectedStep ? waves.get(stepKey(selectedStep, selectedIndex)) : undefined}
      />
    </div>
  );
}

function StepDetailSheet({
  open,
  step,
  application,
  index,
  wave,
  onClose,
  onEdit,
}: {
  open: boolean;
  step?: ReleasePlanStep;
  application?: ReleaseApplication;
  index: number;
  wave?: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const environment = step ? configString(step, "environment", t("workflows.value.notSet")) : "";
  return (
    <Sheet onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
      <SheetContent className="min-w-0 overflow-y-auto sm:max-w-xl" side="right">
        <SheetHeader className="min-w-0 border-b pr-14">
          <SheetTitle className="min-w-0 text-lg [overflow-wrap:anywhere]">
            {step?.name || application?.name || step?.application_id || t("workflows.details.title")}
          </SheetTitle>
          <SheetDescription className="[overflow-wrap:anywhere]">
            {t("workflows.details.wave", {
              wave: wave ?? index + 1,
              environment: environmentLabel(environment, t),
            })}
          </SheetDescription>
        </SheetHeader>
        <div className="grid min-w-0 gap-5 px-4 pb-4">
          <DetailSection title={t("workflows.details.currentStatus")}>
            <div className="rounded-lg border px-3 py-2">
              <Badge variant="secondary">{t("workflows.status.pending")}</Badge>
            </div>
          </DetailSection>
          <DetailSection title={t("workflows.details.repository")}>
            <dl className="grid min-w-0 gap-3">
              <DetailFact label={t("workflows.details.address")} value={application?.repository || t("workflows.value.notSet")} />
              <DetailFact label={t("workflows.details.branch")} value={application?.branch || t("workflows.value.notSet")} />
              <DetailFact label={t("workflows.details.manifest")} value={application?.manifestPath || t("workflows.value.notSet")} />
            </dl>
          </DetailSection>
          <DetailSection title={t("workflows.details.deployment")}>
            <dl className="grid min-w-0 gap-3">
              <DetailFact label={t("workflows.details.environment")} value={environmentLabel(environment, t)} />
              <DetailFact label={t("workflows.details.cluster")} value={step ? configString(step, "cluster_id", application?.clusterId || t("workflows.value.notSet")) : t("workflows.value.notSet")} />
              <DetailFact label={t("workflows.details.namespace")} value={step ? configString(step, "namespace", "default") : t("workflows.value.notSet")} />
              <DetailFact label={t("workflows.details.strategy")} value={strategyLabel(step ? configString(step, "strategy", "rolling") : "rolling", t)} />
              <DetailFact label={t("workflows.details.dependencies")} value={step?.depends_on.join(", ") || t("workflows.value.notSet")} />
            </dl>
          </DetailSection>
        </div>
        <SheetFooter className="border-t bg-popover">
          <Button onClick={onEdit}>
            <Settings2 aria-hidden="true" />
            {t("workflows.details.edit")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid min-w-0 gap-3 border-b pb-5 last:border-b-0 last:pb-0">
      <h3 className="m-0 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(5.5rem,.35fr)_minmax(0,1fr)] gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 text-right text-xs font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
