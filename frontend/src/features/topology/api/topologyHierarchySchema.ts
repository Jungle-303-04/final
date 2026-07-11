import { z } from "zod";

import type { TopologyHierarchySnapshot } from "../contracts";

const nonBlankString = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, "must not be blank");

const canonicalDecimal = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u, "must be a canonical non-negative decimal string");

const positiveDecimal = canonicalDecimal.refine(
  (value) => !/^0(?:\.0+)?$/u.test(value),
  "state=value must be greater than zero; use state=zero for zero",
);

const rfc3339Timestamp = z.iso.datetime({ offset: true });
const utcRfc3339Timestamp = z.iso.datetime();
const safeNonnegativeMilliseconds = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);

const healthLevelSchema = z.enum([
  "healthy",
  "neutral",
  "degraded",
  "unhealthy",
  "unknown",
]);

const metricValueSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("value"),
    valueDecimal: positiveDecimal,
    unitId: nonBlankString,
  }),
  z.object({
    state: z.literal("zero"),
    valueDecimal: z.literal("0"),
    unitId: nonBlankString,
  }),
  z.object({
    state: z.enum(["missing", "forbidden", "unsupported"]),
    valueDecimal: z.null(),
    unitId: nonBlankString,
    reason: nonBlankString,
  }),
]);

const metricsSchema = z.record(nonBlankString, metricValueSchema);

const entityBaseShape = {
  entityKey: nonBlankString,
  displayName: nonBlankString,
  health: healthLevelSchema,
  healthReason: nonBlankString,
  metrics: metricsSchema,
} as const;

const podSchema = z.object({
  ...entityBaseShape,
  kind: z.literal("pod"),
  resourceUid: nonBlankString,
  namespace: nonBlankString,
  phase: nonBlankString,
});

const nodeSchema = z.object({
  ...entityBaseShape,
  kind: z.literal("node"),
  resourceUid: nonBlankString,
  pods: z.array(podSchema),
});

const clusterSchema = z.object({
  ...entityBaseShape,
  kind: z.literal("cluster"),
  clusterUid: nonBlankString,
  environmentLabel: nonBlankString,
  nodes: z.array(nodeSchema),
});

const areaMetricDescriptorSchema = z.object({
  metricId: nonBlankString,
  label: nonBlankString,
  unitId: nonBlankString,
  additive: z.literal(true),
  order: z
    .number()
    .int()
    .min(Number.MIN_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER),
});

const completenessSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("complete") }),
  z.object({
    state: z.literal("partial"),
    reasons: z.array(nonBlankString).min(1),
  }),
]);

const statusReasonSchema = z.object({
  code: nonBlankString,
  messageKey: nonBlankString,
  detail: z.string().nullable(),
});

const freshnessCommonShape = {
  receivedAt: utcRfc3339Timestamp,
  staleAfterMs: safeNonnegativeMilliseconds,
} as const;

const freshnessSchema = z.discriminatedUnion("state", [
  z.object({
    ...freshnessCommonShape,
    state: z.literal("fresh"),
    observedAt: rfc3339Timestamp,
    ageMs: safeNonnegativeMilliseconds,
    reason: z.null(),
  }),
  z.object({
    ...freshnessCommonShape,
    state: z.literal("stale"),
    observedAt: rfc3339Timestamp,
    ageMs: safeNonnegativeMilliseconds,
    reason: statusReasonSchema,
  }),
  z.object({
    ...freshnessCommonShape,
    state: z.literal("unknown"),
    observedAt: z.null(),
    ageMs: z.null(),
    reason: statusReasonSchema,
  }),
]);

export const liveTopologyHierarchySnapshotSchema = z.object({
  schemaVersion: z.literal("topology-hierarchy/v1"),
  workspaceId: nonBlankString,
  snapshotRevision: nonBlankString,
  observedAt: rfc3339Timestamp,
  dataOrigin: z.object({
    kind: z.literal("live"),
    adapterId: nonBlankString,
  }),
  areaMetrics: z.array(areaMetricDescriptorSchema).min(1),
  defaultAreaMetricId: nonBlankString,
  clusters: z.array(clusterSchema),
  completeness: completenessSchema,
  freshness: freshnessSchema,
});

export const topologyHierarchySnapshotResponseSchema = z.object({
  data: liveTopologyHierarchySnapshotSchema,
});

export type TopologyResponseValidationIssue = {
  readonly path: string;
  readonly message: string;
};

export class TopologyResponseValidationError extends Error {
  readonly issues: readonly TopologyResponseValidationIssue[];

  constructor(issues: readonly TopologyResponseValidationIssue[]) {
    super("Topology hierarchy response violates the canonical contract");
    this.name = "TopologyResponseValidationError";
    this.issues = issues;
  }
}

type LiveSnapshotExpectations = {
  readonly workspaceId: string;
  readonly adapterId: string;
};

function issue(path: string, message: string): TopologyResponseValidationIssue {
  return { path, message };
}

/**
 * Runtime validation at the HTTP boundary.
 *
 * Structural parsing alone is insufficient for a treemap: duplicate identities,
 * an absent default metric, or a missing metric state would make entities vanish
 * or map to the wrong tile. These cross-field rules therefore reject the whole
 * response instead of letting a component guess.
 */
