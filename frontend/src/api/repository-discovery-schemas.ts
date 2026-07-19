import { z } from "zod";

export const repositoryProbeSchema = z.strictObject({
  repo_ref: z.string().min(1),
  normalized_repo_ref: z.string().min(1),
  valid: z.boolean(),
  reachable: z.boolean(),
  default_branch: z.string().min(1).nullable(),
  private: z.boolean().nullable(),
  html_url: z.string().nullable(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

export const repositoryBranchListSchema = z.strictObject({
  repo_ref: z.string().min(1),
  default_branch: z.string().min(1).nullable(),
  branches: z.array(z.strictObject({
    name: z.string().min(1),
    protected: z.boolean(),
    default: z.boolean(),
  })),
  warnings: z.array(z.string()),
});

export const repositoryManifestCatalogSchema = z.strictObject({
  repo_ref: z.string().min(1),
  branch: z.string().min(1),
  candidates: z.array(z.strictObject({
    path: z.string().min(1),
    source_type: z.string(),
    display_name: z.string(),
    reason: z.string(),
  })),
  warnings: z.array(z.string()),
});

export const repositoryManifestValidationSchema = z.strictObject({
  repo_ref: z.string().min(1),
  branch: z.string().min(1),
  manifest_path: z.string().min(1),
  valid: z.boolean(),
  status: z.string(),
  validation_mode: z.string(),
  resource_count: z.number().int().nonnegative(),
  resources: z.array(z.strictObject({
    api_version: z.string(),
    kind: z.string(),
    namespace: z.string().nullable(),
    name: z.string(),
  })),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});

export const repositoryConnectionStatusSchema = z.strictObject({
  repo_ref: z.string().min(1),
  repository_id: z.string().min(1).nullable(),
  repository_status: z.enum([
    "unregistered",
    "active",
    "invalid_credential",
    "disabled",
    "unknown",
  ]),
  connection_stage: z.enum(["awaiting_validation", "ready", "error"]),
  terminal: z.boolean(),
  refresh_after_seconds: z.number().min(0.25).max(30).nullable(),
}).superRefine((status, context) => {
  const terminal = status.connection_stage !== "awaiting_validation";
  if (status.terminal !== terminal || (status.refresh_after_seconds === null) !== terminal) {
    context.addIssue({
      code: "custom",
      message: "repository connection terminal semantics are inconsistent",
    });
  }
});

export type RepositoryProbeEndpoint = z.infer<typeof repositoryProbeSchema>;
export type RepositoryBranchListEndpoint = z.infer<typeof repositoryBranchListSchema>;
export type RepositoryManifestCatalogEndpoint = z.infer<typeof repositoryManifestCatalogSchema>;
export type RepositoryManifestValidationEndpoint = z.infer<typeof repositoryManifestValidationSchema>;
export type RepositoryConnectionStatusEndpoint = z.infer<typeof repositoryConnectionStatusSchema>;
