import type { ClusterScope, ResourceRef } from "../../shared/parity/referenceParity";
import type { IssueDetail, IssuesFailureCode, IssueSummary } from "./issuesContract";
import type { IssueRcaReport } from "./issuesEvidenceContract";

export type RcaContextSubject =
  | { kind: "resource"; scope: ClusterScope; resource: ResourceRef }
  | {
      kind: "incident";
      scope: ClusterScope;
      incidentId: string;
      correlationId: string | null;
    };

export type RcaContextReasonCode =
  | "coverage_partial"
  | "coverage_unavailable"
  | "root_cause_unavailable"
  | "impact_unavailable"
  | "evidence_unavailable"
  | "report_unavailable";

export interface RcaContextRecord {
  issue: IssueSummary | IssueDetail;
  report: IssueRcaReport | null;
  rootCause: string | null;
  impact: string | null;
  evidence: readonly string[];
  missingEvidence: readonly string[];
}

export type RcaContextResult =
  | {
      state: "empty";
      scope: ClusterScope;
      coverageAvailability: "available" | "partial" | "unavailable";
      reasonCodes: readonly RcaContextReasonCode[];
      record: null;
    }
  | {
      state: "available" | "partial";
      scope: ClusterScope;
      coverageAvailability: "available" | "partial" | "unavailable";
      reasonCodes: readonly RcaContextReasonCode[];
      record: RcaContextRecord;
    };

export interface RcaContextPort {
  load(subject: RcaContextSubject, signal?: AbortSignal): Promise<RcaContextResult>;
}

export class RcaContextFailure extends Error {
  readonly code: IssuesFailureCode;

  constructor(code: IssuesFailureCode) {
    super(`RCA context failed: ${code}`);
    this.name = "RcaContextFailure";
    this.code = code;
  }
}

export const EMPTY_RCA_CONTEXT_PORT: RcaContextPort = {
  async load(subject) {
    return {
      state: "empty",
      scope: subject.scope,
      coverageAvailability: "unavailable",
      reasonCodes: ["coverage_unavailable"],
      record: null,
    };
  },
};
