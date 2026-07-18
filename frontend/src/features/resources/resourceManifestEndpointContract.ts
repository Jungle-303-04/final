import type { ResourceManifestEditInput } from "./resourceManifestContract";
import type { ResourceActionStatus } from "./resourceCapabilitiesContract";

export interface ResourceManifestSourceChoiceEndpoint {
  application_id: string;
  application_name: string;
  repository_ref: string;
  branch: string;
  manifest_path: string;
  environment: string;
}

export interface ResourceManifestSourceEndpoint {
  resource_id: string;
  status: "available" | "ambiguous" | "unsupported";
  choices: ResourceManifestSourceChoiceEndpoint[];
  selected: ResourceManifestSourceChoiceEndpoint | null;
  base_sha: string | null;
  source_sha256: string | null;
  content: string | null;
  reason: string | null;
}

export interface ResourceManifestPreviewEndpoint {
  valid: boolean;
  changed: boolean;
  base_sha: string;
  source_sha256: string;
  desired_sha256: string;
  diff: string;
  errors: string[];
  warnings: string[];
  apply_availability: "available" | "unavailable";
  apply_reason_codes: string[];
  impact: Array<{
    api_version: string;
    kind: string;
    namespace: string | null;
    name: string;
    selected: boolean;
  }>;
}

export interface ResourceManifestApplyEndpoint {
  accepted: true;
  event_id: string;
  audit_event_id: string;
  correlation_id: string;
  command_id: string;
  status: ResourceActionStatus;
}

export type ResourceManifestDeploymentStageEndpoint = {
  stage: "validation" | "commit" | "pull_request" | "merge" | "sync" | "rollout" | "done";
  status: "completed" | "accepted" | "pending" | "failed" | "unavailable";
  evidence: Record<string, string>;
  reason_code: string | null;
};

export interface ResourceManifestDeployEndpoint {
  accepted: boolean;
  pathway: "git" | "agent";
  operation_id: string;
  correlation_id: string;
  current_stage: "commit" | "pull_request" | "merge" | "sync" | "rollout" | "done";
  preview: ResourceManifestPreviewEndpoint;
  stages: ResourceManifestDeploymentStageEndpoint[];
  command_id: string | null;
  event_id: string | null;
  approval_id: string | null;
  pending_reason_codes: string[];
}

export interface ResourceManifestCreateCapabilityEndpoint {
  cluster_id: string;
  namespace: string;
  snapshot_id: string | null;
  available: boolean;
  reason_codes: string[];
  max_documents: number;
  max_bytes: number;
  resources: Array<{
    api_version: string;
    kind: string;
    resource: string;
    force_supported: boolean;
  }>;
}

export interface ResourceManifestApproveEndpoint {
  accepted: boolean;
  event_id: string;
  correlation_id: string;
  workflow_run_id: string;
  approval_id: string;
  sync_state: "awaiting_pr_merge";
}

export interface ResourceManifestEndpointDependencies {
  getResourceManifestSource(
    resourceId: string,
    applicationId?: string | null,
    signal?: AbortSignal,
  ): Promise<ResourceManifestSourceEndpoint>;
  previewResourceManifestEdit(
    resourceId: string,
    input: ResourceManifestEditInput,
    signal?: AbortSignal,
  ): Promise<ResourceManifestPreviewEndpoint>;
  approveResourceManifestEdit(
    resourceId: string,
    input: ResourceManifestEditInput & { confirmed: true; reason: string },
    signal?: AbortSignal,
  ): Promise<ResourceManifestApproveEndpoint>;
  applyResourceManifestNow(
    resourceId: string,
    input: ResourceManifestEditInput & {
      expectedDesiredSha256: string;
      confirmation: true;
      reason: string;
    },
    signal?: AbortSignal,
  ): Promise<ResourceManifestApplyEndpoint>;
  deployResourceManifestEdit(
    resourceId: string,
    input: ResourceManifestEditInput & { confirmation: true; reason: string },
    signal?: AbortSignal,
  ): Promise<ResourceManifestDeployEndpoint>;
  getResourceManifestCreateCapability(
    clusterId: string,
    namespace: string,
    signal?: AbortSignal,
  ): Promise<ResourceManifestCreateCapabilityEndpoint>;
  dryRunResourceManifestCreate(
    input: {
      clusterId: string;
      namespace: string;
      snapshotId: string;
      editedYaml: string;
      force: boolean;
      reason: string;
    },
    signal?: AbortSignal,
  ): Promise<ResourceManifestApplyEndpoint>;
  createResourceManifest(
    input: {
      clusterId: string;
      namespace: string;
      snapshotId: string;
      editedYaml: string;
      desiredSha256: string;
      dryRunCommandId: string;
      confirmation: true;
      force: boolean;
      forceConfirmation: boolean;
      reason: string;
    },
    signal?: AbortSignal,
  ): Promise<ResourceManifestApplyEndpoint>;
}
