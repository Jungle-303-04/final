import { z } from "zod";

const nullableStringSchema = z.string().nullable();
const nullableNumberSchema = z.number().nullable();

export const clusterWorkloadHealthItemSchema = z.strictObject({
  name: z.string(),
  kind: z.string(),
  namespace: nullableStringSchema,
  health: z.string(),
  ready: z.string(),
  restarts: z.number().int(),
});

export const clusterWarningEventItemSchema = z.strictObject({
  namespace: nullableStringSchema,
  name: z.string(),
  reason: nullableStringSchema,
  message: nullableStringSchema,
  involved_kind: nullableStringSchema,
  involved_name: nullableStringSchema,
  count: z.number().int(),
  last_seen_at: nullableStringSchema,
});

export const clusterOpenIncidentItemSchema = z.strictObject({
  incident_id: z.string(),
  correlation_id: z.string(),
  symptom: nullableStringSchema,
  root_cause: nullableStringSchema,
  namespace: nullableStringSchema,
  resource_kind: nullableStringSchema,
  resource_name: nullableStringSchema,
  status: z.string(),
  created_at: nullableStringSchema,
});

export const clusterUsageSnapshotSchema = z.strictObject({
  sampled_at: nullableStringSchema,
  pods_running: z.number().int(),
  pods_total: z.number().int().optional(),
  nodes_ready: z.number().int(),
  nodes_total: z.number().int(),
  restart_total: z.number().int(),
  cpu_pct: nullableNumberSchema,
  mem_pct: nullableNumberSchema,
});

export const clusterSummaryDetailSchema = z.strictObject({
  cluster_id: z.string(),
  name: z.string(),
  health: z.string(),
  workloads: z.record(z.string(), z.array(clusterWorkloadHealthItemSchema)),
  warning_events: z.array(clusterWarningEventItemSchema),
  open_incidents: z.array(clusterOpenIncidentItemSchema),
  usage: clusterUsageSnapshotSchema.nullable(),
});

const homeInsightCoverageSchema = z.strictObject({
  availability: z.enum(["available", "partial", "unavailable"]),
  observed_at: nullableStringSchema,
  reason_codes: z.array(z.string().min(1)),
}).superRefine((value, context) => {
  if (value.availability !== "available" && value.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "incomplete Home insight coverage requires reasons" });
  }
});

const homeInsightResourceRefSchema = z.strictObject({
  api_group: z.string(),
  version: z.string(),
  kind: z.string().min(1),
  namespace: nullableStringSchema,
  name: z.string().min(1),
  uid: z.string().min(1),
});

const homeTopologyPreviewSchema = z.strictObject({
  coverage: homeInsightCoverageSchema,
  node_count: z.number().int().nonnegative().nullable(),
  edge_count: z.number().int().nonnegative().nullable(),
  omitted_node_count: z.number().int().nonnegative().nullable(),
  omitted_edge_count: z.number().int().nonnegative().nullable(),
  relation_completeness: z.enum(["exact", "partial", "unavailable"]),
});

const homeProviderAvailabilitySchema = z.strictObject({
  coverage: homeInsightCoverageSchema,
});

const homeNetworkPolicyCoverageSchema = z.strictObject({
  coverage: homeInsightCoverageSchema,
  total_policies: z.number().int().nonnegative().nullable(),
  covered_workloads: z.number().int().nonnegative().nullable(),
  total_workloads: z.number().int().nonnegative().nullable(),
});

const homeGitOpsSummarySchema = z.strictObject({
  coverage: homeInsightCoverageSchema,
  controller_count: z.number().int().nonnegative().nullable(),
  provider_counts: z.record(z.string().min(1), z.number().int().positive()),
  health_counts: z.record(z.string().min(1), z.number().int().positive()),
});

const homeAuditSummarySchema = z.strictObject({
  coverage: homeInsightCoverageSchema,
  total_check_count: z.number().int().nonnegative().nullable(),
  total_finding_count: z.number().int().nonnegative().nullable(),
  severity_counts: z.record(z.string(), z.number().int().positive()),
});

