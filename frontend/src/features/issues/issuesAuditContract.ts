export interface IssueAuditTimelineQuery {
  cursor?: string;
  limit?: number;
}

export interface IssueAuditEvent {
  eventId: string;
  subject: string;
  source: string;
  createdAt: string;
  causationId: string | null;
  journeyStage:
    | "alert"
    | "evidence"
    | "rca"
    | "recovery"
    | "command"
    | "pr"
    | "workflow"
    | "cluster"
    | "ai"
    | "notification"
    | "system"
    | "unknown";
  payloadSummary: Readonly<Record<string, unknown>>;
}

export interface IssueAuditTimelinePage {
  correlationId: string;
  items: IssueAuditEvent[];
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}
