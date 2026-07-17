import type { ResourceFileCommandEndpointInput } from "../features/resource-files/resourceFilesEndpointContract";
import { apiRequest, type ApiPath } from "./client";
import {
  resourceActionAcceptedSchema,
  type ResourceActionAccepted,
} from "./resource-capability-actions-schemas";

export const RESOURCE_FILE_COMMANDS_PATH: ApiPath = "/api/resource-files/commands";

export function startResourceFileCommand(
  input: ResourceFileCommandEndpointInput,
  signal?: AbortSignal,
): Promise<ResourceActionAccepted> {
  return apiRequest(RESOURCE_FILE_COMMANDS_PATH, resourceActionAcceptedSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
}
