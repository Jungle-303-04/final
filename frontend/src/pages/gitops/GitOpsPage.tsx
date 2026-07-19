import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { GitOpsPort } from "../../features/gitops/gitOpsContract";
import { EMPTY_RCA_CONTEXT_PORT, type RcaContextPort } from "../../features/issues/rcaContextContract";
import type { BrowserRefreshPolicyRegistry } from "../../shared/data/browserRefreshPolicyRegistry";
import { DeployGitOpsSurface, type DeployGitOpsTab } from "./DeployGitOpsSurface";

export function GitOpsPage({
  port,
  rcaContextPort = EMPTY_RCA_CONTEXT_PORT,
  refreshPolicies,
}: {
  port: GitOpsPort;
  rcaContextPort?: RcaContextPort;
  refreshPolicies: BrowserRefreshPolicyRegistry<"gitops_rows" | "gitops_counts">;
}) {
  const { detail } = useUnifiedFilter();
  return (
    <DeployGitOpsSurface
      port={port}
      rcaContextPort={rcaContextPort}
      refreshPolicies={refreshPolicies}
      tab={deployGitOpsTab(detail.surfaceTab)}
    />
  );
}

function deployGitOpsTab(value: string | null | undefined): DeployGitOpsTab {
  if (value === "repositories" || value === "workflows" || value === "helm") return value;
  return "applications";
}
