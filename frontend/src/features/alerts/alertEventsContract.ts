export type AlertEventSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "warning"
  | "info";

export type AlertEventStatus = "firing" | "resolved" | "acked";
export type AlertEventSource = "opsia" | "alertmanager";

export interface AlertEventSubject {
  cluster: string;
  namespace: string | null;
  kind: string;
  name: string;
}

export interface AlertEvidenceItem {
  type: string;
  metric: string | null;
  observed_at: string | null;
  subject: AlertEventSubject | null;
  value: number | null;
  summary: string | null;
  link: string | null;
}

export interface AlertEvent {
  event_id: string;
  rule_id: string | null;
  rule_name: string | null;
  source: AlertEventSource;
  severity: AlertEventSeverity;
  subject: AlertEventSubject;
  fired_at: string;
  resolved_at: string | null;
  status: AlertEventStatus;
  observed_value: number | null;
  threshold: number | null;
  evidence: AlertEvidenceItem[];
  incident_id: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  promoted_at: string | null;
  promoted_by: string | null;
}

export interface AlertIncidentPromotion {
  incident_id: string;
}

export interface AlertEventListOptions {
  from?: string;
  to?: string;
  ruleId?: string;
  severity?: AlertEventSeverity;
  status?: AlertEventStatus;
  limit?: number;
  signal?: AbortSignal;
}

export interface AlertEventsPort {
  list(signal?: AbortSignal): Promise<readonly AlertEvent[]>;
  acknowledge(eventId: string, signal?: AbortSignal): Promise<AlertEvent>;
  promote(eventId: string, signal?: AbortSignal): Promise<AlertIncidentPromotion>;
}

export interface AlertEventEndpoints {
  listAlertEvents(options?: AlertEventListOptions): Promise<AlertEvent[]>;
  acknowledgeAlertEvent(eventId: string, signal?: AbortSignal): Promise<AlertEvent>;
  promoteAlertEvent(eventId: string, signal?: AbortSignal): Promise<AlertIncidentPromotion>;
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
