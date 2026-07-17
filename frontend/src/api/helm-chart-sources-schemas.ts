import { z } from "zod";

const nullableObservedAtSchema = z.string().min(1).nullable();

export const helmChartSourceSchema = z.strictObject({
  source_id: z.string().min(1),
  provider: z.enum(["repository", "oci"]),
  name: z.string().min(1),
  reference: z.string().min(1),
  status: z.enum(["active", "disabled"]),
  actions: z.array(z.enum(["refresh", "delete"])).max(2),
  credentials_configured: z.boolean(),
  observed_at: nullableObservedAtSchema,
});

export const helmChartSourcePageSchema = z.strictObject({
  items: z.array(helmChartSourceSchema),
  limit: z.number().int().min(1).max(100),
  has_more: z.boolean(),
  next_cursor: z.string().min(1).max(4096).nullable(),
}).superRefine((value, context) => {
  if (value.has_more !== (value.next_cursor !== null)) {
    context.addIssue({
      code: "custom",
      message: "Helm chart source pagination is inconsistent",
      path: ["next_cursor"],
    });
  }
});

export type HelmChartSourceEndpoint = z.infer<typeof helmChartSourceSchema>;
export type HelmChartSourcePageEndpoint = z.infer<typeof helmChartSourcePageSchema>;

export const helmRepositoryRefreshSchema = z.strictObject({
  source_id: z.string().min(1).max(80),
  chart_count: z.number().int().nonnegative().max(50_000),
  observed_at: z.string().min(1),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
});

export type HelmRepositoryRefreshEndpoint = z.infer<typeof helmRepositoryRefreshSchema>;
