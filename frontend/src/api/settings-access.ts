import { apiRequest, type ApiPath } from "./client";
import {
  settingsAccessProfileSchema,
  type SettingsAccessProfileEndpoint,
} from "./settings-access-schemas";
import { withQuery } from "./url";

export const SETTINGS_ACCESS_PATH: ApiPath = "/api/settings/access";

export function getSettingsAccessProfile(
  clusterId: string,
  signal?: AbortSignal,
): Promise<SettingsAccessProfileEndpoint> {
  return apiRequest(
    withQuery(SETTINGS_ACCESS_PATH, [["cluster_id", clusterId.trim()]]),
    settingsAccessProfileSchema,
    { signal },
  );
}
