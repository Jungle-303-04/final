import { ArrowRight, CirclePlay, Layers3, Plus, ShieldCheck } from "lucide-react";
import type { ReleasePlan } from "../../features/gitops/gitOpsContract";
import { settingString } from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { policyLabel } from "./WorkflowFormControls";

export function WorkflowPlanPicker({
  onCreate,
  onSelect,
  plans,
}: {
  onCreate: () => void;
  onSelect: (planId: string) => void;
  plans: ReleasePlan[];
}) {
  const { t } = useI18n();

  return (
    <section aria-labelledby="workflow-plan-picker-title" className="grid min-w-0 gap-4">
      <header className="border-b pb-3">
        <h2 className="m-0 text-base font-semibold" id="workflow-plan-picker-title">
          {t("workflows.plan.select")}
        </h2>
      </header>
      <div className="grid min-w-0 auto-rows-fr grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <PlanButton key={plan.plan_id || plan.name} onSelect={onSelect} plan={plan} />
        ))}
        <button
          className="group flex min-h-44 min-w-0 items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-4 text-center transition-colors hover:border-primary/60 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          onClick={onCreate}
          type="button"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-card text-primary shadow-sm transition-colors group-hover:border-primary/40">
            <Plus aria-hidden="true" className="size-4" />
          </span>
          <strong className="text-sm font-semibold">{t("workflows.plan.new")}</strong>
        </button>
      </div>
    </section>
  );
}

function PlanButton({ onSelect, plan }: { onSelect: (planId: string) => void; plan: ReleasePlan }) {
  const { t } = useI18n();
  const planId = plan.plan_id || "";
  const runtimeMode = settingString(plan, "runtime_mode", "review");

  return (
    <button
      aria-label={t("workflows.plan.open", { name: plan.name })}
      className="group grid min-h-44 min-w-0 grid-rows-[auto_1fr_auto] gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/60 hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={() => onSelect(planId)}
      type="button"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <Badge variant={statusVariant(plan.status)}>{t(`workflows.status.${plan.status}`)}</Badge>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </div>
      <h3 className="m-0 self-start text-base font-semibold leading-6 [overflow-wrap:anywhere]">
        {plan.name}
      </h3>
      <dl className="m-0 grid min-w-0 gap-2 border-t pt-3 text-xs">
        <PlanFact icon={<Layers3 aria-hidden="true" />} label={t("workflows.context.targets")} value={String(plan.steps.length)} />
        <PlanFact icon={<ShieldCheck aria-hidden="true" />} label={t("workflows.context.policy")} value={policyLabel(settingString(plan, "approval_policy"), t)} />
        <PlanFact
          icon={<CirclePlay aria-hidden="true" />}
          label={t("workflows.context.runtime")}
          value={runtimeMode === "live" ? t("workflows.option.runtime.live") : t("workflows.option.runtime.review")}
        />
      </dl>
    </button>
  );
}

function PlanFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-muted-foreground [&>svg]:size-3.5">
        {icon}
        <span>{label}</span>
      </dt>
      <dd className="m-0 min-w-0 truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}

function statusVariant(status: ReleasePlan["status"]): "default" | "secondary" | "outline" | "destructive" {
  if (status === "active") return "default";
  if (status === "paused") return "destructive";
  if (status === "archived") return "outline";
  return "secondary";
}
