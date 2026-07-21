import type { ComponentType } from "react";
import type { IssuesPort } from "../../features/issues/issuesContract";
import type { ChecksPort } from "../../features/checks/checksContract";
import { IssuesPage } from "./IssuesPage";

export function createIssuesSurface(port: IssuesPort, checksPort?: ChecksPort): ComponentType {
  function IssuesSurfaceRoute() {
    return <IssuesPage checksPort={checksPort} port={port} />;
  }

  IssuesSurfaceRoute.displayName = "IssuesSurfaceRoute";
  return IssuesSurfaceRoute;
}
