import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnReconnect,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ReleaseApplication,
  ReleaseCluster,
  ReleasePlan,
} from "../../features/gitops/gitOpsContract";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { DeploymentBlueprintHeader } from "./DeploymentBlueprintHeader";
import { DeploymentBlueprintNodeCard } from "./DeploymentBlueprintNode";
import { DeploymentBlueprintNodeMenu } from "./DeploymentBlueprintNodeMenu";
import { DeploymentBlueprintSidebar } from "./DeploymentBlueprintSidebar";
import {
  alignDeploymentBlueprintPositions,
  buildDeploymentBlueprint,
  deploymentTargetClusterIds,
  saveDeploymentBlueprintPosition,
} from "./deploymentBlueprintModel";
import {
  connectDeploymentSource,
  connectDeploymentTarget,
  disconnectDeploymentCluster,
  disconnectDeploymentSource,
  disconnectDeploymentStep,
  disconnectDeploymentTarget,
  removeDeploymentRepository,
} from "./deploymentBlueprintTargets";
import type {
  DeploymentBlueprintEdge,
  DeploymentBlueprintNode,
} from "./deploymentBlueprintTypes";

const nodeTypes: NodeTypes = { deploymentBlueprint: DeploymentBlueprintNodeCard };
const proOptions = { hideAttribution: true } as const;
const fitViewOptions = { padding: 0.2, minZoom: 0.42, maxZoom: 1 } as const;

interface DeploymentBlueprintEditorProps {
  applications: ReleaseApplication[];
  clusters: ReleaseCluster[];
  onChange: (plan: ReleasePlan) => void;
  plan: ReleasePlan;
}

