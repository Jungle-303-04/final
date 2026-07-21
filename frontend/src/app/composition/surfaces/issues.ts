import type { ComponentType } from "react";
import {
  getAuditTimeline,
  getChecksDetail,
  getChecksOverview,
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
import { createChecksAdapter } from "../../../features/checks/createChecksAdapter";
import { createIssuesSurface } from "../../../pages/issues/createIssuesSurface";

export function loadIssuesSurface(): ComponentType {
  const issuesPort = createIssuesAdapter({
    getAuditTimeline,
    getIncidentRecentChanges,
    getRcaIncident,
    getRecoveryPlanByCorrelation,
    listRcaIssues,
    listEvidence,
    listRcaReports,
    listRcaTimeline,
    selectRecoveryAction,
  });
  const checksPort = createChecksAdapter({ getChecksDetail, getChecksOverview });
  return createIssuesSurface(issuesPort, checksPort);
}
