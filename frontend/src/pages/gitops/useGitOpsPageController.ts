import { useEffect, useMemo, useState } from "react";
import type {
  GeneratedManifest,
  GitOpsPort,
  ReleasePlan,
  ReleaseReadiness,
  ReleaseRunAction,
  SafePrResult,
} from "../../features/gitops/gitOpsContract";
import {
  clonePlan,
  createEmptyPlan,
  isWorkflowView,
  stepKey,
  type StepSetupField,
  type WorkflowView,
} from "../../features/gitops/workflowModel";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n } from "../../shared/i18n";
import { useWorkflowData } from "./useWorkflowData";

type Operation = "idle" | "save" | "create" | "readiness" | "start" | "run" | "generate" | "safe-pr";
export type WorkflowFeedback = { tone: "success" | "danger"; message: string };

export function useGitOpsPageController(port: GitOpsPort) {
  const { t } = useI18n();
  const { detail, updateDetail } = useUnifiedFilter();
  const requestedPlanId = detail.workflowPlan || "";
  const requestedView = detail.workflowView ?? null;
  const view: WorkflowView = isWorkflowView(requestedView) ? requestedView : "overview";
  const creating = detail.workflowMode === "new";
  const data = useWorkflowData(port, requestedPlanId || undefined);
  const selectedPlan = data.plans.find((plan) => plan.plan_id === requestedPlanId) || data.plans[0];
  const [draft, setDraft] = useState<ReleasePlan>();
  const [newPlan, setNewPlan] = useState(createEmptyPlan);
  const [selectedStepId, setSelectedStepId] = useState("");
  const [readiness, setReadiness] = useState<ReleaseReadiness>();
  const [manifest, setManifest] = useState<GeneratedManifest>();
  const [manifestStepIndex, setManifestStepIndex] = useState<number>();
  const [safePr, setSafePr] = useState<SafePrResult>();
  const [safePrStepIndex, setSafePrStepIndex] = useState<number>();
  const [editorTarget, setEditorTarget] = useState<{ stepId: string; field?: StepSetupField }>();
  const [operation, setOperation] = useState<Operation>("idle");
  const [feedback, setFeedback] = useState<WorkflowFeedback>();
  const latestRun = useMemo(
    () => [...data.runs].sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))[0],
    [data.runs],
  );

  useEffect(() => {
    if (creating || data.loading || !selectedPlan?.plan_id || selectedPlan.plan_id === requestedPlanId) return;
    updateDetail((current) => ({
      ...current,
      workflowPlan: selectedPlan.plan_id!,
    }), "detail-tab");
  }, [creating, data.loading, requestedPlanId, selectedPlan?.plan_id, updateDetail]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDraft(selectedPlan ? clonePlan(selectedPlan) : undefined);
      setSelectedStepId("");
      setReadiness(undefined);
      setManifest(undefined);
      setManifestStepIndex(undefined);
      setSafePr(undefined);
      setSafePrStepIndex(undefined);
      setEditorTarget(undefined);
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

  const openEditor = (stepIndex?: number, field?: StepSetupField) => {
    const step = typeof stepIndex === "number" ? selectedPlan?.steps[stepIndex] : undefined;
    setEditorTarget(step && typeof stepIndex === "number"
      ? { stepId: stepKey(step, stepIndex), field }
      : undefined);
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
    safePr, safePrStepIndex, editorTarget, operation,
    feedback, setFeedback, latestRun, setView, selectPlan, beginCreate, cancelCreate,
    openEditor, saveDraft, createPlan, checkReadiness, startPlan, runAction,
    generateManifest, submitSafePr,
  };
}
