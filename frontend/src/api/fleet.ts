import { apiRequest } from "./client";
import { fleetSummarySchema, type FleetSummary } from "./schemas";

export function getFleetSummary(signal?: AbortSignal): Promise<FleetSummary> {
  return apiRequest("/api/fleet/summary", fleetSummarySchema, { signal });
}
