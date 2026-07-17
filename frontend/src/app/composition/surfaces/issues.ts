import type { ComponentType } from "react";
import {
  getAuditTimeline,
  getIncidentRecentChanges,
  getRcaIncident,
  getRecoveryPlanByCorrelation,
  listRcaIssues,
  listEvidence,
  listRcaReports,
  listRcaTimeline,
  selectRecoveryAction,
} from "../../../api";
import { createIssuesAdapter } from "../../../features/issues/createIssuesAdapter";
import { createIssuesSurface } from "../../../pages/issues/createIssuesSurface";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";

export function loadIssuesSurface(
  refreshPolicies: BrowserRefreshPolicyRegistry<"issues_audit">,
): ComponentType {
  return createIssuesSurface(createIssuesAdapter({
    getAuditTimeline,
    getIncidentRecentChanges,
    getRcaIncident,
    getRecoveryPlanByCorrelation,
    listRcaIssues,
    listEvidence,
    listRcaReports,
    listRcaTimeline,
    selectRecoveryAction,
  }, refreshPolicies));
}
