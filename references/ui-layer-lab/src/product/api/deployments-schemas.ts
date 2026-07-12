import { z } from "zod";

export const deploymentActionAcceptedSchema = z.strictObject({
  accepted: z.boolean(),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
});

export type DeploymentActionAccepted = z.infer<
  typeof deploymentActionAcceptedSchema
>;
