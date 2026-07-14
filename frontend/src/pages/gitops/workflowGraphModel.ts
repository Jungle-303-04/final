import type { TranslationFunction } from "../../shared/i18n/types";
import type {
  ReleaseApplication,
  ReleasePlan,
  ReleaseRun,
  ReleaseRunStep,
} from "../../features/gitops/gitOpsContract";
import {
  applicationForStep,
  configString,
  releaseWaves,
  settingString,
  stepKey,
} from "../../features/gitops/workflowModel";
import type {
  GraphOptions,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowNodeInput,
  WorkflowTone,
} from "./workflowGraphTypes";

export function buildWorkflowGraph(
  plan: ReleasePlan,
  applications: ReleaseApplication[],
  run: ReleaseRun | undefined,
  selectedStepId: string | undefined,
  options: GraphOptions,
  t: TranslationFunction,
) {
  const keys = plan.steps.map(stepKey);
  const keySet = new Set(keys);
  const waveByKey = releaseWaves(plan.steps);
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const roots = new Set<string>();
  const dependedOn = new Set<string>();

  if (options.showCheckpoints && plan.steps.length) {
    nodes.push(checkpointNode(
      "preflight",
      t("workflows.graph.preflight"),
      "PRE-FLIGHT",
      run ? "succeeded" : "pending",
      t("workflows.graph.preflightNote"),
      options,
      t,
    ));
  }

  plan.steps.forEach((step, index) => {
    const key = keys[index];
    const application = applicationForStep(step, applications);
    const dependencies = step.depends_on.filter((dependency) => keySet.has(dependency));
    if (!dependencies.length) roots.add(key);
    dependencies.forEach((dependency) => dependedOn.add(dependency));
    const status = runStepStatus(run?.steps, step.application_id);
    const gate = resolvedGate(plan, step);
    const needsGate = options.showCheckpoints && gate !== "auto";
    const entryId = needsGate ? `approval::${key}` : key;

    if (needsGate) {
      nodes.push({
        id: entryId,
        type: "workflow",
        position: { x: 0, y: 0 },
        width: options.compact ? 176 : options.narrow ? 160 : 196,
        height: options.compact ? 78 : 108,
        data: nodeData({
          kind: "approval",
          title: gate === "safe_pr" ? t("workflows.graph.safePrApproval") : t("workflows.graph.manualApproval"),
          eyebrow: "APPROVAL",
          status: status === "waiting_for_approval" ? status : run ? "succeeded" : "pending",
          note: step.name || application?.name || step.application_id,
          selected: selectedStepId === key,
        }, options, t),
      });
      edges.push(flowEdge(`edge-${entryId}-${key}`, entryId, key, status));
    }

    nodes.push({
      id: key,
      type: "workflow",
      position: { x: 0, y: 0 },
      width: options.compact ? 200 : options.narrow ? 214 : 282,
      height: options.compact ? 96 : options.showMetadata ? (options.narrow ? 154 : 152) : 106,
      data: nodeData({
        kind: "application",
        title: step.name || application?.name || step.application_id,
        eyebrow: `WAVE ${waveByKey.get(key) ?? index + 1}`,
        status,
        environment: configString(step, "environment", t("workflows.value.notSet")),
        cluster: configString(step, "cluster_id", application?.clusterId || t("workflows.value.notSet")),
        strategy: strategyLabel(configString(step, "strategy", settingString(plan, "default_strategy", "rolling")), t),
        selected: selectedStepId === key,
      }, options, t),
    });
    dependencies.forEach((dependency) => edges.push(flowEdge(
      `edge-${dependency}-${entryId}`,
      dependency,
      entryId,
      status,
    )));
  });

  if (options.showCheckpoints && plan.steps.length) {
    roots.forEach((root) => {
      const step = plan.steps[keys.indexOf(root)];
      const target = resolvedGate(plan, step) !== "auto" ? `approval::${root}` : root;
      edges.push(flowEdge(`edge-preflight-${target}`, "preflight", target, run ? "succeeded" : "pending"));
    });
    nodes.push(checkpointNode(
      "verification",
      t("workflows.graph.verification"),
      "VERIFY",
      run?.status === "succeeded" ? "succeeded" : "pending",
      t("workflows.graph.verificationNote"),
      options,
      t,
    ));
    keys.filter((key) => !dependedOn.has(key)).forEach((leaf) => {
      edges.push(flowEdge(`edge-${leaf}-verification`, leaf, "verification", run?.status || "pending"));
    });
  }
  return { nodes, edges };
}

