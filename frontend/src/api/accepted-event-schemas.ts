import { z } from "zod";

/** Shared receipt for an immediate, durably audited configuration mutation. */
export const acceptedConfigMutationSchema = z.strictObject({
  accepted: z.literal(true),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
  command_id: z.null(),
});

export type AcceptedConfigMutationEndpoint = z.infer<typeof acceptedConfigMutationSchema>;
