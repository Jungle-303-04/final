export interface ResourceManifestSourceChoice {
  applicationId: string;
  applicationName: string;
  repositoryRef: string;
  branch: string;
  manifestPath: string;
  environment: string;
}

export interface ResourceManifestSource {
  resourceId: string;
  status: "available" | "ambiguous" | "unsupported";
  choices: ResourceManifestSourceChoice[];
  selected: ResourceManifestSourceChoice | null;
  baseSha: string | null;
  sourceSha256: string | null;
  content: string | null;
  reason: string | null;
}

export interface ResourceManifestEditInput {
  applicationId: string;
  baseSha: string;
  sourceSha256: string;
  editedYaml: string;
}

export interface ResourceManifestPreview {
  valid: boolean;
  changed: boolean;
  baseSha: string;
  sourceSha256: string;
  desiredSha256: string;
  diff: string;
  errors: string[];
  warnings: string[];
  applyAvailability: "available" | "unavailable";
  applyReasonCodes: string[];
  impact: ResourceManifestImpact[];
}

export interface ResourceManifestImpact {
  apiVersion: string;
  kind: string;
  namespace: string | null;
  name: string;
  selected: boolean;
}

export interface ResourceManifestDirectApplyInput extends ResourceManifestEditInput {
  desiredSha256: string;
  reason: string;
}

export interface ResourceManifestApprovalReceipt {
  correlationId: string;
  workflowRunId: string;
  approvalId: string;
  syncState: "awaiting-pr-merge";
}

export type ResourceManifestFailureCode =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "stale"
  | "invalid"
  | "unavailable";

export class ResourceManifestPortFailure extends Error {
  readonly code: ResourceManifestFailureCode;

  constructor(code: ResourceManifestFailureCode) {
    super(`Resource manifest port failed: ${code}`);
    this.name = "ResourceManifestPortFailure";
    this.code = code;
  }
}

export interface ResourceManifestPort {
  loadSource(
    resourceId: string,
    applicationId?: string | null,
    signal?: AbortSignal,
  ): Promise<ResourceManifestSource>;
  preview(
    resourceId: string,
    input: ResourceManifestEditInput,
    signal?: AbortSignal,
  ): Promise<ResourceManifestPreview>;
  approve(
    resourceId: string,
    input: ResourceManifestEditInput & { reason: string },
    signal?: AbortSignal,
  ): Promise<ResourceManifestApprovalReceipt>;
  applyNow(
    resourceId: string,
    input: ResourceManifestDirectApplyInput,
    signal?: AbortSignal,
  ): Promise<CommandReceipt>;
}
import type { CommandReceipt } from "../../shared/parity/referenceParity";
