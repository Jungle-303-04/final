import type { ComponentType } from "react";
import type { GitOpsPort } from "../../../features/gitops/gitOpsContract";
import { createGitOpsSurface } from "../../../pages/gitops/createGitOpsSurface";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";
import type { RcaContextPort } from "../../../features/issues/rcaContextContract";

export function loadGitOpsSurface(
  refreshPolicies: BrowserRefreshPolicyRegistry<"gitops_rows" | "gitops_counts">,
  rcaContextPort: RcaContextPort,
  port: GitOpsPort,
): ComponentType {
  return createGitOpsSurface(
    port,
    refreshPolicies,
    rcaContextPort,
  );
}
