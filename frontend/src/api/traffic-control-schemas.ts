import { z } from "zod";

import { commandAcceptedSchema } from "./commands-schemas";
import { trafficClusterScopeSchema, trafficScopeCoverageSchema } from "./traffic-overview-schemas";

const trafficSourceActionSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["select", "connect"]),
  label: z.string().min(1),
  enabled: z.boolean(),
  confirmation_required: z.boolean(),
  reason_code: z.string().min(1).nullable(),
});

const trafficSourceSchema = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["available", "not_detected", "error"]),
  version: z.string().min(1).nullable(),
  native: z.boolean(),
  message: z.string().min(1),
  actions: z.array(trafficSourceActionSchema),
});

const detectedClusterSchema = z.strictObject({
  platform: z.string().min(1),
  cni: z.string().min(1),
  dataplane_v2: z.boolean(),
  kubernetes_version: z.string().min(1).nullable(),
});

const trafficClusterSourceCatalogSchema = z.strictObject({
  scope: trafficClusterScopeSchema,
  freshness: z.enum(["live", "stale", "partial", "disconnected"]),
  observed_at: z.string().min(1).nullable(),
  active_source: z.string().min(1).nullable(),
  capability_revision: z.string().regex(/^[0-9a-f]{64}$/u),
  cluster: detectedClusterSchema.nullable(),
  sources: z.array(trafficSourceSchema),
  reason_codes: z.array(z.string().min(1)),
});

export const trafficSourcesSchema = z.strictObject({
  availability: z.enum(["available", "partial", "unavailable"]),
  coverage: trafficScopeCoverageSchema,
  clusters: z.array(trafficClusterSourceCatalogSchema),
  reason_codes: z.array(z.string().min(1)),
});

export const trafficCommandReceiptSchema = commandAcceptedSchema;

export type TrafficSourcesEndpoint = z.infer<typeof trafficSourcesSchema>;
export type TrafficCommandReceiptEndpoint = z.infer<typeof trafficCommandReceiptSchema>;
