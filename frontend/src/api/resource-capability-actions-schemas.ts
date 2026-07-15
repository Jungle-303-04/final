import { z } from "zod";

export const resourceActionAcceptedSchema = z.strictObject({
  accepted: z.literal(true),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
  command_id: z.string().min(1).nullable().optional(),
});

export type ResourceActionAccepted = z.infer<typeof resourceActionAcceptedSchema>;
