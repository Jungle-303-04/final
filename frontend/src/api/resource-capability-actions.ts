import { z } from "zod";

import { apiRequest, type ApiPath } from "./client";

const resourceActionAcceptedSchema = z.strictObject({
  accepted: z.literal(true),
  event_id: z.string().min(1),
  correlation_id: z.string().min(1),
  command_id: z.string().min(1).nullable().optional(),
});

/** Submit one server-discovered resource command after the UI confirmation. */
export function executeResourceCapability(
  path: string,
  values: Readonly<Record<string, unknown>>,
  signal?: AbortSignal,
): Promise<z.infer<typeof resourceActionAcceptedSchema>> {
  return apiRequest(toApiPath(path), resourceActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...values,
      direct_execution: true,
      direct_execution_confirmed: true,
    }),
    signal,
  });
}

function toApiPath(path: string): ApiPath {
  if (!/^\/(?!\/)[^?\s]+$/u.test(path)) {
    throw new TypeError("resource capability path must be an absolute API path");
  }
  return `/api${path}` as ApiPath;
}
