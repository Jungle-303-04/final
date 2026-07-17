import { apiRequest, type ApiPath } from "./client";
import {
  resourceActionAcceptedSchema,
  type ResourceActionAccepted,
} from "./resource-capability-actions-schemas";
import {
  type ResourceActionExecutionContext,
} from "../features/resources/resourceCapabilitiesContract";

/** Submit one server-discovered resource command after the UI confirmation. */
export function executeResourceCapability(
  path: string,
  values: Readonly<Record<string, unknown>>,
  context?: ResourceActionExecutionContext,
  signal?: AbortSignal,
): Promise<ResourceActionAccepted> {
  const exactContext = context?.requestContext === "exact-resource" ? context : undefined;
  const rollbackContext = context?.requestContext === "rollback" ? context : undefined;
  if (exactContext && exactContext.idempotencyKey.trim().length < 8) {
    throw new TypeError("exact resource action requires an idempotent execution context");
  }
  if (rollbackContext && (
    rollbackContext.idempotencyKey.trim().length < 8 ||
    rollbackContext.rollback === undefined
  )) {
    throw new TypeError("workload rollback requires an exact idempotent execution context");
  }
  return apiRequest(toApiPath(path), resourceActionAcceptedSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(exactContext || rollbackContext
        ? { "Idempotency-Key": (exactContext ?? rollbackContext)?.idempotencyKey ?? "" }
        : {}),
    },
    body: JSON.stringify(
      rollbackContext
        ? workloadRollbackPayload(rollbackContext)
        : exactContext
        ? exactActionPayload(values, exactContext)
        : { ...values, confirmation: true },
    ),
    signal,
  });
}

function exactActionPayload(
  values: Readonly<Record<string, unknown>>,
  context: ResourceActionExecutionContext,
) {
  return {
    ...values,
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

function workloadRollbackPayload(context: ResourceActionExecutionContext) {
  const rollback = context.rollback;
  if (rollback === undefined) throw new TypeError("workload rollback context is incomplete");
  const mapRef = (resource: typeof context.resource) => ({
    api_group: resource.apiGroup,
    version: resource.version,
    kind: resource.kind,
    namespace: resource.namespace,
    name: resource.name,
    uid: resource.uid,
  });
  return {
    resource_id: context.resourceId,
    snapshot_id: context.snapshotId,
    capability_revision: context.revision,
    workload: mapRef(context.resource),
    workload_resource_version: rollback.workloadResourceVersion,
    target_revision: mapRef(rollback.targetRevision),
    target_resource_version: rollback.targetResourceVersion,
    preview_revision: rollback.previewRevision,
    confirmation: true,
    reason: "restore the selected observed workload revision",
  };
}

function toApiPath(path: string): ApiPath {
  if (!/^\/(?!\/)[^?\s]+$/u.test(path)) {
    throw new TypeError("resource capability path must be an absolute API path");
  }
  return `/api${path}` as ApiPath;
}
