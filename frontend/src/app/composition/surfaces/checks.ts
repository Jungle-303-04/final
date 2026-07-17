import type { ComponentType } from "react";
import { getChecksDetail, getChecksOverview } from "../../../api";
import { createChecksAdapter } from "../../../features/checks/createChecksAdapter";
import { createChecksSurface } from "../../../pages/checks/createChecksSurface";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";

export function loadChecksSurface(
  refreshPolicies: BrowserRefreshPolicyRegistry<"issues_audit">,
): ComponentType {
  return createChecksSurface(createChecksAdapter(
    { getChecksDetail, getChecksOverview },
    refreshPolicies,
  ));
}
