import type { AlertEventEndpoints, AlertEventsPort } from "./alertEventsContract";

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
