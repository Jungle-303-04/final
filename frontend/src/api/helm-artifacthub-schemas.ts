import { z } from "zod";

const artifactHubRepositorySchema = z.strictObject({
  name: z.string().min(1).max(253),
  url: z.string().min(1).max(2048),
  official: z.boolean(),
  verified_publisher: z.boolean(),
});

export const artifactHubChartSchema = z.strictObject({
  package_id: z.string().min(1).max(253),
  name: z.string().min(1).max(253),
  version: z.string().min(1).max(256),
  app_version: z.string().max(256).nullable(),
  description: z.string().max(4096).nullable(),
  stars: z.number().int().nonnegative(),
  deprecated: z.boolean(),
  signed: z.boolean(),
  repository: artifactHubRepositorySchema,
});

export const artifactHubSearchPageSchema = z.strictObject({
  items: z.array(artifactHubChartSchema).max(60),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(60),
  has_more: z.boolean(),
  observed_at: z.string().min(1),
}).superRefine((value, context) => {
  if (value.has_more !== (value.offset + value.items.length < value.total)) {
    context.addIssue({ code: "custom", message: "ArtifactHub pagination is inconsistent", path: ["has_more"] });
  }
});

export const artifactHubChartDetailSchema = z.strictObject({
  chart: artifactHubChartSchema,
  readme: z.string().max(262_144).nullable(),
  available_versions: z.array(z.strictObject({
    version: z.string().min(1).max(256),
    app_version: z.string().max(256).nullable(),
  })).max(200),
  versions_truncated: z.boolean(),
  observed_at: z.string().min(1),
});

export type ArtifactHubChartEndpoint = z.infer<typeof artifactHubChartSchema>;
export type ArtifactHubSearchPageEndpoint = z.infer<typeof artifactHubSearchPageSchema>;
export type ArtifactHubChartDetailEndpoint = z.infer<typeof artifactHubChartDetailSchema>;
