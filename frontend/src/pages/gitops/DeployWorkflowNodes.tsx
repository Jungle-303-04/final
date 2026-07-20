import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import type {
  ReleaseApplication,
  ReleasePlan,
} from "../../features/gitops/gitOpsContract";
import {
  APPROVAL_POLICIES,
  settingString,
  stepKey,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { AddApplicationControl } from "./DeployWorkflowPlanActions";
import { ReleaseStepSettings } from "./DeployWorkflowStepSettings";
import {
  FormField,
  NativeSelect,
  policyLabel,
} from "./WorkflowFormControls";

export type SelectedWorkflowNode = "source" | "preflight" | "verification" | string;

export function WorkflowNodeRail({
  applications,
  onSelect,
  plan,
  selected,
}: {
  applications: ReleaseApplication[];
  onSelect?: (node: SelectedWorkflowNode) => void;
  plan: ReleasePlan;
  selected: SelectedWorkflowNode | null;
}) {
  const { t } = useI18n();
  const nodes = [
    { id: "source", label: t("workflows.detail.source"), edge: true },
    { id: "preflight", label: t("workflows.graph.preflight"), edge: false },
    ...plan.steps.map((step, index) => ({
      id: stepKey(step, index),
      label: applications.find((application) => application.id === step.application_id)?.name || step.name,
      edge: false,
    })),
    { id: "verification", label: t("workflows.graph.verification"), edge: true },
  ];
  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5" role="group" aria-label={t("workflows.graph.label")}>
      {nodes.map((node, index) => (
        <span className="contents" key={node.id}>
          {onSelect ? (
            <button
              aria-pressed={selected === node.id}
              className={selected === node.id
                ? "inline-flex min-h-8 items-center rounded-lg border border-primary bg-primary px-3 text-label font-semibold text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                : node.edge
                  ? "inline-flex min-h-8 items-center rounded-lg border border-tint-blue-border bg-tint-blue-bg px-3 text-label font-semibold text-tint-blue-fg transition-colors duration-(--motion-fade) hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"
                  : "inline-flex min-h-8 items-center rounded-lg border bg-background-subtle px-3 text-label font-semibold text-foreground transition-colors duration-(--motion-fade) hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none"}
              onClick={() => onSelect(node.id)}
              type="button"
            >
              <span className="max-w-44 truncate">{node.label}</span>
            </button>
          ) : (
            <span className={node.edge
              ? "inline-flex min-h-8 items-center rounded-lg border border-tint-blue-border bg-tint-blue-bg px-3 text-label font-semibold text-tint-blue-fg"
              : "inline-flex min-h-8 items-center rounded-lg border bg-background-subtle px-3 text-label font-semibold text-foreground"}
            >
              <span className="max-w-44 truncate">{node.label}</span>
            </span>
          )}
          {index < nodes.length - 1 ? (
            <ArrowRight aria-hidden="true" className="size-3 shrink-0 text-caption-foreground" />
          ) : null}
        </span>
      ))}
    </div>
  );
}

export function WorkflowNodeSettings({
  applications,
  onChange,
  plan,
  selectedNode,
}: {
  applications: ReleaseApplication[];
  onChange: (plan: ReleasePlan) => void;
  plan: ReleasePlan;
  selectedNode: SelectedWorkflowNode;
}) {
  const { t } = useI18n();
  if (selectedNode === "source") {
    const available = applications.filter((application) => (
      !plan.steps.some((step) => step.application_id === application.id)
    ));
    return (
      <NodeSettingsFrame title={t("workflows.detail.source")}>
        <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
          {plan.steps.map((step) => {
            const application = applications.find((candidate) => candidate.id === step.application_id);
            return (
              <div className="grid min-w-0 gap-0.5" key={stepKey(step, step.position)}>
                <dt className="text-caption text-caption-foreground">{application?.name || step.name}</dt>
                <dd className="m-0 truncate font-mono text-label text-foreground">
                  {application?.repository || t("common.value.unavailable")}
                  {application?.branch ? ` · ${application.branch}` : ""}
                </dd>
                <dd className="m-0 truncate font-mono text-caption-2 text-caption-foreground">
                  {application?.manifestPath || t("common.value.unavailable")}
                </dd>
              </div>
            );
          })}
        </dl>
        {available.length ? (
          <AddApplicationControl applications={applications} available={available} onChange={onChange} plan={plan} />
        ) : null}
      </NodeSettingsFrame>
    );
  }
  if (selectedNode === "preflight") {
    return (
      <NodeSettingsFrame title={t("workflows.graph.preflight")}>
        <FormField label={t("workflows.editor.policy")}>
          <NativeSelect
            onChange={(value) => onChange({ ...plan, settings: { ...plan.settings, approval_policy: value } })}
            value={settingString(plan, "approval_policy", "manual_each_step")}
          >
            {APPROVAL_POLICIES.map((policy) => (
              <option key={policy} value={policy}>{policyLabel(policy, t)}</option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t("workflows.editor.runtime")}>
          <NativeSelect
            onChange={(value) => onChange({ ...plan, settings: { ...plan.settings, runtime_mode: value } })}
            value={settingString(plan, "runtime_mode", "demo") === "review"
              ? "demo"
              : settingString(plan, "runtime_mode", "demo")}
          >
            <option value="demo">{t("workflows.option.runtime.review")}</option>
            <option value="live">{t("workflows.option.runtime.live")}</option>
          </NativeSelect>
        </FormField>
      </NodeSettingsFrame>
    );
  }
  if (selectedNode === "verification") {
    return (
      <NodeSettingsFrame title={t("workflows.graph.verification")}>
        <FormField label={t("workflows.runs.check.retry")}>
          <NativeSelect
            onChange={(value) => onChange({ ...plan, settings: { ...plan.settings, retry_attempts: Number(value) } })}
            value={String(numberSetting(plan, "retry_attempts", 1))}
          >
            {[0, 1, 2, 3].map((attempts) => <option key={attempts} value={attempts}>{attempts}</option>)}
          </NativeSelect>
        </FormField>
      </NodeSettingsFrame>
    );
  }
  const index = plan.steps.findIndex((step, stepIndex) => stepKey(step, stepIndex) === selectedNode);
  const step = plan.steps[index];
  return step ? (
    <ReleaseStepSettings applications={applications} index={index} onChange={onChange} plan={plan} step={step} />
  ) : null;
}

function NodeSettingsFrame({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="mt-3 flex min-w-0 animate-in flex-wrap items-end gap-3 rounded-xl border border-tint-blue-border bg-tint-blue-bg/40 p-3 fade-in-0 slide-in-from-top-1 duration-(--motion-soft) ease-(--ease-soft) motion-reduce:animate-none">
      <strong className="w-full text-label font-bold text-tint-blue-fg">{title}</strong>
      {children}
    </div>
  );
}

function numberSetting(plan: ReleasePlan, key: string, fallback: number): number {
  const value = plan.settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function selectedWorkflowNode(plan: ReleasePlan, selected: SelectedWorkflowNode): SelectedWorkflowNode {
  if (selected === "source" || selected === "preflight" || selected === "verification") return selected;
  return plan.steps.some((step, index) => stepKey(step, index) === selected)
    ? selected
    : "preflight";
}
