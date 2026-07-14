import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitBranch } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ReleaseApplication,
  ReleasePlan,
  ReleaseRun,
} from "../../features/gitops/gitOpsContract";
import { releaseWaves } from "../../features/gitops/workflowModel";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/ui/primitives/cn";
import { buildWorkflowGraph, ownerStepId } from "./workflowGraphModel";
import type { FlowDirection, WorkflowEdge, WorkflowNode } from "./workflowGraphTypes";
import { WorkflowNodeCard } from "./WorkflowNodeCard";
import { WorkflowViewSettings } from "./WorkflowViewSettings";
import { isNarrowGraphViewport, useWorkflowLayout } from "./useWorkflowLayout";

const nodeTypes: NodeTypes = { workflow: WorkflowNodeCard };
const narrowMinZoom = 0.38;

export function WorkflowGraph({
  plan,
  applications,
  run,
  selectedStepId,
  onSelectStep,
  controls = true,
  className,
}: {
  plan: ReleasePlan;
  applications: ReleaseApplication[];
  run?: ReleaseRun;
  selectedStepId?: string;
  onSelectStep?: (stepId: string) => void;
  controls?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const verticalByShape = hasWideParallelWave(plan);
  const [narrowViewport, setNarrowViewport] = useState(isNarrowGraphViewport);
  const [direction, setDirection] = useState<FlowDirection>(
    () => isNarrowGraphViewport() || verticalByShape ? "TB" : "LR",
  );
  const [showCheckpoints, setShowCheckpoints] = useState(true);
  const [showMetadata, setShowMetadata] = useState(true);
  const [compact, setCompact] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<WorkflowNode, WorkflowEdge>>();
  const graphViewportRef = useRef<HTMLDivElement>(null);
  const [viewportRevision, setViewportRevision] = useState(0);
  const graph = useMemo(
    () => buildWorkflowGraph(plan, applications, run, selectedStepId, {
      showCheckpoints,
      showMetadata,
      compact,
      direction,
      narrow: narrowViewport,
    }, t),
    [applications, compact, direction, narrowViewport, plan, run, selectedStepId, showCheckpoints, showMetadata, t],
  );
  const layout = useWorkflowLayout(graph.nodes, graph.edges, direction, narrowViewport);
  const heightClass = graphHeightClass(layout.nodes.length, direction, narrowViewport);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => {
      setNarrowViewport(media.matches);
      setDirection(media.matches || verticalByShape ? "TB" : "LR");
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [verticalByShape]);

  useEffect(() => {
    if (!flowInstance || !layout.nodes.length) return undefined;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        void flowInstance.fitView({
          padding: 0.18,
          minZoom: narrowViewport ? narrowMinZoom : 0.2,
          maxZoom: narrowViewport ? 1 : 1.2,
        });
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [flowInstance, layout.nodes, narrowViewport, viewportRevision]);

  useEffect(() => {
    const viewport = graphViewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewportRevision((revision) => revision + 1));
    });
    observer.observe(viewport);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <section aria-label={t("workflows.graph.label")} className={cn("min-w-0 overflow-hidden rounded-lg border bg-card shadow-sm", className)}>
      <div className="flex min-w-0 items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <GitBranch aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <span className="truncate">{t("workflows.graph.title")}</span>
          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            {t("workflows.graph.count", { count: plan.steps.length })}
          </span>
        </div>
        {controls ? (
          <WorkflowViewSettings
            compact={compact}
            direction={direction}
            setCompact={setCompact}
            setDirection={setDirection}
            setShowCheckpoints={setShowCheckpoints}
            setShowMetadata={setShowMetadata}
            showCheckpoints={showCheckpoints}
            showMetadata={showMetadata}
          />
        ) : null}
      </div>
      <div aria-label={t("workflows.graph.legend")} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2 text-[0.6875rem] text-muted-foreground sm:px-4">
        <LegendDot className="bg-emerald-500" label={t("workflows.status.succeeded")} />
        <LegendDot className="bg-sky-500" label={t("workflows.status.running")} />
        <LegendDot className="bg-amber-500" label={t("workflows.status.waitingApproval")} />
        <LegendDot className="bg-destructive" label={t("workflows.status.failed")} />
      </div>
      <div ref={graphViewportRef} className={cn("min-w-0 bg-muted/20", heightClass)}>
        {plan.steps.length ? (
          <ReactFlow
            colorMode="system"
            edges={layout.edges}
            fitView
            fitViewOptions={{ padding: 0.18, minZoom: narrowViewport ? narrowMinZoom : 0.32 }}
            maxZoom={1.4}
            minZoom={narrowViewport ? narrowMinZoom : 0.2}
            nodeTypes={nodeTypes}
            nodes={layout.nodes}
            nodesConnectable={false}
            nodesDraggable={false}
            onInit={setFlowInstance}
            onNodeClick={(_event, node) => onSelectStep?.(ownerStepId(node.id))}
            panOnScroll={false}
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={false}
            zoomOnScroll
          >
            <Background color="var(--border)" gap={22} size={1} />
            <Controls position="bottom-left" showInteractive={false} />
            {!narrowViewport ? <MiniMap pannable zoomable /> : null}
          </ReactFlow>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="grid justify-items-center gap-3">
              <span className="grid size-12 place-items-center rounded-lg border bg-card text-primary shadow-sm">
                <GitBranch aria-hidden="true" className="size-5" />
              </span>
              <strong className="text-sm">{t("workflows.graph.empty")}</strong>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <i aria-hidden="true" className={cn("size-1.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function graphHeightClass(nodeCount: number, direction: FlowDirection, narrow: boolean): string {
  if (!narrow) return direction === "TB" ? "h-[44rem]" : "h-[35rem]";
  if (direction === "LR") return "h-[35rem]";
  if (nodeCount <= 5) return "h-[32rem]";
  if (nodeCount <= 8) return "h-[44rem]";
  if (nodeCount <= 12) return "h-[64rem]";
  return "h-[84rem]";
}

function hasWideParallelWave(plan: ReleasePlan): boolean {
  const waves = releaseWaves(plan.steps);
  const counts = new Map<number, number>();
  plan.steps.forEach((step, index) => {
    const wave = waves.get(step.step_id || step.application_id || `step-${index}`) ?? index + 1;
    counts.set(wave, (counts.get(wave) || 0) + 1);
  });
  return [...counts.values()].some((count) => count >= 3);
}
