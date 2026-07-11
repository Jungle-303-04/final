import { z } from "zod";

const jsonMapSchema = z.record(z.string(), z.unknown());

/** Runtime contract for `GET /clusters/{cluster_id}/inventory/summary`. */
export const inventorySummarySchema = z.strictObject({
  cluster_id: z.string(),
  latest_snapshot: jsonMapSchema.nullable(),
  counts: z.array(jsonMapSchema),
});

export type InventorySummary = z.infer<typeof inventorySummarySchema>;