export const homeInsightsSchema = z.strictObject({
  cluster_id: z.string().min(1),
  topology: homeTopologyPreviewSchema,
  explore: z.strictObject({
    traffic: homeProviderAvailabilitySchema,
    cost: homeProviderAvailabilitySchema,
  }),
  posture: z.strictObject({
    network_policy: homeNetworkPolicyCoverageSchema,
    gitops: homeGitOpsSummarySchema,
    audit: homeAuditSummarySchema,
  }),
  custom_resources: z.strictObject({
    coverage: homeInsightCoverageSchema,
    items: z.array(z.strictObject({
      api_group: z.string().min(1),
      version: z.string().min(1),
      kind: z.string().min(1),
      count: z.number().int().positive(),
    })).max(20),
    total_kinds: z.number().int().nonnegative().nullable(),
    total_resources: z.number().int().nonnegative().nullable(),
    has_more: z.boolean(),
  }),
  helm: z.strictObject({
    coverage: homeInsightCoverageSchema,
    release_count: z.number().int().nonnegative().nullable(),
    status_counts: z.record(z.string().min(1), z.number().int().positive()),
  }),
  certificate_expiry: z.strictObject({
    coverage: homeInsightCoverageSchema,
    items: z.array(z.strictObject({
      secret: homeInsightResourceRefSchema,
      source_certificate: homeInsightResourceRefSchema,
      not_after: z.string().min(1),
      status: z.enum(["valid", "expiring", "expired"]),
      seconds_remaining: z.number().int(),
      observed_at: nullableStringSchema,
    })).max(20),
    tls_secret_count: z.number().int().nonnegative().nullable(),
    observed_expiry_count: z.number().int().nonnegative().nullable(),
    expiring_count: z.number().int().nonnegative().nullable(),
    expired_count: z.number().int().nonnegative().nullable(),
    earliest_expiry: nullableStringSchema,
    warning_before_seconds: z.number().int().min(1).max(315_360_000),
    has_more: z.boolean(),
  }),
  refresh_after_seconds: z.number().int().min(1).max(3600),
}).superRefine((value, context) => {
  const customUnavailable = value.custom_resources.coverage.availability === "unavailable";
  if (customUnavailable !== (value.custom_resources.total_kinds === null)) {
    context.addIssue({ code: "custom", message: "custom resource totals must match coverage" });
  }
  if (customUnavailable !== (value.custom_resources.total_resources === null)) {
    context.addIssue({ code: "custom", message: "custom resource totals must match coverage" });
  }
  const visibleCustomTotal = value.custom_resources.items.reduce(
    (total, item) => total + item.count,
    0,
  );
  if (
    customUnavailable && (
      value.custom_resources.items.length > 0 || value.custom_resources.has_more
    )
  ) {
    context.addIssue({ code: "custom", message: "unavailable custom resources cannot expose rows" });
  }
  if (
    value.custom_resources.total_kinds !== null &&
    value.custom_resources.total_kinds < value.custom_resources.items.length
  ) {
    context.addIssue({ code: "custom", message: "custom resource total kinds is too small" });
  }
  if (
    value.custom_resources.total_resources !== null &&
    value.custom_resources.total_resources < visibleCustomTotal
  ) {
    context.addIssue({ code: "custom", message: "custom resource total is too small" });
  }
  if (
    value.custom_resources.has_more !== (
      value.custom_resources.total_kinds !== null &&
      value.custom_resources.total_kinds > value.custom_resources.items.length
    )
  ) {
    context.addIssue({ code: "custom", message: "custom resource has_more is inconsistent" });
  }
  const helmUnavailable = value.helm.coverage.availability === "unavailable";
  if (helmUnavailable !== (value.helm.release_count === null)) {
    context.addIssue({ code: "custom", message: "Helm release count must match coverage" });
  }
  const statusTotal = Object.values(value.helm.status_counts).reduce(
    (total, count) => total + count,
    0,
  );
  if (helmUnavailable && Object.keys(value.helm.status_counts).length > 0) {
    context.addIssue({ code: "custom", message: "unavailable Helm coverage cannot expose statuses" });
  }
  if (
    Object.keys(value.helm.status_counts).length > 20 ||
    Object.keys(value.helm.status_counts).some(
      (status) => status.trim() === "" || status.length > 120,
    )
  ) {
    context.addIssue({ code: "custom", message: "Helm status counts are not bounded" });
  }
  if (value.helm.release_count !== null && statusTotal > value.helm.release_count) {
    context.addIssue({ code: "custom", message: "Helm status counts exceed release count" });
  }
  const certificate = value.certificate_expiry;
  const certificateUnavailable = certificate.coverage.availability === "unavailable";
  const certificateCounts = [
    certificate.tls_secret_count,
    certificate.observed_expiry_count,
    certificate.expiring_count,
    certificate.expired_count,
  ];
  if (certificateUnavailable && (
    certificateCounts.some((count) => count !== null) ||
    certificate.items.length > 0 ||
    certificate.earliest_expiry !== null ||
    certificate.has_more
  )) {
    context.addIssue({ code: "custom", message: "unavailable certificate coverage exposes data" });
  }
  if (!certificateUnavailable && certificateCounts.some((count) => count === null)) {
    context.addIssue({ code: "custom", message: "observed certificate coverage requires counts" });
  }
  if (
    certificate.observed_expiry_count !== null &&
    certificate.tls_secret_count !== null &&
    certificate.observed_expiry_count > certificate.tls_secret_count
  ) {
    context.addIssue({ code: "custom", message: "certificate observations exceed TLS Secrets" });
  }
  if (
    certificate.observed_expiry_count !== null &&
    certificate.expiring_count !== null &&
    certificate.expired_count !== null &&
    certificate.expiring_count + certificate.expired_count >
      certificate.observed_expiry_count
  ) {
    context.addIssue({ code: "custom", message: "certificate health counts exceed observations" });
  }
  if (
    !certificateUnavailable && (
      certificate.observed_expiry_count === 0 ||
      certificate.earliest_expiry === null
    )
  ) {
    context.addIssue({ code: "custom", message: "certificate coverage lacks an expiry" });
  }
  if (
    certificate.has_more !== (
      certificate.observed_expiry_count !== null &&
      certificate.observed_expiry_count > certificate.items.length
    )
  ) {
    context.addIssue({ code: "custom", message: "certificate has_more is inconsistent" });
  }
});

