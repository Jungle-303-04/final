import type { ComponentType } from "react";
import { getCostOverview, getRightsizingScan } from "../../../api";
import { createCostAdapter } from "../../../features/cost/createCostAdapter";
import { createRightsizingAdapter } from "../../../features/rightsizing/createRightsizingAdapter";
import { createCostSurface } from "../../../pages/cost/createCostSurface";

export function loadCostSurface(): ComponentType {
  return createCostSurface(
    createCostAdapter({ getCostOverview }),
    createRightsizingAdapter({ getRightsizingScan }),
  );
}
