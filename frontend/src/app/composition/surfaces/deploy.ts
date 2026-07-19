import type { ComponentType } from "react";

import type { RcaContextPort } from "../../../features/issues/rcaContextContract";
import { createDeploySurface } from "../../../pages/deploy/createDeploySurface";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";
import { loadApplicationsSurface } from "./applications";
import { loadGitOpsSurface } from "./gitops";
import { loadHelmSurface } from "./helm";
import type { GitOpsPort } from "../../../features/gitops/gitOpsContract";

export function loadDeploySurface(
  refreshPolicies: BrowserRefreshPolicyRegistry<
    "applications" | "gitops_rows" | "gitops_counts"
  >,
  rcaContextPort: RcaContextPort,
  gitOpsPort: GitOpsPort,
): ComponentType {
  return createDeploySurface({
    Applications: loadApplicationsSurface(refreshPolicies),
    GitOps: loadGitOpsSurface(refreshPolicies, rcaContextPort, gitOpsPort),
    Helm: loadHelmSurface(),
  });
}
