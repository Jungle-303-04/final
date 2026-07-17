import { z } from "zod";

import type { ResourceFileResultEndpoint } from "../features/resource-files/resourceFilesEndpointContract";

const entrySchema = z.strictObject({
  name: z.string().min(1),
  path: z.string().startsWith("/"),
  type: z.enum(["directory", "file", "symlink"]),
  size: z.number().int().nonnegative(),
  permissions: z.string(),
  modified_at: z.string().datetime({ offset: true }).nullable(),
  link_target: z.string().nullable(),
});

const metadataSchema = z.strictObject({
  operation: z.literal("image.metadata"),
  image: z.string().min(1),
  digest: z.string().min(1),
  platform: z.string().min(1).nullable(),
  total_size: z.number().int().nonnegative(),
  layer_count: z.number().int().nonnegative(),
  cached: z.boolean(),
  artifact_id: z.string().nullable(),
  auth_method: z.enum(["anonymous", "pull-secret", "cached"]),
});

const directorySchema = z.strictObject({
  operation: z.enum(["image.list", "pod.list"]),
  path: z.string().startsWith("/"),
  entries: z.array(entrySchema).max(100),
  cursor: z.number().int().nonnegative(),
  next_cursor: z.number().int().nonnegative().nullable(),
  total_entries: z.number().int().nonnegative(),
  truncated: z.boolean(),
  artifact_id: z.string().nullable(),
});

const readSchema = z.strictObject({
  operation: z.enum(["image.read", "pod.read"]),
  path: z.string().startsWith("/"),
  data_base64: z.string(),
  offset: z.number().int().nonnegative(),
  next_offset: z.number().int().nonnegative(),
  eof: z.boolean(),
  total_size: z.number().int().nonnegative().nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  artifact_id: z.string().nullable(),
  media_type: z.string().min(1),
  filename: z.string().min(1),
});

export const resourceFileResultSchema: z.ZodType<ResourceFileResultEndpoint> = z.discriminatedUnion("operation", [
  metadataSchema,
  directorySchema,
  readSchema,
]);

export type { ResourceFileResultEndpoint } from "../features/resource-files/resourceFilesEndpointContract";
