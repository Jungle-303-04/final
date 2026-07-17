import { IssuesPortFailure, type IssuesPort, type IssueSummary } from "./issuesContract";
import type { IssueRcaReport } from "./issuesEvidenceContract";
import type { ResourceIssuesPort } from "./resourceIssuesContract";
import {
  RcaContextFailure,
  type RcaContextPort,
  type RcaContextReasonCode,
  type RcaContextResult,
  type RcaContextSubject,
} from "./rcaContextContract";

const REPORT_LIMIT = 25;

export function createRcaContextAdapter(dependencies: {
  issues: Pick<IssuesPort, "loadIssue" | "loadReports">;
  resourceIssues: Pick<ResourceIssuesPort, "loadResourceIssues">;
}): RcaContextPort {
  return {
    async load(subject, signal) {
      if (subject.kind === "incident") {
        const issue = await dependencies.issues.loadIssue(
          subject.incidentId,
          subject.scope.clusterId,
          signal,
        );
        assertIssueScope(issue, subject);
        return loadReportContext(dependencies.issues, subject, issue, "available", [], signal);
      }

      const result = await dependencies.resourceIssues.loadResourceIssues(
        subject.scope.clusterId,
        subject.resource,
        signal,
      );
      if (
        result.scope.workspaceId !== subject.scope.workspaceId
        || result.scope.clusterId !== subject.scope.clusterId
      ) {
        throw new RcaContextFailure("invalid-response");
      }
      const reasonCodes: RcaContextReasonCode[] = result.coverageAvailability === "partial"
        ? ["coverage_partial"]
        : result.coverageAvailability === "unavailable"
          ? ["coverage_unavailable"]
          : [];
      if (result.items.length === 0) {
        return {
          state: "empty",
          scope: subject.scope,
          coverageAvailability: result.coverageAvailability,
          reasonCodes,
          record: null,
        };
      }
      const matching = result.items.filter((issue) => issueMatchesResource(issue, subject));
      if (matching.length !== result.items.length || matching[0] === undefined) {
        throw new RcaContextFailure("invalid-response");
      }
      const issue = [...matching].sort(compareIssueRecency)[0];
      if (issue === undefined) throw new RcaContextFailure("invalid-response");
      return loadReportContext(
        dependencies.issues,
        subject,
        issue,
        result.coverageAvailability,
        reasonCodes,
        signal,
      );
    },
  };
}

async function loadReportContext(
  issues: Pick<IssuesPort, "loadReports">,
  subject: RcaContextSubject,
  issue: IssueSummary,
  coverageAvailability: "available" | "partial" | "unavailable",
  initialReasonCodes: readonly RcaContextReasonCode[],
  signal?: AbortSignal,
): Promise<RcaContextResult> {
  let report: IssueRcaReport | null = null;
  const reasonCodes = [...initialReasonCodes];
  try {
    const page = await issues.loadReports(issue.correlationId, { limit: REPORT_LIMIT }, signal);
    if (page.correlationId !== issue.correlationId) {
      throw new RcaContextFailure("invalid-response");
    }
    report = page.items.find((candidate) => reportMatchesIssue(candidate, issue, subject.scope.clusterId)) ?? null;
    if (page.items.length > 0 && report === null) {
      throw new RcaContextFailure("invalid-response");
    }
  } catch (error) {
    if (error instanceof RcaContextFailure) throw error;
    if (isAbortError(error)) throw error;
    if (
      error instanceof IssuesPortFailure
      && (error.code === "invalid-request" || error.code === "invalid-response")
    ) {
      throw new RcaContextFailure(error.code);
    }
    reasonCodes.push("report_unavailable");
  }

  const rootCause = clean(issue.rootCause) ?? clean(report?.rootCause);
  const impact = clean(report?.narrative?.impact);
  const evidence = unique([
    clean(issue.evidenceRef),
    ...(issue.supportingEvidence ?? []).map(clean),
    clean(report?.evidenceRef),
    ...(report?.supportingEvidence ?? []).map(clean),
    ...(report?.supportingEvidenceRefs ?? []).flatMap((reference) => [
      clean(reference.evidenceRef),
      clean(reference.summary),
    ]),
  ]);
  const missingEvidence = unique([
    ...(issue.missingEvidence ?? []).map(clean),
    ...(report?.missingEvidence ?? []).map(clean),
  ]);
  if (rootCause === null) reasonCodes.push("root_cause_unavailable");
  if (impact === null) reasonCodes.push("impact_unavailable");
  if (evidence.length === 0) reasonCodes.push("evidence_unavailable");

  return {
    state: reasonCodes.length === 0 ? "available" : "partial",
    scope: subject.scope,
    coverageAvailability,
    reasonCodes: unique(reasonCodes),
    record: { issue, report, rootCause, impact, evidence, missingEvidence },
  };
}

function assertIssueScope(
  issue: IssueSummary,
  subject: Extract<RcaContextSubject, { kind: "incident" }>,
): void {
  if (
    issue.incidentId !== subject.incidentId
    || issue.workspaceId !== subject.scope.workspaceId
    || issue.clusterId !== subject.scope.clusterId
    || (subject.correlationId !== null && issue.correlationId !== subject.correlationId)
  ) {
    throw new RcaContextFailure("invalid-response");
  }
}

function issueMatchesResource(
  issue: IssueSummary,
  subject: Extract<RcaContextSubject, { kind: "resource" }>,
): boolean {
  return issue.workspaceId === subject.scope.workspaceId
    && issue.clusterId === subject.scope.clusterId
    && issue.resourceKind === subject.resource.kind
    && issue.namespace === subject.resource.namespace
    && issue.resourceName === subject.resource.name;
}

function reportMatchesIssue(
  report: IssueRcaReport,
  issue: IssueSummary,
  clusterId: string,
): boolean {
  return report.correlationId === issue.correlationId
    && (report.incidentId === null || report.incidentId === issue.incidentId)
    && (report.clusterId === null || report.clusterId === clusterId)
    && (report.namespace === null || report.namespace === issue.namespace)
    && (report.resourceKind === null || report.resourceKind === issue.resourceKind)
    && (report.resourceName === null || report.resourceName === issue.resourceName);
}

function compareIssueRecency(left: IssueSummary, right: IssueSummary): number {
  return Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? "");
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function unique<T>(values: readonly (T | null)[]): T[] {
  return [...new Set(values.filter((value): value is T => value !== null))];
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
