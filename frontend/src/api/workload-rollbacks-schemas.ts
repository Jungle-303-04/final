import { z } from "zod";

const resourceRefSchema = z.strictObject({
  api_group: z.string(),
  version: z.string().min(1),
  kind: z.string().min(1),
  namespace: z.string().min(1).nullable(),
  name: z.string().min(1),
  uid: z.string().min(1),
});

export const workloadRollbackPreviewSchema = z.strictObject({
  availability: z.enum(["available", "unavailable"]),
  completeness: z.enum(["exact", "partial"]),
  reason: z.string().nullable(),
  snapshot_id: z.string().min(1),
  current: z.strictObject({
    resource: resourceRefSchema,
    resource_version: z.string().min(1),
    template_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  }),
  revisions: z.array(z.strictObject({
    revision: z.string().min(1),
    resource: resourceRefSchema,
    resource_version: z.string().min(1),
    created_at: z.string().nullable(),
    template_sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    preview_revision: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    changes: z.array(z.strictObject({
      path: z.string().min(1),
      before: z.string(),
      after: z.string(),
    })).max(200),
  })).max(50),
  next_cursor: z.number().int().positive().nullable(),
});

export type WorkloadRollbackPreviewEndpoint = z.infer<typeof workloadRollbackPreviewSchema>;
