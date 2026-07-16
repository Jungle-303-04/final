export type ActivityNotificationKind =
  | "incident-analysis"
  | "incident-recovery"
  | "safe-pr"
  | "ai";

export type ActivityNotificationStatus =
  | "running"
  | "waiting"
  | "succeeded"
  | "failed";

export interface ActivityNotification {
  id: string;
  kind: ActivityNotificationKind;
  status: ActivityNotificationStatus;
  title: string;
  description: string;
  target: string;
  href: string | null;
  createdAt: string;
  updatedAt: string;
  currentStep: number;
  totalSteps: number;
  correlationId: string | null;
  workflowRunId: string | null;
  lastEventId: string | null;
  muted: boolean;
  read: boolean;
}

export interface IncidentActivityEvent {
  eventId: string;
  subject: string;
  createdAt: string;
  payloadSummary: Readonly<Record<string, unknown>>;
}

export interface SafePrActivityEvent {
  eventId: string;
  eventType: string;
  message: string;
  createdAt: string | null;
  details: Readonly<Record<string, unknown>>;
}

export interface ActivityNotificationsPort {
  loadIncidentEvents(
    correlationId: string,
    signal?: AbortSignal,
  ): Promise<readonly IncidentActivityEvent[]>;
  loadSafePrEvents(
    correlationId: string,
    signal?: AbortSignal,
  ): Promise<readonly SafePrActivityEvent[]>;
}

export const EMPTY_ACTIVITY_NOTIFICATIONS_PORT: ActivityNotificationsPort = {
  async loadIncidentEvents() {
    return [];
  },
  async loadSafePrEvents() {
    return [];
  },
};

export interface ActivityNotificationsEndpointDependencies {
  getAuditTimeline(
    correlationId: string,
    options?: { signal?: AbortSignal; limit?: number },
  ): Promise<{
    items: Array<{
      event_id: string;
      subject: string;
      created_at: string;
      payload_summary: Record<string, unknown>;
    }>;
  }>;
}