export function parseLiveTopologyHierarchyResponse(
  input: unknown,
  expectations: LiveSnapshotExpectations,
): TopologyHierarchySnapshot {
  const parsed = topologyHierarchySnapshotResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new TopologyResponseValidationError(
      parsed.error.issues.map((entry) =>
        issue(entry.path.join("."), entry.message),
      ),
    );
  }

  const snapshot = parsed.data.data;
  const issues: TopologyResponseValidationIssue[] = [];

  if (snapshot.workspaceId !== expectations.workspaceId) {
    issues.push(
      issue(
        "data.workspaceId",
        "must equal the authenticated workspace requested in the URL",
      ),
    );
  }
  if (snapshot.dataOrigin.adapterId !== expectations.adapterId) {
    issues.push(
      issue(
        "data.dataOrigin.adapterId",
        "must equal the configured live adapter ID",
      ),
    );
  }

  const snapshotObservedAtMs = Date.parse(snapshot.observedAt);
  const receivedAtMs = Date.parse(snapshot.freshness.receivedAt);
  if (snapshotObservedAtMs > receivedAtMs) {
    issues.push(
      issue(
        "data.freshness.receivedAt",
        "must be greater than or equal to the snapshot projection observedAt",
      ),
    );
  }

  if (snapshot.freshness.state !== "unknown") {
    const sourceObservedAtMs = Date.parse(snapshot.freshness.observedAt);
    const calculatedAgeMs = receivedAtMs - sourceObservedAtMs;

    if (snapshot.freshness.ageMs !== calculatedAgeMs) {
      issues.push(
        issue(
          "data.freshness.ageMs",
          "must equal receivedAt minus freshness.observedAt in integer milliseconds",
        ),
      );
    }
    if (
      sourceObservedAtMs > snapshotObservedAtMs ||
      snapshotObservedAtMs > receivedAtMs
    ) {
      issues.push(
        issue(
          "data.freshness",
          "timestamps must satisfy freshness.observedAt <= snapshot observedAt <= receivedAt",
        ),
      );
    }
    if (
      snapshot.freshness.state === "fresh" &&
      snapshot.freshness.ageMs > snapshot.freshness.staleAfterMs
    ) {
      issues.push(
        issue(
          "data.freshness.state",
          "fresh requires ageMs less than or equal to staleAfterMs",
        ),
      );
    }
    if (
      snapshot.freshness.state === "stale" &&
      snapshot.freshness.ageMs <= snapshot.freshness.staleAfterMs
    ) {
      issues.push(
        issue(
          "data.freshness.state",
          "stale requires ageMs greater than staleAfterMs",
        ),
      );
    }
  }

  const metricDescriptors = new Map(
    snapshot.areaMetrics.map((descriptor) => [descriptor.metricId, descriptor]),
  );
  const metricOrders = new Set(
    snapshot.areaMetrics.map((descriptor) => descriptor.order),
  );
  if (metricDescriptors.size !== snapshot.areaMetrics.length) {
    issues.push(issue("data.areaMetrics", "metricId values must be unique"));
  }
  if (metricOrders.size !== snapshot.areaMetrics.length) {
    issues.push(
      issue(
        "data.areaMetrics",
        "order values must be unique so every client renders the same catalog order",
      ),
    );
  }
  if (!metricDescriptors.has(snapshot.defaultAreaMetricId)) {
    issues.push(
      issue(
        "data.defaultAreaMetricId",
        "must reference one areaMetrics entry",
      ),
    );
  }

  const entityKeys = new Set<string>();
  const clusterUids = new Set<string>();
  const resourceUids = new Set<string>();

  const validateEntity = (
    entity: {
      readonly entityKey: string;
      readonly metrics: Readonly<
        Record<
          string,
          { readonly unitId: string; readonly state: string }
        >
      >;
    },
    path: string,
  ) => {
    if (entityKeys.has(entity.entityKey)) {
      issues.push(issue(`${path}.entityKey`, "must be globally unique"));
    }
    entityKeys.add(entity.entityKey);

    for (const descriptor of snapshot.areaMetrics) {
      const value = entity.metrics[descriptor.metricId];
      if (value === undefined) {
        issues.push(
          issue(
            `${path}.metrics.${descriptor.metricId}`,
            "must explicitly provide value, zero, missing, forbidden, or unsupported",
          ),
        );
      } else if (value.unitId !== descriptor.unitId) {
        issues.push(
          issue(
            `${path}.metrics.${descriptor.metricId}.unitId`,
            `must equal area metric unit ${descriptor.unitId}`,
          ),
        );
      }
    }
  };

  snapshot.clusters.forEach((cluster, clusterIndex) => {
    const clusterPath = `data.clusters.${clusterIndex}`;
    validateEntity(cluster, clusterPath);
    if (clusterUids.has(cluster.clusterUid)) {
      issues.push(issue(`${clusterPath}.clusterUid`, "must be unique"));
    }
    clusterUids.add(cluster.clusterUid);

    cluster.nodes.forEach((node, nodeIndex) => {
      const nodePath = `${clusterPath}.nodes.${nodeIndex}`;
      validateEntity(node, nodePath);
      if (resourceUids.has(node.resourceUid)) {
        issues.push(
          issue(`${nodePath}.resourceUid`, "must be unique in the snapshot"),
        );
      }
      resourceUids.add(node.resourceUid);

      node.pods.forEach((pod, podIndex) => {
        const podPath = `${nodePath}.pods.${podIndex}`;
        validateEntity(pod, podPath);
        if (resourceUids.has(pod.resourceUid)) {
          issues.push(
            issue(`${podPath}.resourceUid`, "must be unique in the snapshot"),
          );
        }
        resourceUids.add(pod.resourceUid);
      });
    });
  });

  if (issues.length > 0) {
    throw new TopologyResponseValidationError(issues);
  }

  return snapshot;
}