function nodeData(data: WorkflowNodeInput, options: GraphOptions, t: TranslationFunction): WorkflowNodeData {
  return {
    ...data,
    compact: options.compact,
    direction: options.direction,
    showMetadata: options.showMetadata && !options.compact,
    statusLabel: statusLabel(data.status, t),
    tone: statusTone(data.status),
  };
}

function checkpointNode(
  kind: "preflight" | "verification",
  title: string,
  eyebrow: string,
  status: string,
  note: string,
  options: GraphOptions,
  t: TranslationFunction,
): WorkflowNode {
  return {
    id: kind,
    type: "workflow",
    position: { x: 0, y: 0 },
    width: options.compact ? 176 : options.narrow ? 160 : 196,
    height: options.compact ? 78 : 108,
    data: nodeData({ kind, title, eyebrow, status, note, selected: false }, options, t),
  };
}

function flowEdge(id: string, source: string, target: string, status: string): WorkflowEdge {
  const tone = statusTone(status);
  return {
    id,
    source,
    target,
    type: "smoothstep",
    animated: tone === "info",
    style: { stroke: edgeColor(tone), strokeWidth: tone === "info" ? 2 : 1.5 },
  };
}

function edgeColor(tone: WorkflowTone): string {
  if (tone === "success") return "var(--color-emerald-500)";
  if (tone === "warning") return "var(--color-amber-500)";
  if (tone === "danger") return "var(--destructive)";
  if (tone === "info") return "var(--primary)";
  return "var(--border)";
}

function runStepStatus(steps: ReleaseRunStep[] | undefined, applicationId: string): string {
  return steps?.find((step) => step.application_id === applicationId)?.status || "pending";
}

function resolvedGate(plan: ReleasePlan, step: ReleasePlan["steps"][number]): string {
  const gate = configString(step, "approval_gate", "inherit");
  if (gate !== "inherit") return gate;
  const policy = settingString(plan, "approval_policy", "manual_each_step");
  if (policy === "auto_safe") return "auto";
  if (policy === "external_change_ticket") return "safe_pr";
  if (policy === "production_only") {
    return configString(step, "environment", "staging") === "production" ? "manual" : "auto";
  }
  return "manual";
}

function statusTone(status: string): WorkflowTone {
  const normalized = status.toLowerCase();
  if (["succeeded", "success", "completed", "passed"].includes(normalized)) return "success";
  if (["failed", "error", "cancelled", "rollback_failed"].includes(normalized)) return "danger";
  if (["waiting_for_approval", "paused", "warning", "blocked"].includes(normalized)) return "warning";
  if (["running", "in_progress", "deploying", "queued"].includes(normalized)) return "info";
  return "neutral";
}

function statusLabel(status: string, t: TranslationFunction): string {
  const normalized = status.toLowerCase();
  if (["succeeded", "success", "completed", "passed"].includes(normalized)) return t("workflows.status.succeeded");
  if (["failed", "error", "rollback_failed"].includes(normalized)) return t("workflows.status.failed");
  if (normalized === "cancelled") return t("workflows.status.cancelled");
  if (normalized === "waiting_for_approval") return t("workflows.status.waitingApproval");
  if (["running", "in_progress", "deploying", "queued"].includes(normalized)) return t("workflows.status.running");
  return t("workflows.status.pending");
}

function strategyLabel(strategy: string, t: TranslationFunction): string {
  if (strategy === "canary") return t("workflows.option.strategy.canary");
  if (strategy === "blue_green") return t("workflows.option.strategy.blueGreen");
  return t("workflows.option.strategy.rolling");
}

export function ownerStepId(nodeId: string): string {
  return nodeId.startsWith("approval::") ? nodeId.slice("approval::".length) : nodeId;
}
