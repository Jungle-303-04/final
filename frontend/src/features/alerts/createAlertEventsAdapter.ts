import type {
  AlertEvent,
  AlertEventListOptions,
  AlertIncidentPromotion,
} from "../../api";
import type { AlertEventsPort } from "./alertEventsContract";

export interface AlertEventEndpoints {
  listAlertEvents(options?: AlertEventListOptions): Promise<AlertEvent[]>;
  acknowledgeAlertEvent(eventId: string, signal?: AbortSignal): Promise<AlertEvent>;
  promoteAlertEvent(eventId: string, signal?: AbortSignal): Promise<AlertIncidentPromotion>;
}

export function createAlertEventsAdapter(endpoints: AlertEventEndpoints): AlertEventsPort {
  return {
    list(signal) {
      return endpoints.listAlertEvents({ limit: 200, signal });
    },
    acknowledge(eventId, signal) {
      return endpoints.acknowledgeAlertEvent(eventId, signal);
    },
    promote(eventId, signal) {
      return endpoints.promoteAlertEvent(eventId, signal);
    },
  };
}
