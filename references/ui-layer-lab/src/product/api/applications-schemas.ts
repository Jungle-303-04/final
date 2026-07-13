import { z } from "zod";

const jsonMapSchema = z.record(z.string(), z.unknown());

export const applicationSchema = jsonMapSchema;
export const applicationListSchema = z.strictObject({
  applications: z.array(applicationSchema),
});
export const applicationResponseSchema = z.strictObject({
  application: applicationSchema,
});

export const deploymentBindingListSchema = z.strictObject({
  deployments: z.array(jsonMapSchema),
});
export const workflowRunListSchema = z.strictObject({
  runs: z.array(jsonMapSchema),
});

export type Application = z.infer<typeof applicationSchema>;
export type ApplicationList = z.infer<typeof applicationListSchema>;
export type ApplicationResponse = z.infer<typeof applicationResponseSchema>;
export type DeploymentBindingList = z.infer<typeof deploymentBindingListSchema>;
export type WorkflowRunList = z.infer<typeof workflowRunListSchema>;
