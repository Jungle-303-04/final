import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { ReleaseApplication, ReleasePlan } from "../../features/gitops/gitOpsContract";
import {
  ENVIRONMENTS,
  STRATEGIES,
  configString,
  moveStep,
  stepKey,
  syncSelectedApplications,
  updateStep,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import {
  FormField,
  NativeSelect,
  environmentLabel,
  gateLabel,
  strategyLabel,
} from "./WorkflowFormControls";

export function PlanStepEditor({
  plan,
  index,
  applications,
  onChange,
}: {
  plan: ReleasePlan;
  index: number;
  applications: ReleaseApplication[];
  onChange: (plan: ReleasePlan) => void;
}) {
  const { t } = useI18n();
  const step = plan.steps[index];
  const application = applications.find((item) => item.id === step.application_id);
  const changeConfig = (key: string, value: string) => onChange(updateStep(plan, index, (current) => ({
    ...current,
    config: { ...current.config, [key]: value },
  })));
  return (
    <article className="grid min-w-0 gap-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
            {index + 1}
          </span>
          <div className="grid min-w-0 gap-0.5">
            <strong className="text-sm [overflow-wrap:anywhere]">{step.name || step.application_id}</strong>
            <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {application?.repository || step.application_id}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton disabled={index === 0} label={t("workflows.editor.moveUp")} onClick={() => onChange(moveStep(plan, index, -1))}>
            <ArrowUp aria-hidden="true" />
          </IconButton>
          <IconButton disabled={index === plan.steps.length - 1} label={t("workflows.editor.moveDown")} onClick={() => onChange(moveStep(plan, index, 1))}>
            <ArrowDown aria-hidden="true" />
          </IconButton>
          <IconButton
            destructive
            label={t("workflows.editor.remove")}
            onClick={() => onChange(syncSelectedApplications(
              plan,
              plan.steps.filter((_, stepIndex) => stepIndex !== index).map((item) => item.application_id),
              applications,
            ))}
          >
            <Trash2 aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FormField label={t("workflows.editor.environment")}>
          <NativeSelect onChange={(value) => changeConfig("environment", value)} value={configString(step, "environment", "staging")}>
            {ENVIRONMENTS.map((environment) => <option key={environment} value={environment}>{environmentLabel(environment, t)}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label={t("workflows.editor.strategy")}>
          <NativeSelect onChange={(value) => changeConfig("strategy", value)} value={configString(step, "strategy", "rolling")}>
            {STRATEGIES.map((strategy) => <option key={strategy} value={strategy}>{strategyLabel(strategy, t)}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label={t("workflows.editor.cluster")}>
          <Input onChange={(event) => changeConfig("cluster_id", event.target.value)} value={configString(step, "cluster_id")} />
        </FormField>
        <FormField label={t("workflows.editor.namespace")}>
          <Input onChange={(event) => changeConfig("namespace", event.target.value)} value={configString(step, "namespace", "default")} />
        </FormField>
        <FormField label={t("workflows.editor.gate")}>
          <NativeSelect onChange={(value) => changeConfig("approval_gate", value)} value={configString(step, "approval_gate", "inherit")}>
            {(["inherit", "auto", "manual", "safe_pr"] as const).map((gate) => <option key={gate} value={gate}>{gateLabel(gate, t)}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label={t("workflows.editor.dependsOn")}>
          <NativeSelect onChange={(value) => onChange(updateStep(plan, index, (current) => ({ ...current, depends_on: value ? [value] : [] })))} value={step.depends_on[0] || ""}>
            <option value="">{t("workflows.value.notSet")}</option>
            {plan.steps.slice(0, index).map((candidate, candidateIndex) => (
              <option key={stepKey(candidate, candidateIndex)} value={stepKey(candidate, candidateIndex)}>{candidate.name || candidate.application_id}</option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
    </article>
  );
}

function IconButton({ label, children, onClick, disabled, destructive }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <Button aria-label={label} disabled={disabled} onClick={onClick} size="icon-sm" title={label} variant={destructive ? "destructive" : "ghost"}>
      {children}
    </Button>
  );
}
