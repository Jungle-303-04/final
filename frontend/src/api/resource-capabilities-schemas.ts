import { z } from "zod";

export const resourceActionCapabilityIdSchema = z.enum([
  "deployment.restart",
  "deployment.scale",
]);

export const resourceCapabilitySubjectSchema = z.strictObject({
  resource_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  cluster_id: z.string().min(1),
  resource_type: z.string().min(1),
  kind: z.string().min(1),
  namespace: z.string().min(1).nullable(),
  name: z.string().min(1),
});

export const resourceActionCapabilitySchema = z.strictObject({
  capability_id: resourceActionCapabilityIdSchema,
  method: z.literal("POST"),
  path: z.string().regex(/^\/clusters\/[^?]+$/u),
});

export const resourceCapabilitiesSchema = z.strictObject({
  subject: resourceCapabilitySubjectSchema,
  revision: z.string().regex(/^[0-9a-f]{64}$/u),
  capabilities: z.array(resourceActionCapabilitySchema),
}).superRefine((response, context) => {
  const ids = response.capabilities.map((item) => item.capability_id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      message: "resource capabilities must be unique",
      path: ["capabilities"],
    });
  }
  if (ids.some((id, index) => index > 0 && id <= ids[index - 1]!)) {
    context.addIssue({
      code: "custom",
      message: "resource capabilities must be sorted",
      path: ["capabilities"],
    });
  }
});

export type ResourceCapabilitiesEndpoint = z.infer<typeof resourceCapabilitiesSchema>;
export type ResourceActionCapabilityId = z.infer<typeof resourceActionCapabilityIdSchema>;
