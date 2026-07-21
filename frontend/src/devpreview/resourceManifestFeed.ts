import { isApiError } from "../api/client";
import { getCommandStatus } from "../api/metrics";
import type { CommandStatus } from "../api/metrics-schemas";
import {
  applyResourceManifestEdit,
  approveResourceManifestEdit,
  getResourceManifestSource,
  previewResourceManifestEdit,
} from "../api/resource-manifests";
import type {
  ResourceManifestApplyEndpoint,
  ResourceManifestApproveEndpoint,
  ResourceManifestPreviewEndpoint,
  ResourceManifestSourceEndpoint,
} from "../api/resource-manifests-schemas";

export {
  applyResourceManifestEdit,
  approveResourceManifestEdit,
  getCommandStatus,
  getResourceManifestSource,
  previewResourceManifestEdit,
};
export type {
  CommandStatus,
  ResourceManifestApplyEndpoint,
  ResourceManifestApproveEndpoint,
  ResourceManifestPreviewEndpoint,
  ResourceManifestSourceEndpoint,
};

export function manifestIdempotencyKey(resourceId: string, desiredSha256: string): string {
  const safeResource = resourceId.replace(/[^A-Za-z0-9._:-]/g, "-").slice(-40);
  return `manifest-${safeResource}-${desiredSha256.slice(-16)}`;
}

export function resourceManifestFailureText(cause: unknown): string {
  if (isApiError(cause)) {
    return cause.detail ?? cause.code ?? `${cause.kind}${cause.status ? ` (${cause.status})` : ""}`;
  }
  return cause instanceof Error ? cause.message : "요청을 완료하지 못했습니다.";
}
