import type { ComponentType } from "react";

import type { RcaContextPort } from "../../../features/issues/rcaContextContract";
import { createDeploySurface } from "../../../pages/deploy/createDeploySurface";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";
import { loadApplicationsSurface } from "./applications";
import { loadGitOpsSurface } from "./gitops";
import { loadHelmSurface } from "./helm";

export function loadDeploySurface(
  refreshPolicies: BrowserRefreshPolicyRegistry<
    "applications" | "gitops_rows" | "gitops_counts"
  >,
  rcaContextPort: RcaContextPort,
): ComponentType {
  return createDeploySurface({
    Applications: loadApplicationsSurface(refreshPolicies),
    GitOps: loadGitOpsSurface(refreshPolicies, rcaContextPort),
    Helm: loadHelmSurface(),
  });
}
