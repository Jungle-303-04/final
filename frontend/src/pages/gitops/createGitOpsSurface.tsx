import type { ComponentType } from "react";
import type { GitOpsPort } from "../../features/gitops/gitOpsContract";
import { GitOpsPage } from "./GitOpsPage";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import { EMPTY_RCA_CONTEXT_PORT, type RcaContextPort } from "../../features/issues/rcaContextContract";

export function createGitOpsSurface(
  port: GitOpsPort,
  refreshPolicies: BrowserRefreshPolicyRegistry<"gitops_rows" | "gitops_counts">,
  rcaContextPort: RcaContextPort = EMPTY_RCA_CONTEXT_PORT,
): ComponentType {
  function GitOpsSurface() {
    return (
      <GitOpsPage
        port={port}
        rcaContextPort={rcaContextPort}
        refreshPolicies={refreshPolicies}
      />
    );
  }

  GitOpsSurface.displayName = "GitOpsSurface";
  return GitOpsSurface;
}
