import type { ReactNode } from "react";
import type { ReleasePlan } from "../../features/gitops/gitOpsContract";
import type { TranslationFunction } from "../../shared/i18n/types";
import { WorkflowInlineHeading } from "./WorkflowInlineHeading";

export function WizardSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="grid min-w-0 gap-5 border-y py-5">
      <WorkflowInlineHeading icon={icon} title={title} />
      {children}
    </section>
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

export function WizardMobileOrder({ plan, title }: { plan: ReleasePlan; title: string }) {
  return (
    <section aria-label={title} className="grid min-w-0 gap-2 border-y py-3 xl:hidden">
      <h3 className="m-0 text-sm font-semibold">{title}</h3>
      <div className="grid min-w-0 divide-y">
        {plan.steps.map((step, index) => (
          <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 py-2 first:pt-0" key={step.step_id || step.application_id}>
            <span className="grid size-6 place-items-center rounded-md bg-muted text-[0.6875rem] font-semibold">{index + 1}</span>
            <strong className="min-w-0 text-xs [overflow-wrap:anywhere]">{step.name || step.application_id}</strong>
          </div>
        ))}
      </div>
    </section>
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
