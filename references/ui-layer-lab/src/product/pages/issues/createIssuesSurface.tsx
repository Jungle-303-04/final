import type { ComponentType } from "react";
import type { IssuesPort } from "../../features/issues/issuesContract";
import { IssuesPage } from "./IssuesPage";

export function createIssuesSurface(port: IssuesPort): ComponentType {
  function IssuesSurfaceRoute() {
    return <IssuesPage port={port} />;
  }

  IssuesSurfaceRoute.displayName = "IssuesSurfaceRoute";
  return IssuesSurfaceRoute;
}
