import type { Ref } from "react";

import type {
  IssueAuditTimelinePage,
  IssueDetail,
  IssueEvidencePage,
  IssueRecentChanges,
  IssueRcaReportPage,
  IssueSummary,
  IssuesPortFailure,
  IssueRecoveryPlan,
  IssueRecoveryReceipt,
} from "./issuesContract";

export interface IssuesSurfaceCopy {
  listLabel: string;
  listEmpty: string;
  listLoading: string;
  detailLabel: string;
  detailEmpty: string;
  detailLoading: string;
  detailClose: string;
  detailExpand: string;
  detailCollapse: string;
  auditLabel: string;
  auditUnavailable: string;
  auditRoot: string;
  auditCause: (causationId: string) => string;
  auditPayload: string;
  auditLoadMore: string;
  auditLoadingMore: string;
  auditTimeUnknown: string;
  auditTime: (value: string) => string;
  recentChangesLabel: string;
  recentChangesUnavailable: string;
  recentChangesPullRequest: string;
  recentChangesTime: (value: string) => string;
  recentChangesImageBeforeLabel: string;
  recentChangesImageAfterLabel: string;
  recentChangesCommitLabel: string;
  recentChangesRepositoryLabel: string;
  recentChangesWorkflowLabel: string;
  evidenceLabel: string;
  reportsLabel: string;
  recoveryLabel: string;
  sectionLoading: string;
  sectionEmpty: string;
  evidenceUnavailable: string;
  reportsUnavailable: string;
  recoveryUnavailable: string;
  refresh: string;
  status: string;
  rootCause: string;
  recommended: string;
  approvalRequired: string;
  selectionPending: string;
  selectionReceived: (eventId: string) => string;
  genericFailure: string;
  failureDetail: (code: IssuesPortFailure["code"]) => string;
  partial: (excludedCount: number) => string;
}

export type RecoverySelectionCapability =
  | { state: "enabled" }
  | { state: "disabled"; reason: string }
  | { state: "hidden" };

export interface SectionState<T> {
  data: T | null;
  failure: IssuesPortFailure | null;
  loading: boolean;
}

export interface IssuePanelsState {
  detail: SectionState<IssueDetail>;
  recentChanges: SectionState<IssueRecentChanges>;
  audit: SectionState<IssueAuditTimelinePage>;
  evidence: SectionState<IssueEvidencePage>;
  reports: SectionState<IssueRcaReportPage>;
  recovery: SectionState<IssueRecoveryPlan>;
  receipt: IssueRecoveryReceipt | null;
  selectionPendingId: string | null;
}

export interface IssuesPanelsProps {
  capability: RecoverySelectionCapability;
  copy: IssuesSurfaceCopy;
  detailRegionId: string;
  detailRegionRef: Ref<HTMLDivElement>;
  full: boolean;
  onClose: () => void;
  onFullChange: (full: boolean) => void;
  onSelectRecovery: (actionId: string) => void;
  onLoadMoreAudit: () => void;
  selected: IssueSummary;
  state: IssuePanelsState;
}
