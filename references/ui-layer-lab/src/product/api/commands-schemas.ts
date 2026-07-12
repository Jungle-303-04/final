import { z } from "zod";

export const commandAcceptedSchema = z.strictObject({
  accepted: z.boolean(),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
  // null = recorded approval is required, so the worker cannot derive the ID at submission time.
  command_id: z.string().nullable(),
});

export type CommandAccepted = z.infer<typeof commandAcceptedSchema>;