export const nodeSummaryItemSchema = z.strictObject({
  name: z.string(),
  ready: z.boolean(),
  health: z.string(),
  kubernetes_version: nullableStringSchema,
  pods_running: z.number().int(),
  pods_capacity: z.number().int(),
  cpu_pct: nullableNumberSchema,
  mem_pct: nullableNumberSchema,
  restarts_recent: z.number().int(),
  conditions: z.array(z.string()),
});

export const clusterNodesSummarySchema = z.strictObject({
  cluster_id: z.string(),
  nodes: z.array(nodeSummaryItemSchema),
});

export const podSummaryItemSchema = z.strictObject({
  name: z.string(),
  namespace: z.string(),
  phase: z.string(),
  health: z.string(),
  ready: z.string(),
  restarts: z.number().int(),
  owner_kind: nullableStringSchema,
  owner_name: nullableStringSchema,
  cpu_mcores: nullableNumberSchema,
  mem_mib: nullableNumberSchema,
  incident_correlation_id: nullableStringSchema,
});

export const nodePodsSummarySchema = z.strictObject({
  cluster_id: z.string(),
  node_name: z.string(),
  pods: z.array(podSummaryItemSchema),
});

export type ClusterSummaryDetail = z.infer<typeof clusterSummaryDetailSchema>;
export type HomeInsightsEndpoint = z.infer<typeof homeInsightsSchema>;
export type ClusterNodesSummary = z.infer<typeof clusterNodesSummarySchema>;
export type NodePodsSummary = z.infer<typeof nodePodsSummarySchema>;
export type ClusterWorkloadHealthItem = z.infer<typeof clusterWorkloadHealthItemSchema>;
export type NodeSummaryItem = z.infer<typeof nodeSummaryItemSchema>;
export type PodSummaryItem = z.infer<typeof podSummaryItemSchema>;
