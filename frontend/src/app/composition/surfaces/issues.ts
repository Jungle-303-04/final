import type { ComponentType } from "react";
import {
  getAuditTimeline,
  getIncidentRecentChanges,
  getRcaIncident,
  getRecoveryPlanByCorrelation,
  listEvidence,
  listRcaReports,
  listRcaTimeline,
  selectRecoveryAction,
} from "../../../api";
import { createIssuesAdapter } from "../../../features/issues/createIssuesAdapter";
import { createIssuesSurface } from "../../../pages/issues/createIssuesSurface";

export function loadIssuesSurface(): ComponentType {
  return createIssuesSurface(createIssuesAdapter({
    getAuditTimeline,
    getIncidentRecentChanges,
    getRcaIncident,
    getRecoveryPlanByCorrelation,
    listEvidence,
    listRcaReports,
    listRcaTimeline,
    selectRecoveryAction,
  }));
}
