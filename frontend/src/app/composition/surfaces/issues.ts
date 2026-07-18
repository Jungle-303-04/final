import type { ComponentType } from "react";
import type { IssuesPort } from "../../../features/issues/issuesContract";
import type { AlertRulesPort } from "../../../features/alerts/alertRulesContract";
import { createIssuesSurface } from "../../../pages/issues/createIssuesSurface";

export function loadIssuesSurface(
  port: IssuesPort,
  rulesPort: AlertRulesPort,
): ComponentType {
  return createIssuesSurface(port, rulesPort);
}
