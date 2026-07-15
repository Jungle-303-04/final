import { z } from "zod";

export const resourceActionCapabilityIdSchema = z.string()
  .regex(/^[a-z][a-z0-9._-]*$/u)
  .max(160);

export const resourceCapabilityInputSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/u).max(120),
  label: z.string().min(1).max(120),
  type: z.enum(["integer", "string"]),
  required: z.boolean(),
  minimum: z.number().int().nullable(),
  maximum: z.number().int().nullable(),
  default: z.union([z.number().int(), z.string(), z.null()]),
}).superRefine((input, context) => {
  if (input.minimum !== null && input.maximum !== null && input.minimum > input.maximum) {
    context.addIssue({ code: "custom", message: "minimum must not exceed maximum" });
  }
  if (input.type === "integer" && typeof input.default === "string") {
    context.addIssue({ code: "custom", message: "integer default must be an integer" });
  }
  if (input.type === "string" && typeof input.default === "number") {
    context.addIssue({ code: "custom", message: "string default must be a string" });
  }
});

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
  label: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  execution: z.enum(["command", "terminal"]),
  confirmation_required: z.boolean(),
  realtime: z.boolean(),
  input_schema: z.array(resourceCapabilityInputSchema),
  method: z.enum(["POST", "WEBSOCKET"]),
  path: z.string().regex(/^\/(?!\/)[^?\s]+$/u),
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
export type ResourceCapabilityInputEndpoint = z.infer<typeof resourceCapabilityInputSchema>;
