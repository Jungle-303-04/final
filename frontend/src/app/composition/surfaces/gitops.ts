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
import type { RcaContextPort } from "../../../features/issues/rcaContextContract";

export function loadGitOpsSurface(
  refreshPolicies: BrowserRefreshPolicyRegistry<"gitops_rows" | "gitops_counts">,
  rcaContextPort: RcaContextPort,
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
    rcaContextPort,
  );
}
