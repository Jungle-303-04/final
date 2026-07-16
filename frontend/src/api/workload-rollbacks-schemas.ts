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
}).superRefine((preview, context) => {
  if (preview.availability === "available" && (
    preview.completeness !== "exact" ||
    preview.reason !== null ||
    preview.revisions.length === 0
  )) {
    context.addIssue({
      code: "custom",
      message: "available rollback history requires exact revisions without a reason",
      path: ["availability"],
    });
  }
  if (preview.availability === "unavailable" && (
    preview.reason === null ||
    preview.revisions.length > 0 ||
    preview.next_cursor !== null
  )) {
    context.addIssue({
      code: "custom",
      message: "unavailable rollback history cannot expose revisions",
      path: ["availability"],
    });
  }
  const revisions = preview.revisions.map((item) => item.revision);
  const identities = preview.revisions.map((item) =>
    `${item.resource.uid}\u001f${item.resource_version}`);
  if (new Set(revisions).size !== revisions.length ||
    new Set(identities).size !== identities.length) {
    context.addIssue({
      code: "custom",
      message: "rollback revisions must have unique revision and resource identities",
      path: ["revisions"],
    });
  }
});

export type WorkloadRollbackPreviewEndpoint = z.infer<typeof workloadRollbackPreviewSchema>;
