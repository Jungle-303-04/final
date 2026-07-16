import { z } from "zod";

export const resourceDeletionRefSchema = z.strictObject({
  api_group: z.string(),
  version: z.string().min(1),
  kind: z.string().min(1),
  namespace: z.string().min(1).nullable(),
  name: z.string().min(1),
  uid: z.string().min(1),
  resource_version: z.string().min(1),
});

export const resourceDeletionPreviewSchema = z.strictObject({
  root: resourceDeletionRefSchema,
  dependents: z.array(resourceDeletionRefSchema).max(200),
  revision: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  truncated: z.literal(false),
  max_dependents: z.number().int().min(1).max(200),
});

export type ResourceDeletionPreviewEndpoint = z.infer<typeof resourceDeletionPreviewSchema>;
