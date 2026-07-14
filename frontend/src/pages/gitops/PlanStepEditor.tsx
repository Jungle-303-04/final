import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { ReleaseApplication, ReleasePlan } from "../../features/gitops/gitOpsContract";
import {
  ENVIRONMENTS,
  STRATEGIES,
  configString,
  moveStep,
  stepSetupFields,
  stepKey,
  syncSelectedApplications,
  updateStep,
  type StepSetupField,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { cn } from "../../shared/ui/primitives/cn";
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
  expanded,
  focusField,
  onChange,
  onToggle,
}: {
  plan: ReleasePlan;
  index: number;
  applications: ReleaseApplication[];
  expanded: boolean;
  focusField?: StepSetupField;
  onChange: (plan: ReleasePlan) => void;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const step = plan.steps[index];
  const application = applications.find((item) => item.id === step.application_id);
  const stepName = step.name || step.application_id;
  const repository = application?.repository || step.application_id;
  const missingFields = stepSetupFields(plan, step, application);
  const panelId = `workflow-step-${stepKey(step, index).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const commitRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const clusterRef = useRef<HTMLInputElement>(null);
  const changeConfig = (key: string, value: string) => onChange(updateStep(plan, index, (current) => ({
    ...current,
    config: { ...current.config, [key]: value },
  })));

  useEffect(() => {
    if (!expanded || !focusField) return undefined;
    const frame = requestAnimationFrame(() => {
      const target = focusField === "commit_sha"
        ? commitRef.current
        : focusField === "image"
          ? imageRef.current
          : clusterRef.current;
      target?.focus();
      target?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, focusField]);

  return (
    <article className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid min-w-0 gap-2 p-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-3">
        <button
          aria-controls={panelId}
          aria-expanded={expanded}
          className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_1rem] items-center gap-3 rounded-lg p-1.5 text-left hover:bg-muted/50"
          onClick={onToggle}
          type="button"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
            {index + 1}
          </span>
          <span className="grid min-w-0 gap-1">
            <strong className="min-w-0 text-sm leading-5 [overflow-wrap:anywhere]">{stepName}</strong>
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="min-w-0 [overflow-wrap:anywhere]">{repository}</span>
              {missingFields.length ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle aria-hidden="true" className="size-3" />
                  {t("workflows.editor.missingCount", { count: missingFields.length })}
                </span>
              ) : null}
            </span>
          </span>
          <ChevronDown aria-hidden="true" className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </button>
        <div className="flex shrink-0 items-center justify-end gap-1">
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
      {expanded ? (
        <div className="grid min-w-0 gap-3 border-t p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4" id={panelId}>
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
            <Input
              aria-invalid={missingFields.includes("cluster_id")}
              onChange={(event) => changeConfig("cluster_id", event.target.value)}
              placeholder={t("workflows.editor.clusterPlaceholder")}
              ref={clusterRef}
              value={configString(step, "cluster_id")}
            />
          </FormField>
          <FormField label={t("workflows.editor.namespace")}>
            <Input onChange={(event) => changeConfig("namespace", event.target.value)} value={configString(step, "namespace", "default")} />
          </FormField>
          <FormField className="sm:col-span-2 xl:col-span-2" label={t("workflows.editor.commitSha")}>
            <Input
              aria-invalid={missingFields.includes("commit_sha")}
              autoComplete="off"
              className="font-mono"
              onChange={(event) => changeConfig("commit_sha", event.target.value)}
              placeholder={t("workflows.editor.commitShaPlaceholder")}
              ref={commitRef}
              spellCheck={false}
              value={configString(step, "commit_sha")}
            />
          </FormField>
          <FormField className="sm:col-span-2 xl:col-span-2" label={t("workflows.editor.image")}>
            <Input
              aria-invalid={missingFields.includes("image")}
              autoComplete="off"
              className="font-mono"
              onChange={(event) => changeConfig("image", event.target.value)}
              placeholder={t("workflows.editor.imagePlaceholder")}
              ref={imageRef}
              spellCheck={false}
              value={configString(step, "image")}
            />
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
      ) : null}
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
