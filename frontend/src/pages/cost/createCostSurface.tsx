import type { ComponentType } from "react";

import type { CostPort } from "../../features/cost/costContract";
import type { RightsizingPort } from "../../features/rightsizing/rightsizingContract";
import { CostPage } from "./CostPage";

export function createCostSurface(
  port: CostPort,
  rightsizingPort: RightsizingPort,
): ComponentType {
  function CostSurface() {
    return <CostPage port={port} rightsizingPort={rightsizingPort} />;
  }

  CostSurface.displayName = "CostSurface";
  return CostSurface;
}
