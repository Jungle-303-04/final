import { z } from "zod";

/** Runtime contract for `GET /repositories/connection-status`. */
export const repositoryConnectionStatusSchema = z.strictObject({
  repo_ref: z.string().min(1),
  repository_id: z.string().min(1).nullable().optional(),
  repository_status: z.enum([
    "unregistered",
    "active",
    "invalid_credential",
    "disabled",
    "unknown",
  ]),
  connection_stage: z.enum(["awaiting_validation", "ready", "error"]),
  terminal: z.boolean(),
  refresh_after_seconds: z.number().min(0.25).max(30).nullable(),
});

export type RepositoryConnectionStatus = z.infer<
  typeof repositoryConnectionStatusSchema
>;
