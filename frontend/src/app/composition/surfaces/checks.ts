import type { ComponentType } from "react";
import {
  getChecksDetail,
  getChecksOverview,
  getChecksSettings,
  updateChecksSettings,
} from "../../../api";
import { createChecksAdapter } from "../../../features/checks/createChecksAdapter";
import { createChecksSurface } from "../../../pages/checks/createChecksSurface";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";
import type { ChecksPort } from "../../../features/checks/checksContract";

export function createChecksProductPort(
  refreshPolicies: BrowserRefreshPolicyRegistry<"issues_audit">,
): ChecksPort {
  return createChecksAdapter(
    { getChecksDetail, getChecksOverview, getChecksSettings, updateChecksSettings },
    refreshPolicies,
  );
}

export function loadChecksSurface(
  refreshPolicies: BrowserRefreshPolicyRegistry<"issues_audit">,
): ComponentType {
  return createChecksSurface(createChecksProductPort(refreshPolicies));
}
