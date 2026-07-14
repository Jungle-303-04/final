import { ArrowLeft, ArrowRight, Check, GitBranch, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReleaseApplication, ReleasePlan } from "../../features/gitops/gitOpsContract";
import {
  APPROVAL_POLICIES,
  STRATEGIES,
  WIZARD_STAGES,
  settingString,
  syncSelectedApplications,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import {
  FormField,
  NativeSelect,
  policyLabel,
  strategyLabel,
} from "./WorkflowFormControls";
import { WorkflowGraph } from "./WorkflowGraph";
import {
  ReviewFact,
  WizardSection,
  stageErrors,
  stageLabel,
  validationLabel,
} from "./PlanWizardParts";

export function PlanWizard({
  plan,
  applications,
  pending,
  onChange,
  onCancel,
  onCreate,
}: {
  plan: ReleasePlan;
  applications: ReleaseApplication[];
  pending: boolean;
  onChange: (plan: ReleasePlan) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const [stageIndex, setStageIndex] = useState(0);
  const [furthestStage, setFurthestStage] = useState(0);
  const [validation, setValidation] = useState<string[]>([]);
  const stage = WIZARD_STAGES[stageIndex];

  useEffect(() => {
    const frame = requestAnimationFrame(() => document.querySelector("main")?.scrollTo(0, 0));
    return () => cancelAnimationFrame(frame);
  }, [stageIndex]);

  const next = () => {
    const errors = stageErrors(stage, plan);
    if (errors.length) {
      setValidation(errors);
      return;
    }
    const nextIndex = Math.min(stageIndex + 1, WIZARD_STAGES.length - 1);
    setStageIndex(nextIndex);
    setFurthestStage((current) => Math.max(current, nextIndex));
    setValidation([]);
  };

  const back = () => {
    setStageIndex((current) => Math.max(0, current - 1));
    setValidation([]);
  };

  return (
    <section aria-labelledby="workflow-wizard-title" className="grid min-w-0 gap-4">
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid min-w-0 gap-1">
          <h1 className="m-0 text-xl font-semibold [overflow-wrap:anywhere]" id="workflow-wizard-title">
            {t("workflows.wizard.title")}
          </h1>
          <p className="m-0 max-w-2xl text-sm leading-5 text-muted-foreground">
            {t("workflows.wizard.description")}
          </p>
        </div>
        <Button onClick={onCancel} variant="outline">
          {t("common.action.cancel")}
        </Button>
      </header>

      <ol
        aria-label={t("workflows.wizard.progress")}
        className="grid min-w-0 grid-cols-4 border-y py-3"
      >
        {WIZARD_STAGES.map((item, index) => {
          const active = index === stageIndex;
          const complete = index < stageIndex;
          const enabled = index <= furthestStage;
          return (
            <li className="relative min-w-0 px-1" key={item}>
              {index < WIZARD_STAGES.length - 1 ? (
                <span aria-hidden="true" className="absolute top-3.5 left-[calc(50%+1rem)] h-px w-[calc(100%-2rem)] bg-border" />
              ) : null}
              <button
                aria-current={active ? "step" : undefined}
                className="relative z-10 grid w-full min-w-0 justify-items-center gap-1 bg-background text-center disabled:cursor-default"
                disabled={!enabled}
                onClick={() => enabled && setStageIndex(index)}
                type="button"
              >
                <span className={`grid size-7 place-items-center rounded-full border text-xs font-semibold ${active ? "border-primary bg-primary text-primary-foreground" : complete ? "border-primary bg-background text-primary" : "bg-background text-muted-foreground"}`}>
                  {complete ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
                </span>
                <strong className="min-w-0 text-[0.6875rem] leading-4 font-medium [overflow-wrap:anywhere]">
                  {stageLabel(item, t)}
                </strong>
              </button>
            </li>
          );
        })}
      </ol>

      {validation.length ? (
        <div className="grid gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
          {validation.map((code) => <span key={code}>{validationLabel(code, t)}</span>)}
        </div>
      ) : null}

      <div className="min-h-[26rem] min-w-0">
        {stage === "basics" ? (
          <WizardSection
            description={t("workflows.wizard.basicsDescription")}
            icon={<GitBranch aria-hidden="true" />}
            title={t("workflows.wizard.basicsTitle")}
          >
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <FormField label={t("workflows.editor.name")}>
                <Input
                  autoFocus
                  onChange={(event) => onChange({ ...plan, name: event.target.value })}
                  value={plan.name}
                />
              </FormField>
              <FormField className="md:col-span-2" label={t("workflows.editor.descriptionLabel")}>
                <textarea
                  className="min-h-28 w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  onChange={(event) => onChange({ ...plan, description: event.target.value })}
                  value={plan.description}
                />
              </FormField>
            </div>
          </WizardSection>
        ) : null}

        {stage === "targets" ? (
          <WizardSection
            description={t("workflows.wizard.targetsDescription")}
            icon={<GitBranch aria-hidden="true" />}
            title={t("workflows.wizard.targetsTitle")}
          >
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {applications.map((application) => {
                const checked = plan.steps.some((step) => step.application_id === application.id);
                return (
                  <label
                    className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40 has-checked:border-primary has-checked:bg-primary/5"
                    key={application.id}
                  >
                    <input
                      checked={checked}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      onChange={(event) => {
                        const ids = plan.steps.map((step) => step.application_id);
                        onChange(syncSelectedApplications(
                          plan,
                          event.target.checked ? [...ids, application.id] : ids.filter((id) => id !== application.id),
                          applications,
                        ));
                      }}
                      type="checkbox"
                    />
                    <span className="grid min-w-0 gap-1">
                      <strong className="text-sm [overflow-wrap:anywhere]">{application.name}</strong>
                      <small className="text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">
                        {application.repository || application.id}
                      </small>
                      <small className="text-[0.6875rem] text-muted-foreground [overflow-wrap:anywhere]">
                        {application.branch || t("workflows.value.notSet")}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          </WizardSection>
        ) : null}

        {stage === "policy" ? (
          <WizardSection
            description={t("workflows.wizard.policyDescription")}
            icon={<ShieldCheck aria-hidden="true" />}
            title={t("workflows.wizard.policyTitle")}
          >
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <FormField label={t("workflows.editor.policy")}>
                <NativeSelect
                  onChange={(value) => onChange({
                    ...plan,
                    settings: { ...plan.settings, approval_policy: value },
                  })}
                  value={settingString(plan, "approval_policy", "manual_each_step")}
                >
                  {APPROVAL_POLICIES.map((policy) => (
                    <option key={policy} value={policy}>{policyLabel(policy, t)}</option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label={t("workflows.editor.strategy")}>
                <NativeSelect
                  onChange={(value) => onChange({
                    ...plan,
                    settings: { ...plan.settings, default_strategy: value },
                    steps: plan.steps.map((step) => ({
                      ...step,
                      config: { ...step.config, strategy: value },
                    })),
                  })}
                  value={settingString(plan, "default_strategy", "rolling")}
                >
                  {STRATEGIES.map((strategy) => (
                    <option key={strategy} value={strategy}>{strategyLabel(strategy, t)}</option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label={t("workflows.editor.runtime")}>
                <NativeSelect
                  onChange={(value) => onChange({
                    ...plan,
                    settings: { ...plan.settings, runtime_mode: value },
                  })}
                  value={settingString(plan, "runtime_mode", "review")}
                >
                  <option value="review">{t("workflows.option.runtime.review")}</option>
                  <option value="live">{t("workflows.option.runtime.live")}</option>
                </NativeSelect>
              </FormField>
            </div>
          </WizardSection>
        ) : null}

        {stage === "review" ? (
          <div className="grid min-w-0 gap-4">
            <WizardSection
              description={t("workflows.wizard.reviewDescription")}
              icon={<Check aria-hidden="true" />}
              title={t("workflows.wizard.reviewTitle")}
            >
              <dl className="grid min-w-0 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
                <ReviewFact label={t("workflows.editor.name")} value={plan.name} />
                <ReviewFact label={t("workflows.context.targets")} value={String(plan.steps.length)} />
                <ReviewFact label={t("workflows.context.policy")} value={policyLabel(settingString(plan, "approval_policy"), t)} />
                <ReviewFact label={t("workflows.context.runtime")} value={settingString(plan, "runtime_mode", "review") === "live" ? t("workflows.option.runtime.live") : t("workflows.option.runtime.review")} />
              </dl>
            </WizardSection>
            <WorkflowGraph applications={applications} controls={false} plan={plan} />
          </div>
        ) : null}
      </div>

      <footer className="flex min-w-0 flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button disabled={stageIndex === 0} onClick={back} variant="outline">
          <ArrowLeft aria-hidden="true" />
          {t("workflows.wizard.back")}
        </Button>
        {stage === "review" ? (
          <Button disabled={pending} onClick={onCreate}>
            <Save aria-hidden="true" />
            {pending ? t("workflows.wizard.creating") : t("workflows.wizard.create")}
          </Button>
        ) : (
          <Button onClick={next}>
            {t("workflows.wizard.next")}
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
      </footer>
    </section>
  );
}
