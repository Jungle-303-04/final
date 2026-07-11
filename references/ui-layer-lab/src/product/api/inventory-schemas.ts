import { z } from "zod";

const nullableStringSchema = z.string().nullable();
const unknownRecordSchema = z.record(z.string(), z.unknown());

/**
 * Runtime contract for `InventoryResourceResponse` from
 * `src/packages/contracts/gateway/responses.py`. Nested Kubernetes projections
 * remain unknown until a feature-specific schema narrows them.
 */
export const inventoryResourceSchema = z.strictObject({
  inventory_key: z.string(),
  snapshot_id: z.string(),
  workspace_id: z.string(),
  cluster_id: z.string(),
  resource_type: z.string(),
  api_version: z.string(),
  kind: z.string(),
  namespace: nullableStringSchema,
  name: z.string(),
  uid: nullableStringSchema,
  resource_version: nullableStringSchema,
  status: z.string(),
  health: z.string(),
  labels: unknownRecordSchema,
  annotations: unknownRecordSchema,
  summary: unknownRecordSchema,
  observed_at: nullableStringSchema,
  first_seen_at: nullableStringSchema,
  last_seen_at: nullableStringSchema,
  deleted_at: nullableStringSchema,
  created_at: nullableStringSchema,
  updated_at: nullableStringSchema,
});

/** Runtime contract shared by Home and Resources inventory lists. */
export const inventoryResourceListSchema = z.strictObject({
  cluster_id: z.string(),
  resource_type: nullableStringSchema,
  resources: z.array(inventoryResourceSchema),
});

/** Runtime contract consumed by a Resources inline detail expansion. */
export const inventoryResourceDetailSchema = z.strictObject({
  cluster_id: z.string(),
  identity: unknownRecordSchema,
  resource: inventoryResourceSchema,
  related: z.record(z.string(), z.array(inventoryResourceSchema)),
  events: z.array(inventoryResourceSchema),
});

export type InventoryResource = z.infer<typeof inventoryResourceSchema>;
export type InventoryResourceList = z.infer<typeof inventoryResourceListSchema>;
export type InventoryResourceDetail = z.infer<typeof inventoryResourceDetailSchema>;
