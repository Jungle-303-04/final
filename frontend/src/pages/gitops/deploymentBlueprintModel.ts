import type { XYPosition } from "@xyflow/react";
import type {
  ReleaseApplication,
  ReleaseCluster,
  ReleasePlan,
} from "../../features/gitops/gitOpsContract";
import { applicationForStep, stepKey } from "../../features/gitops/workflowModel";
import {
  deploymentClusterIds,
  deploymentSourceConnected,
} from "./deploymentBlueprintTargets";
import type {
  DeploymentBlueprintEdge,
  DeploymentBlueprintNode,
} from "./deploymentBlueprintTypes";

const positionsSettingKey = "deployment_blueprint_positions";
const alignedColumnX = { cluster: 816, deployment: 440, repository: 64 } as const;
const alignedLayoutTop = 64;
const alignedNodeHeight = { cluster: 162, deployment: 162, repository: 162 } as const;
const alignedRowPitch = 196;

export interface DeploymentBlueprintGraph {
  edges: DeploymentBlueprintEdge[];
  nodes: DeploymentBlueprintNode[];
}

export function deploymentTargetClusterIds(
  plan: ReleasePlan,
  applications: ReleaseApplication[],
): string[] {
  const ids = plan.steps.flatMap((step) => (
    deploymentClusterIds(step, applicationForStep(step, applications))
  ));
  return [...new Set(ids)];
}

export function buildDeploymentBlueprint(
  plan: ReleasePlan,
  applications: ReleaseApplication[],
  clusters: ReleaseCluster[],
  visibleClusterIds: ReadonlySet<string>,
): DeploymentBlueprintGraph {
  const positions = readPositions(plan);
  const repositoryNodes: DeploymentBlueprintNode[] = plan.steps.map((step, index) => {
    const application = applicationForStep(step, applications);
    const stepId = stepKey(step, index);
    const id = repositoryNodeId(stepId);
    return {
      id,
      type: "deploymentBlueprint",
      position: positions[id] ?? { x: 64, y: 64 + index * 196 },
      draggable: true,
      deletable: false,
      data: {
        kind: "repository",
        title: application?.name || step.name || step.application_id,
        subtitle: application?.repository || "owner/repository",
        applicationId: step.application_id,
        branch: application?.branch || "main",
        connected: deploymentSourceConnected(plan, stepId),
        connectionCount: deploymentSourceConnected(plan, stepId) ? 1 : 0,
        placeholder: false,
        stepId,
      },
    };
  });

  if (repositoryNodes.length === 0) {
    repositoryNodes.push({
      id: "placeholder:repository",
      type: "deploymentBlueprint",
      position: positions["placeholder:repository"] ?? { x: 64, y: 144 },
      draggable: true,
      deletable: false,
      connectable: false,
      data: {
        kind: "repository",
        title: "",
        subtitle: "owner/repository",
        branch: "main",
        connected: false,
        placeholder: true,
      },
    });
  }

  const deploymentNodes: DeploymentBlueprintNode[] = plan.steps.map((step, index) => {
    const application = applicationForStep(step, applications);
    const targetClusterIds = deploymentClusterIds(step, application);
    const stepId = stepKey(step, index);
    const id = deploymentNodeId(stepId);
    return {
      id,
      type: "deploymentBlueprint",
      position: positions[id] ?? { x: 440, y: 64 + index * 196 },
      draggable: true,
      deletable: false,
      data: {
        kind: "deployment",
        title: step.name || application?.name || step.application_id,
        subtitle: application?.manifestPath || "deploy/manifest.yaml",
        applicationId: step.application_id,
        branch: application?.branch || "main",
        connected: targetClusterIds.length > 0,
        connectionCount: targetClusterIds.length,
        manifestPath: application?.manifestPath || "deploy/manifest.yaml",
        placeholder: false,
        stepId,
      },
    };
  });

  if (deploymentNodes.length === 0) {
    deploymentNodes.push({
      id: "placeholder:deployment",
      type: "deploymentBlueprint",
      position: positions["placeholder:deployment"] ?? { x: 440, y: 144 },
      draggable: true,
      deletable: false,
      connectable: false,
      data: {
        kind: "deployment",
        title: "",
        subtitle: "deploy/manifest.yaml",
        connected: false,
        connectionCount: 0,
        manifestPath: "deploy/manifest.yaml",
        placeholder: true,
      },
    });
  }

  const nodes: DeploymentBlueprintNode[] = [...repositoryNodes, ...deploymentNodes];

  const clustersById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const referencedIds = deploymentTargetClusterIds(plan, applications);
  const clusterIds = [...new Set([...visibleClusterIds, ...referencedIds])];
  clusterIds.forEach((clusterId, index) => {
    const cluster = clustersById.get(clusterId);
    const id = clusterNodeId(clusterId);
    nodes.push({
      id,
      type: "deploymentBlueprint",
      position: positions[id] ?? { x: 816, y: 64 + index * 180 },
      draggable: true,
      deletable: false,
      data: {
        kind: "cluster",
        title: cluster?.name || clusterId,
        subtitle: clusterId,
        clusterId,
        connected: plan.steps.some((step) => (
          deploymentClusterIds(step, applicationForStep(step, applications)).includes(clusterId)
        )),
        connectionStatus: cluster?.connectionStatus || "unknown",
        environment: cluster?.environment || "unknown",
        placeholder: !cluster,
      },
    });
  });

  if (clusterIds.length === 0) {
    nodes.push({
      id: "placeholder:cluster",
      type: "deploymentBlueprint",
      position: positions["placeholder:cluster"] ?? { x: 816, y: 144 },
      draggable: true,
      deletable: false,
      connectable: false,
      data: {
        kind: "cluster",
        title: "",
        subtitle: "cluster-id",
        connected: false,
        connectionStatus: "unknown",
        environment: "environment",
        placeholder: true,
      },
    });
  }

  const edges: DeploymentBlueprintEdge[] = [];
  plan.steps.forEach((step, index) => {
    const application = applicationForStep(step, applications);
    const stepId = stepKey(step, index);
    const repository = repositoryNodeId(stepId);
    const deployment = deploymentNodeId(stepId);
    if (deploymentSourceConnected(plan, stepId)) {
      edges.push({
        id: `deployment-source:${repository}:${deployment}`,
        source: repository,
        sourceHandle: "output",
        target: deployment,
        targetHandle: "input",
        type: "default",
        reconnectable: false,
        style: { stroke: "var(--blueprint-connection)", strokeWidth: 2 },
      });
    }
    deploymentClusterIds(step, application).forEach((clusterId) => {
      if (!clusterIds.includes(clusterId)) return;
      const target = clusterNodeId(clusterId);
      edges.push({
        id: `deployment-target:${deployment}:${target}`,
        source: deployment,
        sourceHandle: "output",
        target,
        targetHandle: "input",
        type: "default",
        reconnectable: true,
        style: { stroke: "var(--blueprint-connection)", strokeWidth: 2 },
      });
    });
  });

  return { edges, nodes };
}

