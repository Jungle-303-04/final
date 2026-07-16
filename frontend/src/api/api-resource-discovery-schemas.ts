import { z } from "zod";

export const apiResourceDescriptorSchema = z.strictObject({
  group: z.string().max(253),
  version: z.string().min(1).max(63),
  api_version: z.string().min(1).max(317),
  name: z.string().min(1).max(253),
  singular_name: z.string().max(253),
  kind: z.string().min(1).max(253),
  namespaced: z.boolean(),
  is_crd: z.boolean().nullable(),
  verbs: z.array(z.string().min(1)).max(32),
});

export const apiResourceDiscoveryObservationSchema = z.strictObject({
  observed_at: z.string().datetime({ offset: true }),
  completeness: z.enum(["exact", "partial", "unavailable"]),
  reason_codes: z.array(z.string().min(1)).max(132),
  resources: z.array(apiResourceDescriptorSchema).max(2_000),
});

export const kubernetesApiResourcesSchema = z.strictObject({
  cluster_id: z.string().min(1),
  snapshot_id: z.string().min(1).nullable(),
  discovery: apiResourceDiscoveryObservationSchema.nullable(),
  unavailable_reason: z.string().min(1).nullable(),
}).superRefine((value, context) => {
  if ((value.discovery === null) === (value.unavailable_reason === null)) {
    context.addIssue({
      code: "custom",
      message: "API resource discovery must be available or carry one unavailable reason",
    });
  }
});

export type ApiResourceDescriptorEndpoint = z.infer<typeof apiResourceDescriptorSchema>;
export type ApiResourceDiscoveryObservationEndpoint = z.infer<
  typeof apiResourceDiscoveryObservationSchema
>;
export type KubernetesApiResourcesEndpoint = z.infer<typeof kubernetesApiResourcesSchema>;
