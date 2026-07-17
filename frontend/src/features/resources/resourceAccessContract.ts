import { z } from "zod";

const kubernetesSubjectSchema = z.strictObject({
  kind: z.enum(["ServiceAccount", "User", "Group"]),
  namespace: z.string(),
  name: z.string().min(1),
});
const kubernetesRoleRefSchema = z.strictObject({
  kind: z.enum(["Role", "ClusterRole"]),
  namespace: z.string(),
  name: z.string().min(1),
});
const kubernetesBindingRefSchema = z.strictObject({
  kind: z.enum(["RoleBinding", "ClusterRoleBinding"]),
  namespace: z.string(),
  name: z.string().min(1),
  role: kubernetesRoleRefSchema,
});
const kubernetesPolicyRuleSchema = z.strictObject({
  verbs: z.array(z.string()),
  api_groups: z.array(z.string()),
  resources: z.array(z.string()),
  resource_names: z.array(z.string()),
  non_resource_urls: z.array(z.string()),
});
const kubernetesBindingRulesSchema = z.strictObject({
  binding: kubernetesBindingRefSchema,
  role: kubernetesRoleRefSchema,
  rules: z.array(kubernetesPolicyRuleSchema),
  scope_namespace: z.string(),
});
const kubernetesBindingWithSubjectsSchema = z.strictObject({
  binding: kubernetesBindingRefSchema,
  subjects: z.array(kubernetesSubjectSchema),
});

export const resourceAccessDetailEndpointSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("subject"),
    observed_at: z.string(),
    subject: kubernetesSubjectSchema,
    direct: z.array(kubernetesBindingRulesSchema),
    inherited_from_groups: z.array(z.strictObject({
      group_name: z.string().min(1),
      bindings: z.array(kubernetesBindingRulesSchema),
    })),
    flat: z.array(kubernetesPolicyRuleSchema),
    truncated: z.boolean(),
    used_by_pods: z.array(z.strictObject({ namespace: z.string(), name: z.string() })),
  }),
  z.strictObject({
    type: z.literal("role"),
    observed_at: z.string(),
    role: kubernetesRoleRefSchema,
    bindings: z.array(kubernetesBindingWithSubjectsSchema),
  }),
  z.strictObject({
    type: z.literal("namespace"),
    observed_at: z.string(),
    namespace: z.string().min(1),
    role_bindings: z.array(kubernetesBindingWithSubjectsSchema),
    cluster_role_bindings_with_local_subject: z.array(kubernetesBindingWithSubjectsSchema),
    service_account_count: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("unavailable"),
    reason_codes: z.array(z.string().min(1)).min(1),
  }),
]);

export type ResourceAccessDetailEndpoint = z.infer<typeof resourceAccessDetailEndpointSchema>;
type SubjectEndpoint = z.infer<typeof kubernetesSubjectSchema>;
type RoleRefEndpoint = z.infer<typeof kubernetesRoleRefSchema>;
type BindingRefEndpoint = z.infer<typeof kubernetesBindingRefSchema>;
type RuleEndpoint = z.infer<typeof kubernetesPolicyRuleSchema>;
type BindingRulesEndpoint = z.infer<typeof kubernetesBindingRulesSchema>;
type BindingWithSubjectsEndpoint = z.infer<typeof kubernetesBindingWithSubjectsSchema>;

export interface KubernetesSubject {
  kind: SubjectEndpoint["kind"];
  namespace: string;
  name: string;
}
export interface KubernetesRoleRef {
  kind: RoleRefEndpoint["kind"];
  namespace: string;
  name: string;
}
export interface KubernetesBindingRef {
  kind: BindingRefEndpoint["kind"];
  namespace: string;
  name: string;
  role: KubernetesRoleRef;
}
export interface KubernetesPolicyRule {
  verbs: string[];
  apiGroups: string[];
  resources: string[];
  resourceNames: string[];
  nonResourceUrls: string[];
}
export interface KubernetesBindingRules {
  binding: KubernetesBindingRef;
  role: KubernetesRoleRef;
  rules: KubernetesPolicyRule[];
  scopeNamespace: string;
}
export interface KubernetesBindingWithSubjects {
  binding: KubernetesBindingRef;
  subjects: KubernetesSubject[];
}
export type ResourceAccessDetail =
  | {
    type: "subject";
    observedAt: string;
    subject: KubernetesSubject;
    direct: KubernetesBindingRules[];
    inheritedFromGroups: Array<{ groupName: string; bindings: KubernetesBindingRules[] }>;
    flat: KubernetesPolicyRule[];
    truncated: boolean;
    usedByPods: Array<{ namespace: string; name: string }>;
  }
  | {
    type: "role";
    observedAt: string;
    role: KubernetesRoleRef;
    bindings: KubernetesBindingWithSubjects[];
  }
  | {
    type: "namespace";
    observedAt: string;
    namespace: string;
    roleBindings: KubernetesBindingWithSubjects[];
    clusterRoleBindingsWithLocalSubject: KubernetesBindingWithSubjects[];
    serviceAccountCount: number;
  }
  | { type: "unavailable"; reasonCodes: string[] };

const roleRef = (value: RoleRefEndpoint): KubernetesRoleRef => ({ ...value });
const subject = (value: SubjectEndpoint): KubernetesSubject => ({ ...value });
const bindingRef = (value: BindingRefEndpoint): KubernetesBindingRef => ({
  ...value,
  role: roleRef(value.role),
});
const rule = (value: RuleEndpoint): KubernetesPolicyRule => ({
  verbs: value.verbs,
  apiGroups: value.api_groups,
  resources: value.resources,
  resourceNames: value.resource_names,
  nonResourceUrls: value.non_resource_urls,
});
const bindingRules = (value: BindingRulesEndpoint): KubernetesBindingRules => ({
  binding: bindingRef(value.binding),
  role: roleRef(value.role),
  rules: value.rules.map(rule),
  scopeNamespace: value.scope_namespace,
});
const bindingWithSubjects = (
  value: BindingWithSubjectsEndpoint,
): KubernetesBindingWithSubjects => ({
  binding: bindingRef(value.binding),
  subjects: value.subjects.map(subject),
});

export function toResourceAccessDetail(
  value: ResourceAccessDetailEndpoint | null | undefined,
): ResourceAccessDetail | null {
  if (!value) return null;
  if (value.type === "unavailable") {
    return { type: value.type, reasonCodes: value.reason_codes };
  }
  if (value.type === "subject") {
    return {
      type: value.type,
      observedAt: value.observed_at,
      subject: subject(value.subject),
      direct: value.direct.map(bindingRules),
      inheritedFromGroups: value.inherited_from_groups.map((group) => ({
        groupName: group.group_name,
        bindings: group.bindings.map(bindingRules),
      })),
      flat: value.flat.map(rule),
      truncated: value.truncated,
      usedByPods: value.used_by_pods,
    };
  }
  if (value.type === "role") {
    return {
      type: value.type,
      observedAt: value.observed_at,
      role: roleRef(value.role),
      bindings: value.bindings.map(bindingWithSubjects),
    };
  }
  return {
    type: value.type,
    observedAt: value.observed_at,
    namespace: value.namespace,
    roleBindings: value.role_bindings.map(bindingWithSubjects),
    clusterRoleBindingsWithLocalSubject:
      value.cluster_role_bindings_with_local_subject.map(bindingWithSubjects),
    serviceAccountCount: value.service_account_count,
  };
}
