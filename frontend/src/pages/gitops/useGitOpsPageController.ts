import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApprovalDecision,
  GeneratedManifest,
  GitOpsPort,
  ReleaseApplication,
  ReleasePlan,
  ReleaseReadiness,
  ReleaseRunAction,
  ReleaseTargetInput,
  SafePrResult,
} from "../../features/gitops/gitOpsContract";
import { createEmptyProductDetailQuery } from "../../features/filters/filterContract";
import {
  clonePlan,
  createEmptyPlan,
  isWorkflowView,
  stepKey,
  type StepSetupField,
  type WorkflowView,
} from "../../features/gitops/workflowModel";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useOptionalProductNotifications } from "../../features/notifications/ProductNotificationsProvider";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import { useI18n } from "../../shared/i18n";
import { toast } from "../../shared/ui/primitives/sonner";
import { useWorkflowData, type WorkflowRunTransition } from "./useWorkflowData";
import {
  validRunTimestamp,
  workflowNotificationTone,
  workflowStatusKey,
} from "./workflowRunPresentation";

type Operation = "idle" | "save" | "create" | "target" | "readiness" | "start" | "run" | "generate" | "safe-pr";
export type WorkflowFeedback = { tone: "success" | "danger"; message: string };

export function useGitOpsPageController(
  port: GitOpsPort,
  refreshPolicies: BrowserRefreshPolicyRegistry<"gitops_rows">,
) {
  const { t } = useI18n();
  const filter = useUnifiedFilter();
  const { detail, updateDetail } = filter;
  const notifications = useOptionalProductNotifications();
  const requestedPlanId = detail.workflowPlan || "";
  const requestedView = detail.workflowView ?? null;
  const view: WorkflowView = isWorkflowView(requestedView) ? requestedView : "overview";
  const creating = detail.workflowMode === "new";
  const announceRunTransition = useCallback(({ run, status }: WorkflowRunTransition) => {
    const statusLabel = t(workflowStatusKey(status));
    const title = `${run.plan_name} · ${statusLabel}`;
    const description = `${run.run_id} · ${t("workflows.runs.currentWave", {
      current: run.current_wave,
      total: run.total_waves,
    })}`;
    const href = filter.navigationHref("/deploy", {
      ...createEmptyProductDetailQuery(),
      detail: run.run_id,
      surfaceTab: "workflows",
      workflowPlan: run.plan_id,
      workflowView: "runs",
    });
    const tone = workflowNotificationTone(status);
    const id = `workflow-run:${run.run_id}`;
    notifications?.publish({
      description,
      href,
      id,
      occurredAt: validRunTimestamp(run.updated_at) ?? new Date().toISOString(),
      title,
      tone,
    });
    const toastOptions = { description, id: `${id}:${status}` };
    if (tone === "critical") toast.error(title, toastOptions);
    else if (tone === "warning") toast.warning(title, toastOptions);
    else if (tone === "healthy") toast.success(title, toastOptions);
    else toast.info(title, toastOptions);
  }, [filter, notifications, t]);
  const data = useWorkflowData(
    port,
    requestedPlanId || undefined,
    refreshPolicies,
    announceRunTransition,
  );
  const selectedPlan = data.plans.find((plan) => plan.plan_id === requestedPlanId);
  const [draft, setDraft] = useState<ReleasePlan>();
  const [newPlan, setNewPlan] = useState(createEmptyPlan);
  const [selectedStepId, setSelectedStepId] = useState("");
  const [readiness, setReadiness] = useState<ReleaseReadiness>();
  const [manifest, setManifest] = useState<GeneratedManifest>();
  const [manifestStepIndex, setManifestStepIndex] = useState<number>();
  const [safePr, setSafePr] = useState<SafePrResult>();
  const [safePrStepIndex, setSafePrStepIndex] = useState<number>();
  const [operation, setOperation] = useState<Operation>("idle");
  const [feedback, setFeedback] = useState<WorkflowFeedback>();
  const latestRun = useMemo(
    () => [...data.runs].sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))[0],
    [data.runs],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDraft(selectedPlan ? clonePlan(selectedPlan) : undefined);
      setSelectedStepId("");
      setReadiness(undefined);
      setManifest(undefined);
      setManifestStepIndex(undefined);
      setSafePr(undefined);
      setSafePrStepIndex(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedPlan]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => document.querySelector("main")?.scrollTo(0, 0));
    return () => cancelAnimationFrame(frame);
  }, [creating, selectedPlan?.plan_id, view]);

  const setView = (nextView: WorkflowView) => {
    updateDetail((current) => ({
      ...current,
      workflowMode: null,
      workflowView: nextView,
      workflowPlan: selectedPlan?.plan_id || current.workflowPlan,
    }), "detail-tab");
  };

  const openEditor = (stepIndex?: number, _field?: StepSetupField) => {
    const step = typeof stepIndex === "number" ? selectedPlan?.steps[stepIndex] : undefined;
    if (step && typeof stepIndex === "number") setSelectedStepId(stepKey(step, stepIndex));
    setView("edit");
  };

  const selectPlan = (planId: string) => {
    if (!data.plans.some((plan) => plan.plan_id === planId)) return;
    updateDetail((current) => ({
      ...current,
      workflowMode: null,
      workflowPlan: planId,
      workflowView: view,
    }), "detail-open");
  };

  const openPlan = (planId: string) => {
    if (!data.plans.some((plan) => plan.plan_id === planId)) return;
    updateDetail((current) => ({
      ...current,
      workflowMode: null,
      workflowPlan: planId,
      workflowView: "overview",
    }), "detail-open");
  };

  const showPlanList = () => {
    updateDetail((current) => ({
      ...current,
      workflowMode: null,
      workflowPlan: null,
      workflowView: null,
    }), "detail-close");
  };

  const beginCreate = () => {
    setNewPlan(createEmptyPlan());
    setFeedback(undefined);
    updateDetail((current) => ({
      ...current,
      workflowMode: "new",
      workflowView: null,
    }), "detail-open");
  };

  const cancelCreate = () => {
    updateDetail((current) => ({
      ...current,
      workflowMode: null,
      workflowView: "overview",
    }), "detail-close");
  };

  const handleError = () => setFeedback({ tone: "danger", message: t("workflows.feedback.actionError") });

  const saveDraft = async () => {
    if (!draft) return;
    setOperation("save");
    try {
      const saved = await port.savePlan(draft);
      data.replacePlan(saved);
      setDraft(clonePlan(saved));
      setFeedback({ tone: "success", message: t("workflows.editor.saved") });
    } catch { handleError(); } finally { setOperation("idle"); }
  };

  const createPlan = async () => {
    setOperation("create");
    try {
      const saved = await port.savePlan(newPlan);
      data.replacePlan(saved);
      setFeedback({ tone: "success", message: t("workflows.wizard.created") });
      updateDetail((current) => ({
        ...current,
        workflowMode: null,
        workflowPlan: saved.plan_id || null,
        workflowView: "overview",
      }), "detail-open");
    } catch { handleError(); } finally { setOperation("idle"); }
  };

  const createTarget = async (input: ReleaseTargetInput): Promise<ReleaseApplication | null> => {
    setOperation("target");
    try {
      const application = await port.connectApplication(input);
      data.replaceApplication(application);
      setFeedback({ tone: "success", message: t("workflows.target.created") });
      return application;
    } catch {
      setFeedback({ tone: "danger", message: t("workflows.target.createError") });
      return null;
    } finally {
      setOperation("idle");
    }
  };

  const checkReadiness = async () => {
    if (!selectedPlan) return;
    setOperation("readiness");
    try { setReadiness(await port.checkReadiness(selectedPlan)); }
    catch { handleError(); } finally { setOperation("idle"); }
  };

  const startPlan = async () => {
    if (!selectedPlan) return;
    setOperation("start");
    try {
      data.replaceRun(await port.startPlan(selectedPlan));
      setFeedback({ tone: "success", message: t("workflows.runs.started") });
    } catch { handleError(); } finally { setOperation("idle"); }
  };

  const runAction = async (runId: string, action: ReleaseRunAction) => {
    setOperation("run");
    try {
      data.replaceRun(await port.runAction(runId, action));
      setFeedback({ tone: "success", message: t("workflows.feedback.actionComplete") });
    } catch { handleError(); } finally { setOperation("idle"); }
  };

  const decideApproval = async (approvalId: string, decision: ApprovalDecision) => {
    setOperation("run");
    try {
      await port.decideApproval(approvalId, decision);
      data.refreshRuns();
      setFeedback({ tone: "success", message: t("workflows.feedback.actionComplete") });
    } catch { handleError(); } finally { setOperation("idle"); }
  };

  const generateManifest = async (stepIndex: number) => {
    if (!selectedPlan) return;
    setOperation("generate");
    setManifest(undefined);
    setManifestStepIndex(undefined);
    setSafePr(undefined);
    setSafePrStepIndex(undefined);
    try {
      setManifest(await port.renderManifest(selectedPlan, stepIndex));
      setManifestStepIndex(stepIndex);
    }
    catch { handleError(); } finally { setOperation("idle"); }
  };

  const submitSafePr = async (stepIndex: number) => {
    if (!selectedPlan) return;
    setOperation("safe-pr");
    try {
      setSafePr(await port.submitSafePr(selectedPlan, stepIndex));
      setSafePrStepIndex(stepIndex);
    }
    catch { handleError(); } finally { setOperation("idle"); }
  };

  return {
    data, view, creating, selectedPlan, draft, setDraft, newPlan, setNewPlan,
    selectedStepId, setSelectedStepId, readiness, manifest, manifestStepIndex,
    safePr, safePrStepIndex, operation,
    feedback, setFeedback, latestRun, setView, selectPlan, openPlan, showPlanList, beginCreate, cancelCreate,
    openEditor, saveDraft, createPlan, createTarget, checkReadiness, startPlan, runAction, decideApproval,
    generateManifest, submitSafePr,
  };
}
