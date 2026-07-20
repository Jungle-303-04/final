import { GitBranch, Save } from "lucide-react";
import { useState } from "react";

import type {
  ReleaseApplication,
  ReleasePlan,
  ReleaseTargetInput,
} from "../../features/gitops/gitOpsContract";
import {
  APPROVAL_POLICIES,
  STRATEGIES,
  planValidationCodes,
  settingString,
  syncSelectedApplications,
} from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import { StatusPill } from "../../shared/ui/status";
import { DeploymentTargetDialog } from "./DeploymentTargetDialog";
import {
  type SelectedWorkflowNode,
  WorkflowNodeRail,
  WorkflowNodeSettings,
} from "./DeployWorkflowNodes";
import { QuickPlanActions } from "./DeployWorkflowPlanActions";
import {
  FormField,
  NativeSelect,
  policyLabel,
  strategyLabel,
} from "./WorkflowFormControls";
import { useGitOpsPageController } from "./useGitOpsPageController";

export function WorkflowPreview({
  applications,
  onOpen,
  plan,
}: {
  applications: ReleaseApplication[];
  onOpen: () => void;
  plan: ReleasePlan;
}) {
  const { formatDate, t } = useI18n();
  const repositories = repositoriesForPlan(plan, applications);
  const branches = branchesForPlan(plan, applications);
  return (
    <Surface
      aria-label={t("workflows.plan.open", { name: plan.name })}
      className="min-w-0 animate-in p-[1.171875rem] fade-in-0 slide-in-from-bottom-1 duration-(--motion-soft) ease-(--ease-soft) motion-reduce:animate-none"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <GitBranch aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <strong className="min-w-0 truncate text-body-strong font-bold">{plan.name}</strong>
        <span className="min-w-0 truncate font-mono text-caption-2 text-caption-foreground">
          {repositories.length ? repositories.join(" · ") : t("common.value.unavailable")}
        </span>
        {branches ? (
          <span className="min-w-0 max-w-48 truncate font-mono text-caption-2 text-caption-foreground">
            {t("workflows.detail.branch")} · {branches}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {plan.updated_at ? (
            <span className="font-mono text-caption text-caption-foreground">
              {formatDate(Date.parse(plan.updated_at), { dateStyle: "medium", timeStyle: "short" })}
            </span>
          ) : null}
          <PlanStatus status={plan.status} />
        </span>
      </div>
      <WorkflowNodeRail applications={applications} onSelect={onOpen} plan={plan} selected={null} />
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
        <span className="text-caption-2 font-bold text-caption-foreground">{t("workflows.editor.steps")}</span>
        <Button onClick={onOpen} size="sm" type="button" variant="outline">
          {t("workflows.overview.edit")}
        </Button>
      </div>
    </Surface>
  );
}

export function WorkflowEditor({
  applications,
  clusters,
  createTarget,
  draft,
  onBack,
  onChange,
  onSave,
  onSelectNode,
  pending,
  selectedNode,
  targetPending,
}: {
  applications: ReleaseApplication[];
  clusters: ReturnType<typeof useGitOpsPageController>["data"]["clusters"];
  createTarget: (input: ReleaseTargetInput) => Promise<ReleaseApplication | null>;
  draft: ReleasePlan;
  onBack: () => void;
  onChange: (plan: ReleasePlan) => void;
  onSave: () => void;
  onSelectNode: (node: SelectedWorkflowNode) => void;
  pending: boolean;
  selectedNode: SelectedWorkflowNode;
  targetPending: boolean;
}) {
  const { t } = useI18n();
  const validation = planValidationCodes(draft);
  const createAndAddTarget = async (input: ReleaseTargetInput) => {
    const application = await createTarget(input);
    if (!application) return null;
    onChange(syncSelectedApplications(
      draft,
      [...draft.steps.map((step) => step.application_id), application.id],
      [...applications, application],
    ));
    return application;
  };
  return (
    <Surface aria-label={t("workflows.editor.title")} className="min-w-0 p-[1.171875rem]">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <GitBranch aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <Input
          aria-label={t("workflows.editor.name")}
          className="h-8 min-w-48 max-w-sm flex-1 border-0 bg-background-subtle px-2.5 text-body font-bold shadow-none"
          onChange={(event) => onChange({ ...draft, name: event.currentTarget.value })}
          value={draft.name}
        />
        <NativeSelect
          ariaLabel={t("workflows.editor.status")}
          className="h-8 w-32"
          onChange={(status) => onChange({ ...draft, status: status as ReleasePlan["status"] })}
          value={draft.status}
        >
          {(["draft", "active", "paused", "archived"] as const).map((status) => (
            <option key={status} value={status}>{t(`workflows.status.${status}`)}</option>
          ))}
        </NativeSelect>
        <span className="ml-auto flex items-center gap-2">
          <Button onClick={onBack} size="sm" type="button" variant="outline">{t("common.action.cancel")}</Button>
          <Button disabled={pending || validation.length > 0} onClick={onSave} size="sm" type="button">
            <Save aria-hidden="true" />
            {pending ? t("workflows.editor.saving") : t("workflows.editor.save")}
          </Button>
        </span>
      </div>
      <WorkflowNodeRail applications={applications} onSelect={onSelectNode} plan={draft} selected={selectedNode} />
      <WorkflowNodeSettings applications={applications} onChange={onChange} plan={draft} selectedNode={selectedNode} />
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
        <span className="text-caption-2 font-bold text-caption-foreground">{t("workflows.editor.steps")}</span>
        <QuickPlanActions onChange={onChange} plan={draft} />
        <DeploymentTargetDialog clusters={clusters} onCreate={createAndAddTarget} pending={targetPending} />
      </div>
    </Surface>
  );
}

export function WorkflowCreation({ page }: { page: ReturnType<typeof useGitOpsPageController> }) {
  const { t } = useI18n();
  const plan = page.newPlan;
  const [applicationId, setApplicationId] = useState(plan.steps[0]?.application_id || "");
  const selectedIds = plan.steps.map((step) => step.application_id);
  const syncTarget = (nextId: string) => {
    setApplicationId(nextId);
    page.setNewPlan(syncSelectedApplications(plan, nextId ? [nextId] : [], page.data.applications));
  };
  const createAndSelect = async (input: ReleaseTargetInput) => {
    const application = await page.createTarget(input);
    if (!application) return null;
    const applications = [...page.data.applications, application];
    setApplicationId(application.id);
    page.setNewPlan(syncSelectedApplications(plan, [application.id], applications));
    return application;
  };
  return (
    <Surface aria-label={t("workflows.plan.new")} className="min-w-0 p-[1.171875rem]">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <GitBranch aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <Input
          aria-label={t("workflows.editor.name")}
          autoFocus
          className="h-8 min-w-48 max-w-sm flex-1 border-0 bg-background-subtle px-2.5 text-body font-bold shadow-none"
          onChange={(event) => page.setNewPlan({ ...plan, name: event.currentTarget.value })}
          value={plan.name}
        />
        <span className="ml-auto flex items-center gap-2">
          <Button onClick={page.cancelCreate} size="sm" type="button" variant="outline">{t("common.action.cancel")}</Button>
          <Button disabled={page.operation === "create" || planValidationCodes(plan).length > 0} onClick={() => void page.createPlan()} size="sm" type="button">
            <Save aria-hidden="true" />
            {page.operation === "create" ? t("workflows.editor.saving") : t("workflows.wizard.create")}
          </Button>
        </span>
      </div>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label={t("workflows.editor.application")}>
          <NativeSelect disabled={!page.data.applications.length} onChange={syncTarget} value={selectedIds[0] || applicationId}>
            <option disabled value="">{t("workflows.editor.application")}</option>
            {page.data.applications.map((application) => (
              <option key={application.id} value={application.id}>{application.name}</option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label={t("workflows.editor.policy")}>
          <NativeSelect onChange={(value) => page.setNewPlan({ ...plan, settings: { ...plan.settings, approval_policy: value } })} value={settingString(plan, "approval_policy", "manual_each_step")}>
            {APPROVAL_POLICIES.map((policy) => <option key={policy} value={policy}>{policyLabel(policy, t)}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label={t("workflows.editor.strategy")}>
          <NativeSelect onChange={(value) => page.setNewPlan({ ...plan, settings: { ...plan.settings, default_strategy: value } })} value={settingString(plan, "default_strategy", "rolling")}>
            {STRATEGIES.map((strategy) => <option key={strategy} value={strategy}>{strategyLabel(strategy, t)}</option>)}
          </NativeSelect>
        </FormField>
        <DeploymentTargetDialog clusters={page.data.clusters} onCreate={createAndSelect} pending={page.operation === "target"} />
      </div>
      <WorkflowNodeRail applications={page.data.applications} plan={plan} selected={null} />
    </Surface>
  );
}

function PlanStatus({ status }: { status: ReleasePlan["status"] }) {
  const { t } = useI18n();
  const tone = status === "active" ? "healthy" : status === "paused" ? "warning" : status === "archived" ? "stale" : "unknown";
  return <StatusPill label={t(`workflows.status.${status}`)} tone={tone} />;
}

function repositoriesForPlan(plan: ReleasePlan, applications: ReleaseApplication[]) {
  return [...new Set(plan.steps
    .map((step) => applications.find((application) => application.id === step.application_id)?.repository || "")
    .filter(Boolean))];
}

function branchesForPlan(plan: ReleasePlan, applications: ReleaseApplication[]): string | null {
  const branches = [...new Set(plan.steps
    .map((step) => applications.find((application) => application.id === step.application_id)?.branch.trim() || "")
    .filter(Boolean))];
  return branches.length ? branches.join(" · ") : null;
}
