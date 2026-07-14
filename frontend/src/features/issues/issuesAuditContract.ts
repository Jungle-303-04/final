export interface IssueAuditTimelineQuery {
  cursor?: string;
  limit?: number;
}

export interface IssueAuditEvent {
  subject: string;
  source: string;
  createdAt: string;
  causationId: string | null;
  payloadSummary: Readonly<Record<string, unknown>>;
}

export interface IssueAuditTimelinePage {
  correlationId: string;
  items: IssueAuditEvent[];
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}
