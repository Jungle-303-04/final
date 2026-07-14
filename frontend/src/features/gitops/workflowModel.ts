import type { ReleaseApplication, ReleasePlan, ReleasePlanStep } from "./gitOpsContract";

export type WorkflowView = "overview" | "edit" | "runs" | "yaml";
export type WizardStage = "basics" | "targets" | "policy" | "review";

export const WORKFLOW_VIEWS: WorkflowView[] = ["overview", "edit", "runs", "yaml"];
export const WIZARD_STAGES: WizardStage[] = ["basics", "targets", "policy", "review"];
export const ENVIRONMENTS = ["development", "staging", "production"] as const;
export const STRATEGIES = ["rolling", "canary", "blue_green"] as const;
export const APPROVAL_POLICIES = [
  "manual_each_step",
  "production_only",
  "auto_safe",
  "external_change_ticket",
] as const;

export function isWorkflowView(value: string | null): value is WorkflowView {
  return WORKFLOW_VIEWS.some((view) => view === value);
}

export function createEmptyPlan(): ReleasePlan {
  return {
    name: "",
    description: "",
    status: "draft",
    settings: {
      approval_policy: "manual_each_step",
      default_strategy: "rolling",
      runtime_mode: "review",
    },
    steps: [],
  };
}

export function clonePlan(plan: ReleasePlan): ReleasePlan {
  return {
    ...plan,
    settings: { ...plan.settings },
    steps: plan.steps.map((step) => ({
      ...step,
      depends_on: [...step.depends_on],
      config: { ...step.config },
    })),
  };
}

export function stepKey(step: ReleasePlanStep, index: number): string {
  return step.step_id || step.application_id || `step-${index}`;
}

export function configString(step: ReleasePlanStep, key: string, fallback = ""): string {
  const value = step.config[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function settingString(plan: ReleasePlan, key: string, fallback = ""): string {
  const value = plan.settings[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function applicationForStep(
  step: ReleasePlanStep,
  applications: ReleaseApplication[],
): ReleaseApplication | undefined {
  return applications.find((application) => application.id === step.application_id);
}

export function updateStep(
  plan: ReleasePlan,
  index: number,
  update: (step: ReleasePlanStep) => ReleasePlanStep,
): ReleasePlan {
  return {
    ...plan,
    steps: plan.steps.map((step, stepIndex) => stepIndex === index ? update(step) : step),
  };
}

export function syncSelectedApplications(
  plan: ReleasePlan,
  applicationIds: string[],
  applications: ReleaseApplication[],
): ReleasePlan {
  const existing = new Map(plan.steps.map((step) => [step.application_id, step]));
  const selected = new Set(applicationIds);
  const steps = applicationIds.map((applicationId, position) => {
    const current = existing.get(applicationId);
    const application = applications.find((item) => item.id === applicationId);
    return current ? { ...current, position } : {
      application_id: applicationId,
      name: application?.name || applicationId,
      position,
      depends_on: position === 0 ? [] : [applicationIds[position - 1]],
      config: {
        environment: "staging",
        strategy: "rolling",
        cluster_id: application?.clusterId || "",
        namespace: "default",
        approval_gate: "inherit",
      },
    };
  }).map((step) => ({
    ...step,
    depends_on: step.depends_on.filter((dependency) => selected.has(dependency)),
  }));
  return { ...plan, steps };
}

export function moveStep(plan: ReleasePlan, index: number, offset: -1 | 1): ReleasePlan {
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= plan.steps.length) return plan;
  const steps = [...plan.steps];
  [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
  return { ...plan, steps: steps.map((step, position) => ({ ...step, position })) };
}

export function releaseWaves(steps: ReleasePlanStep[]): Map<string, number> {
  const result = new Map<string, number>();
  const pending = steps.map((step, index) => ({ step, index, key: stepKey(step, index) }));
  for (let iteration = 0; pending.length > 0 && iteration <= steps.length; iteration += 1) {
    let advanced = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const item = pending[index];
      const dependencyWaves = item.step.depends_on.map((dependency) => result.get(dependency));
      if (dependencyWaves.some((wave) => wave === undefined)) continue;
      result.set(item.key, dependencyWaves.length ? Math.max(...dependencyWaves as number[]) + 1 : 1);
      pending.splice(index, 1);
      advanced = true;
    }
    if (!advanced) break;
  }
  pending.forEach((item) => result.set(item.key, 1));
  return result;
}

export function planValidationCodes(plan: ReleasePlan): string[] {
  const errors: string[] = [];
  if (!plan.name.trim()) errors.push("name");
  if (plan.steps.length === 0) errors.push("steps");
  const ids = new Set(plan.steps.map((step) => step.application_id));
  if (ids.size !== plan.steps.length) errors.push("duplicate");
  if (plan.steps.some((step) => step.depends_on.some((dependency) => !ids.has(dependency)))) {
    errors.push("dependency");
  }
  return errors;
}
