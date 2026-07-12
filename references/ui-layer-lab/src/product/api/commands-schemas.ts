import { z } from "zod";

export const commandAcceptedSchema = z.strictObject({
  accepted: z.boolean(),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
});

export type CommandAccepted = z.infer<typeof commandAcceptedSchema>;
