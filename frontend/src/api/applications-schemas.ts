import { z } from "zod";

const jsonMapSchema = z.record(z.string(), z.unknown());

export const promotionGateSchema = z
  .strictObject({
    eligible: z.boolean(),
    command_status: z.string(),
    command_completed: z.boolean(),
    applied: z.boolean().nullable(),
    applied_not_false: z.boolean(),
    failed_resources: z.array(jsonMapSchema),
    failed_resource_count: z.number().int().nonnegative(),
    rollout_ready: z.boolean().nullable(),
    rollout_ready_not_false: z.boolean(),
  })
  .superRefine((gate, context) => {
    if (gate.failed_resource_count !== gate.failed_resources.length) {
      context.addIssue({
        code: "custom",
        path: ["failed_resource_count"],
        message: "failed resource count must match the resource list",
      });
    }
    if (gate.applied_not_false !== (gate.applied !== false)) {
      context.addIssue({
        code: "custom",
        path: ["applied_not_false"],
        message: "applied_not_false contradicts applied",
      });
    }
    if (gate.rollout_ready_not_false !== (gate.rollout_ready !== false)) {
      context.addIssue({
        code: "custom",
        path: ["rollout_ready_not_false"],
        message: "rollout_ready_not_false contradicts rollout_ready",
      });
    }
    const expectedEligible =
      gate.command_completed &&
      gate.applied_not_false &&
      gate.failed_resource_count === 0 &&
      gate.rollout_ready_not_false;
    if (gate.eligible !== expectedEligible) {
      context.addIssue({
        code: "custom",
        path: ["eligible"],
        message: "eligible contradicts the promotion gate conditions",
      });
    }
  });

export const workflowRunSchema = z.looseObject({
  promotion_gate: promotionGateSchema.nullable().optional(),
});

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
  runs: z.array(workflowRunSchema),
});

export type Application = z.infer<typeof applicationSchema>;
export type ApplicationList = z.infer<typeof applicationListSchema>;
export type ApplicationResponse = z.infer<typeof applicationResponseSchema>;
export type DeploymentBindingList = z.infer<typeof deploymentBindingListSchema>;
export type PromotionGate = z.infer<typeof promotionGateSchema>;
export type WorkflowRun = z.infer<typeof workflowRunSchema>;
export type WorkflowRunList = z.infer<typeof workflowRunListSchema>;
