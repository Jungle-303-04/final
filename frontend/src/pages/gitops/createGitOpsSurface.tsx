import type { ComponentType } from "react";
import type { GitOpsPort } from "../../features/gitops/gitOpsContract";
import { GitOpsPage } from "./GitOpsPage";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";

export function createGitOpsSurface(
  port: GitOpsPort,
  refreshPolicies: BrowserRefreshPolicyRegistry<"gitops_rows" | "gitops_counts">,
): ComponentType {
  function GitOpsSurface() {
    return <GitOpsPage port={port} refreshPolicies={refreshPolicies} />;
  }

  GitOpsSurface.displayName = "GitOpsSurface";
  return GitOpsSurface;
}
