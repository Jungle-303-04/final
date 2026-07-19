import type { ComponentType } from "react";
import { getRightsizingScan } from "../../../api";
import type { CostPort } from "../../../features/cost/costContract";
import { createRightsizingAdapter } from "../../../features/rightsizing/createRightsizingAdapter";
import { createCostSurface } from "../../../pages/cost/createCostSurface";

export function loadCostSurface(
  costPort: CostPort,
): ComponentType {
  return createCostSurface(
    costPort,
    createRightsizingAdapter({ getRightsizingScan }),
  );
}
