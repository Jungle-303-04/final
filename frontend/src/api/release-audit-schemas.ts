import { z } from "zod";

export const releaseAuditEventSchema = z.object({
  audit_id: z.string().min(1),
  workspace_id: z.string().min(1),
  run_id: z.string().min(1),
  event_type: z.string().min(1),
  message: z.string(),
  actor: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  plan_id: z.string(),
  plan_name: z.string(),
  run_status: z.string(),
  application_ids: z.array(z.string()),
});

export const releaseAuditListSchema = z.object({
  events: z.array(releaseAuditEventSchema),
});

export type ReleaseAuditEventEndpoint = z.infer<typeof releaseAuditEventSchema>;
export type ReleaseAuditListEndpoint = z.infer<typeof releaseAuditListSchema>;
