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
  listCount: (count: number) => string;
  listBrowseResources: string;
  listBrowseAlerts: string;
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
  auditEvent: (subject: string) => string;
  auditStage: (stage: IssueAuditTimelinePage["items"][number]["journeyStage"]) => string;
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
  evidenceRecordLabel: (summary: string) => string;
  evidenceKindLabel: (kind: string) => string;
  evidenceSourceLabel: (source: string) => string;
  evidenceCollectorLabel: (collector: string) => string;
  evidenceSummaryLabel: (source: string, summary: string) => string;
  reportsLabel: string;
  reportsEmpty: string;
  recoveryLabel: string;
  sectionLoading: string;
  sectionEmpty: string;
  evidenceUnavailable: string;
  reportsUnavailable: string;
  recoveryUnavailable: string;
  refresh: string;
  status: string;
  statusLabel: (status: string) => string;
  causeLabel: (cause: string) => string;
  target: string;
  updated: string;
  confidence: string;
  symptom: string;
  supportingEvidence: string;
  missingEvidence: string;
  rootCause: string;
  recommended: string;
  narrativeLabel: string;
  narrativeSummary: string;
  narrativeImpact: string;
  narrativeReasoning: string;
  narrativeRecommendedAction: string;
  narrativeRecurrencePrevention: string;
  narrativeLimitations: string;
  approvalRequired: string;
  recoveryProgressAccepted: string;
  recoveryProgressApproval: string;
  recoveryProgressApprovalWaiting: string;
  recoveryProgressCompletion: string;
  recoveryProgressExecution: string;
  recoveryProgressFailed: string;
  recoveryProgressLabel: string;
  recoveryProgressLatest: string;
  recoveryProgressStopped: string;
  recoveryProgressSubmission: string;
  recoveryProgressVerification: string;
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
  selectionFailure: IssuesPortFailure | null;
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
