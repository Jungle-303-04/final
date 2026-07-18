import type { ComponentType } from "react";
import type { IssuesPort } from "../../features/issues/issuesContract";
import type { AlertRulesPort } from "../../features/alerts/alertRulesContract";
import { IncidentsPage } from "./IncidentsPage";

export function createIssuesSurface(
  port: IssuesPort,
  rulesPort: AlertRulesPort,
): ComponentType {
  function IssuesSurfaceRoute() {
    return <IncidentsPage issuesPort={port} rulesPort={rulesPort} />;
  }

  IssuesSurfaceRoute.displayName = "IssuesSurfaceRoute";
  return IssuesSurfaceRoute;
}
