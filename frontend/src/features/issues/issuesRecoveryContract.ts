export interface IssueRecoveryCandidate {
  id: string;
  title: string;
  description: string;
  route: string;
  rank: number;
  score: number;
  riskLevel: string;
  blastRadius: string;
  approvalRequired: boolean;
  prerequisites: string[];
  validationChecks: string[];
  rollbackPlan: string;
  evidenceRefs: string[];
  recommendationReason: string | null;
  expectedOutcome: string | null;
  riskExplanation: string | null;
  rollbackReason: string | null;
}

export interface IssueRecoveryPlan {
  id: string;
  correlationId: string;
  incidentId: string;
  evidenceRef: string;
  status: string;
  summary: string;
  recommendedActionId: string;
  executionRoute: string;
  selectionRequired: boolean;
  selectedActionId: string | null;
  selectedBy: string | null;
  selectedAction: IssueRecoveryCandidate | null;
  candidates: IssueRecoveryCandidate[];
}

export interface IssueRecoverySelection {
  correlationId: string;
  planId: string;
  actionId: string;
  reason?: string | null;
}

export interface IssueRecoveryReceipt {
  accepted: boolean;
  eventId: string;
  correlationId: string;
}

export type IssueRecoverySelectionResult =
  | { kind: "accepted"; receipt: IssueRecoveryReceipt }
  | { kind: "conflict"; plan: IssueRecoveryPlan };
