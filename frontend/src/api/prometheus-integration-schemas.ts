import { z } from "zod";

const commandStatusSchema = z.enum([
  "queued",
  "leased",
  "running",
  "cancel_requested",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
]);

export const prometheusIntegrationReceiptSchema = z.strictObject({
  accepted: z.literal(true),
  command_id: z.string().min(1),
  event_id: z.string().min(1),
  audit_event_id: z.string().min(1),
  correlation_id: z.string().min(1),
  status: commandStatusSchema,
  audit_id: z.string().min(1).nullable().optional(),
}).refine((receipt) => receipt.audit_event_id === receipt.event_id, {
  message: "audit event must be the accepted integration event",
});

export const prometheusIntegrationStatusSchema = z.strictObject({
  cluster_id: z.string().min(1),
  revision: z.string().min(1).nullable(),
  operation_id: z.string().min(1).nullable(),
  address: z.string().url().nullable(),
  header_keys: z.array(z.string().min(1)),
  state: z.enum(["unconfigured", "pending", "connected", "failed"]),
  error_code: z.string().min(1).nullable(),
  receipt: prometheusIntegrationReceiptSchema.nullable().optional(),
});

export type PrometheusIntegrationEndpoint = z.infer<typeof prometheusIntegrationStatusSchema>;
export type PrometheusIntegrationReceiptEndpoint = z.infer<
  typeof prometheusIntegrationReceiptSchema
>;
