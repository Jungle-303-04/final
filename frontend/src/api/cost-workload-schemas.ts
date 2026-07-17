import { z } from "zod";

import { costTrendSchema } from "./cost-overview-schemas";

const maxSafeIntegerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const optionalBasisPointsSchema = z.number().int().min(0).max(10_000).nullable();
const optionalWindowSchema = z.number().int().min(1).max(86_400).nullable();

const costCurrentAllocationSchema = z.strictObject({
  replicas: z.number().int().min(0).max(100_000),
  hourly_rate_micros: maxSafeIntegerSchema,
  projected_daily_micros: maxSafeIntegerSchema,
  projected_monthly_micros: maxSafeIntegerSchema,
  cpu_rate_micros: maxSafeIntegerSchema,
  memory_rate_micros: maxSafeIntegerSchema,
  cpu_allocation_use_basis_points: optionalBasisPointsSchema,
  memory_allocation_use_basis_points: optionalBasisPointsSchema,
  cpu_usage_window_seconds: optionalWindowSchema,
  memory_usage_window_seconds: optionalWindowSchema,
}).superRefine((current, context) => {
  if (current.cpu_rate_micros + current.memory_rate_micros > current.hourly_rate_micros) {
    context.addIssue({ code: "custom", message: "component rates exceed the total" });
  }
  if ((current.cpu_allocation_use_basis_points === null) !== (current.cpu_usage_window_seconds === null)) {
    context.addIssue({ code: "custom", message: "CPU use and window must be available together" });
  }
  if ((current.memory_allocation_use_basis_points === null) !== (current.memory_usage_window_seconds === null)) {
    context.addIssue({ code: "custom", message: "memory use and window must be available together" });
  }
});

const costObservedWorkloadSchema = z.strictObject({
  availability: z.enum(["available", "partial"]),
  observed_at: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  current: costCurrentAllocationSchema,
  trend: costTrendSchema,
  reason_codes: z.array(z.string().min(1)),
}).superRefine((workload, context) => {
  if (workload.availability === "partial" && workload.reason_codes.length === 0) {
    context.addIssue({ code: "custom", message: "partial workload cost requires reasons" });
  }
  if (workload.trend.availability !== "unavailable" && workload.trend.currency !== workload.currency) {
    context.addIssue({ code: "custom", message: "current and trend currencies must match" });
  }
  if (new Set(workload.reason_codes).size !== workload.reason_codes.length) {
    context.addIssue({ code: "custom", message: "workload cost reasons must be unique" });
  }
});

const costUnavailableWorkloadSchema = z.strictObject({
  availability: z.literal("unavailable"),
  reason_codes: z.array(z.string().min(1)).min(1).max(20),
}).superRefine((workload, context) => {
  if (new Set(workload.reason_codes).size !== workload.reason_codes.length) {
    context.addIssue({ code: "custom", message: "workload cost reasons must be unique" });
  }
});

export const costWorkloadAllocationSchema = z.union([
  costObservedWorkloadSchema,
  costUnavailableWorkloadSchema,
]);

export type CostWorkloadAllocationEndpoint = z.infer<typeof costWorkloadAllocationSchema>;
