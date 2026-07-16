import type {
  ActivityNotificationsEndpointDependencies,
  ActivityNotificationsPort,
} from "./activityNotificationsContract";

export function createActivityNotificationsAdapter(
  endpoints: ActivityNotificationsEndpointDependencies,
): ActivityNotificationsPort {
  return {
    async loadIncidentEvents(correlationId, signal) {
      const response = await endpoints.getAuditTimeline(correlationId, { limit: 200, signal });
      return response.items.map((event) => ({
        eventId: event.event_id,
        subject: event.subject,
        createdAt: event.created_at,
        payloadSummary: event.payload_summary,
      }));
    },
    async loadSafePrEvents(correlationId, signal) {
      const response = await endpoints.getAuditTimeline(correlationId, { limit: 200, signal });
      return response.items.map((event) => ({
        eventId: event.event_id,
        eventType: event.subject,
        message: typeof event.payload_summary.message === "string"
          ? event.payload_summary.message
          : event.subject,
        createdAt: event.created_at,
        details: event.payload_summary,
      }));
    },
  };
}
