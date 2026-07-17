import type { ComponentType } from "react";
import {
  createReleaseFlowClient,
  executeGitOpsResourceAction,
  getGitOpsApplicationDetail,
  getGitOpsResourceInsights,
  getGitOpsResourceTree,
  listGitOpsOverview,
} from "../../../api";
import { createGitOpsAdapter } from "../../../features/gitops/createGitOpsAdapter";
import { createGitOpsSurface } from "../../../pages/gitops/createGitOpsSurface";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";

export function loadGitOpsSurface(
  refreshPolicies: BrowserRefreshPolicyRegistry<"gitops_rows" | "gitops_counts">,
): ComponentType {
  return createGitOpsSurface(
    createGitOpsAdapter({
      ...createReleaseFlowClient(),
      getApplicationDetail: getGitOpsApplicationDetail,
      getResourceTree: getGitOpsResourceTree,
      getResourceInsights: getGitOpsResourceInsights,
      executeResourceAction: executeGitOpsResourceAction,
      listOverview: listGitOpsOverview,
    }),
    refreshPolicies,
  );
}
