import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

const scopeSchema = z.strictObject({
  workspace_id: nonEmptyString,
  cluster_id: nonEmptyString,
  namespaces: z.array(nonEmptyString),
  freshness: z.enum(["live", "stale", "partial", "disconnected"]),
});

export const homeDashboardEventFrameSchema = z.strictObject({
  kind: z.enum(["connected", "deferred_ready", "heartbeat"]),
  cursor: nonEmptyString.max(8192),
  scope: scopeSchema,
  reconnect_after_ms: z.number().int().min(100).max(30_000),
  snapshot_id: nonEmptyString.optional(),
  occurred_at: z.iso.datetime({ offset: true }).optional(),
}).superRefine((frame, context) => {
  const snapshotFields = [frame.snapshot_id, frame.occurred_at]
    .filter((value) => value !== undefined).length;
  if (
    (frame.kind === "deferred_ready" && snapshotFields !== 2) ||
    (frame.kind !== "deferred_ready" && snapshotFields !== 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "deferred_ready requires exactly one durable snapshot position",
    });
  }
});

export type HomeDashboardEventFrameEndpoint = z.infer<typeof homeDashboardEventFrameSchema>;