export function DeploymentBlueprintEditor({
  applications,
  clusters,
  onChange,
  plan,
}: DeploymentBlueprintEditorProps) {
  const { t } = useI18n();
  const referencedClusterIds = useMemo(
    () => deploymentTargetClusterIds(plan, applications),
    [applications, plan],
  );
  const [visibleClusterIds, setVisibleClusterIds] = useState<Set<string>>(() => {
    const initial = new Set(referencedClusterIds);
    if (initial.size === 0 && clusters[0]) initial.add(clusters[0].id);
    return initial;
  });
  const [nodeMenu, setNodeMenu] = useState<DeploymentBlueprintNode | null>(null);
  const graph = useMemo(
    () => buildDeploymentBlueprint(plan, applications, clusters, visibleClusterIds),
    [applications, clusters, plan, visibleClusterIds],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<DeploymentBlueprintNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DeploymentBlueprintEdge>(graph.edges);
  const [flow, setFlow] = useState<ReactFlowInstance<DeploymentBlueprintNode, DeploymentBlueprintEdge>>();

  useEffect(() => setNodes(graph.nodes), [graph.nodes, setNodes]);
  useEffect(() => setEdges(graph.edges), [graph.edges, setEdges]);

  const hiddenClusters = useMemo(
    () => clusters.filter((cluster) => !visibleClusterIds.has(cluster.id)),
    [clusters, visibleClusterIds],
  );

  const applyConnection = useCallback((connection: Connection) => {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (sourceNode?.data.kind === "repository" && targetNode?.data.kind === "deployment") {
      if (sourceNode.data.stepId && sourceNode.data.stepId === targetNode.data.stepId) {
        onChange(connectDeploymentSource(plan, sourceNode.data.stepId));
      }
      return;
    }
    const stepId = sourceNode?.data.kind === "deployment" ? sourceNode.data.stepId : undefined;
    const clusterId = targetNode?.data.kind === "cluster" ? targetNode.data.clusterId : undefined;
    const cluster = clusters.find((candidate) => candidate.id === clusterId);
    if (!stepId || !cluster) return;
    const application = applications.find((candidate) => (
      candidate.id === sourceNode?.data.applicationId
    ));
    onChange(connectDeploymentTarget(plan, stepId, cluster, application?.clusterId));
  }, [applications, clusters, nodes, onChange, plan]);

  const reconnect: OnReconnect<DeploymentBlueprintEdge> = useCallback((edge, connection) => {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const previousTarget = nodes.find((node) => node.id === edge.target);
    const nextTarget = nodes.find((node) => node.id === connection.target);
    const stepId = sourceNode?.data.kind === "deployment" ? sourceNode.data.stepId : undefined;
    const previousClusterId = previousTarget?.data.kind === "cluster"
      ? previousTarget.data.clusterId
      : undefined;
    const nextClusterId = nextTarget?.data.kind === "cluster" ? nextTarget.data.clusterId : undefined;
    const nextCluster = clusters.find((candidate) => candidate.id === nextClusterId);
    const application = applications.find((candidate) => (
      candidate.id === sourceNode?.data.applicationId
    ));
    if (!stepId || !previousClusterId || !nextCluster) return;
    const disconnected = disconnectDeploymentTarget(
      plan,
      stepId,
      previousClusterId,
      application?.clusterId,
    );
    onChange(connectDeploymentTarget(disconnected, stepId, nextCluster));
  }, [applications, clusters, nodes, onChange, plan]);

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    const repositoryToDeployment = sourceNode?.data.kind === "repository" &&
      targetNode?.data.kind === "deployment" &&
      sourceNode.data.stepId === targetNode.data.stepId;
    const deploymentToCluster = sourceNode?.data.kind === "deployment" &&
      targetNode?.data.kind === "cluster";
    return Boolean(sourceNode && targetNode && !sourceNode.data.placeholder &&
      !targetNode.data.placeholder && (repositoryToDeployment || deploymentToCluster) &&
      !edges.some((edge) => edge.source === connection.source && edge.target === connection.target));
  }, [edges, nodes]);

  const deleteEdges = useCallback((deletedEdges: DeploymentBlueprintEdge[]) => {
    const nextPlan = deletedEdges.reduce((currentPlan, edge) => {
      const sourceNode = nodes.find((node) => node.id === edge.source);
      const targetNode = nodes.find((node) => node.id === edge.target);
      const stepId = sourceNode?.data.stepId;
      if (sourceNode?.data.kind === "repository" && targetNode?.data.kind === "deployment") {
        return stepId ? disconnectDeploymentSource(currentPlan, stepId) : currentPlan;
      }
      const clusterId = targetNode?.data.kind === "cluster" ? targetNode.data.clusterId : undefined;
      const application = applications.find((candidate) => (
        candidate.id === sourceNode?.data.applicationId
      ));
      return sourceNode?.data.kind === "deployment" && stepId && clusterId
        ? disconnectDeploymentTarget(currentPlan, stepId, clusterId, application?.clusterId)
        : currentPlan;
    }, plan);
    if (nextPlan !== plan) onChange(nextPlan);
  }, [applications, nodes, onChange, plan]);

  const addClusterNode = useCallback((clusterId: string) => {
    setVisibleClusterIds((current) => new Set([...current, clusterId]));
    requestAnimationFrame(() => {
      void flow?.fitView(fitViewOptions);
    });
  }, [flow]);

  const closeNodeMenu = useCallback(() => setNodeMenu(null), []);

  const disconnectNode = useCallback((node: DeploymentBlueprintNode) => {
    if (node.data.kind === "repository" && node.data.stepId) {
      onChange(disconnectDeploymentSource(plan, node.data.stepId));
    } else if (node.data.kind === "deployment" && node.data.stepId) {
      onChange(disconnectDeploymentStep(plan, node.data.stepId));
    } else if (node.data.kind === "cluster" && node.data.clusterId) {
      onChange(disconnectDeploymentCluster(plan, node.data.clusterId, applications));
    }
  }, [applications, onChange, plan]);

  const deleteNode = useCallback((node: DeploymentBlueprintNode) => {
    if (node.data.kind !== "cluster" && node.data.stepId) {
      onChange(removeDeploymentRepository(plan, node.data.stepId));
      return;
    }
    if (node.data.kind === "cluster" && node.data.clusterId) {
      const clusterId = node.data.clusterId;
      setVisibleClusterIds((current) => {
        const next = new Set(current);
        next.delete(clusterId);
        return next;
      });
      onChange(disconnectDeploymentCluster(plan, clusterId, applications));
    }
  }, [applications, onChange, plan]);

  const alignLayout = useCallback(() => {
    onChange(alignDeploymentBlueprintPositions(plan, nodes));
    requestAnimationFrame(() => {
      void flow?.fitView(fitViewOptions);
    });
  }, [flow, nodes, onChange, plan]);

  const fitCanvas = useCallback(() => {
    void flow?.fitView(fitViewOptions);
  }, [flow]);

  return (
    <Surface aria-label={t("workflows.blueprint.label")} className="overflow-hidden">
      <DeploymentBlueprintHeader
        clusterCount={visibleClusterIds.size}
        onFit={fitCanvas}
        onAlign={alignLayout}
        sourceCount={plan.steps.length}
      />

      <div className="min-w-0">
        <DeploymentBlueprintSidebar
          clusters={clusters}
          hiddenClusters={hiddenClusters}
          onAddCluster={addClusterNode}
        />
        <DeploymentBlueprintNodeMenu
          node={nodeMenu}
          onClose={closeNodeMenu}
          onDelete={deleteNode}
        >
          <div
            aria-label={t("workflows.blueprint.canvas")}
            className="h-[44rem] min-w-0 bg-[var(--blueprint-canvas)] [&_.react-flow__attribution]:hidden [&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-lg [&_.react-flow__controls]:border [&_.react-flow__controls]:border-slate-700 [&_.react-flow__controls-button]:!border-slate-700 [&_.react-flow__controls-button]:!bg-slate-900 [&_.react-flow__controls-button]:!fill-slate-200 [&_.react-flow__minimap]:!rounded-lg [&_.react-flow__minimap]:!border [&_.react-flow__minimap]:!border-slate-700 [&_.react-flow__minimap]:!bg-slate-950/90"
          >
          <ReactFlow
            colorMode="dark"
            connectionLineStyle={{ stroke: "var(--blueprint-connection)", strokeWidth: 2 }}
            deleteKeyCode={["Backspace", "Delete"]}
            edges={edges}
            edgesReconnectable
            elevateEdgesOnSelect
            fitView
            fitViewOptions={fitViewOptions}
            isValidConnection={isValidConnection}
            maxZoom={1.5}
            minZoom={0.3}
            nodeTypes={nodeTypes}
            nodes={nodes}
            nodesConnectable
            nodesDraggable
            onConnect={applyConnection}
            onEdgeClick={(event, edge) => {
              closeNodeMenu();
              if (event.altKey) deleteEdges([edge]);
            }}
            onEdgesChange={onEdgesChange}
            onEdgesDelete={deleteEdges}
            onInit={setFlow}
            onNodeClick={(event, node) => {
              closeNodeMenu();
              if (event.altKey && !node.data.placeholder) disconnectNode(node);
            }}
            onNodeContextMenu={(event, node) => {
              if (node.data.placeholder) {
                event.preventDefault();
                event.stopPropagation();
                return;
              }
              setNodeMenu(node);
            }}
            onNodeDragStop={(_event, node) => {
              if (!node.data.placeholder) {
                onChange(saveDeploymentBlueprintPosition(plan, node.id, node.position));
              }
            }}
            onNodesChange={onNodesChange}
            onPaneClick={closeNodeMenu}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeNodeMenu();
            }}
            onReconnect={reconnect}
            onlyRenderVisibleElements
            panOnDrag
            panOnScroll={false}
            proOptions={proOptions}
            reconnectRadius={28}
            selectionOnDrag={false}
            snapGrid={[16, 16]}
            snapToGrid
            zoomOnDoubleClick={false}
            zoomOnPinch
            zoomOnScroll
          >
            <Background color="var(--blueprint-grid)" gap={24} id="blueprint-grid" size={1.1} variant={BackgroundVariant.Dots} />
            <Background color="var(--blueprint-grid-major)" gap={96} id="blueprint-major-grid" lineWidth={1.2} size={1} variant={BackgroundVariant.Lines} />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              maskColor="var(--blueprint-minimap-mask)"
              nodeColor={(node: Node) => node.data?.kind === "cluster"
                ? "var(--blueprint-cluster)"
                : node.data?.kind === "deployment"
                  ? "#a78bfa"
                  : "var(--blueprint-connection)"}
              pannable
              position="bottom-right"
              zoomable
            />
          </ReactFlow>
          </div>
        </DeploymentBlueprintNodeMenu>

      </div>
    </Surface>
  );
}
