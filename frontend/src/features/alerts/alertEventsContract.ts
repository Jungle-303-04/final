import type {
  AlertEvent,
  AlertIncidentPromotion,
} from "../../api/alert-events-schemas";

export interface AlertEventsPort {
  list(signal?: AbortSignal): Promise<readonly AlertEvent[]>;
  acknowledge(eventId: string, signal?: AbortSignal): Promise<AlertEvent>;
  promote(eventId: string, signal?: AbortSignal): Promise<AlertIncidentPromotion>;
}

export const EMPTY_ALERT_EVENTS_PORT: AlertEventsPort = {
  async list() {
    return [];
  },
  async acknowledge() {
    throw new Error("Alert event acknowledgement is unavailable");
  },
  async promote() {
    throw new Error("Alert event promotion is unavailable");
  },
};
