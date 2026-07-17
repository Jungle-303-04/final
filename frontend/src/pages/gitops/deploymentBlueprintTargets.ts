import type {
  ReleaseApplication,
  ReleaseCluster,
  ReleasePlan,
  ReleasePlanStep,
} from "../../features/gitops/gitOpsContract";
import { applicationForStep, configString, stepKey } from "../../features/gitops/workflowModel";

const positionsSettingKey = "deployment_blueprint_positions";
const sourceLinksSettingKey = "deployment_blueprint_source_links";

export function deploymentSourceConnected(plan: ReleasePlan, stepId: string): boolean {
  const links = sourceLinks(plan.settings);
  return links[stepId] !== false;
}

export function connectDeploymentSource(plan: ReleasePlan, stepId: string): ReleasePlan {
  const links = sourceLinks(plan.settings);
  const { [stepId]: _detached, ...remainingLinks } = links;
  return {
    ...plan,
    settings: {
      ...plan.settings,
      [sourceLinksSettingKey]: remainingLinks,
    },
  };
}

export function disconnectDeploymentSource(plan: ReleasePlan, stepId: string): ReleasePlan {
  return {
    ...plan,
    settings: {
      ...plan.settings,
      [sourceLinksSettingKey]: {
        ...sourceLinks(plan.settings),
        [stepId]: false,
      },
    },
  };
}

export function deploymentClusterIds(
  step: ReleasePlanStep,
  application?: ReleaseApplication,
): string[] {
  return configuredClusterIds(step, application?.clusterId || "");
}

export function connectDeploymentTarget(
  plan: ReleasePlan,
  stepId: string,
  cluster: ReleaseCluster,
  fallbackClusterId = "",
): ReleasePlan {
  return updateStep(plan, stepId, (step) => {
    const clusterIds = configuredClusterIds(step, fallbackClusterId);
    const nextClusterIds = [...new Set([...clusterIds, cluster.id])];
    const environments = configuredClusterEnvironments(step, clusterIds);
    environments[cluster.id] = cluster.environment;
    return withDeploymentTargets(step, nextClusterIds, environments);
  });
}

export function disconnectDeploymentTarget(
  plan: ReleasePlan,
  stepId: string,
  clusterId: string,
  fallbackClusterId = "",
): ReleasePlan {
  return updateStep(plan, stepId, (step) => {
    const clusterIds = configuredClusterIds(step, fallbackClusterId);
    const nextClusterIds = clusterIds.filter((candidate) => candidate !== clusterId);
    const environments = configuredClusterEnvironments(step, clusterIds);
    delete environments[clusterId];
    return withDeploymentTargets(step, nextClusterIds, environments);
  });
}

export function disconnectDeploymentStep(plan: ReleasePlan, stepId: string): ReleasePlan {
  const withoutSource = disconnectDeploymentSource(plan, stepId);
  return updateStep(withoutSource, stepId, (step) => withDeploymentTargets(step, [], {}));
}

export function disconnectDeploymentCluster(
  plan: ReleasePlan,
  clusterId: string,
  applications: ReleaseApplication[],
): ReleasePlan {
  return plan.steps.reduce((currentPlan, step, index) => {
    const application = applicationForStep(step, applications);
    const stepId = stepKey(step, index);
    return deploymentClusterIds(step, application).includes(clusterId)
      ? disconnectDeploymentTarget(currentPlan, stepId, clusterId, application?.clusterId)
      : currentPlan;
  }, plan);
}

export function removeDeploymentRepository(plan: ReleasePlan, stepId: string): ReleasePlan {
  const targetIndex = plan.steps.findIndex((step, index) => stepKey(step, index) === stepId);
  if (targetIndex < 0) return plan;
  const target = plan.steps[targetIndex];
  const dependencyKeys = new Set<string>(
    [stepId, target.step_id, target.application_id]
      .filter((value): value is string => Boolean(value)),
  );
  const steps = plan.steps
    .filter((_step, index) => index !== targetIndex)
    .map((step, position) => ({
      ...step,
      position,
      depends_on: step.depends_on.filter((dependency) => !dependencyKeys.has(dependency)),
    }));
  return {
    ...plan,
    settings: withoutSourceLink(
      withoutNodePosition(
        withoutNodePosition(plan.settings, `repository:${stepId}`),
        `deployment:${stepId}`,
      ),
      stepId,
    ),
    steps,
  };
}

function updateStep(
  plan: ReleasePlan,
  targetStepId: string,
  update: (step: ReleasePlanStep) => ReleasePlanStep,
): ReleasePlan {
  return {
    ...plan,
    steps: plan.steps.map((step, index) => (
      stepKey(step, index) === targetStepId ? update(step) : step
    )),
  };
}

function configuredClusterIds(step: ReleasePlanStep, fallbackClusterId: string): string[] {
  if (Object.prototype.hasOwnProperty.call(step.config, "cluster_ids")) {
    const value = step.config.cluster_ids;
    return Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => (
        typeof item === "string" && Boolean(item.trim())
      )))]
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(step.config, "cluster_id")) {
    const clusterId = configString(step, "cluster_id", "");
    return clusterId ? [clusterId] : [];
  }
  return fallbackClusterId ? [fallbackClusterId] : [];
}

function configuredClusterEnvironments(
  step: ReleasePlanStep,
  clusterIds: string[],
): Record<string, string> {
  const value = step.config.cluster_environments;
  const environments = typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => (
      typeof entry[1] === "string"
    )))
    : {};
  const primaryEnvironment = configString(step, "environment", "");
  if (clusterIds[0] && primaryEnvironment && !environments[clusterIds[0]]) {
    environments[clusterIds[0]] = primaryEnvironment;
  }
  return environments;
}

function withDeploymentTargets(
  step: ReleasePlanStep,
  clusterIds: string[],
  environments: Record<string, string>,
): ReleasePlanStep {
  const primaryClusterId = clusterIds[0] || "";
  return {
    ...step,
    config: {
      ...step.config,
      cluster_ids: clusterIds,
      cluster_id: primaryClusterId,
      cluster_environments: environments,
      environment: primaryClusterId ? environments[primaryClusterId] || "" : "",
    },
  };
}

function withoutNodePosition(
  settings: Record<string, unknown>,
  nodeId: string,
): Record<string, unknown> {
  const value = settings[positionsSettingKey];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return settings;
  if (!Object.prototype.hasOwnProperty.call(value, nodeId)) return settings;
  const positions = value as Record<string, unknown>;
  const { [nodeId]: _position, ...remainingPositions } = positions;
  return { ...settings, [positionsSettingKey]: remainingPositions };
}

function sourceLinks(settings: Record<string, unknown>): Record<string, boolean> {
  const value = settings[sourceLinksSettingKey];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => (
    typeof entry[1] === "boolean"
  )));
}

function withoutSourceLink(
  settings: Record<string, unknown>,
  stepId: string,
): Record<string, unknown> {
  const links = sourceLinks(settings);
  if (!Object.prototype.hasOwnProperty.call(links, stepId)) return settings;
  const { [stepId]: _link, ...remainingLinks } = links;
  return { ...settings, [sourceLinksSettingKey]: remainingLinks };
}
