import type { ReactNode } from "react";
import type { ReleasePlan } from "../../features/gitops/gitOpsContract";
import type { TranslationFunction } from "../../shared/i18n/types";
import { Surface } from "../../shared/ui/Surface";
import { WorkflowInlineHeading } from "./WorkflowInlineHeading";

export function WizardSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Surface aria-label={title} className="grid min-w-0 gap-5 p-4 sm:p-5">
      <WorkflowInlineHeading description={description} icon={icon} title={title} />
      {children}
    </Surface>
  );
}

export function ReviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 text-sm font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

export function stageLabel(stage: string, t: TranslationFunction): string {
  if (stage === "targets") return t("workflows.wizard.stage.targets");
  if (stage === "policy") return t("workflows.wizard.stage.policy");
  if (stage === "review") return t("workflows.wizard.stage.review");
  return t("workflows.wizard.stage.basics");
}

export function stageErrors(stage: string, plan: ReleasePlan): string[] {
  if (stage === "basics" && !plan.name.trim()) return ["name"];
  if (stage === "targets" && !plan.steps.length) return ["steps"];
  return [];
}

export function validationLabel(code: string, t: TranslationFunction): string {
  return code === "name" ? t("workflows.validation.name") : t("workflows.validation.steps");
}
