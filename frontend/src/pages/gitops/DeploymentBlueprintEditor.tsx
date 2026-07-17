import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { findPortReconnectEdge } from "./deploymentBlueprintPortReconnect";
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
  const [frontNodeId, setFrontNodeId] = useState<string | null>(null);
  const graph = useMemo(
    () => buildDeploymentBlueprint(plan, applications, clusters, visibleClusterIds),
    [applications, clusters, plan, visibleClusterIds],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<DeploymentBlueprintNode>(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DeploymentBlueprintEdge>(graph.edges);
  const [flow, setFlow] = useState<ReactFlowInstance<DeploymentBlueprintNode, DeploymentBlueprintEdge>>();
  const reconnectingEdgeIdRef = useRef<string | null>(null);
  const reconnectSucceededRef = useRef(false);

  useEffect(() => setNodes(graph.nodes), [graph.nodes, setNodes]);
  useEffect(() => setEdges(graph.edges), [graph.edges, setEdges]);

  const hiddenClusters = useMemo(
    () => clusters.filter((cluster) => !visibleClusterIds.has(cluster.id)),
    [clusters, visibleClusterIds],
  );
  const layeredNodes = useMemo(() => nodes.map((node, index) => ({
    ...node,
    zIndex: node.id === frontNodeId ? nodes.length + 1 : index,
  })), [frontNodeId, nodes]);
  const nodeLayerOrder = useMemo(() => layeredNodes
    .map((node) => ({ id: node.id, zIndex: node.zIndex ?? 0 }))
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((node) => node.id), [layeredNodes]);

  const connectPlan = useCallback((currentPlan: ReleasePlan, connection: Connection) => {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (sourceNode?.data.kind === "repository" && targetNode?.data.kind === "deployment") {
      if (sourceNode.data.stepId && sourceNode.data.stepId === targetNode.data.stepId) {
        return connectDeploymentSource(currentPlan, sourceNode.data.stepId);
      }
      return currentPlan;
    }
    const stepId = sourceNode?.data.kind === "deployment" ? sourceNode.data.stepId : undefined;
    const clusterId = targetNode?.data.kind === "cluster" ? targetNode.data.clusterId : undefined;
    const cluster = clusters.find((candidate) => candidate.id === clusterId);
    if (!stepId || !cluster) return currentPlan;
    const application = applications.find((candidate) => (
      candidate.id === sourceNode?.data.applicationId
    ));
    return connectDeploymentTarget(currentPlan, stepId, cluster, application?.clusterId);
  }, [applications, clusters, nodes]);

  const disconnectEdgeFromPlan = useCallback((
    currentPlan: ReleasePlan,
    edge: DeploymentBlueprintEdge,
  ) => {
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
  }, [applications, nodes]);

  const applyConnection = useCallback((connection: Connection) => {
    const nextPlan = connectPlan(plan, connection);
    if (nextPlan !== plan) onChange(nextPlan);
  }, [connectPlan, onChange, plan]);

  const reconnect: OnReconnect<DeploymentBlueprintEdge> = useCallback((edge, connection) => {
    reconnectSucceededRef.current = true;
    const disconnected = disconnectEdgeFromPlan(plan, edge);
    onChange(connectPlan(disconnected, connection));
  }, [connectPlan, disconnectEdgeFromPlan, onChange, plan]);

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
      !edges.some((edge) => edge.id !== reconnectingEdgeIdRef.current &&
        edge.source === connection.source && edge.target === connection.target));
  }, [edges, nodes]);

  const deleteEdges = useCallback((deletedEdges: DeploymentBlueprintEdge[]) => {
    const nextPlan = deletedEdges.reduce((currentPlan, edge) => {
      return disconnectEdgeFromPlan(currentPlan, edge);
    }, plan);
    if (nextPlan !== plan) onChange(nextPlan);
  }, [disconnectEdgeFromPlan, onChange, plan]);

  const beginInputReconnect = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const handle = target.closest<HTMLElement>(".react-flow__handle.target");
    if (!handle) return;

    const edge = findPortReconnectEdge(edges, {
      handleId: handle.dataset.handleid ?? null,
      handleType: "target",
      nodeId: handle.dataset.nodeid ?? null,
    }, nodeLayerOrder);

    event.preventDefault();
    event.stopPropagation();
    if (!edge) return;

    const edgeElement = Array.from(
      event.currentTarget.querySelectorAll<SVGGElement>(".react-flow__edge"),
    ).find((candidate) => candidate.dataset.id === edge.id);
    const targetUpdater = edgeElement?.querySelector<SVGCircleElement>(
      ".react-flow__edgeupdater-target",
    );
    if (!targetUpdater) return;

    targetUpdater.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      view: window,
    }));
  }, [edges, nodeLayerOrder]);

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
    <Surface aria-label={t("workflows.blueprint.label")} className="overflow-hidden border-border/80 shadow-sm">
      <DeploymentBlueprintHeader
        clusterCount={visibleClusterIds.size}
        onFit={fitCanvas}
        onAlign={alignLayout}
        sourceCount={plan.steps.length}
      />

      <div className="min-w-0 bg-muted/20 pb-px">
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
            className="m-3 h-[44rem] min-w-0 overflow-hidden rounded-xl border border-black/[0.06] bg-[var(--blueprint-canvas)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] [&_.react-flow__attribution]:hidden [&_.react-flow__controls]:overflow-hidden [&_.react-flow__controls]:rounded-xl [&_.react-flow__controls]:border [&_.react-flow__controls]:border-black/10 [&_.react-flow__controls]:shadow-[0_2px_8px_rgba(0,0,0,0.08)] [&_.react-flow__controls-button]:!border-zinc-200 [&_.react-flow__controls-button]:!bg-white/95 [&_.react-flow__controls-button]:!fill-zinc-800 [&_.react-flow__controls-button:hover]:!bg-zinc-100 [&_.react-flow__edge.selected_.react-flow__edge-path]:!stroke-zinc-500 [&_.react-flow__edge:hover_.react-flow__edge-path]:!stroke-zinc-600 [&_.react-flow__minimap]:!rounded-xl [&_.react-flow__minimap]:!border [&_.react-flow__minimap]:!border-black/10 [&_.react-flow__minimap]:!bg-white/95 [&_.react-flow__minimap]:!shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            onMouseDownCapture={beginInputReconnect}
          >
          <ReactFlow
            colorMode="light"
            connectionLineStyle={{ stroke: "var(--blueprint-connection)", strokeWidth: 3 }}
            connectionLineType={ConnectionLineType.Bezier}
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
            nodes={layeredNodes}
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
              setFrontNodeId(node.id);
              closeNodeMenu();
              if (event.altKey && !node.data.placeholder) {
                disconnectNode(node);
              }
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
            onNodeDragStart={(_event, node) => setFrontNodeId(node.id)}
            onNodesChange={onNodesChange}
            onPaneClick={() => {
              closeNodeMenu();
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeNodeMenu();
            }}
            onReconnect={reconnect}
            onReconnectEnd={(_event, edge) => {
              if (!reconnectSucceededRef.current) deleteEdges([edge]);
              reconnectingEdgeIdRef.current = null;
            }}
            onReconnectStart={(_event, edge) => {
              reconnectingEdgeIdRef.current = edge.id;
              reconnectSucceededRef.current = false;
            }}
            elevateNodesOnSelect={false}
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
            <Background color="var(--blueprint-grid)" gap={20} id="blueprint-grid" size={1.25} variant={BackgroundVariant.Dots} />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              maskColor="var(--blueprint-minimap-mask)"
              nodeColor={(node: Node) => node.data?.kind === "cluster"
                ? "var(--blueprint-cluster)"
                : node.data?.kind === "deployment"
                  ? "var(--blueprint-deployment)"
                  : "var(--blueprint-source)"}
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
