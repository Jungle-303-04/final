import { describe, expect, it } from "vitest";
import type {
  ReleaseApplication,
  ReleaseCluster,
  ReleasePlan,
} from "../../features/gitops/gitOpsContract";
import {
  alignDeploymentBlueprintPositions,
  buildDeploymentBlueprint,
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

const applications: ReleaseApplication[] = [{
  id: "checkout-api",
  name: "Checkout API",
  repository: "team/checkout-api",
  branch: "main",
  clusterId: "prod-seoul",
  manifestPath: "deploy/checkout.yaml",
}];

const clusters: ReleaseCluster[] = [{
  id: "prod-seoul",
  name: "Production Seoul",
  environment: "production",
  connectionStatus: "online",
}, {
  id: "staging-seoul",
  name: "Staging Seoul",
  environment: "staging",
  connectionStatus: "online",
}];

const plan: ReleasePlan = {
  plan_id: "checkout-release",
  name: "Checkout release",
  description: "",
  status: "draft",
  settings: {},
  steps: [{
    step_id: "deploy-checkout",
    application_id: "checkout-api",
    name: "Deploy checkout",
    position: 1,
    depends_on: [],
    config: {},
  }],
};

describe("deploymentBlueprintModel", () => {
  it("keeps the existing target when a repository connects to another cluster", () => {
    const initial = buildDeploymentBlueprint(
      plan,
      applications,
      clusters,
      new Set(["prod-seoul", "staging-seoul"]),
    );

    expect(initial.nodes.map((node) => node.id)).toContain("repository:deploy-checkout");
    expect(initial.edges).toHaveLength(2);
    expect(initial.edges[0]).toMatchObject({
      source: "repository:deploy-checkout",
      target: "deployment:deploy-checkout",
    });
    expect(initial.edges[1]).toMatchObject({
      source: "deployment:deploy-checkout",
      target: "cluster:prod-seoul",
    });

    const connected = connectDeploymentTarget(
      plan,
      "deploy-checkout",
      clusters[1],
      applications[0].clusterId,
    );
    expect(connected.steps[0].config).toMatchObject({
      cluster_id: "prod-seoul",
      cluster_ids: ["prod-seoul", "staging-seoul"],
    });
    const connectedGraph = buildDeploymentBlueprint(
      connected,
      applications,
      clusters,
      new Set(["prod-seoul", "staging-seoul"]),
    );
    expect(connectedGraph.edges.filter((edge) => edge.target.startsWith("cluster:"))
      .map((edge) => edge.target)).toEqual([
      "cluster:prod-seoul",
      "cluster:staging-seoul",
    ]);

    const duplicate = connectDeploymentTarget(
      connected,
      "deploy-checkout",
      clusters[1],
      applications[0].clusterId,
    );
    expect(duplicate.steps[0].config.cluster_ids).toEqual(["prod-seoul", "staging-seoul"]);
  });

  it("removes only the selected edge and keeps both cluster nodes", () => {
    const connected = connectDeploymentTarget(
      plan,
      "deploy-checkout",
      clusters[1],
      applications[0].clusterId,
    );
    const disconnected = disconnectDeploymentTarget(
      connected,
      "deploy-checkout",
      "staging-seoul",
      applications[0].clusterId,
    );
    const graph = buildDeploymentBlueprint(
      disconnected,
      applications,
      clusters,
      new Set(["prod-seoul", "staging-seoul"]),
    );
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.some((edge) => edge.target === "cluster:prod-seoul")).toBe(true);
    expect(graph.nodes.map((node) => node.id)).toContain("cluster:staging-seoul");
  });

  it("disconnects a removed cluster from every repository", () => {
    const connected = connectDeploymentTarget(
      plan,
      "deploy-checkout",
      clusters[1],
      applications[0].clusterId,
    );
    const next = disconnectDeploymentCluster(connected, "prod-seoul", applications);
    expect(next.steps[0].config.cluster_ids).toEqual(["staging-seoul"]);
    expect(next.steps[0].config.cluster_id).toBe("staging-seoul");
  });

  it("disconnects the source edge independently and can restore it", () => {
    const disconnected = disconnectDeploymentSource(plan, "deploy-checkout");
    const graph = buildDeploymentBlueprint(
      disconnected,
      applications,
      clusters,
      new Set(["prod-seoul"]),
    );
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      source: "deployment:deploy-checkout",
      target: "cluster:prod-seoul",
    });
    expect(connectDeploymentSource(disconnected, "deploy-checkout").settings)
      .toMatchObject({ deployment_blueprint_source_links: {} });
  });

  it("removes every edge from a deployment step without removing its three node types", () => {
    const connected = connectDeploymentTarget(
      plan,
      "deploy-checkout",
      clusters[1],
      applications[0].clusterId,
    );
    const disconnected = disconnectDeploymentStep(connected, "deploy-checkout");
    const graph = buildDeploymentBlueprint(
      disconnected,
      applications,
      clusters,
      new Set(["prod-seoul", "staging-seoul"]),
    );
    expect(graph.edges).toHaveLength(0);
    expect(graph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      "repository:deploy-checkout",
      "deployment:deploy-checkout",
      "cluster:prod-seoul",
      "cluster:staging-seoul",
    ]));
  });

  it("removes a repository step and clears dependencies that point to it", () => {
    const dependentPlan: ReleasePlan = {
      ...plan,
      steps: [
        plan.steps[0],
        {
          step_id: "deploy-orders",
          application_id: "orders-api",
          name: "Deploy orders",
          position: 2,
          depends_on: ["checkout-api", "deploy-checkout"],
          config: {},
        },
      ],
    };
    const next = removeDeploymentRepository(dependentPlan, "deploy-checkout");
    expect(next.steps).toHaveLength(1);
    expect(next.steps[0]).toMatchObject({ position: 0, depends_on: [] });
  });

  it("stores positions only in blueprint settings and aligns both columns by port center", () => {
    const positioned = saveDeploymentBlueprintPosition(
      plan,
      "repository:deploy-checkout",
      { x: 123.4, y: 456.7 },
    );
    expect(positioned.settings.deployment_blueprint_positions).toEqual({
      "repository:deploy-checkout": { x: 123, y: 457 },
    });

    const graph = buildDeploymentBlueprint(
      plan,
      applications,
      clusters,
      new Set(["prod-seoul", "staging-seoul"]),
    );
    const aligned = alignDeploymentBlueprintPositions(positioned, graph.nodes);
    expect(aligned.settings.deployment_blueprint_positions).toEqual({
      "repository:deploy-checkout": { x: 64, y: 162 },
      "deployment:deploy-checkout": { x: 440, y: 162 },
      "cluster:prod-seoul": { x: 816, y: 64 },
      "cluster:staging-seoul": { x: 816, y: 260 },
    });
  });
});
