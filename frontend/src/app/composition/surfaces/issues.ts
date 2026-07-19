import type { ComponentType } from "react";
import type { IssuesPort } from "../../../features/issues/issuesContract";
import { createIssuesSurface } from "../../../pages/issues/createIssuesSurface";

export function loadIssuesSurface(port: IssuesPort): ComponentType {
  return createIssuesSurface(port);
}
