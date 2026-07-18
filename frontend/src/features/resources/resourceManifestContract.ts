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
  applicationId: string | null;
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

export interface ResourceManifestDeploymentStage {
  stage: "validation" | "commit" | "pull_request" | "merge" | "sync" | "rollout" | "done";
  status: "completed" | "accepted" | "pending" | "failed" | "unavailable";
  evidence: Record<string, string>;
  reasonCode: string | null;
}

export interface ResourceManifestDeployment {
  accepted: boolean;
  pathway: "git" | "agent";
  operationId: string;
  workflowRunId: string | null;
  correlationId: string;
  currentStage: Exclude<ResourceManifestDeploymentStage["stage"], "validation">;
  preview: ResourceManifestPreview;
  stages: ResourceManifestDeploymentStage[];
  commandId: string | null;
  eventId: string | null;
  approvalId: string | null;
  pendingReasonCodes: string[];
}

export interface ResourceManifestCreateCapability {
  clusterId: string;
  namespace: string;
  snapshotId: string | null;
  available: boolean;
  reasonCodes: string[];
  maxDocuments: number;
  maxBytes: number;
  resources: Array<{
    apiVersion: string;
    kind: string;
    resource: string;
    forceSupported: boolean;
  }>;
}

export interface ResourceManifestCreateDryRunInput {
  clusterId: string;
  namespace: string;
  snapshotId: string;
  editedYaml: string;
  force: boolean;
  reason: string;
}

export interface ResourceManifestCreateInput extends ResourceManifestCreateDryRunInput {
  desiredSha256: string;
  dryRunCommandId: string;
  forceConfirmation: boolean;
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

export interface ResourceManifestCreatePort {
  loadCreateCapability(
    clusterId: string,
    namespace: string,
    signal?: AbortSignal,
  ): Promise<ResourceManifestCreateCapability>;
  dryRunCreate(
    input: ResourceManifestCreateDryRunInput,
    signal?: AbortSignal,
  ): Promise<CommandReceipt>;
  createResources(
    input: ResourceManifestCreateInput,
    signal?: AbortSignal,
  ): Promise<CommandReceipt>;
}

export interface ResourceManifestPort extends Partial<ResourceManifestCreatePort> {
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
  saveAndDeploy(
    resourceId: string,
    input: ResourceManifestEditInput & { reason: string },
    signal?: AbortSignal,
  ): Promise<ResourceManifestDeployment>;
}
import type { CommandReceipt } from "../../shared/parity/referenceParity";
