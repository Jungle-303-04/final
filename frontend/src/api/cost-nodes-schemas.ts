import { z } from "zod";

import { costScopeCoverageSchema } from "./cost-overview-schemas";

const nullableMeasurement = z.number().min(0).nullable();
const reasonCodes = z.array(z.string().min(1));

const nodeUsageSchema = z.strictObject({
  availability: z.enum(["available", "partial", "unavailable"]),
  observed_at: z.string().min(1).nullable(),
  cpu_mcores: nullableMeasurement,
  memory_mib: nullableMeasurement,
  cpu_utilization_percent: nullableMeasurement,
  memory_utilization_percent: nullableMeasurement,
  reason_codes: reasonCodes,
}).superRefine((value, context) => {
  const measurements = [
    value.cpu_mcores,
    value.memory_mib,
    value.cpu_utilization_percent,
    value.memory_utilization_percent,
  ];
  const observed = measurements.filter((measurement) => measurement !== null).length;
  if (value.availability === "available" &&
      (value.observed_at === null || observed !== measurements.length || value.reason_codes.length > 0)) {
    context.addIssue({ code: "custom", message: "available node usage requires complete evidence" });
  }
  if (value.availability === "partial" &&
      (value.observed_at === null || observed === 0 || value.reason_codes.length === 0)) {
    context.addIssue({ code: "custom", message: "partial node usage requires measured evidence and reasons" });
  }
  if (value.availability === "unavailable" &&
      (value.observed_at !== null || observed > 0 || value.reason_codes.length === 0)) {
    context.addIssue({ code: "custom", message: "unavailable node usage cannot carry measurements" });
  }
});

const nodePricingSchema = z.strictObject({
  availability: z.literal("unavailable"),
  currency: z.null(),
  hourly_rate_micros: z.null(),
  reason_codes: reasonCodes.min(1),
});

const nodeItemSchema = z.strictObject({
  resource: z.strictObject({
    api_group: z.string(),
    version: z.string(),
    kind: z.literal("Node"),
    namespace: z.null(),
    name: z.string().min(1),
    uid: z.string().min(1),
  }),
  cluster_id: z.string().min(1),
  cluster_name: z.string().min(1),
  provider: z.string().min(1),
  provider_id: z.string().min(1).nullable(),
  instance_type: z.string().min(1).nullable(),
  zone: z.string().min(1).nullable(),
  capacity_type: z.string().min(1).nullable(),
  status: z.string().min(1),
  observed_at: z.string().min(1),
  capacity: z.strictObject({
    cpu_mcores: nullableMeasurement,
    memory_mib: nullableMeasurement,
    pods: z.number().int().min(0).nullable(),
  }),
  usage: nodeUsageSchema,
  pricing: nodePricingSchema,
});

export const costNodePageSchema = z.strictObject({
  scope_coverage: costScopeCoverageSchema,
  items: z.array(nodeItemSchema).max(200),
  total: z.number().int().min(0),
  count_completeness: z.enum(["exact", "partial", "unavailable"]),
  has_more: z.boolean(),
  next_cursor: z.string().min(1).max(8192).nullable(),
  snapshot_revision: z.number().int().min(0),
  pricing_coverage: z.strictObject({
    availability: z.literal("unavailable"),
    reason_codes: reasonCodes.min(1),
  }),
  refresh_after_seconds: z.number().int().min(1).max(3600),
}).superRefine((value, context) => {
  if (value.has_more !== (value.next_cursor !== null)) {
    context.addIssue({ code: "custom", message: "node pagination cursor is inconsistent" });
  }
  if (value.total < value.items.length) {
    context.addIssue({ code: "custom", message: "node total is smaller than the page" });
  }
});

export type CostNodePageEndpoint = z.infer<typeof costNodePageSchema>;
