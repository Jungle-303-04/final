import type { ComponentType } from "react";
import { getCostNodes, getCostOverview, getRightsizingScan } from "../../../api";
import { createCostAdapter } from "../../../features/cost/createCostAdapter";
import type { CostRefreshPolicyKey } from "../../../features/cost/costContract";
import { createRightsizingAdapter } from "../../../features/rightsizing/createRightsizingAdapter";
import { createCostSurface } from "../../../pages/cost/createCostSurface";
import type { BrowserRefreshPolicyRegistry } from "../../../shared/data/browserRefreshPolicyRegistry";

export function loadCostSurface(
  refreshPolicies: BrowserRefreshPolicyRegistry<CostRefreshPolicyKey>,
): ComponentType {
  return createCostSurface(
    createCostAdapter({ getCostOverview, getCostNodes }, refreshPolicies),
    createRightsizingAdapter({ getRightsizingScan }),
  );
}