export function saveDeploymentBlueprintPosition(
  plan: ReleasePlan,
  nodeId: string,
  position: XYPosition,
): ReleasePlan {
  const positions = readPositions(plan);
  return {
    ...plan,
    settings: {
      ...plan.settings,
      [positionsSettingKey]: {
        ...positions,
        [nodeId]: { x: Math.round(position.x), y: Math.round(position.y) },
      },
    },
  };
}

export function alignDeploymentBlueprintPositions(
  plan: ReleasePlan,
  nodes: DeploymentBlueprintNode[],
): ReleasePlan {
  const repositories = nodes.filter((node) => node.data.kind === "repository");
  const deployments = nodes.filter((node) => node.data.kind === "deployment");
  const clusters = nodes.filter((node) => node.data.kind === "cluster");
  const rowCount = Math.max(repositories.length, deployments.length, clusters.length, 1);
  const firstRowCenter = alignedLayoutTop + alignedNodeHeight.repository / 2;
  const positions = [...alignedColumnPositions(repositories, "repository", rowCount, firstRowCenter),
    ...alignedColumnPositions(deployments, "deployment", rowCount, firstRowCenter),
    ...alignedColumnPositions(clusters, "cluster", rowCount, firstRowCenter)];

  return {
    ...plan,
    settings: {
      ...plan.settings,
      [positionsSettingKey]: Object.fromEntries(positions),
    },
  };
}

function alignedColumnPositions(
  nodes: DeploymentBlueprintNode[],
  kind: "cluster" | "deployment" | "repository",
  rowCount: number,
  firstRowCenter: number,
): [string, XYPosition][] {
  const columnOffset = (rowCount - nodes.length) * alignedRowPitch / 2;
  return nodes.map((node, index) => {
    const height = node.measured?.height || alignedNodeHeight[kind];
    const centerY = firstRowCenter + columnOffset + index * alignedRowPitch;
    return [node.id, {
      x: alignedColumnX[kind],
      y: Math.round(centerY - height / 2),
    }];
  });
}

function readPositions(plan: ReleasePlan): Record<string, XYPosition> {
  const candidate = plan.settings[positionsSettingKey];
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return {};
  return Object.fromEntries(Object.entries(candidate).flatMap(([id, value]) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
    const x = "x" in value ? value.x : undefined;
    const y = "y" in value ? value.y : undefined;
    return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
      ? [[id, { x, y }]]
      : [];
  }));
}

function repositoryNodeId(stepId: string): string {
  return `repository:${stepId}`;
}

function deploymentNodeId(stepId: string): string {
  return `deployment:${stepId}`;
}

function clusterNodeId(clusterId: string): string {
  return `cluster:${clusterId}`;
}
