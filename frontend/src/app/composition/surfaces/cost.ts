import type { ComponentType } from "react";
import { getCostOverview } from "../../../api";
import { createCostAdapter } from "../../../features/cost/createCostAdapter";
import { createCostSurface } from "../../../pages/cost/createCostSurface";

export function loadCostSurface(): ComponentType {
  return createCostSurface(createCostAdapter({ getCostOverview }));
}
