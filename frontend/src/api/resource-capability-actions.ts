import { apiRequest, type ApiPath } from "./client";
import {
  resourceActionAcceptedSchema,
  type ResourceActionAccepted,
} from "./resource-capability-actions-schemas";
import type { ResourceActionExecutionContext } from "../features/resources/resourceCapabilitiesContract";

/** Submit one server-discovered resource command after the UI confirmation. */
export function executeResourceCapability(
  path: string,
  values: Readonly<Record<string, unknown>>,
  context?: ResourceActionExecutionContext,
  signal?: AbortSignal,
): Promise<ResourceActionAccepted> {
  const cronjob = /\/cronjobs\//u.test(path);
  if (cronjob && (
    context === undefined
    || !context.capabilityId.startsWith("cronjob.")
    || context.idempotencyKey.trim().length < 8
  )) {
    throw new TypeError("CronJob action requires an exact idempotent execution context");
  }
  const cronjobContext = cronjob ? context : undefined;
  return apiRequest(toApiPath(path), resourceActionAcceptedSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cronjobContext ? { "Idempotency-Key": cronjobContext.idempotencyKey } : {}),
    },
    body: JSON.stringify(cronjobContext ? cronjobPayload(cronjobContext) : {
      ...values,
      confirmation: true,
    }),
    signal,
  });
}

function cronjobPayload(context: ResourceActionExecutionContext) {
  return {
    resource_id: context.resourceId,
    snapshot_id: context.snapshotId,
    capability_revision: context.revision,
    resource: {
      api_group: context.resource.apiGroup,
      version: context.resource.version,
      kind: context.resource.kind,
      namespace: context.resource.namespace,
      name: context.resource.name,
      uid: context.resource.uid,
    },
    confirmation: true,
  };
}

function toApiPath(path: string): ApiPath {
  if (!/^\/(?!\/)[^?\s]+$/u.test(path)) {
    throw new TypeError("resource capability path must be an absolute API path");
  }
  return `/api${path}` as ApiPath;
}
