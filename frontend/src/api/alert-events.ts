import { apiRequest, type ApiPath } from "./client";
import {
  alertEventListSchema,
  alertEventSchema,
  alertIncidentPromotionSchema,
  type AlertEvent,
  type AlertEventSeverity,
  type AlertEventStatus,
  type AlertIncidentPromotion,
} from "./alert-events-schemas";
import { encodePathSegment } from "./url";

export const ALERT_EVENTS_PATH: ApiPath = "/api/alert-events";
export const ALERT_EVENT_TEST_PATH: ApiPath = "/api/alert-events/test";

export interface AlertEventListOptions {
  from?: string;
  to?: string;
  ruleId?: string;
  severity?: AlertEventSeverity;
  status?: AlertEventStatus;
  limit?: number;
  signal?: AbortSignal;
}

export function listAlertEvents(options: AlertEventListOptions = {}): Promise<AlertEvent[]> {
  const params = new URLSearchParams();
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  if (options.ruleId) params.set("rule_id", options.ruleId);
  if (options.severity) params.set("severity", options.severity);
  if (options.status) params.set("status", options.status);
  params.set("limit", String(options.limit ?? 200));
  return apiRequest(
    `${ALERT_EVENTS_PATH}?${params.toString()}` as ApiPath,
    alertEventListSchema,
    { signal: options.signal },
  );
}

export function createTestAlertEvent(signal?: AbortSignal): Promise<AlertEvent> {
  return apiRequest(ALERT_EVENT_TEST_PATH, alertEventSchema, { method: "POST", signal });
}

export function acknowledgeAlertEvent(
  eventId: string,
  signal?: AbortSignal,
): Promise<AlertEvent> {
  return apiRequest(
    alertEventActionPath(eventId, "ack"),
    alertEventSchema,
    { method: "POST", signal },
  );
}

export function promoteAlertEvent(
  eventId: string,
  signal?: AbortSignal,
): Promise<AlertIncidentPromotion> {
  return apiRequest(
    alertEventActionPath(eventId, "promote-incident"),
    alertIncidentPromotionSchema,
    { method: "POST", signal },
  );
}

function alertEventActionPath(
  eventId: string,
  action: "ack" | "promote-incident",
): ApiPath {
  if (eventId.trim() === "") throw new TypeError("eventId must not be empty");
  return `${ALERT_EVENTS_PATH}/${encodePathSegment(eventId)}/${action}` as ApiPath;
}
