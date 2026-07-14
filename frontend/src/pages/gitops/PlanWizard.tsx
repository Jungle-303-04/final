import { ArrowLeft, ArrowRight, Check, GitBranch, Save, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  ReleaseApplication,
  ReleaseCluster,
  ReleasePlan,
  ReleaseTargetInput,
} from "../../features/gitops/gitOpsContract";
import {
  APPROVAL_POLICIES,
  STRATEGIES,
  WIZARD_STAGES,
  settingString,
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
import { WorkflowInlineHeading } from "./WorkflowInlineHeading";
import { PlanWizardTargets } from "./PlanWizardTargets";
import {
  ReviewFact,
  WizardMobileOrder,
  WizardSection,
  stageErrors,
  stageLabel,
  validationLabel,
} from "./PlanWizardParts";

export function PlanWizard({
  plan,
  applications,
  clusters,
  pending,
  targetPending,
  onChange,
  onCancel,
  onCreate,
  onCreateTarget,
}: {
  plan: ReleasePlan;
  applications: ReleaseApplication[];
  clusters: ReleaseCluster[];
  pending: boolean;
  targetPending: boolean;
  onChange: (plan: ReleasePlan) => void;
  onCancel: () => void;
  onCreate: () => void;
  onCreateTarget: (input: ReleaseTargetInput) => Promise<ReleaseApplication | null>;
}) {
  const { t } = useI18n();
  const [stageIndex, setStageIndex] = useState(0);
  const [furthestStage, setFurthestStage] = useState(0);
  const [validation, setValidation] = useState<string[]>([]);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const stage = WIZARD_STAGES[stageIndex];
  const nameError = validation.includes("name") ? validationLabel("name", t) : undefined;
  const sectionValidation = validation.filter((code) => code !== "name");

  useEffect(() => {
    const frame = requestAnimationFrame(() => document.querySelector("main")?.scrollTo(0, 0));
    return () => cancelAnimationFrame(frame);
  }, [stageIndex]);

  const next = () => {
    const errors = stageErrors(stage, plan);
    if (errors.length) {
      setValidation(errors);
      if (errors.includes("name")) {
        requestAnimationFrame(() => nameInputRef.current?.focus());
      }
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
        <WorkflowInlineHeading
          as="h1"
          className="flex-1"
          title={t("workflows.wizard.title")}
          titleId="workflow-wizard-title"
          variant="page"
        />
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
          const label = stageLabel(item, t);
          return (
            <li className="min-w-0 px-0.5" key={item}>
              <button
                aria-current={active ? "step" : undefined}
                className="flex h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-md px-1 text-center hover:bg-muted/50 disabled:cursor-default aria-[current=step]:bg-muted"
                disabled={!enabled}
                onClick={() => enabled && setStageIndex(index)}
                type="button"
              >
                <span className={`grid size-6 shrink-0 place-items-center rounded-full border text-[0.6875rem] font-semibold ${active ? "border-primary bg-primary text-primary-foreground" : complete ? "border-primary bg-background text-primary" : "bg-background text-muted-foreground"}`}>
                  {complete ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
                </span>
                <strong className="text-[0.6875rem] leading-4 font-medium whitespace-nowrap">
                  {label}
                </strong>
              </button>
            </li>
          );
        })}
      </ol>

      {sectionValidation.length ? (
        <div className="grid gap-1 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
          {sectionValidation.map((code) => <span key={code}>{validationLabel(code, t)}</span>)}
        </div>
      ) : null}

      <div className="min-h-[26rem] min-w-0">
        {stage === "basics" ? (
          <WizardSection
            icon={<GitBranch aria-hidden="true" />}
            title={t("workflows.wizard.basicsTitle")}
          >
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <FormField error={nameError} label={t("workflows.editor.name")}>
                <Input
                  aria-invalid={Boolean(nameError)}
                  autoFocus
                  onChange={(event) => {
                    onChange({ ...plan, name: event.target.value });
                    if (nameError) setValidation((current) => current.filter((code) => code !== "name"));
                  }}
                  ref={nameInputRef}
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
            icon={<GitBranch aria-hidden="true" />}
            title={t("workflows.wizard.targetsTitle")}
          >
            <PlanWizardTargets
              applications={applications}
              clusters={clusters}
              onChange={onChange}
              onCreateTarget={onCreateTarget}
              onTargetChanged={() => setValidation((current) => current.filter((code) => code !== "steps"))}
              pending={targetPending}
              plan={plan}
            />
          </WizardSection>
        ) : null}

        {stage === "policy" ? (
          <WizardSection
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
            <WizardMobileOrder plan={plan} title={t("workflows.overview.order")} />
            <WorkflowGraph applications={applications} className="hidden xl:block" controls={false} plan={plan} />
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
