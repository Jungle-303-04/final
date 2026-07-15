import type { ComponentType } from "react";
import {
  createReleaseFlowClient,
  getGitOpsApplicationDetail,
  listApplicationDeployments,
} from "../../../api";
import { createGitOpsAdapter } from "../../../features/gitops/createGitOpsAdapter";
import { createGitOpsSurface } from "../../../pages/gitops/createGitOpsSurface";

export function loadGitOpsSurface(): ComponentType {
  return createGitOpsSurface(createGitOpsAdapter({
    ...createReleaseFlowClient(),
    getApplicationDetail: getGitOpsApplicationDetail,
    listApplicationDeployments,
  }));
}
