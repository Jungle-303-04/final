import { z } from "zod";

/** Shared response for a GitOps approval decision event. */
export const approvalDecisionResponseSchema = z.strictObject({
  accepted: z.boolean(),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
});

export type ApprovalDecisionResponse = z.infer<
  typeof approvalDecisionResponseSchema
>;
